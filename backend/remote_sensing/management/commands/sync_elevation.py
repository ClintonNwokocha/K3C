"""
Sync command: Elevation / Terrain (USGS SRTMGL1_003).

Computes LGA-level mean elevation (m) from the NASA SRTM DEM and stores the
result as RemoteSensingLGAMetric records.

Product
-------
Dataset  : USGS/SRTMGL1_003
Band     : elevation (metres above sea level)
Meaning  : NASA SRTM static topographic DEM (~2000 acquisition).  Not a
           climate variable — topographic context for exposure analysis.
Year     : 2000 (SRTM mission date)
Season   : annual (the product is not seasonal)
Unit     : m
Scale    : 30 m (native ~1 arc-second SRTM resolution)

Flags
-----
is_public=False, is_active=False on the layer — this command does NOT change
those flags.  Run seed_remote_sensing_layers to update the DB record if needed.

Usage
-----
    python manage.py sync_elevation --dry-run
    python manage.py sync_elevation --dry-run --admin-codes 19001,19009
    python manage.py sync_elevation --skip-existing
    python manage.py sync_elevation --admin-codes 19001,19009 --skip-existing
"""

import json
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.models import LGARegistry
from remote_sensing.gee_service import gee_service
from remote_sensing.models import RemoteSensingLGAMetric, RemoteSensingLayer

_LAYER_KEY = "elevation"
_YEAR = 2000
_SEASON = "annual"
_DATA_SOURCE = "USGS SRTMGL1 v003"
_METHOD_VERSION = "srtm_mean_elevation_v1"
_SCALE = 30

_GEOJSON_PATH = (
    Path(settings.BASE_DIR).parent
    / "frontend" / "public" / "data" / "kaduna_lga.geojson"
)


