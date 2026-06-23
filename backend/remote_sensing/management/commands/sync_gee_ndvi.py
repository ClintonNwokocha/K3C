import datetime
import json
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import LGARegistry
from remote_sensing.gee_service import gee_service
from remote_sensing.models import RemoteSensingLGAMetric, RemoteSensingLayer, RemoteSensingSyncLog


_GEOJSON_FILE = {
    "lga":  "kaduna_lga.geojson",
    "ward": "kaduna_ward.geojson",
}

_NAME_FIELD = {
    "lga":  "lganame",
    "ward": "wardname",
}

_CODE_FIELD = {
    "lga":  "lgacode",
    "ward": "wardcode",
}

# Inclusive start / end dates for each season (Nigeria / Kaduna conventions).
# end_date is the last day that should be included in the composite.
# The command adds one day before passing to GEE (filterDate is exclusive on end).
_SEASON_DATES = {
    "annual":     lambda y: (datetime.date(y,     1,  1), datetime.date(y,      12, 31)),
    "wet_season": lambda y: (datetime.date(y,     5,  1), datetime.date(y,      10, 31)),
    "dry_season": lambda y: (datetime.date(y,    11,  1), datetime.date(y + 1,   3, 31)),
}


def _normalize(name: str) -> str:
    return (
        str(name or "")
        .strip()
        .lower()
        .replace("’", "'")
        .replace("`", "'")
        .replace("-", " ")
        .replace("_", " ")
    )


