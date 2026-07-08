"""
Build fixed-window SPI drought-condition records from completed rainfall totals.

This command derives a precipitation-only meteorological drought product from the
database rainfall layer.  It never calls Earth Engine.
"""

import math
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from scipy.stats import gamma, norm

from remote_sensing.models import RemoteSensingLGAMetric, RemoteSensingLayer


SOURCE_LAYER_KEY = "rainfall"
TARGET_LAYER_KEY = "drought_index"
SOURCE_DATASET = "CHIRPS v2.0 Daily"
METHOD_VERSION = "spi_gamma_fixed_window_chirps_baseline_1991_2020_v1"
DEFAULT_BASELINE_START = 1991
DEFAULT_BASELINE_END = 2020
MINIMUM_BASELINE_SAMPLES = 25
PROBABILITY_EPSILON = 1e-10


def spi_category(spi_value: float) -> str:
    if spi_value <= -2.0:
        return "Extreme drought"
    if spi_value <= -1.5:
        return "Severe drought"
    if spi_value <= -1.0:
        return "Moderate drought"
    if spi_value < 1.0:
        return "Near normal"
    if spi_value < 1.5:
        return "Moderately wet"
    if spi_value < 2.0:
        return "Very wet"
    return "Extremely wet"


def temporal_window_from_source(record: RemoteSensingLGAMetric) -> dict:
    metadata = record.metadata if isinstance(record.metadata, dict) else {}
    window = {
        key: metadata[key]
        for key in ("start_date", "end_date", "season", "season_year_convention")
        if key in metadata
    }
    return window or {"season": record.season}


def diagnostic_metadata(
    *,
    observed_total_mm,
    baseline_start,
    baseline_end,
    baseline_sample_count,
    baseline_zero_count,
    baseline_positive_sample_count,
    temporal_window,
    null_reason=None,
    gamma_shape=None,
    gamma_scale=None,
    cumulative_probability=None,
    spi_value=None,
    category=None,
):
    metadata = {
        "source_layer": SOURCE_LAYER_KEY,
        "source_dataset": SOURCE_DATASET,
        "observed_total_mm": (
            round(observed_total_mm, 4) if observed_total_mm is not None else None
        ),
        "baseline_start_year": baseline_start,
        "baseline_end_year": baseline_end,
        "baseline_sample_count": baseline_sample_count,
        "minimum_required_baseline_samples": MINIMUM_BASELINE_SAMPLES,
        "baseline_zero_count": baseline_zero_count,
        "baseline_zero_probability": (
            round(baseline_zero_count / baseline_sample_count, 10)
            if baseline_sample_count else None
        ),
        "baseline_positive_sample_count": baseline_positive_sample_count,
        "gamma_shape": round(gamma_shape, 8) if gamma_shape is not None else None,
        "gamma_scale": round(gamma_scale, 8) if gamma_scale is not None else None,
        "cumulative_probability": (
            round(cumulative_probability, 10)
            if cumulative_probability is not None else None
        ),
        "spi_value": round(spi_value, 6) if spi_value is not None else None,
        "spi_category": category,
        "temporal_window": temporal_window,
        "method_version": METHOD_VERSION,
    }
    if null_reason:
        metadata["result_status"] = "no_data"
        metadata["null_reason"] = null_reason
    return metadata


