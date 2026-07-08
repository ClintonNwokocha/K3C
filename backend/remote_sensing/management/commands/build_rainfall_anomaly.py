"""
Build Rainfall Anomaly records from completed CHIRPS rainfall totals.

Derives rainfall_anomaly metrics for every observed CHIRPS rainfall record by
comparing each (LGA, year, season) observed total against the 1991-2020 baseline
mean for the same (LGA, season) combination.

Formula:
    anomaly_mm      = observed_total_mm − baseline_mean_mm
    anomaly_percent = (anomaly_mm / baseline_mean_mm) × 100

Stored as:
    mean_value  = anomaly_percent (%)
    min_value   = None  (no spatial extremes — derived statistic)
    max_value   = None
    unit        = "%"

Baseline requirements:
    Default: 1991–2020 (30-year WMO standard)
    Minimum: 25 valid baseline records per (LGA, season)
    If < 25 records: null result stored with diagnostic metadata

Usage:
    python manage.py build_rainfall_anomaly --dry-run
    python manage.py build_rainfall_anomaly --skip-existing --report
    python manage.py build_rainfall_anomaly --baseline-start 1981 --baseline-end 2010 --dry-run
"""

from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from remote_sensing.models import RemoteSensingLGAMetric, RemoteSensingLayer


METHOD_VERSION = "rainfall_anomaly_chirps_baseline_1991_2020_v1"
DEFAULT_BASELINE_START = 1991
DEFAULT_BASELINE_END = 2020
MINIMUM_BASELINE_SAMPLES = 25