class Command(BaseCommand):
    help = (
        "Fetch NDVI zonal statistics from Sentinel-2 via GEE "
        "and save to RemoteSensingLGAMetric. Processes one feature at a time."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--admin-level",
            choices=["lga", "ward"],
            default="lga",
            help="Admin level to process (default: lga).",
        )
        parser.add_argument(
            "--season",
            choices=["annual", "wet_season", "dry_season"],
            default="annual",
            help="Season period (default: annual).",
        )
        parser.add_argument(
            "--year",
            type=int,
            default=None,
            help="Year to compute NDVI for (default: current year).",
        )
        parser.add_argument(
            "--start-date",
            type=str,
            default=None,
            metavar="YYYY-MM-DD",
            help="Override season start date (inclusive).",
        )
        parser.add_argument(
            "--end-date",
            type=str,
            default=None,
            metavar="YYYY-MM-DD",
            help="Override season end date (inclusive).",
        )
        parser.add_argument(
            "--scale",
            type=int,
            default=60,
            help=(
                "GEE pixel scale in metres (default: 60). "
                "Use 100 for a quick smoke test; 10 for future high-res exports."
            ),
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            metavar="N",
            help="Stop after N features — useful for smoke testing.",
        )
        parser.add_argument(
            "--skip-existing",
            action="store_true",
            default=False,
            help="Skip features that already have a record for this layer/admin/year/season.",
        )

    def handle(self, *args, **options):
        admin_level  = options["admin_level"]
        season       = options["season"]
        year         = options["year"] or datetime.date.today().year
        scale        = options["scale"]
        limit        = options["limit"]
        skip_existing = options["skip_existing"]

        # --- Resolve inclusive date window, then convert end to GEE-exclusive ---
        start_d, end_d = _SEASON_DATES[season](year)
        if options.get("start_date"):
            start_d = datetime.date.fromisoformat(options["start_date"])
        if options.get("end_date"):
            end_d = datetime.date.fromisoformat(options["end_date"])

        gee_start = start_d.isoformat()
        gee_end   = (end_d + datetime.timedelta(days=1)).isoformat()  # exclusive

        self.stdout.write(
            f"Config  admin_level={admin_level}  season={season}  year={year}  "
            f"dates={start_d} → {end_d}  scale={scale}m"
        )

        # --- Fetch layer ---
        try:
            layer = RemoteSensingLayer.objects.get(key="ndvi")
        except RemoteSensingLayer.DoesNotExist:
            raise CommandError(
                "ndvi layer not found. Run: python manage.py seed_remote_sensing_layers"
            )

        # --- Create sync log ---
        sync_log = RemoteSensingSyncLog.objects.create(
            layer=layer,
            status=RemoteSensingSyncLog.Status.STARTED,
            message=f"NDVI sync started: {admin_level} / {season} / {year}.",
        )
        self.stdout.write(f"Sync log #{sync_log.pk} created.")

        try:
            # --- Load GeoJSON ---
            geojson_path = (
                Path(settings.BASE_DIR).parent
                / "frontend" / "public" / "data"
                / _GEOJSON_FILE[admin_level]
            )
            with open(geojson_path, "r", encoding="utf-8") as fh:
                features = json.load(fh)["features"]

            if limit:
                features = features[:limit]

            self.stdout.write(
                f"Loaded {len(features)} {admin_level} features "
                f"from {_GEOJSON_FILE[admin_level]}."
            )

            # --- LGA FK lookup (only for LGA-level records) ---
            lga_lookup = {}
            if admin_level == "lga":
                lga_lookup = {
                    _normalize(lga.lga_name): lga
                    for lga in LGARegistry.objects.all()
                }

            # --- Initialize GEE once ---
            self.stdout.write("Initializing GEE...")
            init_result = gee_service.initialize()
            if not init_result.available:
                self._fail(sync_log, init_result.error)
                raise CommandError(f"GEE initialization failed: {init_result.error}")

            auth_mode = init_result.data.get("auth_mode", "unknown")
            self.stdout.write(
                self.style.SUCCESS(
                    f"GEE ready — auth: {auth_mode}, project: {gee_service.project}"
                )
            )

            # --- Per-feature loop ---
            name_field = _NAME_FIELD[admin_level]
            code_field = _CODE_FIELD[admin_level]
            created = updated = skipped = failed = 0

            for feat in features:
                props       = feat["properties"]
                admin_name  = props[name_field]
                admin_code  = props[code_field]

                # Skip-existing check
                if skip_existing:
                    if RemoteSensingLGAMetric.objects.filter(
                        layer=layer,
                        admin_level=admin_level,
                        admin_code=admin_code,
                        year=year,
                        season=season,
                    ).exists():
                        self.stdout.write(f"  Skip (exists): {admin_name}")
                        skipped += 1
                        continue

                # Resolve LGA FK for LGA-level records
                lga_obj = None
                if admin_level == "lga":
                    lga_obj = lga_lookup.get(_normalize(admin_name))
                    if not lga_obj:
                        self.stdout.write(
                            self.style.WARNING(f"  No DB match: {admin_name}")
                        )
                        skipped += 1
                        continue

                # Call GEE for this single feature
                gee_result = gee_service.compute_ndvi_for_geometry(
                    feat["geometry"], gee_start, gee_end, scale
                )
                if not gee_result.available:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  GEE error [{admin_name}]: {gee_result.error}"
                        )
                    )
                    failed += 1
                    continue

                mean_val = gee_result.data.get("mean")
                if mean_val is None:
                    self.stdout.write(
                        self.style.WARNING(f"  No NDVI result (all pixels masked?): {admin_name}")
                    )
                    skipped += 1
                    continue

                min_val = gee_result.data.get("min")
                max_val = gee_result.data.get("max")

                # Save immediately
                _, was_created = RemoteSensingLGAMetric.objects.update_or_create(
                    layer=layer,
                    admin_level=admin_level,
                    admin_code=admin_code,
                    year=year,
                    season=season,
                    defaults={
                        "admin_name":  admin_name,
                        "lga":         lga_obj,
                        "month":       None,
                        "mean_value":  Decimal(str(round(mean_val, 6))),
                        "min_value":   Decimal(str(round(min_val, 6))) if min_val is not None else None,
                        "max_value":   Decimal(str(round(max_val, 6))) if max_val is not None else None,
                        "unit":        "",
                        "data_source": "COPERNICUS/S2_SR_HARMONIZED",
                        "metadata": {
                            "gee_project":      "kccc-499913",
                            "scale_m":          scale,
                            "composite":        "median",
                            "cloud_filter_pct": 30,
                            "start_date":       start_d.isoformat(),
                            "end_date":         end_d.isoformat(),
                        },
                    },
                )

                tag = "Created" if was_created else "Updated"
                self.stdout.write(
                    f"  {tag}: {admin_name} ({admin_code}) — mean NDVI {round(mean_val, 4)}"
                )
                if was_created:
                    created += 1
                else:
                    updated += 1

            # --- Update layer timestamp ---
            layer.last_synced_at = timezone.now()
            layer.save(update_fields=["last_synced_at"])

            # --- Close sync log ---
            summary = (
                f"NDVI sync complete — {admin_level} / {season} / {year}. "
                f"Created: {created}. Updated: {updated}. "
                f"Skipped: {skipped}. Failed: {failed}."
            )
            sync_log.status   = RemoteSensingSyncLog.Status.COMPLETED
            sync_log.message  = summary
            sync_log.details  = {
                "admin_level": admin_level,
                "season":      season,
                "year":        year,
                "start_date":  start_d.isoformat(),
                "end_date":    end_d.isoformat(),
                "scale_m":     scale,
                "created":     created,
                "updated":     updated,
                "skipped":     skipped,
                "failed":      failed,
                "auth_mode":   auth_mode,
            }
            sync_log.completed_at = timezone.now()
            sync_log.save()

            self.stdout.write(self.style.SUCCESS(summary))

        except CommandError:
            raise
        except Exception as exc:
            self._fail(sync_log, str(exc))
            raise CommandError(str(exc)) from exc

    def _fail(self, sync_log: RemoteSensingSyncLog, message: str) -> None:
        sync_log.status       = RemoteSensingSyncLog.Status.FAILED
        sync_log.message      = message
        sync_log.completed_at = timezone.now()
        sync_log.save()