def fit_gamma_spi(observed_total_mm: float, baseline_totals: list[float]) -> dict:
    baseline_sample_count = len(baseline_totals)
    baseline_zero_count = sum(1 for value in baseline_totals if value == 0)
    positive_totals = [value for value in baseline_totals if value > 0]
    baseline_positive_sample_count = len(positive_totals)

    if baseline_sample_count < MINIMUM_BASELINE_SAMPLES:
        return {
            "ok": False,
            "null_reason": "insufficient_or_unfit_baseline",
            "baseline_sample_count": baseline_sample_count,
            "baseline_zero_count": baseline_zero_count,
            "baseline_positive_sample_count": baseline_positive_sample_count,
        }

    if baseline_positive_sample_count < 2:
        return {
            "ok": False,
            "null_reason": "insufficient_or_unfit_baseline",
            "baseline_sample_count": baseline_sample_count,
            "baseline_zero_count": baseline_zero_count,
            "baseline_positive_sample_count": baseline_positive_sample_count,
        }

    try:
        shape, loc, scale = gamma.fit(positive_totals, floc=0)
    except Exception:
        return {
            "ok": False,
            "null_reason": "insufficient_or_unfit_baseline",
            "baseline_sample_count": baseline_sample_count,
            "baseline_zero_count": baseline_zero_count,
            "baseline_positive_sample_count": baseline_positive_sample_count,
        }

    if (
        loc != 0
        or not math.isfinite(shape)
        or not math.isfinite(scale)
        or shape <= 0
        or scale <= 0
    ):
        return {
            "ok": False,
            "null_reason": "insufficient_or_unfit_baseline",
            "baseline_sample_count": baseline_sample_count,
            "baseline_zero_count": baseline_zero_count,
            "baseline_positive_sample_count": baseline_positive_sample_count,
            "gamma_shape": shape if math.isfinite(shape) else None,
            "gamma_scale": scale if math.isfinite(scale) else None,
        }

    zero_probability = baseline_zero_count / baseline_sample_count
    gamma_probability = gamma.cdf(max(observed_total_mm, 0.0), shape, loc=0, scale=scale)
    cumulative_probability = zero_probability + (
        (1 - zero_probability) * gamma_probability
    )
    cumulative_probability = min(
        max(cumulative_probability, PROBABILITY_EPSILON),
        1 - PROBABILITY_EPSILON,
    )
    spi_value = norm.ppf(cumulative_probability)

    return {
        "ok": True,
        "baseline_sample_count": baseline_sample_count,
        "baseline_zero_count": baseline_zero_count,
        "baseline_positive_sample_count": baseline_positive_sample_count,
        "gamma_shape": shape,
        "gamma_scale": scale,
        "cumulative_probability": cumulative_probability,
        "spi_value": spi_value,
        "spi_category": spi_category(spi_value),
    }


