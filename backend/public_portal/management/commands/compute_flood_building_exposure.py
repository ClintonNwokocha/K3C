import json
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

WATER_DATASET = "JRC/GSW1_4/GlobalSurfaceWater"
WATER_BAND = "occurrence"
BUILDING_DATASET = "GOOGLE/Research/open-buildings/v3/polygons"
DEFAULT_CONFIDENCE_THRESHOLD = 0.75
DEFAULT_OCCURRENCE_THRESHOLD = 10
DEFAULT_GEE_PROJECT = "kccc-499913"
DEFAULT_OUTPUT = "flood_building_exposure_pilot.json"
MAX_BOUNDED_LGAS = 5


class Command(BaseCommand):
    help = (
        "Compute bounded pilot flood-exposed Open Buildings aggregates for one "
        "Kaduna LGA. Defaults to dry-run; pass --force to execute GEE."
    )

    def add_arguments(self, parser):
        parser.add_argument("--admin-code", default=None, help="LGA lgacode, e.g. 19008.")
        parser.add_argument("--admin-name", default=None, help="LGA name, e.g. Kachia.")
        parser.add_argument(
            "--confidence-threshold",
            type=float,
            default=DEFAULT_CONFIDENCE_THRESHOLD,
            help="Minimum Open Buildings confidence. Default: 0.75.",
        )
        parser.add_argument(
            "--occurrence-threshold",
            type=float,
            default=DEFAULT_OCCURRENCE_THRESHOLD,
            help="JRC occurrence percentage threshold. Default: 10.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Preview the selected LGA and output path without calling GEE.",
        )
        parser.add_argument(
            "--output",
            default=None,
            help=(
                "Pilot JSON output path. Defaults to "
                "backend/public_portal/data/flood_building_exposure_pilot.json."
            ),
        )
        parser.add_argument(
            "--force",
            action="store_true",
            default=False,
            help="Execute the bounded GEE pilot and allow overwriting the pilot output.",
        )

    def handle(self, *args, **options):
        confidence_threshold = options["confidence_threshold"]
        occurrence_threshold = options["occurrence_threshold"]
        self._validate_thresholds(confidence_threshold, occurrence_threshold)

        features = self._select_features(
            admin_code=options.get("admin_code"),
            admin_name=options.get("admin_name"),
        )
        output_path = self._resolve_output_path(options.get("output"))
        dry_run = options["dry_run"] or not options["force"]

        if dry_run:
            payload = self._build_payload(
                feature=features[0],
                confidence_threshold=confidence_threshold,
                occurrence_threshold=occurrence_threshold,
                metrics=None,
                command_text=self._command_text(options, dry_run=True),
            )
            self.stdout.write("DRY RUN - no Earth Engine call, no output file written.")
            self.stdout.write(f"Selected LGA: {payload['admin_code']} {payload['admin_name']}")
            self.stdout.write(f"Output path: {output_path}")
            self.stdout.write(json.dumps(payload, indent=2))
            return

        if output_path.exists() and not options["force"]:
            raise CommandError(
                f"Output already exists: {output_path}. Pass --force to overwrite."
            )

        metrics = self.compute_flood_building_metrics(
            geometry_dict=features[0]["geometry"],
            confidence_threshold=confidence_threshold,
            occurrence_threshold=occurrence_threshold,
        )
        payload = self._build_payload(
            feature=features[0],
            confidence_threshold=confidence_threshold,
            occurrence_threshold=occurrence_threshold,
            metrics=metrics,
            command_text=self._command_text(options, dry_run=False),
        )

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")

        self.stdout.write(self.style.SUCCESS(f"Pilot output written: {output_path}"))

    def compute_flood_building_metrics(
        self,
        geometry_dict,
        confidence_threshold,
        occurrence_threshold,
    ):
        try:
            import ee
        except ImportError as exc:
            raise CommandError("earthengine-api is not installed.") from exc

        try:
            ee.Initialize(project=DEFAULT_GEE_PROJECT)
        except Exception:
            ee.Initialize()

        geometry = ee.Geometry(geometry_dict)
        occurrence = ee.Image(WATER_DATASET).select(WATER_BAND)
        flood_mask = occurrence.gt(occurrence_threshold)
        exposed_area_image = ee.Image.pixelArea().updateMask(flood_mask)

        buildings = (
            ee.FeatureCollection(BUILDING_DATASET)
            .filterBounds(geometry)
            .filter(ee.Filter.gte("confidence", confidence_threshold))
        )

        def with_exposure(feature):
            building_geometry = feature.geometry()
            exposed_area = exposed_area_image.reduceRegion(
                reducer=ee.Reducer.sum(),
                geometry=building_geometry,
                scale=30,
                maxPixels=1e8,
                tileScale=4,
            ).get("area")
            exposed_area_number = ee.Number(ee.Algorithms.If(exposed_area, exposed_area, 0))
            return feature.set({
                "kccc_flood_exposed": exposed_area_number.gt(0),
                "kccc_flood_exposed_area_m2": exposed_area_number,
            })

        exposed_buildings = buildings.map(with_exposure)

        total_buildings = buildings.size()
        flood_exposed_buildings = exposed_buildings.filter(
            ee.Filter.eq("kccc_flood_exposed", True)
        ).size()
        total_area = buildings.aggregate_sum("area_in_meters")
        exposed_area = exposed_buildings.aggregate_sum("kccc_flood_exposed_area_m2")

        results = ee.Dictionary({
            "total_buildings": total_buildings,
            "flood_exposed_buildings": flood_exposed_buildings,
            "total_building_area_m2": total_area,
            "flood_exposed_building_area_m2": exposed_area,
        }).getInfo()

        return self._normalize_metrics(results)

    def _build_payload(
        self,
        feature,
        confidence_threshold,
        occurrence_threshold,
        metrics,
        command_text,
    ):
        props = feature.get("properties", {})
        normalized_metrics = self._normalize_metrics(metrics or {})
        return {
            "status": "pilot",
            "validated_for_publication": False,
            "admin_code": str(props.get("lgacode", "")),
            "admin_name": str(props.get("lganame", "")),
            "method": {
                "water_dataset": WATER_DATASET,
                "water_band": WATER_BAND,
                "occurrence_threshold_percent": occurrence_threshold,
                "building_dataset": BUILDING_DATASET,
                "building_confidence_threshold": confidence_threshold,
                "exposure_intersection_method": (
                    "Open Buildings polygons filtered to one LGA and confidence "
                    "threshold; per-building exposed area is computed server-side "
                    "from JRC occurrence > threshold masked pixelArea. Buildings "
                    "with exposed area greater than zero are counted as exposed."
                ),
            },
            "metrics": normalized_metrics,
            "provenance": {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "gee_project": DEFAULT_GEE_PROJECT,
                "command": command_text,
                "processing_mode": "offline",
                "boundary_source": "frontend/public/data/kaduna_lga.geojson",
            },
            "limitations": [
                "Pilot output is not public-facing and must not be exposed until validated.",
                "JRC occurrence is historical surface-water occurrence, not a predictive flood hazard model.",
                "Open Buildings identifies mapped structures and does not classify critical infrastructure function.",
                "Building exposed area uses a 30 m historical water-occurrence raster mask, so small structures may be affected by raster resolution.",
            ],
        }

    def _normalize_metrics(self, metrics):
        total_buildings = self._number_or_none(metrics.get("total_buildings"))
        exposed_buildings = self._number_or_none(metrics.get("flood_exposed_buildings"))
        total_area = self._number_or_none(metrics.get("total_building_area_m2"))
        exposed_area = self._number_or_none(metrics.get("flood_exposed_building_area_m2"))

        return {
            "total_buildings": total_buildings,
            "flood_exposed_buildings": exposed_buildings,
            "total_building_area_m2": total_area,
            "flood_exposed_building_area_m2": exposed_area,
            "exposed_buildings_percent": self._percent(exposed_buildings, total_buildings),
            "exposed_area_percent": self._percent(exposed_area, total_area),
        }

    def _select_features(self, admin_code=None, admin_name=None):
        if not admin_code and not admin_name:
            raise CommandError("Provide exactly one bounded LGA using --admin-code or --admin-name.")

        codes = self._split_option(admin_code)
        names = self._split_option(admin_name)
        requested_count = len(codes) + len(names)
        if requested_count != 1:
            raise CommandError("Provide exactly one LGA for this pilot command.")
        if requested_count > MAX_BOUNDED_LGAS:
            raise CommandError(f"Bounded LGA list exceeds limit of {MAX_BOUNDED_LGAS}.")

        all_features = self._load_lga_features()
        matches = []
        for feature in all_features:
            props = feature.get("properties", {})
            code = str(props.get("lgacode", "")).strip()
            name = str(props.get("lganame", "")).strip().lower()
            if codes and code in codes:
                matches.append(feature)
            if names and name in {item.lower() for item in names}:
                matches.append(feature)

        unique = {}
        for feature in matches:
            unique[str(feature.get("properties", {}).get("lgacode", ""))] = feature

        if len(unique) != 1:
            raise CommandError(
                f"Expected exactly one matching LGA, found {len(unique)}."
            )
        return list(unique.values())

    def _load_lga_features(self):
        path = (
            Path(settings.BASE_DIR).parent
            / "frontend"
            / "public"
            / "data"
            / "kaduna_lga.geojson"
        )
        if not path.exists():
            raise CommandError(f"Kaduna LGA boundary file not found: {path}")
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data.get("features", [])

    def _resolve_output_path(self, output):
        if output:
            return Path(output).resolve()
        return (
            Path(settings.BASE_DIR)
            / "public_portal"
            / "data"
            / DEFAULT_OUTPUT
        )

    def _validate_thresholds(self, confidence_threshold, occurrence_threshold):
        if not 0 <= confidence_threshold <= 1:
            raise CommandError("--confidence-threshold must be between 0 and 1.")
        if not 0 < occurrence_threshold <= 100:
            raise CommandError("--occurrence-threshold must be greater than 0 and at most 100.")

    @staticmethod
    def _split_option(raw_value):
        if not raw_value:
            return []
        return [item.strip() for item in str(raw_value).split(",") if item.strip()]

    @staticmethod
    def _number_or_none(value):
        if value is None:
            return None
        number = float(value)
        if number.is_integer():
            return int(number)
        return number

    @staticmethod
    def _percent(part, whole):
        if part is None or whole in (None, 0):
            return None
        return round((float(part) / float(whole)) * 100, 4)

    @staticmethod
    def _command_text(options, dry_run):
        parts = ["compute_flood_building_exposure"]
        for key in ("admin_code", "admin_name", "confidence_threshold", "occurrence_threshold", "output"):
            value = options.get(key)
            if value not in (None, ""):
                parts.append(f"--{key.replace('_', '-')}={value}")
        if dry_run:
            parts.append("--dry-run")
        else:
            parts.append("--force")
        return " ".join(parts)
