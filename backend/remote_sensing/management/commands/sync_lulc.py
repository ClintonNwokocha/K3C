"""
Annual Land Use / Land Cover sync command — writes LandCoverDataset + LandCoverSnapshot records.

Calls compute_land_cover_for_geometry in gee_service.py for each (LGA, year)
task, validates class percentage sums, and persists the results.

This command is LULC-specific and is intentionally separate from
sync_climate_atlas.  It uses LandCoverDataset/Snapshot (not RemoteSensingLGAMetric)
because land-cover data is a class distribution, not a single scalar.

Phase 1: Annual Land Use / Land Cover snapshots, Dynamic World v1, 2018-present.
Phase 2 (future): Historical Landsat LULC ~1984-2017 and/or change analysis.
build_land_cover_change (Phase 2/3 change analysis) derives LandCoverDerivedMetric
records from stored snapshots; it never calls GEE.

Usage examples:
    python manage.py sync_lulc --plan lulc_dw_5lga_pilot_2018_2024 --dry-run
    python manage.py sync_lulc --provider dynamic_world_v1 --years 2018 2024 \\
        --admin-codes 19001,19009 --dry-run
    python manage.py sync_lulc --plan lulc_dw_5lga_pilot_2018_2024 --skip-existing --dry-run
    python manage.py sync_lulc --plan lulc_dw_5lga_pilot_2018_2024 --min-peak-scenes 5 --dry-run
    python manage.py sync_lulc --plan lulc_dw_full_2018_2025 --min-peak-scenes 5 --skip-existing
"""

import datetime
import json
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import LGARegistry
from remote_sensing.gee_service import gee_service
from remote_sensing.lulc_providers import COMPOSITE_WINDOW_CONFIGS, LAND_COVER_PROVIDERS, get_provider
from remote_sensing.models import LandCoverDataset, LandCoverSnapshot, RemoteSensingSyncLog
from remote_sensing.sync_registry import LULC_NAMED_PLANS, get_lulc_plan

_GEOJSON_LGA = "kaduna_lga.geojson"
_LGA_NAME_FIELD = "lganame"
_LGA_CODE_FIELD = "lgacode"