class Command(BaseCommand):
    help = (
        "Build rainfall_anomaly records from completed CHIRPS rainfall totals.  "
        "Database-only — no GEE calls."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Print what would be computed without writing any database records.",
        )
        parser.add_argument(
            "--report",
            action="store_true",
            default=False,
            help="Print a detailed record-level report after a live run.",
        )
        parser.add_argument(
            "--skip-existing",
            action="store_true",
            default=False,
            help="Skip (LGA, year, season) combos where a rainfall_anomaly record already exists.",
        )
        parser.add_argument(
            "--baseline-start",
            type=int,
            default=DEFAULT_BASELINE_START,
            metavar="YEAR",
            help=f"First year of the baseline period (default: {DEFAULT_BASELINE_START}).",
        )
        parser.add_argument(
            "--baseline-end",
            type=int,
            default=DEFAULT_BASELINE_END,
            metavar="YEAR",
            help=f"Last year of the baseline period (default: {DEFAULT_BASELINE_END}).",
        )

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        report = options["report"]
        skip_existing = options["skip_existing"]
        baseline_start = options["baseline_start"]
        baseline_end = options["baseline_end"]

        if baseline_start >= baseline_end:
            raise CommandError(
                f"--baseline-start ({baseline_start}) must be less than "
                f"--baseline-end ({baseline_end})."
            )

        W = 65
        self.stdout.write("\n" + "=" * W)
        self.stdout.write("  Build Rainfall Anomaly")
        self.stdout.write(
            f"  Mode         : "
            f"{'DRY RUN — no DB writes' if dry_run else 'LIVE'}"
        )
        self.stdout.write(f"  Baseline     : {baseline_start}–{baseline_end}")
        self.stdout.write(f"  Min samples  : {MINIMUM_BASELINE_SAMPLES}")
        self.stdout.write(f"  Skip existing: {skip_existing}")
        self.stdout.write("=" * W + "\n")

        # Load layers
        try:
            rainfall_layer = RemoteSensingLayer.objects.get(key="rainfall")
        except RemoteSensingLayer.DoesNotExist:
            raise CommandError(
                "rainfall layer not found in the database.  "
                "Run: python manage.py seed_remote_sensing_layers"
            )

        try:
            anomaly_layer = RemoteSensingLayer.objects.get(key="rainfall_anomaly")
        except RemoteSensingLayer.DoesNotExist:
            raise CommandError(
                "rainfall_anomaly layer not found in the database.  "
                "Run: python manage.py seed_remote_sensing_layers"
            )

        # Load all valid rainfall records
        rainfall_qs = list(
            RemoteSensingLGAMetric.objects.filter(
                layer=rainfall_layer,
                mean_value__isnull=False,
            ).select_related("lga")
        )
        total_rainfall = len(rainfall_qs)
        self.stdout.write(f"Source rainfall records (valid, non-null): {total_rainfall}")

        if total_rainfall == 0:
            self.stdout.write("  No valid rainfall records found. Nothing to process.\n")
            return

        # Group records by (admin_level, admin_code, admin_name, lga, season)
        groups: dict = defaultdict(list)
        for rec in rainfall_qs:
            group_key = (rec.admin_level, rec.admin_code, rec.admin_name, rec.lga, rec.season)
            groups[group_key].append(rec)

        self.stdout.write(f"Groups (LGA × season)               : {len(groups)}\n")

        # Load existing anomaly keys for --skip-existing
        existing_keys: set = set()
        if skip_existing:
            existing_keys = set(
                RemoteSensingLGAMetric.objects.filter(layer=anomaly_layer).values_list(
                    "admin_level", "admin_code", "year", "season"
                )
            )

        total_processed = total_created = total_updated = 0
        total_null = total_skipped = 0
        groups_sufficient = groups_insufficient = 0

        for (admin_level, admin_code, admin_name, lga_obj, season), records in sorted(
            groups.items(), key=lambda x: (x[0][0], x[0][1], x[0][4])
        ):
            # Compute baseline stats for this (LGA, season) group
            baseline_records = [
                r for r in records if baseline_start <= r.year <= baseline_end
            ]
            baseline_sample_count = len(baseline_records)
            has_sufficient_baseline = baseline_sample_count >= MINIMUM_BASELINE_SAMPLES

            if has_sufficient_baseline:
                groups_sufficient += 1
                baseline_mean_mm = (
                    sum(float(r.mean_value) for r in baseline_records)
                    / baseline_sample_count
                )
            else:
                groups_insufficient += 1
                baseline_mean_mm = None

            for rec in records:
                task_key = (admin_level, admin_code, rec.year, season)

                if skip_existing and task_key in existing_keys:
                    total_skipped += 1
                    continue

                if not has_sufficient_baseline:
                    if dry_run:
                        total_null += 1
                        continue
                    RemoteSensingLGAMetric.objects.update_or_create(
                        layer=anomaly_layer,
                        admin_level=admin_level,
                        admin_code=admin_code,
                        year=rec.year,
                        season=season,
                        defaults={
                            "admin_name": admin_name,
                            "lga": lga_obj,
                            "month": None,
                            "mean_value": None,
                            "min_value": None,
                            "max_value": None,
                            "unit": "%",
                            "data_source": "CHIRPS v2.0 Daily (derived)",
                            "metadata": {
                                "result_status": "no_data",
                                "null_reason": "insufficient_baseline_samples",
                                "source_layer": "rainfall",
                                "baseline_start_year": baseline_start,
                                "baseline_end_year": baseline_end,
                                "baseline_sample_count": baseline_sample_count,
                                "minimum_required_baseline_samples": MINIMUM_BASELINE_SAMPLES,
                                "method_version": METHOD_VERSION,
                            },
                        },
                    )
                    total_null += 1
                    continue

                observed_mm = float(rec.mean_value)
                anomaly_mm = observed_mm - baseline_mean_mm
                anomaly_percent = (
                    (anomaly_mm / baseline_mean_mm) * 100
                    if baseline_mean_mm != 0 else None
                )

                if dry_run:
                    total_processed += 1
                    continue

                _, was_created = RemoteSensingLGAMetric.objects.update_or_create(
                    layer=anomaly_layer,
                    admin_level=admin_level,
                    admin_code=admin_code,
                    year=rec.year,
                    season=season,
                    defaults={
                        "admin_name": admin_name,
                        "lga": lga_obj,
                        "month": None,
                        "mean_value": (
                            Decimal(str(round(anomaly_percent, 6)))
                            if anomaly_percent is not None else None
                        ),
                        "min_value": None,
                        "max_value": None,
                        "unit": "%",
                        "data_source": "CHIRPS v2.0 Daily (derived)",
                        "metadata": {
                            "source_layer": "rainfall",
                            "source_dataset": "CHIRPS v2.0 Daily",
                            "observed_total_mm": round(observed_mm, 4),
                            "baseline_mean_mm": round(baseline_mean_mm, 4),
                            "anomaly_mm": round(anomaly_mm, 4),
                            "anomaly_percent": (
                                round(anomaly_percent, 4)
                                if anomaly_percent is not None else None
                            ),
                            "baseline_start_year": baseline_start,
                            "baseline_end_year": baseline_end,
                            "baseline_sample_count": baseline_sample_count,
                            "minimum_required_baseline_samples": MINIMUM_BASELINE_SAMPLES,
                            "method_version": METHOD_VERSION,
                        },
                    },
                )

                if was_created:
                    total_created += 1
                else:
                    total_updated += 1

                if report:
                    direction = "+" if (anomaly_percent or 0) >= 0 else ""
                    self.stdout.write(
                        f"  {'Created' if was_created else 'Updated'}: "
                        f"{admin_name} ({admin_code}) "
                        f"year={rec.year} season={season} "
                        f"→ {direction}{round(anomaly_percent or 0, 1)}%"
                    )

        # ------------------------------------------------------------------
        # Summary
        # ------------------------------------------------------------------
        self.stdout.write(
            f"\n  Groups with sufficient baseline (≥{MINIMUM_BASELINE_SAMPLES}): "
            f"{groups_sufficient}"
        )
        self.stdout.write(
            f"  Groups with insufficient baseline               : "
            f"{groups_insufficient}"
        )
        self.stdout.write("")

        if dry_run:
            self.stdout.write("SUMMARY (dry run)")
            self.stdout.write(
                f"  Would process (create or update) : {total_processed}"
            )
            self.stdout.write(f"  Would be null (baseline < 25)    : {total_null}")
            self.stdout.write(f"  Would skip (--skip-existing)     : {total_skipped}")
            self.stdout.write(
                "\n  DRY RUN complete.  No database records written.\n"
            )
        else:
            total_valid = total_created + total_updated
            self.stdout.write(self.style.SUCCESS(
                f"SUMMARY\n"
                f"  Created  : {total_created}\n"
                f"  Updated  : {total_updated}\n"
                f"  Null     : {total_null}\n"
                f"  Skipped  : {total_skipped}\n"
                f"  Total    : {total_valid + total_null + total_skipped}"
            ))
