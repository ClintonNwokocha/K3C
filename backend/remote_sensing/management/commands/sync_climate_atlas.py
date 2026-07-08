"""
Climate Atlas Sync Orchestrator.

Builds and executes a deterministic, sequential, resumable task plan for all
climate layers in the KCCC Climate Atlas GEE pipeline.

Unique processing key:  layer + admin_level + admin_code + year + season
A given combination is computed once only; --skip-existing / --resume enforce this.

GEE dispatch is data-driven: each layer in sync_registry.py declares its
entry_point (gee_service method name), default_scale, and metadata_extras.
The orchestrator calls getattr(gee_service, reg.entry_point) at runtime.
All layer-specific GEE methods must return GEEResult with data["mean"] set.

Named plans:
    ndvi_2025_lga                  — NDVI, LGA, 2025, all three seasons
    lga_atlas_current_era          — All layers, LGA, 2021-2025 (readiness audit)
    lga_atlas_historical           — All layers, LGA, 1981-2025 (readiness audit)
    ndvi_sentinel_complete_lga     — NDVI, LGA, 2018-2025 (8 yr historical backfill)
    rainfall_chirps_2025_lga       — CHIRPS rainfall, LGA, 2025 (pilot)
    rainfall_chirps_historical_lga — CHIRPS rainfall, LGA, 1981-2025 (3,082 tasks; dry_season starts 1982)

--admin-codes filters loaded LGA features by lgacode before task planning.
Example: --admin-codes 19011,19008,19022  →  3 LGAs × 3 seasons = 9 tasks.
Omitting --admin-codes preserves the normal all-LGA behaviour.

Usage examples:
    python manage.py sync_climate_atlas --plan ndvi_2025_lga --dry-run --skip-existing
    python manage.py sync_climate_atlas --plan ndvi_sentinel_complete_lga --dry-run --skip-existing
    python manage.py sync_climate_atlas --plan rainfall_chirps_historical_lga --dry-run --skip-existing
    python manage.py sync_climate_atlas --plan ndvi_sentinel_complete_lga --resume --skip-existing --continue-on-error
    python manage.py sync_climate_atlas --plan rainfall_chirps_2025_lga --admin-codes 19011,19008,19022 --dry-run --skip-existing
    python manage.py sync_climate_atlas --plan rainfall_chirps_2025_lga --admin-codes 19011,19008,19022 --resume --skip-existing --continue-on-error
    python manage.py sync_climate_atlas --layers ndvi --years 2024 --seasons annual --dry-run
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
from remote_sensing.models import RemoteSensingLGAMetric, RemoteSensingLayer, RemoteSensingSyncLog
from remote_sensing.sync_registry import (
    NAMED_PLANS,
    LAYER_REGISTRY,
    Readiness,
    get_layer,
    get_plan,
    resolve_season_dates,
)


_GEOJSON_FILE = {
    "lga": "kaduna_lga.geojson",
    "ward": "kaduna_ward.geojson",
}

_NAME_FIELD = {
    "lga": "lganame",
    "ward": "wardname",
}

_CODE_FIELD = {
    "lga": "lgacode",
    "ward": "wardcode",
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
        "Climate Atlas Sync Orchestrator. Builds and executes a sequential, "
        "resumable task plan for GEE-based climate layer processing."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--plan",
            type=str,
            default=None,
            metavar="NAME",
            help=(
                "Named plan to load.  "
                f"Available: {', '.join(sorted(NAMED_PLANS.keys()))}"
            ),
        )
        parser.add_argument(
            "--layers",
            nargs="+",
            type=str,
            default=None,
            metavar="LAYER_KEY",
            help=(
                "Override plan: one or more layer keys.  "
                f"Available: {', '.join(sorted(LAYER_REGISTRY.keys()))}"
            ),
        )
        parser.add_argument(
            "--admin-level",
            choices=["lga", "ward"],
            default="lga",
            help="Admin level to process (default: lga).",
        )
        parser.add_argument(
            "--years",
            nargs="+",
            type=int,
            default=None,
            metavar="YEAR",
            help="Override plan: one or more years.",
        )
        parser.add_argument(
            "--seasons",
            nargs="+",
            type=str,
            default=None,
            choices=["annual", "wet_season", "dry_season"],
            metavar="SEASON",
            help="Override plan: one or more seasons.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Print the task plan without making GEE calls or writing to the database.",
        )
        parser.add_argument(
            "--resume",
            action="store_true",
            default=False,
            help="Resume an interrupted sync.  Implies --skip-existing.",
        )
        parser.add_argument(
            "--skip-existing",
            action="store_true",
            default=False,
            help="Skip tasks where a valid metric record already exists.",
        )
        parser.add_argument(
            "--max-tasks",
            type=int,
            default=None,
            metavar="N",
            help="Stop after N individual tasks (LGA × layer × year × season).",
        )
        parser.add_argument(
            "--continue-on-error",
            action="store_true",
            default=False,
            help="Continue to the next task when an individual GEE call fails.",
        )
        parser.add_argument(
            "--report",
            action="store_true",
            default=False,
            help="Print a final detailed report after a live run.",
        )
        parser.add_argument(
            "--admin-codes",
            type=str,
            default=None,
            metavar="CODES",
            help=(
                "Comma-separated admin codes to target (e.g. 19011,19008,19022).  "
                "Filters loaded LGA features before task planning.  "
                "Omit to process all LGAs (normal behaviour)."
            ),
        )
        parser.add_argument(
            "--retry-null-results",
            action="store_true",
            default=False,
            help=(
                "Re-issue GEE calls for known no-data sentinel records.  "
                "Valid metric records are still skipped.  "
                "Use when source data, QA logic, or computation methods have improved."
            ),
        )

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        retry_null = options["retry_null_results"]
        skip_existing = options["skip_existing"] or options["resume"] or retry_null
        admin_codes_opt = options.get("admin_codes")

        plan_config = self._resolve_plan(options)
        admin_level = plan_config["admin_level"]
        layer_keys = plan_config["layer_keys"]
        years = plan_config["years"]
        seasons = plan_config["seasons"]
        plan_name = plan_config["name"]
        plan_description = plan_config["description"]

        W = 70
        self.stdout.write("\n" + "=" * W)
        self.stdout.write("  Climate Atlas Sync Orchestrator")
        self.stdout.write(f"  Plan        : {plan_name}")
        self.stdout.write(f"  Description : {plan_description}")
        self.stdout.write(
            f"  Mode        : "
            f"{'DRY RUN — no GEE calls, no DB writes' if dry_run else 'LIVE'}"
        )
        year_list = sorted(years)
        years_display = (
            f"{year_list[0]}-{year_list[-1]} ({len(year_list)} years)"
            if len(year_list) > 6
            else ", ".join(str(y) for y in year_list)
        )
        self.stdout.write(f"  Layers      : {', '.join(layer_keys)}")
        self.stdout.write(f"  Years       : {years_display}")
        self.stdout.write(f"  Seasons     : {', '.join(seasons)}")
        self.stdout.write(f"  Admin level : {admin_level}")
        self.stdout.write(f"  Skip existing: {skip_existing}")
        if admin_codes_opt:
            self.stdout.write(f"  Admin codes : {admin_codes_opt}")
        self.stdout.write("=" * W + "\n")

        features = self._load_features(admin_level)
        total_loaded = len(features)
        self.stdout.write(f"Loaded {total_loaded} {admin_level} features.")

        if admin_codes_opt:
            code_field = _CODE_FIELD[admin_level]
            selected_codes = {c.strip() for c in admin_codes_opt.split(",") if c.strip()}
            features = [
                f for f in features
                if str(f["properties"].get(code_field, "")) in selected_codes
            ]
            matched_codes = sorted(
                str(f["properties"].get(code_field, "")) for f in features
            )
            self.stdout.write(
                f"--admin-codes filter: {len(features)} of {total_loaded} selected "
                f"({', '.join(matched_codes)})."
            )
            if not features:
                raise CommandError(
                    f"No features matched --admin-codes {admin_codes_opt!r}.  "
                    "Check that codes match the lgacode field in the GeoJSON."
                )
        self.stdout.write("")

        if dry_run:
            self._run_dry_run(
                plan_name=plan_name,
                layer_keys=layer_keys,
                admin_level=admin_level,
                years=years,
                seasons=seasons,
                features=features,
                skip_existing=skip_existing,
                retry_null=retry_null,
            )
        else:
            self._run_live(
                plan_name=plan_name,
                layer_keys=layer_keys,
                admin_level=admin_level,
                years=years,
                seasons=seasons,
                features=features,
                skip_existing=skip_existing,
                max_tasks=options["max_tasks"],
                continue_on_error=options["continue_on_error"],
                report=options["report"],
                retry_null=retry_null,
            )

    # ------------------------------------------------------------------
    # Plan resolution
    # ------------------------------------------------------------------

    def _resolve_plan(self, options):
        plan_name = options.get("plan")
        layers_opt = options.get("layers")
        years_opt = options.get("years")
        seasons_opt = options.get("seasons")
        admin_level = options.get("admin_level") or "lga"

        if plan_name:
            try:
                plan = get_plan(plan_name)
            except ValueError as exc:
                raise CommandError(str(exc))
            return {
                "name": plan.name,
                "description": plan.description,
                "layer_keys": layers_opt or plan.layer_keys,
                "admin_level": admin_level,
                "years": sorted(years_opt or plan.years),
                "seasons": seasons_opt or plan.seasons,
            }

        if layers_opt and years_opt:
            return {
                "name": "custom",
                "description": (
                    f"Custom plan: layers={', '.join(layers_opt)} "
                    f"admin_level={admin_level}"
                ),
                "layer_keys": layers_opt,
                "admin_level": admin_level,
                "years": sorted(years_opt),
                "seasons": seasons_opt or ["annual"],
            }

        raise CommandError(
            "Provide --plan <name> or both --layers and --years.\n"
            f"Available plans: {', '.join(sorted(NAMED_PLANS.keys()))}"
        )

    # ------------------------------------------------------------------
    # Feature / GeoJSON loading
    # ------------------------------------------------------------------

    def _load_features(self, admin_level):
        geojson_path = (
            Path(settings.BASE_DIR).parent
            / "frontend" / "public" / "data"
            / _GEOJSON_FILE[admin_level]
        )
        with open(geojson_path, "r", encoding="utf-8") as fh:
            return json.load(fh)["features"]

    # ------------------------------------------------------------------
    # Existing-metric lookup (batched — one query per layer/season combo)
    # ------------------------------------------------------------------

    def _load_existing_keys(self, layer_db, admin_level, years, seasons):
        """
        Return (valid_keys, null_keys) for already-saved task records.

        valid_keys — (admin_code, year, season) tuples where mean_value IS NOT NULL
        null_keys  — (admin_code, year, season) tuples where mean_value IS NULL
                     (known no-data sentinels written when GEE returned no result)
        """
        qs = RemoteSensingLGAMetric.objects.filter(
            layer=layer_db,
            admin_level=admin_level,
            year__in=years,
            season__in=seasons,
        ).values_list("admin_code", "year", "season", "mean_value")
        valid_keys: set = set()
        null_keys: set = set()
        for admin_code, year, season, mean_value in qs:
            key = (admin_code, year, season)
            if mean_value is None:
                null_keys.add(key)
            else:
                valid_keys.add(key)
        return valid_keys, null_keys

    # ------------------------------------------------------------------
    # Dry-run output
    # ------------------------------------------------------------------

    def _run_dry_run(
        self, plan_name, layer_keys, admin_level, years, seasons, features, skip_existing,
        retry_null=False,
    ):
        total_features = len(features)
        multi_year = len(years) > 1

        self.stdout.write("DRY RUN — Task Plan\n")

        if multi_year:
            self._print_compact_table(
                layer_keys, admin_level, years, seasons,
                total_features, skip_existing, retry_null=retry_null,
            )
        else:
            self._print_verbose_table(
                layer_keys, admin_level, years, seasons,
                total_features, skip_existing, retry_null=retry_null,
            )

    # ---- Verbose table: one row per layer × year × season ----

    def _print_verbose_table(
        self, layer_keys, admin_level, years, seasons, total_features, skip_existing,
        retry_null=False,
    ):
        # Column widths — Valid + NoData replace the old Exist column.
        CL, CY, CS, CF, CV, CN, CP, CST = 10, 6, 12, 6, 7, 7, 7, 16
        sep = "-" * (CL + CY + CS + CF + CV + CN + CP + CST + 7)
        hdr = (
            f"{'Layer':<{CL}} {'Year':>{CY}} {'Season':<{CS}} "
            f"{'LGAs':>{CF}} {'Valid':>{CV}} {'NoData':>{CN}} {'Pend':>{CP}} {'Status':<{CST}}"
        )
        self.stdout.write(sep)
        self.stdout.write(hdr)
        self.stdout.write(sep)

        grand_total = grand_valid = grand_null = grand_pending = 0
        block_notes = []

        for layer_key in layer_keys:
            try:
                reg = get_layer(layer_key)
            except ValueError:
                self.stdout.write(
                    self.style.WARNING(f"  Layer {layer_key!r} not in registry — skipped.")
                )
                continue

            layer_db = None
            try:
                layer_db = RemoteSensingLayer.objects.get(key=layer_key)
            except RemoteSensingLayer.DoesNotExist:
                pass

            for year in sorted(years):
                year_valid = (
                    (reg.valid_year_min is None or year >= reg.valid_year_min)
                    and (reg.valid_year_max is None or year <= reg.valid_year_max)
                )

                for season in seasons:
                    season_valid = season in reg.supported_seasons

                    # --- Blocked year ---
                    if not year_valid:
                        status = (
                            f"BLOCKED (year outside "
                            f"{reg.valid_year_min or '?'}-{reg.valid_year_max or 'present'})"
                        )
                        self.stdout.write(
                            f"{layer_key:<{CL}} {year:>{CY}} {season:<{CS}} "
                            f"{0:>{CF}} {0:>{CV}} {0:>{CN}} {0:>{CP}} {status}"
                        )
                        continue

                    # --- Season not applicable ---
                    if not season_valid:
                        self.stdout.write(
                            f"{layer_key:<{CL}} {year:>{CY}} {season:<{CS}} "
                            f"{0:>{CF}} {0:>{CV}} {0:>{CN}} {0:>{CP}} NOT SEASONAL"
                        )
                        continue

                    # --- Per-season year minimum (e.g. dry_season 1982+ for CHIRPS) ---
                    season_yr_min = reg.season_year_min.get(season)
                    if season_yr_min is not None and year < season_yr_min:
                        self.stdout.write(
                            f"{layer_key:<{CL}} {year:>{CY}} {season:<{CS}} "
                            f"{0:>{CF}} {0:>{CV}} {0:>{CN}} {0:>{CP}} "
                            f"SKIP ({season}<season_yr_min={season_yr_min})"
                        )
                        continue

                    # --- Layer blocked or method decision needed ---
                    if reg.readiness != Readiness.RUNNABLE or layer_db is None:
                        status = reg.readiness.value
                        self.stdout.write(
                            f"{layer_key:<{CL}} {year:>{CY}} {season:<{CS}} "
                            f"{0:>{CF}} {0:>{CV}} {0:>{CN}} {0:>{CP}} {status}"
                        )
                        if reg.block_reason and reg.block_reason not in [n[1] for n in block_notes]:
                            block_notes.append((layer_key, reg.block_reason))
                        continue

                    # --- Runnable ---
                    valid_keys, null_keys = self._load_existing_keys(
                        layer_db, admin_level, [year], [season]
                    )
                    valid_count = len(valid_keys)
                    null_count = len(null_keys)
                    completed = valid_count + (0 if retry_null else null_count)
                    pending = total_features - completed if skip_existing else total_features

                    date_start, date_end = resolve_season_dates(year, season)
                    convention = (
                        "end-year convention"
                        if season == "dry_season"
                        else "calendar year"
                    )

                    self.stdout.write(
                        f"{layer_key:<{CL}} {year:>{CY}} {season:<{CS}} "
                        f"{total_features:>{CF}} {valid_count:>{CV}} {null_count:>{CN}} "
                        f"{pending:>{CP}} RUNNABLE"
                    )
                    self.stdout.write(
                        f"  -> date window: {date_start} to {date_end}  ({convention})"
                    )

                    grand_total += total_features
                    grand_valid += valid_count
                    grand_null += null_count
                    grand_pending += pending

        self.stdout.write(sep)

        # Block notes
        if block_notes:
            self.stdout.write("\nBlocked layer details:")
            for key, reason in block_notes:
                self.stdout.write(f"  {key}: {reason}")

        self._print_summary(grand_total, grand_valid, grand_null, grand_pending, skip_existing, retry_null)

    # ---- Compact table: aggregated over years, one row per layer × season ----

    def _print_compact_table(
        self, layer_keys, admin_level, years, seasons, total_features, skip_existing,
        retry_null=False,
    ):
        plan_year_min, plan_year_max = min(years), max(years)
        n_plan_years = len(years)

        # Print plan scope context before the table so it is explicit.
        if n_plan_years > 6:
            self.stdout.write(
                f"  Plan year envelope : {plan_year_min}-{plan_year_max} "
                f"({n_plan_years} years)"
            )
        else:
            self.stdout.write(
                f"  Plan years         : {', '.join(str(y) for y in sorted(years))}"
            )
        self.stdout.write(
            "  Eff range column   : source-supported years within the plan "
            "envelope, per layer.\n"
        )

        # Column widths — Valid + NoData replace the old Exist column.
        CL, CDS, CER, CS, CF, CV, CN, CP, CR = 14, 28, 17, 12, 6, 7, 7, 7, 20
        sep = "-" * (CL + CDS + CER + CS + CF + CV + CN + CP + CR + 8)
        hdr = (
            f"{'Layer':<{CL}} {'Source dataset':<{CDS}} {'Eff range':<{CER}} "
            f"{'Season':<{CS}} {'Poss':>{CF}} {'Valid':>{CV}} {'NoData':>{CN}} {'Pend':>{CP}} "
            f"{'Readiness':<{CR}}"
        )
        self.stdout.write(sep)
        self.stdout.write(hdr)
        self.stdout.write(sep)

        grand_poss = grand_valid = grand_null = grand_pending = 0
        block_notes = []
        coverage_notes = []

        for layer_key in layer_keys:
            try:
                reg = get_layer(layer_key)
            except ValueError:
                self.stdout.write(
                    self.style.WARNING(f"  Layer {layer_key!r} not in registry — skipped.")
                )
                continue

            layer_db = None
            try:
                layer_db = RemoteSensingLayer.objects.get(key=layer_key)
            except RemoteSensingLayer.DoesNotExist:
                pass

            # Partition plan years into source-supported (valid) vs excluded.
            valid_years = [
                y for y in years
                if (reg.valid_year_min is None or y >= reg.valid_year_min)
                and (reg.valid_year_max is None or y <= reg.valid_year_max)
            ]
            excluded_years = [y for y in years if y not in valid_years]

            # Record coverage exclusions for the footnote section.
            if excluded_years:
                n_excl = len(excluded_years)
                excl_min, excl_max = min(excluded_years), max(excluded_years)
                src_start = reg.valid_year_min or "?"
                coverage_notes.append(
                    f"{layer_key}: {excl_min}-{excl_max} ({n_excl} yr) outside "
                    f"source coverage ({src_start}-present) -- not scheduled."
                )

            # Snapshot layers (no seasons) — show the layer's own valid range.
            effective_seasons = [s for s in seasons if s in reg.supported_seasons]
            if not effective_seasons:
                snap_min = reg.valid_year_min or "?"
                snap_max = reg.valid_year_max or "present"
                snap_label = f"{snap_min}-{snap_max}"
                self.stdout.write(
                    f"{layer_key:<{CL}} {reg.source_dataset[:CDS-1]:<{CDS}} "
                    f"{snap_label:<{CER}} {'(snapshot)':<{CS}} "
                    f"{0:>{CF}} {0:>{CV}} {0:>{CN}} {0:>{CP}} {reg.readiness.value:<{CR}}"
                )
                if reg.block_reason:
                    block_notes.append((layer_key, reg.block_reason))
                continue

            for season in effective_seasons:
                # Apply per-season year minimum (e.g. dry_season 1982+ for CHIRPS).
                season_yr_min = reg.season_year_min.get(season)
                season_valid_years = [
                    y for y in valid_years
                    if season_yr_min is None or y >= season_yr_min
                ]

                # Build the per-season effective-range label.
                if season_valid_years:
                    sv_min, sv_max = min(season_valid_years), max(season_valid_years)
                    n_sv = len(season_valid_years)
                    if n_sv <= 2:
                        season_eff_label = ", ".join(
                            str(y) for y in sorted(season_valid_years)
                        )
                    else:
                        season_eff_label = f"{sv_min}-{sv_max} ({n_sv} yr)"
                else:
                    season_eff_label = (
                        f"N/A (starts {season_yr_min})" if season_yr_min
                        else f"N/A (src:{reg.valid_year_min or '?'}-"
                             f"{reg.valid_year_max or 'present'})"
                    )

                # Record season-level year exclusions in footnotes.
                if season_yr_min is not None and valid_years:
                    excl_by_season = [y for y in valid_years if y < season_yr_min]
                    if excl_by_season:
                        note = (
                            f"{layer_key} {season}: {len(excl_by_season)} yr below "
                            f"season_year_min={season_yr_min} excluded "
                            f"(source incomplete for {season} before {season_yr_min})."
                        )
                        if note not in coverage_notes:
                            coverage_notes.append(note)

                if reg.readiness == Readiness.RUNNABLE and season_valid_years and layer_db:
                    # --- Runnable ---
                    valid_keys, null_keys = self._load_existing_keys(
                        layer_db, admin_level, season_valid_years, [season]
                    )
                    valid_count = len(valid_keys)
                    null_count = len(null_keys)
                    poss = total_features * len(season_valid_years)
                    completed = valid_count + (0 if retry_null else null_count)
                    pending = poss - completed if skip_existing else poss

                    self.stdout.write(
                        f"{layer_key:<{CL}} {reg.source_dataset[:CDS-1]:<{CDS}} "
                        f"{season_eff_label:<{CER}} {season:<{CS}} "
                        f"{poss:>{CF}} {valid_count:>{CV}} {null_count:>{CN}} {pending:>{CP}} "
                        f"{'RUNNABLE':<{CR}}"
                    )

                    grand_poss += poss
                    grand_valid += valid_count
                    grand_null += null_count
                    grand_pending += pending
                else:
                    # --- Blocked / method decision ---
                    poss = total_features * len(season_valid_years) if season_valid_years else 0
                    self.stdout.write(
                        f"{layer_key:<{CL}} {reg.source_dataset[:CDS-1]:<{CDS}} "
                        f"{season_eff_label:<{CER}} {season:<{CS}} "
                        f"{poss:>{CF}} {0:>{CV}} {0:>{CN}} {0:>{CP}} "
                        f"{reg.readiness.value:<{CR}}"
                    )
                    if reg.block_reason:
                        block_notes.append((layer_key, reg.block_reason))

        self.stdout.write(sep)

        # Source coverage exclusion notes (deduped, only when years differ per layer).
        if coverage_notes:
            self.stdout.write("\nSource coverage exclusions:")
            for note in coverage_notes:
                self.stdout.write(f"  {note}")

        # Block reason legend (deduplicated).
        seen = set()
        if block_notes:
            self.stdout.write("\nBlock / decision notes:")
            for key, reason in block_notes:
                if reason not in seen:
                    seen.add(reason)
                    words, line, lines = reason.split(), "", []
                    for w in words:
                        if len(line) + len(w) + 1 > 72:
                            lines.append(line)
                            line = w
                        else:
                            line = f"{line} {w}" if line else w
                    if line:
                        lines.append(line)
                    self.stdout.write(f"  [{key}]")
                    for ln in lines:
                        self.stdout.write(f"    {ln}")

        # Note on dry_season year convention.
        self.stdout.write(
            "\n  Note: dry_season YYYY = 01 Nov (YYYY-1) to 31 Mar YYYY  "
            "(end-year convention)."
        )

        self._print_summary(grand_poss, grand_valid, grand_null, grand_pending, skip_existing, retry_null)

    # ---- Summary footer ----

    def _print_summary(
        self, grand_total, grand_valid, grand_null, grand_pending, skip_existing,
        retry_null=False,
    ):
        grand_completed = grand_valid + grand_null
        self.stdout.write("")
        self.stdout.write("SUMMARY")
        self.stdout.write(f"  Total tasks in runnable scope : {grand_total}")
        self.stdout.write(f"  Valid metrics saved           : {grand_valid}")
        self.stdout.write(f"  Known no-data records         : {grand_null}")
        self.stdout.write(f"  Completed task keys           : {grand_completed}")
        if skip_existing:
            suffix = "  (--retry-null-results ON)" if retry_null else "  (skip-existing ON)"
            self.stdout.write(f"  Pending GEE calls             : {grand_pending}{suffix}")
        else:
            self.stdout.write(
                f"  Pending GEE calls             : {grand_pending}  "
                f"(skip-existing OFF — all records would be recomputed)"
            )
        self.stdout.write("")

        if grand_pending > 0:
            self.stdout.write(
                self.style.SUCCESS(
                    f"  -> {grand_pending} GEE call(s) would be issued on live execution."
                )
            )
        elif grand_total > 0:
            self.stdout.write("  -> All runnable tasks already saved.  Nothing to process.")
        else:
            self.stdout.write(
                "  -> No runnable tasks in scope.  "
                "Check layer readiness and year validity."
            )

        self.stdout.write(
            "\n  DRY RUN complete.  No GEE calls made.  No database records written.\n"
        )

    # ------------------------------------------------------------------
    # Live execution
    # ------------------------------------------------------------------

    def _run_live(
        self, plan_name, layer_keys, admin_level, years, seasons, features,
        skip_existing, max_tasks, continue_on_error, report, retry_null=False,
    ):
        # Validate that at least one layer is runnable before touching GEE.
        runnable_keys = []
        for key in layer_keys:
            try:
                reg = get_layer(key)
            except ValueError:
                self.stdout.write(
                    self.style.WARNING(f"Layer {key!r} not in registry — skipped.")
                )
                continue
            if reg.readiness != Readiness.RUNNABLE:
                self.stdout.write(
                    self.style.WARNING(
                        f"Layer {key!r} is {reg.readiness.value} — skipped.  "
                        f"Reason: {reg.block_reason}"
                    )
                )
                continue
            runnable_keys.append(key)

        if not runnable_keys:
            raise CommandError(
                "No runnable layers in this plan.  "
                "Use --dry-run to inspect the readiness of each layer."
            )

        name_field = _NAME_FIELD[admin_level]
        code_field = _CODE_FIELD[admin_level]

        lga_lookup = {}
        if admin_level == "lga":
            lga_lookup = {
                _normalize(lga.lga_name): lga
                for lga in LGARegistry.objects.all()
            }

        self.stdout.write("Initializing GEE...")
        init_result = gee_service.initialize()
        if not init_result.available:
            raise CommandError(f"GEE initialization failed: {init_result.error}")
        auth_mode = init_result.data.get("auth_mode", "unknown")
        self.stdout.write(
            self.style.SUCCESS(
                f"GEE ready — auth: {auth_mode}, project: {gee_service.project}"
            )
        )

        sync_log = RemoteSensingSyncLog.objects.create(
            layer=None,
            status=RemoteSensingSyncLog.Status.STARTED,
            message=f"Atlas sync started — plan={plan_name} layers={runnable_keys}",
            details={
                "plan": plan_name,
                "layers": runnable_keys,
                "admin_level": admin_level,
                "years": sorted(years),
                "seasons": seasons,
                "skip_existing": skip_existing,
                "retry_null_results": retry_null,
                "max_tasks": max_tasks,
            },
        )
        self.stdout.write(f"Sync log #{sync_log.pk} created.")

        total_created = total_updated = total_skipped = total_no_data = total_failed = task_count = 0

        try:
            for layer_key in runnable_keys:
                reg = get_layer(layer_key)

                try:
                    layer_db = RemoteSensingLayer.objects.get(key=layer_key)
                except RemoteSensingLayer.DoesNotExist:
                    raise CommandError(
                        f"Layer {layer_key!r} not found in the database.  "
                        "Run: python manage.py seed_remote_sensing_layers"
                    )

                valid_years = [
                    y for y in years
                    if (reg.valid_year_min is None or y >= reg.valid_year_min)
                    and (reg.valid_year_max is None or y <= reg.valid_year_max)
                ]
                if not valid_years:
                    self.stdout.write(
                        self.style.WARNING(
                            f"No valid years for {layer_key} in {years} — skipped."
                        )
                    )
                    continue

                for year in sorted(valid_years):
                    for season in seasons:
                        if season not in reg.supported_seasons:
                            self.stdout.write(
                                f"  Skip: {layer_key} season={season} not applicable."
                            )
                            continue

                        # Per-season year minimum (e.g. dry_season 1982+ for CHIRPS).
                        season_yr_min = reg.season_year_min.get(season)
                        if season_yr_min is not None and year < season_yr_min:
                            self.stdout.write(
                                f"  Skip: {layer_key} year={year} season={season} "
                                f"(season_year_min={season_yr_min} — source incomplete)."
                            )
                            continue

                        date_start, date_end = resolve_season_dates(year, season)
                        gee_start = date_start.isoformat()
                        gee_end = (date_end + datetime.timedelta(days=1)).isoformat()

                        self.stdout.write(
                            f"\n[{layer_key}] year={year} season={season}  "
                            f"dates={date_start} -> {date_end}"
                        )

                        # Build base metadata once per (layer, year, season).
                        # Available to both the null-result sentinel and valid-result branches.
                        base_record_metadata = {
                            "gee_project": gee_service.project,
                            "plan": plan_name,
                            "layer": layer_key,
                            "source_collection": reg.gee_collection,
                            "scale_m": reg.default_scale,
                            "start_date": date_start.isoformat(),
                            "end_date": date_end.isoformat(),
                            "season": season,
                            "season_year_convention": (
                                "dry_season_end_year"
                                if season == "dry_season"
                                else "calendar_year"
                            ),
                            **reg.metadata_extras,
                        }

                        if skip_existing:
                            valid_keys, null_keys = self._load_existing_keys(
                                layer_db, admin_level, [year], [season]
                            )
                            skip_keys = valid_keys | null_keys
                            if retry_null:
                                skip_keys = valid_keys
                        else:
                            valid_keys = null_keys = skip_keys = set()

                        for feat in features:
                            if max_tasks is not None and task_count >= max_tasks:
                                self.stdout.write(
                                    self.style.WARNING(
                                        f"\nReached --max-tasks={max_tasks}.  Stopping."
                                    )
                                )
                                self._close_sync_log(
                                    sync_log, auth_mode, plan_name, admin_level,
                                    years, seasons,
                                    total_created, total_updated,
                                    total_skipped, total_no_data, total_failed,
                                )
                                return

                            props = feat["properties"]
                            admin_name = props[name_field]
                            admin_code = props[code_field]
                            task_count += 1

                            if (admin_code, year, season) in skip_keys:
                                self.stdout.write(f"  Skip (exists): {admin_name}")
                                total_skipped += 1
                                continue

                            lga_obj = None
                            if admin_level == "lga":
                                lga_obj = lga_lookup.get(_normalize(admin_name))
                                if not lga_obj:
                                    self.stdout.write(
                                        self.style.WARNING(
                                            f"  No DB LGA match: {admin_name}"
                                        )
                                    )
                                    total_skipped += 1
                                    continue

                            # Dispatch to the layer-specific GEE method.
                            # entry_point and default_scale are declared in sync_registry.py.
                            gee_method = getattr(gee_service, reg.entry_point, None)
                            if gee_method is None:
                                raise CommandError(
                                    f"gee_service has no method {reg.entry_point!r} "
                                    f"(layer={layer_key}).  "
                                    "Implement the method or mark the layer BLOCKED."
                                )
                            gee_result = gee_method(
                                feat["geometry"], gee_start, gee_end,
                                scale=reg.default_scale,
                            )

                            if not gee_result.available:
                                self.stdout.write(
                                    self.style.WARNING(
                                        f"  GEE error [{admin_name}]: {gee_result.error}"
                                    )
                                )
                                total_failed += 1
                                if not continue_on_error:
                                    self._close_sync_log(
                                        sync_log, auth_mode, plan_name, admin_level,
                                        years, seasons,
                                        total_created, total_updated,
                                        total_skipped, total_no_data, total_failed,
                                        status=RemoteSensingSyncLog.Status.FAILED,
                                    )
                                    raise CommandError(
                                        f"GEE error for {admin_name}: {gee_result.error}"
                                    )
                                continue

                            mean_val = gee_result.data.get("mean")
                            min_val = gee_result.data.get("min")
                            max_val = gee_result.data.get("max")

                            dynamic_metadata = {}
                            if gee_result.data:
                                candidate_metadata = gee_result.data.get("metadata", {})
                                if isinstance(candidate_metadata, dict):
                                    dynamic_metadata = {
                                        key: value
                                        for key, value in candidate_metadata.items()
                                        if value is not None
                                    }
                            record_metadata = {**base_record_metadata, **dynamic_metadata}

                            if mean_val is None:
                                # GEE returned no valid result for this task (e.g. all
                                # Sentinel-2 pixels masked after cloud filtering).
                                # Write a null-value sentinel so the task is not counted
                                # as pending on future dry-runs and skip-existing retries.
                                self.stdout.write(
                                    self.style.WARNING(
                                        f"  No data: {admin_name} ({admin_code})"
                                    )
                                )
                                RemoteSensingLGAMetric.objects.update_or_create(
                                    layer=layer_db,
                                    admin_level=admin_level,
                                    admin_code=admin_code,
                                    year=year,
                                    season=season,
                                    defaults={
                                        "admin_name": admin_name,
                                        "lga": lga_obj,
                                        "month": None,
                                        "mean_value": None,
                                        "min_value": None,
                                        "max_value": None,
                                        "unit": reg.output_unit,
                                        "data_source": reg.gee_collection,
                                        "metadata": {
                                            **record_metadata,
                                            "result_status": "no_data",
                                            "null_reason": "no_valid_observations",
                                        },
                                    },
                                )
                                total_no_data += 1
                                continue

                            # Save valid metric immediately — makes the run resumable.
                            _, was_created = RemoteSensingLGAMetric.objects.update_or_create(
                                layer=layer_db,
                                admin_level=admin_level,
                                admin_code=admin_code,
                                year=year,
                                season=season,
                                defaults={
                                    "admin_name": admin_name,
                                    "lga": lga_obj,
                                    "month": None,
                                    "mean_value": Decimal(str(round(mean_val, 6))),
                                    "min_value": (
                                        Decimal(str(round(min_val, 6)))
                                        if min_val is not None else None
                                    ),
                                    "max_value": (
                                        Decimal(str(round(max_val, 6)))
                                        if max_val is not None else None
                                    ),
                                    "unit": reg.output_unit,
                                    "data_source": reg.gee_collection,
                                    "metadata": record_metadata,
                                },
                            )

                            tag = "Created" if was_created else "Updated"
                            self.stdout.write(
                                f"  {tag}: {admin_name} ({admin_code}) "
                                f"— mean {round(mean_val, 4)}"
                            )
                            if was_created:
                                total_created += 1
                            else:
                                total_updated += 1

                        # Update layer's last-synced timestamp after each season batch.
                        layer_db.last_synced_at = timezone.now()
                        layer_db.save(update_fields=["last_synced_at"])

        except CommandError:
            raise
        except Exception as exc:
            self._close_sync_log(
                sync_log, auth_mode, plan_name, admin_level, years, seasons,
                total_created, total_updated, total_skipped, total_no_data, total_failed,
                status=RemoteSensingSyncLog.Status.FAILED,
                extra_message=str(exc),
            )
            raise CommandError(str(exc)) from exc

        self._close_sync_log(
            sync_log, auth_mode, plan_name, admin_level, years, seasons,
            total_created, total_updated, total_skipped, total_no_data, total_failed,
        )

        if report:
            self.stdout.write("\nFINAL REPORT")
            self.stdout.write(f"  Valid metrics saved     : {total_created + total_updated}")
            self.stdout.write(f"    Created               : {total_created}")
            self.stdout.write(f"    Updated               : {total_updated}")
            self.stdout.write(f"  Known no-data records   : {total_no_data}")
            self.stdout.write(f"  Skipped (existing)      : {total_skipped}")
            self.stdout.write(f"  Failed (GEE error)      : {total_failed}")
            self.stdout.write(f"  Tasks processed         : {task_count}")

    # ------------------------------------------------------------------
    # Sync log helpers
    # ------------------------------------------------------------------

    def _close_sync_log(
        self, sync_log, auth_mode, plan_name, admin_level,
        years, seasons, created, updated, skipped, no_data, failed,
        status=None, extra_message="",
    ):
        if status is None:
            status = RemoteSensingSyncLog.Status.COMPLETED
        outcome = "complete" if status == RemoteSensingSyncLog.Status.COMPLETED else "failed"
        summary = (
            f"Atlas sync {outcome} — plan={plan_name} admin={admin_level}.  "
            f"Valid: {created + updated} (created {created}, updated {updated}).  "
            f"No-data: {no_data}.  Skipped: {skipped}.  Failed: {failed}."
        )
        if extra_message:
            summary += f"  Error: {extra_message}"

        sync_log.status = status
        sync_log.message = summary
        sync_log.details.update({
            "created": created,
            "updated": updated,
            "no_data": no_data,
            "skipped": skipped,
            "failed": failed,
            "auth_mode": auth_mode,
        })
        sync_log.completed_at = timezone.now()
        sync_log.save()

        if status == RemoteSensingSyncLog.Status.COMPLETED:
            self.stdout.write(self.style.SUCCESS(f"\n{summary}"))
        else:
            self.stdout.write(self.style.ERROR(f"\n{summary}"))