class Command(BaseCommand):
    help = (
        "Compute USGS SRTMGL1_003 elevation (mean m) for each Kaduna LGA "
        "and store as RemoteSensingLGAMetric records.  "
        "Year=2000 (SRTM mission), season=annual.  "
        "Does not change is_public / is_active on the layer."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Print the task plan without calling GEE or writing to the database.",
        )
        parser.add_argument(
            "--admin-codes",
            type=str,
            default=None,
            metavar="CODES",
            help=(
                "Comma-separated LGA codes to target (e.g. 19001,19009).  "
                "Omit to process all 23 Kaduna LGAs."
            ),
        )
        parser.add_argument(
            "--skip-existing",
            action="store_true",
            default=False,
            help="Skip LGAs that already have a valid metric record for this layer/year/season.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        skip_existing = options["skip_existing"]
        admin_codes_opt = options.get("admin_codes")

        W = 70
        self.stdout.write("\n" + "=" * W)
        self.stdout.write("  Elevation Sync  (USGS SRTMGL1_003)")
        self.stdout.write(f"  Layer    : {_LAYER_KEY}")
        self.stdout.write(f"  Year     : {_YEAR}")
        self.stdout.write(f"  Season   : {_SEASON}")
        self.stdout.write(f"  Scale    : {_SCALE} m")
        self.stdout.write(
            f"  Mode     : "
            f"{'DRY RUN — no GEE calls, no DB writes' if dry_run else 'LIVE'}"
        )
        self.stdout.write(f"  Skip existing: {skip_existing}")
        if admin_codes_opt:
            self.stdout.write(f"  Admin codes: {admin_codes_opt}")
        self.stdout.write("=" * W + "\n")

        # Fetch the layer DB record (must already exist from seed).
        try:
            layer = RemoteSensingLayer.objects.get(key=_LAYER_KEY)
        except RemoteSensingLayer.DoesNotExist:
            raise CommandError(
                f"Layer '{_LAYER_KEY}' not found in the database.  "
                "Run seed_remote_sensing_layers first."
            )

        # Load LGA features.
        features = self._load_features()
        self.stdout.write(f"Loaded {len(features)} LGA features from GeoJSON.")

        # Optional admin-code filter.
        if admin_codes_opt:
            selected_codes = {c.strip() for c in admin_codes_opt.split(",") if c.strip()}
            features = [
                f for f in features
                if str(f["properties"].get("lgacode", "")) in selected_codes
            ]
            if not features:
                raise CommandError(
                    f"No features matched --admin-codes {admin_codes_opt!r}.  "
                    "Check that codes match the lgacode field in the GeoJSON."
                )
            self.stdout.write(f"Filtered to {len(features)} LGA(s) by admin-codes.")

        self.stdout.write(f"Tasks planned: {len(features)}\n")

        if dry_run:
            self._run_dry(features, skip_existing, layer)
        else:
            self._run_live(features, skip_existing, layer)

    # ------------------------------------------------------------------
    # Dry run
    # ------------------------------------------------------------------

    def _run_dry(self, features, skip_existing, layer):
        planned = skipped = 0
        for feat in features:
            props = feat["properties"]
            admin_code = str(props.get("lgacode", ""))
            admin_name = str(props.get("lganame", ""))

            if skip_existing and self._metric_exists(layer, admin_code):
                self.stdout.write(f"  SKIP  {admin_code}  {admin_name}  (record exists)")
                skipped += 1
            else:
                self.stdout.write(f"  PLAN  {admin_code}  {admin_name}")
                planned += 1

        self.stdout.write(
            f"\nDRY RUN complete.  Planned: {planned}  Skipped: {skipped}  "
            f"Total: {planned + skipped}"
        )

    # ------------------------------------------------------------------
    # Live run
    # ------------------------------------------------------------------

    def _run_live(self, features, skip_existing, layer):
        gee_result = gee_service.initialize()
        if not gee_result.available:
            raise CommandError(f"GEE initialization failed: {gee_result.error}")
        self.stdout.write(f"GEE initialized (project={gee_service.project}).\n")

        created = updated = skipped = failed = 0

        for feat in features:
            props = feat["properties"]
            admin_code = str(props.get("lgacode", ""))
            admin_name = str(props.get("lganame", ""))
            geometry = feat["geometry"]

            if skip_existing and self._metric_exists(layer, admin_code):
                self.stdout.write(f"  SKIP  {admin_code}  {admin_name}")
                skipped += 1
                continue

            self.stdout.write(f"  RUN   {admin_code}  {admin_name} ... ", ending="")

            result = gee_service.compute_elevation_for_geometry(
                geometry_dict=geometry,
                scale=_SCALE,
            )

            if not result.available:
                self.stdout.write(f"ERROR: {result.error}")
                failed += 1
                continue

            mean_val = result.data.get("mean")
            meta = result.data.get("metadata", {})

            mean_decimal = Decimal(str(mean_val)) if mean_val is not None else None

            # Resolve LGARegistry FK if available.
            lga_obj = LGARegistry.objects.filter(
                lga_id=int(admin_code)
            ).first() if admin_code.isdigit() else None

            defaults = {
                "admin_name": admin_name,
                "admin_level": "lga",
                "lga": lga_obj,
                "year": _YEAR,
                "season": _SEASON,
                "mean_value": mean_decimal,
                "unit": "m",
                "data_source": _DATA_SOURCE,
                "metadata": meta,
            }

            _, record_created = RemoteSensingLGAMetric.objects.update_or_create(
                layer=layer,
                admin_level="lga",
                admin_code=admin_code,
                year=_YEAR,
                season=_SEASON,
                defaults=defaults,
            )

            status = "CREATE" if record_created else "UPDATE"
            mean_str = f"{float(mean_decimal):.1f}m" if mean_decimal is not None else "null"
            self.stdout.write(f"{status}  mean={mean_str}")

            if record_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(
            f"\nSync complete.  Created: {created}  Updated: {updated}  "
            f"Skipped: {skipped}  Failed: {failed}"
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _load_features(self):
        if not _GEOJSON_PATH.exists():
            raise CommandError(
                f"kaduna_lga.geojson not found at {_GEOJSON_PATH}.  "
                "Expected at frontend/public/data/kaduna_lga.geojson relative to the repo root."
            )
        with open(_GEOJSON_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data["features"]

    def _metric_exists(self, layer, admin_code):
        return RemoteSensingLGAMetric.objects.filter(
            layer=layer,
            admin_level="lga",
            admin_code=admin_code,
            year=_YEAR,
            season=_SEASON,
            mean_value__isnull=False,
        ).exists()