class Command(BaseCommand):
    help = (
        "Build private database-derived Meteorological Drought Conditions (SPI) "
        "from completed CHIRPS rainfall totals. No GEE calls."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Print what would be computed without writing database records.",
        )
        parser.add_argument(
            "--report",
            action="store_true",
            default=False,
            help="Print record-level output after a live run.",
        )
        parser.add_argument(
            "--skip-existing",
            action="store_true",
            default=False,
            help="Skip records where a drought_index row already exists.",
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

        try:
            rainfall_layer = RemoteSensingLayer.objects.get(key=SOURCE_LAYER_KEY)
        except RemoteSensingLayer.DoesNotExist:
            raise CommandError(
                "rainfall layer not found in the database. "
                "Seed layer definitions before building drought conditions."
            )

        try:
            drought_layer = RemoteSensingLayer.objects.get(key=TARGET_LAYER_KEY)
        except RemoteSensingLayer.DoesNotExist:
            raise CommandError(
                "drought_index layer not found in the database. "
                "Seed layer definitions before building drought conditions."
            )

        self.stdout.write("\n" + "=" * 72)
        self.stdout.write("  Build Meteorological Drought Conditions (SPI)")
        self.stdout.write(f"  Mode         : {'DRY RUN - no DB writes' if dry_run else 'LIVE'}")
        self.stdout.write(f"  Source layer : {SOURCE_LAYER_KEY}")
        self.stdout.write(f"  Target layer : {TARGET_LAYER_KEY}")
        self.stdout.write(f"  Baseline     : {baseline_start}-{baseline_end}")
        self.stdout.write(f"  Min samples  : {MINIMUM_BASELINE_SAMPLES}")
        self.stdout.write(f"  Skip existing: {skip_existing}")
        self.stdout.write("=" * 72 + "\n")

        rainfall_records = list(
            RemoteSensingLGAMetric.objects.filter(
                layer=rainfall_layer,
                mean_value__isnull=False,
            ).select_related("lga")
        )
        self.stdout.write(
            f"Source rainfall records (valid, non-null): {len(rainfall_records)}"
        )
        if not rainfall_records:
            self.stdout.write("  No valid rainfall records found. Nothing to process.\n")
            return

        groups = defaultdict(list)
        for record in rainfall_records:
            group_key = (
                record.admin_level,
                record.admin_code,
                record.admin_name,
                record.lga,
                record.season,
            )
            groups[group_key].append(record)

        existing_keys = set()
        if skip_existing:
            existing_keys = set(
                RemoteSensingLGAMetric.objects.filter(layer=drought_layer).values_list(
                    "admin_level", "admin_code", "year", "season"
                )
            )

        total_created = total_updated = total_valid = 0
        total_null = total_skipped = 0
        groups_fit = groups_unfit = 0

        for (admin_level, admin_code, admin_name, lga_obj, season), records in sorted(
            groups.items(), key=lambda item: (item[0][0], item[0][1], item[0][4])
        ):
            baseline_totals = [
                float(record.mean_value)
                for record in records
                if baseline_start <= record.year <= baseline_end
            ]
            baseline_probe = fit_gamma_spi(
                float(records[0].mean_value),
                baseline_totals,
            )
            if baseline_probe["ok"]:
                groups_fit += 1
            else:
                groups_unfit += 1

            for record in sorted(records, key=lambda item: item.year):
                task_key = (admin_level, admin_code, record.year, season)
                if skip_existing and task_key in existing_keys:
                    total_skipped += 1
                    continue

                observed_total_mm = float(record.mean_value)
                fit = fit_gamma_spi(observed_total_mm, baseline_totals)
                temporal_window = temporal_window_from_source(record)

                if fit["ok"]:
                    metadata = diagnostic_metadata(
                        observed_total_mm=observed_total_mm,
                        baseline_start=baseline_start,
                        baseline_end=baseline_end,
                        baseline_sample_count=fit["baseline_sample_count"],
                        baseline_zero_count=fit["baseline_zero_count"],
                        baseline_positive_sample_count=fit[
                            "baseline_positive_sample_count"
                        ],
                        gamma_shape=fit["gamma_shape"],
                        gamma_scale=fit["gamma_scale"],
                        cumulative_probability=fit["cumulative_probability"],
                        spi_value=fit["spi_value"],
                        category=fit["spi_category"],
                        temporal_window=temporal_window,
                    )
                    defaults = {
                        "admin_name": admin_name,
                        "lga": lga_obj,
                        "month": None,
                        "mean_value": Decimal(str(round(fit["spi_value"], 6))),
                        "min_value": None,
                        "max_value": None,
                        "unit": "SPI",
                        "data_source": "CHIRPS v2.0 Daily rainfall totals (derived SPI)",
                        "metadata": metadata,
                    }
                    total_valid += 1
                else:
                    metadata = diagnostic_metadata(
                        observed_total_mm=observed_total_mm,
                        baseline_start=baseline_start,
                        baseline_end=baseline_end,
                        baseline_sample_count=fit["baseline_sample_count"],
                        baseline_zero_count=fit["baseline_zero_count"],
                        baseline_positive_sample_count=fit[
                            "baseline_positive_sample_count"
                        ],
                        gamma_shape=fit.get("gamma_shape"),
                        gamma_scale=fit.get("gamma_scale"),
                        temporal_window=temporal_window,
                        null_reason=fit["null_reason"],
                    )
                    defaults = {
                        "admin_name": admin_name,
                        "lga": lga_obj,
                        "month": None,
                        "mean_value": None,
                        "min_value": None,
                        "max_value": None,
                        "unit": "SPI",
                        "data_source": "CHIRPS v2.0 Daily rainfall totals (derived SPI)",
                        "metadata": metadata,
                    }
                    total_null += 1

                if dry_run:
                    continue

                _, was_created = RemoteSensingLGAMetric.objects.update_or_create(
                    layer=drought_layer,
                    admin_level=admin_level,
                    admin_code=admin_code,
                    year=record.year,
                    season=season,
                    defaults=defaults,
                )
                if was_created:
                    total_created += 1
                else:
                    total_updated += 1

                if report:
                    if fit["ok"]:
                        self.stdout.write(
                            f"  {'Created' if was_created else 'Updated'}: "
                            f"{admin_name} ({admin_code}) year={record.year} "
                            f"season={season} SPI={fit['spi_value']:.3f} "
                            f"category={fit['spi_category']}"
                        )
                    else:
                        self.stdout.write(
                            f"  {'Created' if was_created else 'Updated'} null: "
                            f"{admin_name} ({admin_code}) year={record.year} "
                            f"season={season} reason={fit['null_reason']}"
                        )

        self.stdout.write("")
        self.stdout.write(f"  Groups with fitted baseline     : {groups_fit}")
        self.stdout.write(f"  Groups with unfit baseline      : {groups_unfit}")
        self.stdout.write("")

        if dry_run:
            self.stdout.write("SUMMARY (dry run)")
            self.stdout.write(f"  Would process valid SPI records : {total_valid}")
            self.stdout.write(f"  Would write null sentinels      : {total_null}")
            self.stdout.write(f"  Would skip (--skip-existing)    : {total_skipped}")
            self.stdout.write("\n  DRY RUN complete. No database records written.\n")
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    "SUMMARY\n"
                    f"  Created  : {total_created}\n"
                    f"  Updated  : {total_updated}\n"
                    f"  Valid SPI: {total_valid}\n"
                    f"  Null     : {total_null}\n"
                    f"  Skipped  : {total_skipped}\n"
                    f"  Total    : {total_valid + total_null + total_skipped}"
                )
            )