_MONTH_ABBR = {7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct"}

CLASS_PCT_SUM_MIN = 99.5
CLASS_PCT_SUM_MAX = 100.5


def class_pct_from_result(result, scale: int):
    """
    Convert a LandCoverComputeResult to class_pct and class_areas_km2 dicts.

    Returns (class_pct, class_areas_km2).  class_pct values sum to 100.0
    (within floating-point precision) when total_pixels > 0.
    """
    total = result.total_pixels
    if total == 0:
        return {}, {}
    pixel_area_km2 = (scale ** 2) / 1_000_000.0
    class_pct = {
        k: round(v / total * 100, 6)
        for k, v in result.class_pixel_counts.items()
    }
    class_areas_km2 = {
        k: round(v * pixel_area_km2, 6)
        for k, v in result.class_pixel_counts.items()
    }
    return class_pct, class_areas_km2


def _normalize(name: str) -> str:
    return (
        str(name or "")
        .strip()
        .lower()
        .replace("'", "'")
        .replace("`", "'")
        .replace("-", " ")
        .replace("_", " ")
    )


class Command(BaseCommand):
    help = (
        "Sync Annual Land Use / Land Cover data from Google Earth Engine.  "
        "Writes LandCoverDataset and LandCoverSnapshot records.  "
        "Annual LULC data remains is_public=False and is_validated=False until Phase 1 release approval."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--plan",
            type=str,
            default=None,
            metavar="NAME",
            help=(
                "Named lulc plan to load.  "
                f"Available: {', '.join(sorted(LULC_NAMED_PLANS.keys()))}"
            ),
        )
        parser.add_argument(
            "--provider",
            type=str,
            default="dynamic_world_v1",
            metavar="KEY",
            help=(
                "Land-cover provider key (default: dynamic_world_v1).  "
                f"Available: {', '.join(sorted(LAND_COVER_PROVIDERS.keys()))}"
            ),
        )
        parser.add_argument(
            "--years",
            nargs="+",
            type=int,
            default=None,
            metavar="YEAR",
            help="One or more years to process (e.g. --years 2018 2024).",
        )
        parser.add_argument(
            "--admin-codes",
            type=str,
            default=None,
            metavar="CODES",
            help=(
                "Comma-separated LGA codes to target (e.g. 19001,19009).  "
                "Omit to process all LGAs in the GeoJSON."
            ),
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Print the task plan without making GEE calls or writing to the database.",
        )
        parser.add_argument(
            "--skip-existing",
            action="store_true",
            default=False,
            help="Skip (LGA, year) tasks where a LandCoverSnapshot already exists.",
        )
        parser.add_argument(
            "--cloud-filter-pct",
            type=int,
            default=30,
            metavar="PCT",
            help="Maximum CLOUDY_PIXEL_PERCENTAGE for DW image pre-filter (default: 30).",
        )
        parser.add_argument(
            "--min-peak-scenes",
            type=int,
            default=0,
            metavar="N",
            help=(
                "Minimum peak-season DW scene count required to save a snapshot.  "
                "Peak months are determined by the composite window "
                "(Jul+Aug for wet_season; Sep+Oct for late_wet_season).  "
                "Tasks with peak_season_scene_count < N are skipped and counted as "
                "quality_skipped in the sync log.  "
                "Default: 0 (save all tasks regardless of quality).  "
                "Recommended value before full sync: 5."
            ),
        )
        parser.add_argument(
            "--composite-window",
            type=str,
            default=None,
            metavar="WINDOW",
            dest="composite_window",
            help=(
                "Override the composite window for this run.  "
                f"Known windows: {', '.join(sorted(COMPOSITE_WINDOW_CONFIGS))}.  "
                "Default: wet_season (or value from --plan).  "
                "Use late_wet_season to test the Sep–Oct window."
            ),
        )

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        skip_existing = options["skip_existing"]
        cloud_filter_pct = options["cloud_filter_pct"]
        min_peak_scenes = options["min_peak_scenes"]

        # Resolve plan + CLI overrides → (provider_key, years, composite_window, admin_codes, admin_level)
        plan_name, provider_key, years, composite_window, admin_level, plan_admin_codes = (
            self._resolve_options(options)
        )

        # Validate provider.
        try:
            provider = get_provider(provider_key)
        except ValueError as exc:
            raise CommandError(str(exc))
        if not provider.enabled:
            raise CommandError(
                f"Provider {provider_key!r} is disabled: {provider.block_reason}  "
                "Enable it in lulc_providers.py only after GEE pilot validation."
            )

        # Validate years against the provider's valid range.
        current_year = datetime.date.today().year
        max_year = provider.valid_year_max if provider.valid_year_max is not None else current_year
        invalid = [y for y in years if y < provider.valid_year_min or y > max_year]
        if invalid:
            raise CommandError(
                f"Year(s) {invalid} are outside the valid range for provider "
                f"{provider_key!r} ({provider.valid_year_min}-{max_year})."
            )

        # Validate composite window — known config first, then provider support.
        if composite_window not in COMPOSITE_WINDOW_CONFIGS:
            raise CommandError(
                f"Unknown composite window {composite_window!r}.  "
                f"Known: {', '.join(sorted(COMPOSITE_WINDOW_CONFIGS))}"
            )
        if composite_window not in provider.supported_windows:
            raise CommandError(
                f"Composite window {composite_window!r} is not supported by provider "
                f"{provider_key!r}.  Supported: {provider.supported_windows}"
            )
        window_config = COMPOSITE_WINDOW_CONFIGS[composite_window]
        peak_months_str = "+".join(
            _MONTH_ABBR.get(m, str(m)) for m in window_config.peak_months
        )

        # Load and filter LGA features.
        features = self._load_features()
        total_loaded = len(features)

        # Merge plan admin_codes with CLI admin-codes option.
        admin_codes_filter = set(plan_admin_codes)
        if options.get("admin_codes"):
            cli_codes = {c.strip() for c in options["admin_codes"].split(",") if c.strip()}
            admin_codes_filter = cli_codes if not admin_codes_filter else admin_codes_filter & cli_codes

        if admin_codes_filter:
            features = [
                f for f in features
                if str(f["properties"].get(_LGA_CODE_FIELD, "")) in admin_codes_filter
            ]
            matched_codes = sorted(
                str(f["properties"].get(_LGA_CODE_FIELD, "")) for f in features
            )
            self.stdout.write(
                f"Admin-code filter: {len(features)} of {total_loaded} LGAs selected "
                f"({', '.join(matched_codes)})."
            )
            if not features:
                raise CommandError(
                    f"No LGA features matched admin-codes {sorted(admin_codes_filter)}.  "
                    "Check codes against the lgacode field in kaduna_lga.geojson."
                )

        W = 72
        self.stdout.write("\n" + "=" * W)
        self.stdout.write("  Land Cover Sync (sync_lulc)")
        self.stdout.write(f"  Plan         : {plan_name}")
        self.stdout.write(f"  Provider     : {provider.label} ({provider_key})")
        self.stdout.write(
            f"  Composite    : {composite_window}  "
            f"({window_config.start_month:02d}/{window_config.start_day:02d} - "
            f"{window_config.end_month:02d}/{window_config.end_day:02d})  "
            f"peak: {peak_months_str}"
        )
        self.stdout.write(f"  Year(s)      : {', '.join(str(y) for y in sorted(years))}")
        self.stdout.write(f"  LGAs         : {len(features)}")
        self.stdout.write(f"  Cloud filter : <= {cloud_filter_pct}%")
        self.stdout.write(f"  Skip existing: {skip_existing}")
        self.stdout.write(
            f"  Min peak scenes: {min_peak_scenes}"
            f"{'  (no gate)' if min_peak_scenes == 0 else f'  ({peak_months_str} scenes required)'}"
        )
        self.stdout.write(
            f"  Mode         : "
            f"{'DRY RUN - no GEE calls, no DB writes' if dry_run else 'LIVE'}"
        )
        self.stdout.write("=" * W + "\n")

        if dry_run:
            self._run_dry_run(
                provider=provider,
                years=sorted(years),
                composite_window=composite_window,
                window_config=window_config,
                admin_level=admin_level,
                features=features,
                skip_existing=skip_existing,
                min_peak_scenes=min_peak_scenes,
            )
        else:
            self._run_live(
                plan_name=plan_name,
                provider=provider,
                years=sorted(years),
                composite_window=composite_window,
                window_config=window_config,
                admin_level=admin_level,
                features=features,
                skip_existing=skip_existing,
                cloud_filter_pct=cloud_filter_pct,
                min_peak_scenes=min_peak_scenes,
            )

    # ------------------------------------------------------------------
    # Option resolution
    # ------------------------------------------------------------------

    def _resolve_options(self, options):
        plan_name_opt = options.get("plan")
        provider_opt = options.get("provider") or "dynamic_world_v1"
        years_opt = options.get("years")
        window_opt = options.get("composite_window")   # CLI override; None = use plan/default

        if plan_name_opt:
            try:
                plan = get_lulc_plan(plan_name_opt)
            except ValueError as exc:
                raise CommandError(str(exc))
            return (
                plan.name,
                options.get("provider") or plan.provider_key,
                sorted(years_opt or plan.years),
                window_opt or plan.composite_window,   # CLI wins over plan
                plan.admin_level,
                plan.admin_codes,
            )

        if not years_opt:
            raise CommandError(
                "Provide --plan <name> or --years <year ...>.\n"
                f"Available plans: {', '.join(sorted(LULC_NAMED_PLANS.keys()))}"
            )

        return (
            "custom",
            provider_opt,
            sorted(years_opt),
            window_opt or "wet_season",
            "lga",
            [],
        )

    # ------------------------------------------------------------------
    # Feature loading
    # ------------------------------------------------------------------

    def _load_features(self):
        geojson_path = (
            Path(settings.BASE_DIR).parent
            / "frontend" / "public" / "data"
            / _GEOJSON_LGA
        )
        with open(geojson_path, "r", encoding="utf-8") as fh:
            return json.load(fh)["features"]

    # ------------------------------------------------------------------
    # Dry-run output
    # ------------------------------------------------------------------

    def _run_dry_run(self, provider, years, composite_window, window_config, admin_level, features, skip_existing, min_peak_scenes=0):
        n_features = len(features)
        total_tasks = len(years) * n_features
        grand_pending = 0

        CY, CF, CE, CP, CS = 6, 6, 8, 8, 22
        sep = "-" * (CY + CF + CE + CP + CS + 4)
        hdr = (
            f"{'Year':>{CY}} {'LGAs':>{CF}} {'Exist':>{CE}} {'Pending':>{CP}} {'Dataset status':<{CS}}"
        )
        self.stdout.write("DRY RUN - Task Plan\n")
        self.stdout.write(sep)
        self.stdout.write(hdr)
        self.stdout.write(sep)

        for year in years:
            composite_start = datetime.date(year, window_config.start_month, window_config.start_day)
            composite_end = datetime.date(year, window_config.end_month, window_config.end_day)

            existing_count = 0
            dataset_status = "(new)"

            if skip_existing:
                try:
                    dataset_obj = LandCoverDataset.objects.get(
                        provider=provider.key,
                        year=year,
                        composite_window=composite_window,
                        admin_level=admin_level,
                    )
                    existing_count = LandCoverSnapshot.objects.filter(
                        dataset=dataset_obj,
                        admin_level=admin_level,
                    ).count()
                    dataset_status = f"(exists - {dataset_obj.snapshot_count} snaps)"
                except LandCoverDataset.DoesNotExist:
                    pass

            pending = n_features - existing_count if skip_existing else n_features
            grand_pending += pending

            self.stdout.write(
                f"{year:>{CY}} {n_features:>{CF}} {existing_count:>{CE}} {pending:>{CP}} {dataset_status:<{CS}}"
            )
            self.stdout.write(
                f"       window: {composite_start.isoformat()} - {composite_end.isoformat()}"
            )

        self.stdout.write(sep)
        self.stdout.write("")
        self.stdout.write("SUMMARY")
        self.stdout.write(f"  Total tasks in scope : {total_tasks}")
        if skip_existing:
            self.stdout.write(f"  Pending GEE calls    : {grand_pending}  (--skip-existing ON)")
        else:
            self.stdout.write(f"  Pending GEE calls    : {grand_pending}")
        self.stdout.write("")

        if grand_pending > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f"  -> {grand_pending} GEE call(s) would be issued on live execution."
                )
            )
        else:
            self.stdout.write("  -> All tasks already exist.  Nothing to process.")

        gate_note = (
            f"  Quality gate: --min-peak-scenes={min_peak_scenes} "
            "(actual skips depend on live GEE scene counts).\n"
            if min_peak_scenes > 0
            else ""
        )
        self.stdout.write(
            f"\n{gate_note}"
            "  DRY RUN complete.  No GEE calls made.  No database records written.\n"
        )

    # ------------------------------------------------------------------
    # Live execution
    # ------------------------------------------------------------------

    def _run_live(
        self, plan_name, provider, years, composite_window, window_config, admin_level,
        features, skip_existing, cloud_filter_pct, min_peak_scenes=0,
    ):
        self.stdout.write("Initializing GEE...")
        init_result = gee_service.initialize()
        if not init_result.available:
            raise CommandError(f"GEE initialization failed: {init_result.error}")
        auth_mode = init_result.data.get("auth_mode", "unknown")
        self.stdout.write(
            self.style.SUCCESS(
                f"GEE ready - auth: {auth_mode}, project: {gee_service.project}"
            )
        )

        sync_log = RemoteSensingSyncLog.objects.create(
            layer=None,
            status=RemoteSensingSyncLog.Status.STARTED,
            message=f"sync_lulc started - plan={plan_name} provider={provider.key}",
            details={
                "plan": plan_name,
                "provider": provider.key,
                "composite_window": composite_window,
                "admin_level": admin_level,
                "years": sorted(y for y in years),
                "skip_existing": skip_existing,
                "cloud_filter_pct": cloud_filter_pct,
                "min_peak_scenes": min_peak_scenes,
            },
        )
        self.stdout.write(f"Sync log #{sync_log.pk} created.\n")

        # Build lga_name → LGARegistry lookup (name-based, same as sync_climate_atlas).
        lga_lookup = {
            _normalize(lga.lga_name): lga
            for lga in LGARegistry.objects.all()
        }

        total_created = total_updated = total_skipped = total_quality_skipped = total_failed = 0

        try:
            for year in years:
                composite_start = datetime.date(year, window_config.start_month, window_config.start_day)
                composite_end = datetime.date(year, window_config.end_month, window_config.end_day)
                # GEE filterDate end is exclusive.
                gee_start = composite_start.isoformat()
                gee_end = (composite_end + datetime.timedelta(days=1)).isoformat()

                self.stdout.write(
                    f"\n[{provider.key}] year={year}  "
                    f"window={gee_start} - {composite_end.isoformat()}"
                )

                dataset, ds_created = LandCoverDataset.objects.get_or_create(
                    provider=provider.key,
                    year=year,
                    composite_window=composite_window,
                    admin_level=admin_level,
                    defaults={
                        "provider_label": provider.label,
                        "gee_collection": provider.gee_collection,
                        "composite_start": composite_start,
                        "composite_end": composite_end,
                        "method_version": window_config.method_version,
                        "is_validated": False,
                        "is_public": False,
                        "sync_log": sync_log,
                    },
                )
                if not ds_created:
                    dataset.sync_log = sync_log
                    dataset.save(update_fields=["sync_log", "updated_at"])

                self.stdout.write(
                    f"  Dataset #{dataset.pk} "
                    f"({'created' if ds_created else 'existing'})"
                )

                snaps_this_year = 0

                for feat in features:
                    props = feat["properties"]
                    admin_name = props[_LGA_NAME_FIELD]
                    admin_code = str(props[_LGA_CODE_FIELD])

                    if skip_existing:
                        if LandCoverSnapshot.objects.filter(
                            dataset=dataset,
                            admin_level=admin_level,
                            admin_code=admin_code,
                        ).exists():
                            self.stdout.write(f"  Skip (exists): {admin_name}")
                            total_skipped += 1
                            continue

                    lga_obj = lga_lookup.get(_normalize(admin_name))
                    if not lga_obj:
                        self.stdout.write(
                            self.style.WARNING(
                                f"  No LGARegistry match for {admin_name!r} - "
                                "snapshot will have lga=None"
                            )
                        )

                    result = gee_service.compute_land_cover_for_geometry(
                        feat["geometry"],
                        gee_start,
                        gee_end,
                        scale=provider.default_scale,
                        cloud_filter_pct=cloud_filter_pct,
                        provider_key=provider.key,
                        peak_months=window_config.peak_months,
                        method_version=window_config.method_version,
                    )

                    if not result.success:
                        self.stdout.write(
                            self.style.WARNING(
                                f"  GEE error [{admin_name}]: {result.error}"
                            )
                        )
                        total_failed += 1
                        continue

                    if result.total_pixels == 0:
                        self.stdout.write(
                            self.style.WARNING(
                                f"  No data: {admin_name} - zero classified pixels"
                            )
                        )
                        total_failed += 1
                        continue

                    class_pct, class_areas_km2 = class_pct_from_result(
                        result, provider.default_scale
                    )

                    quality_flag = result.metadata.get("quality_flag", "unknown")
                    peak_n = result.metadata.get("peak_season_scene_count", 0)

                    if min_peak_scenes > 0 and peak_n < min_peak_scenes:
                        # Quality gate active: skip saving this snapshot.
                        self.stdout.write(
                            self.style.WARNING(
                                f"  [QUALITY SKIP] {admin_name} year={year}: "
                                f"peak_season_scenes={peak_n} < "
                                f"--min-peak-scenes={min_peak_scenes} - "
                                "snapshot not saved"
                            )
                        )
                        total_quality_skipped += 1
                        continue
                    elif quality_flag == "low":
                        # No gate active, but flag the low-quality result.
                        peak_months_str = "+".join(
                            _MONTH_ABBR.get(m, str(m)) for m in window_config.peak_months
                        )
                        self.stdout.write(
                            self.style.WARNING(
                                f"  [LOW QUALITY] {admin_name} year={year}: "
                                f"peak_season_scenes={peak_n} ({peak_months_str}) - "
                                "composite may understate peak vegetation"
                            )
                        )

                    pct_sum = sum(class_pct.values())
                    if not (CLASS_PCT_SUM_MIN <= pct_sum <= CLASS_PCT_SUM_MAX):
                        raise CommandError(
                            f"class_pct sum {pct_sum:.4f} out of range "
                            f"[{CLASS_PCT_SUM_MIN}, {CLASS_PCT_SUM_MAX}] "
                            f"for {admin_name} year={year}.  "
                            "Aborting - inspect GEE output before retrying."
                        )

                    # total_area_km2: prefer LGARegistry.area_ha / 100; fall back to
                    # computed area from all pixels (classified + masked).
                    if lga_obj and lga_obj.area_ha is not None:
                        total_area_km2 = Decimal(str(round(float(lga_obj.area_ha) / 100, 4)))
                    else:
                        pixel_area_km2 = (provider.default_scale ** 2) / 1_000_000.0
                        total_area_km2 = Decimal(str(
                            round(
                                (result.total_pixels + result.masked_pixels) * pixel_area_km2, 4
                            )
                        ))

                    masked_pct = (
                        Decimal(str(round(
                            result.masked_pixels
                            / (result.total_pixels + result.masked_pixels)
                            * 100, 2
                        )))
                        if (result.total_pixels + result.masked_pixels) > 0
                        else None
                    )

                    snap, snap_created = LandCoverSnapshot.objects.update_or_create(
                        dataset=dataset,
                        admin_level=admin_level,
                        admin_code=admin_code,
                        defaults={
                            "lga": lga_obj,
                            "admin_name": admin_name,
                            "total_area_km2": total_area_km2,
                            "class_pct": class_pct,
                            "class_areas_km2": class_areas_km2,
                            "pixel_count": result.total_pixels,
                            "masked_pixel_pct": masked_pct,
                            "metadata": result.metadata,
                        },
                    )

                    tag = "Created" if snap_created else "Updated"
                    self.stdout.write(
                        f"  {tag}: {admin_name} ({admin_code}) "
                        f"- {result.total_pixels:,} px  "
                        f"trees={class_pct.get('trees', 0):.1f}%  "
                        f"crops={class_pct.get('crops', 0):.1f}%"
                    )
                    snaps_this_year += 1
                    if snap_created:
                        total_created += 1
                    else:
                        total_updated += 1

                # Update the dataset's snapshot count to the total now stored.
                dataset.snapshot_count = LandCoverSnapshot.objects.filter(
                    dataset=dataset, admin_level=admin_level
                ).count()
                dataset.save(update_fields=["snapshot_count", "updated_at"])

                self.stdout.write(
                    f"  Dataset #{dataset.pk} snapshot_count updated to "
                    f"{dataset.snapshot_count}."
                )

        except CommandError:
            self._close_sync_log(
                sync_log, plan_name, total_created, total_updated,
                total_skipped, total_failed,
                quality_skipped=total_quality_skipped,
                status=RemoteSensingSyncLog.Status.FAILED,
            )
            raise
        except Exception as exc:
            self._close_sync_log(
                sync_log, plan_name, total_created, total_updated,
                total_skipped, total_failed,
                quality_skipped=total_quality_skipped,
                status=RemoteSensingSyncLog.Status.FAILED,
                extra_message=str(exc),
            )
            raise CommandError(str(exc)) from exc

        self._close_sync_log(
            sync_log, plan_name, total_created, total_updated,
            total_skipped, total_failed,
            quality_skipped=total_quality_skipped,
        )

    # ------------------------------------------------------------------
    # Sync log helpers
    # ------------------------------------------------------------------

    def _close_sync_log(
        self, sync_log, plan_name, created, updated, skipped, failed,
        quality_skipped=0, status=None, extra_message="",
    ):
        if status is None:
            status = RemoteSensingSyncLog.Status.COMPLETED
        outcome = "complete" if status == RemoteSensingSyncLog.Status.COMPLETED else "failed"
        summary = (
            f"sync_lulc {outcome} - plan={plan_name}.  "
            f"Snapshots created: {created}, updated: {updated}, "
            f"skipped: {skipped}, quality_skipped: {quality_skipped}, failed: {failed}."
        )
        if extra_message:
            summary += f"  Error: {extra_message}"

        sync_log.status = status
        sync_log.message = summary
        sync_log.details.update({
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "quality_skipped": quality_skipped,
            "failed": failed,
        })
        sync_log.completed_at = timezone.now()
        sync_log.save()

        if status == RemoteSensingSyncLog.Status.COMPLETED:
            self.stdout.write(self.style.SUCCESS(f"\n{summary}"))
        else:
            self.stdout.write(self.style.ERROR(f"\n{summary}"))
