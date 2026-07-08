"""
Central registry for the KCCC Climate Atlas GEE sync pipeline.

Single source of truth for:
  - season-date resolution (with the approved end-year convention)
  - layer definitions (source, valid years, readiness, entry point)
  - named sync plans

Nothing about "which data to process, when, and from where" should be
scattered across individual management command files.
"""

import datetime
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Tuple


# ---------------------------------------------------------------------------
# Season-date resolver  —  END-YEAR convention
# ---------------------------------------------------------------------------
#
# Approved definitions (Nigeria / Kaduna):
#
#   annual      YYYY  →  01 Jan YYYY  –  31 Dec YYYY
#   wet_season  YYYY  →  01 May YYYY  –  31 Oct YYYY
#   dry_season  YYYY  →  01 Nov (YYYY-1)  –  31 Mar YYYY
#
# For dry_season, YYYY is the END year (the year in which the season closes).
# Example:  dry_season 2025  →  01 Nov 2024  –  31 Mar 2025
#
# GEE filterDate uses an exclusive end date.  Callers that pass the result to
# GEE must add timedelta(days=1) to end_date before calling filterDate.

SUPPORTED_SEASONS: Tuple[str, ...] = ("annual", "wet_season", "dry_season")


def resolve_season_dates(year: int, season: str) -> Tuple[datetime.date, datetime.date]:
    """
    Return (start_date, end_date) inclusive for the given year + season.

    For dry_season, ``year`` is the END year (March of that year is the close).
    The returned end_date is inclusive; add one day before passing to GEE.
    """
    if season == "annual":
        return datetime.date(year, 1, 1), datetime.date(year, 12, 31)

    if season == "wet_season":
        return datetime.date(year, 5, 1), datetime.date(year, 10, 31)

    if season == "dry_season":
        # Dry season spans Nov of the PREVIOUS calendar year through Mar of year.
        return datetime.date(year - 1, 11, 1), datetime.date(year, 3, 31)

    raise ValueError(
        f"Unknown season: {season!r}. Valid values: {', '.join(SUPPORTED_SEASONS)}"
    )


# ---------------------------------------------------------------------------
# Readiness states
# ---------------------------------------------------------------------------


class Readiness(str, Enum):
    RUNNABLE = "RUNNABLE"
    BLOCKED = "BLOCKED"
    METHOD_DECISION_REQUIRED = "METHOD_DECISION_REQUIRED"
    DATABASE_DERIVED = "DATABASE_DERIVED"


# ---------------------------------------------------------------------------
# Layer registry entry
# ---------------------------------------------------------------------------


@dataclass
class LayerRegistryEntry:
    key: str
    label: str
    source_dataset: str          # Human-readable source name
    gee_collection: str          # GEE asset ID used in computation
    valid_year_min: Optional[int]  # Inclusive lower bound; None = unknown
    valid_year_max: Optional[int]  # Inclusive upper bound; None = up to today
    supported_seasons: Tuple[str, ...]
    output_unit: str
    readiness: Readiness
    block_reason: str = ""
    entry_point: str = ""        # gee_service method name for live execution
    notes: str = ""
    # Native GEE computation scale in metres.  Drives the scale= arg in live runs.
    default_scale: int = 60
    # Layer-specific metadata additions merged into each saved record's metadata dict.
    metadata_extras: dict = field(default_factory=dict)
    # Per-season minimum year overrides.  Takes precedence over valid_year_min for
    # the named season only.  Use when source data is incomplete for a season even
    # though the source exists for that calendar year.
    # Example: {"dry_season": 1982} — CHIRPS begins 1981-01-01, so dry_season 1981
    # (Nov 1980–Mar 1981) is partially outside the available record.
    season_year_min: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Layer registry
# ---------------------------------------------------------------------------

LAYER_REGISTRY: dict = {

    "ndvi": LayerRegistryEntry(
        key="ndvi",
        label="Vegetation / NDVI",
        source_dataset="Sentinel-2 SR Harmonized",
        gee_collection="COPERNICUS/S2_SR_HARMONIZED",
        valid_year_min=2017,
        valid_year_max=None,   # current year
        supported_seasons=SUPPORTED_SEASONS,
        output_unit="NDVI (-1 to 1)",
        readiness=Readiness.RUNNABLE,
        block_reason="",
        entry_point="compute_ndvi_for_geometry",
        default_scale=60,
        metadata_extras={
            "composite": "median",
            "cloud_filter_pct": 30,
            "statistic": "ndvi_median",
        },
        notes=(
            "Sentinel-2A operational from June 2015; the SR Harmonized product is "
            "reliable from 2017 onward.  Pre-2017 NDVI requires a Landsat-based "
            "strategy with cross-sensor calibration — do not schedule until that "
            "strategy is formally approved."
        ),
    ),

    "rainfall": LayerRegistryEntry(
        key="rainfall",
        label="Rainfall Total",
        source_dataset="CHIRPS v2.0 Daily",
        gee_collection="UCSB-CHG/CHIRPS/DAILY",
        valid_year_min=1981,
        valid_year_max=None,
        supported_seasons=SUPPORTED_SEASONS,
        output_unit="mm",
        readiness=Readiness.RUNNABLE,
        block_reason="",
        entry_point="compute_rainfall_for_geometry",
        default_scale=5566,
        metadata_extras={
            "product_type": "accumulated_total",
            "statistic": "spatial_mean_accumulated_rainfall",
            "method_version": "chirps_daily_sum_v1",
        },
        # dry_season 1981 = Nov 1980 – Mar 1981.  CHIRPS begins 1981-01-01, so
        # Nov/Dec 1980 data does not exist; the season window is incomplete.
        # Exclude dry_season 1981 — use 1982 as the earliest complete dry season.
        season_year_min={"dry_season": 1982},
        notes=(
            "CHIRPS v2.0 covers 1981-present globally with an ~2-month near-real-time lag.  "
            "mean_value = spatial mean of accumulated (summed) daily precipitation "
            "across the LGA geometry for the season window, in mm.  "
            "This is an ACCUMULATED TOTAL — not a rainfall anomaly.  "
            "scale=5566 m matches the native 0.05° CHIRPS pixel resolution (~5.5 km).  "
            "dry_season 1981 excluded: CHIRPS starts 1981-01-01, making the Nov 1980–Mar 1981 "
            "window partially outside the available record.  First complete dry season: 1982."
        ),
    ),

    "lst": LayerRegistryEntry(
        key="lst",
        label="Land Surface Temperature (Daytime)",
        source_dataset="MODIS Terra MOD11A1 v061 (Daily)",
        gee_collection="MODIS/061/MOD11A1",
        valid_year_min=2001,
        valid_year_max=2025,
        supported_seasons=SUPPORTED_SEASONS,
        output_unit="°C",
        readiness=Readiness.RUNNABLE,
        block_reason="",
        entry_point="compute_lst_for_geometry",
        default_scale=1000,
        metadata_extras={
            "temporal_source":    "Terra MODIS daily",
            "quality_policy":     "mandatory QA <=1; data quality <=1; LST error <=1",
            "temperature_measure": (
                "daytime land-surface temperature, not air temperature"
            ),
            "method_version":     "mod11a1_daytime_lst_v1",
        },
        notes=(
            "MOD11A1: Terra MODIS daily 1 km LST product.  "
            "Globally available from 2000-02-24; 2001 used as valid_year_min for "
            "complete seasonal coverage.  "
            "QC mask: mandatory_ok (bits 0-1 ≤ 1), data_quality_ok (bits 2-3 ≤ 1), "
            "lst_error_ok (bits 6-7 ≤ 1).  "
            "Temporal composite: quality-filtered daily mean.  "
            "Scale: 1000 m (native resolution).  "
            "Output: daytime LST in Celsius (DN * 0.02 - 273.15).  "
            "Public layer in the current release-state audit; keep it distinct from air temperature."
        ),
    ),

    "flood_hazard": LayerRegistryEntry(
        key="flood_hazard",
        label="Flood Hazard",
        source_dataset="JRC Global Surface Water v1.4 / Sentinel-1 SAR",
        gee_collection="JRC/GSW1_4/GlobalSurfaceWater",
        valid_year_min=1984,
        valid_year_max=None,
        supported_seasons=("annual",),  # occurrence frequency is not seasonal in the same sense
        output_unit="Index (0-1)",
        readiness=Readiness.METHOD_DECISION_REQUIRED,
        block_reason=(
            "Annual/seasonal flood hazard metric not formally defined.  "
            "Candidates: JRC occurrence %, JRC recurrence, Sentinel-1 flood archive, "
            "or terrain+water composite index.  Cannot schedule until the metric "
            "definition is approved and a GEE function is implemented."
        ),
        entry_point="compute_flood_hazard_for_geometry",
        notes=(
            "JRC GSW v1.4 provides static occurrence/recurrence products (1984-2021).  "
            "Sentinel-1 SAR flood archive available from 2014.  "
            "Seasonal interpretation of flood hazard requires a formal method decision.  "
            "Candidate approach: combine JRC occurrence (see flood_occurrence entry) with "
            "terrain/HAND-derived susceptibility or Sentinel-1 archive — not approved yet.  "
            "--- "
            "SAFETY: Catalog shell only — no data loaded and no GEE function implemented.  "
            "is_public=False, is_active=False in seed_remote_sensing_layers.py.  "
            "Do not set either flag to True without an approved metric definition, "
            "a completed GEE implementation, and loaded data."
        ),
    ),

    "flood_occurrence": LayerRegistryEntry(
        key="flood_occurrence",
        label="Flood Occurrence (JRC GSW v1.4)",
        source_dataset="JRC Global Surface Water v1.4 (Landsat 1984–2021)",
        gee_collection="JRC/GSW1_4/GlobalSurfaceWater",
        valid_year_min=2021,
        valid_year_max=2021,
        supported_seasons=("annual",),
        output_unit="%",
        readiness=Readiness.RUNNABLE,
        block_reason="",
        entry_point="compute_flood_occurrence_for_geometry",
        default_scale=30,
        metadata_extras={
            "method_version": "jrc_gsw14_occurrence_mean_v1",
            "product_type": "historical_surface_water_occurrence",
            "observation_period": "1984-2021",
        },
        notes=(
            "JRC Global Surface Water v1.4 occurrence band: percentage of the 1984–2021 "
            "observation period that open surface water was detected by Landsat.  "
            "Static product — not a time-series layer and not seasonal.  "
            "year=2021 is used as the representative label (end of the v1.4 window).  "
            "mean_value = spatial mean of occurrence % over the LGA geometry (0–100).  "
            "metadata also stores threshold area fractions: "
            "area_pct_occurrence_gt_10 / _gt_25 / _gt_50.  "
            "scale=30 m matches the Landsat-derived native pixel resolution.  "
            "CAUTION: historical surface-water occurrence indicator — not a real-time "
            "alert; consult official sources for current conditions.  "
            "is_public=False, is_active=False — do not expose until editorial sign-off."
        ),
    ),

    "elevation": LayerRegistryEntry(
        key="elevation",
        label="Elevation / Terrain",
        source_dataset="USGS SRTMGL1 v003 (NASA SRTM)",
        gee_collection="USGS/SRTMGL1_003",
        valid_year_min=2000,
        valid_year_max=2000,
        supported_seasons=("annual",),  # static product — not seasonal
        output_unit="m",
        readiness=Readiness.RUNNABLE,
        block_reason="",
        entry_point="compute_elevation_for_geometry",
        default_scale=30,
        metadata_extras={
            "method_version": "srtm_mean_elevation_v1",
            "product_type": "static_topographic_dem",
            "acquisition_period": "~2000 (SRTM mission)",
        },
        notes=(
            "NASA SRTM (Shuttle Radar Topography Mission) ~2000 topographic DEM.  "
            "Available in GEE as USGS/SRTMGL1_003 (~1 arc-second / 30 m resolution).  "
            "Static product — year=2000 is the representative label (SRTM acquisition date).  "
            "mean_value = spatial mean of pixel elevation (m) over the LGA geometry.  "
            "metadata also stores min_elevation_m, max_elevation_m, std_elevation_m.  "
            "scale=30 m matches the native ~1 arc-second SRTM resolution.  "
            "NOT a climate variable — topographic context layer for exposure and hazard analysis.  "
            "SAFETY: is_public=False, is_active=False in seed — do not expose until QA reviewed."
        ),
    ),

    "drought_index": LayerRegistryEntry(
        key="drought_index",
        label="Meteorological Drought Conditions (SPI)",
        source_dataset="CHIRPS v2.0 Daily rainfall totals",
        gee_collection="",
        valid_year_min=1981,
        valid_year_max=None,
        supported_seasons=SUPPORTED_SEASONS,
        output_unit="SPI",
        readiness=Readiness.DATABASE_DERIVED,
        block_reason="",
        entry_point="",
        metadata_extras={
            "method_version": "spi_gamma_fixed_window_chirps_baseline_1991_2020_v1",
            "source_layer": "rainfall",
            "source_dataset": "CHIRPS v2.0 Daily",
            "baseline_definition": "1991-2020_gamma_fit_by_lga_and_season",
            "distribution": "Gamma(shape, loc=0, scale) with baseline zero-rainfall probability",
        },
        season_year_min={"dry_season": 1982},
        notes=(
            "Database-derived fixed-window Standardized Precipitation Index.  "
            "Computed by build_drought_conditions from completed CHIRPS rainfall totals only.  "
            "Annual, Wet Season, and Dry Season each use independent LGA-level gamma fits "
            "over the 1991-2020 baseline, with at least 25 valid baseline samples required.  "
            "Precipitation-only meteorological drought indicator; not agricultural or "
            "hydrological drought.  Public layer in the current release-state audit."
        ),
    ),
    "lulc": LayerRegistryEntry(
        key="lulc",
        label="Annual Land Use / Land Cover (Dynamic World v1)",
        source_dataset="Dynamic World v1 (Google / WRI)",
        gee_collection="GOOGLE/DYNAMICWORLD/V1",
        valid_year_min=2018,
        valid_year_max=None,    # current year
        supported_seasons=(),   # wet-season composite — managed by LandCoverDataset, not Season enum
        output_unit="Class %",
        readiness=Readiness.RUNNABLE,
        block_reason="",
        entry_point="compute_land_cover_for_geometry",
        notes=(
            "PHASE 1 OFFICIAL METHOD (adopted 2026-06-30): "
            "Dynamic World v1, late_wet_season composite (Sep 1–Oct 31), "
            "peak months Sep+Oct, method_version=dw_latewet_mode_v1.  "
            "Phase 1 product: Annual Land Use / Land Cover snapshots, 2018–present.  "
            "NOT change analysis, NOT degradation, NOT trend, NOT deforestation.  "
            "Phase 2 (future, not approved): Historical Landsat LULC ~1984–2017, "
            "separate methodology.  "
            "1981 LULC not supported at Dynamic World (10 m) resolution — Landsat required.  "
            "--- "
            "Sep-Oct pilot results (2026-06-30): late_wet_season eliminates the systematic "
            "Jul-Aug cloud gap.  2024 wet_season = 5/5 LGAs low quality (0-1 Jul+Aug scenes); "
            "2024 late_wet_season = 4/5 high + 1/5 medium.  "
            "Bare-ground spike (Soba 10.3%, Zaria 11.7%) under wet_season 2024 confirmed "
            "cloud-shadow artifact; drops to <0.3% under late_wet_season.  "
            "Dominant class stable across windows for 4/5 LGAs; Soba 2018 is marginal "
            "(Guinea Savanna mixed zone).  "
            "--- "
            "Existing datasets: #3 (2018 wet_season 5-LGA), #4 (2024 wet_season 23-LGA), "
            "#5 (2018 late_wet_season 5-LGA), #6 (2024 late_wet_season 5-LGA).  "
            "All: is_public=False, is_validated=False.  "
            "GEE auth: application_default credentials, project kccc-499913.  "
            "Quality thresholds: high>=5, medium=2-4, low=0-1 peak-season scenes.  "
            "compute_quality_flag() in lulc_providers.py is the canonical threshold function.  "
            "LandCoverDerivedMetric and build_land_cover_change are Phase 2/3 tooling only."
        ),
    ),

    "rainfall_anomaly": LayerRegistryEntry(
        key="rainfall_anomaly",
        label="Rainfall Anomaly",
        source_dataset="Derived from CHIRPS v2.0 Daily rainfall totals",
        gee_collection="",   # database-derived — no GEE collection
        valid_year_min=1981,
        valid_year_max=None,
        supported_seasons=SUPPORTED_SEASONS,
        output_unit="%",
        readiness=Readiness.DATABASE_DERIVED,
        block_reason="",
        entry_point="",      # database-derived — use build_rainfall_anomaly command
        metadata_extras={
            "method_version": "rainfall_anomaly_chirps_baseline_1991_2020_v1",
            "source_layer": "rainfall",
            "baseline_definition": "1991-2020_mean",
            "anomaly_formula": "(observed_mm - baseline_mean_mm) / baseline_mean_mm * 100",
        },
        season_year_min={"dry_season": 1982},
        notes=(
            "Derived product computed by build_rainfall_anomaly management command.  "
            "Not a GEE layer — no GEE calls required.  "
            "Baseline period: 1991–2020 (30-year WMO standard).  "
            "Minimum 25 valid baseline years required per (LGA, season) group.  "
            "anomaly_percent = (observed_mm − baseline_mean_mm) / baseline_mean_mm × 100.  "
            "Public layer in the current release-state audit; do not conflate with Rainfall Total or SPI."
        ),
    ),

    "ndvi_landsat": LayerRegistryEntry(
        key="ndvi_landsat",
        label="Historical NDVI (Landsat Collection 2)",
        source_dataset=(
            "Landsat Collection 2 Level-2 Surface Reflectance — "
            "LT05 / LE07 / LC08 selected by full-date-window eligibility"
        ),
        gee_collection="multi_sensor_landsat_c2_l2",
        valid_year_min=1985,
        valid_year_max=2017,
        supported_seasons=SUPPORTED_SEASONS,
        output_unit="NDVI (-1 to 1)",
        readiness=Readiness.RUNNABLE,
        entry_point="compute_landsat_ndvi_for_geometry",
        default_scale=30,
        metadata_extras={
            "sensor_family": "landsat_c2_l2_single_sensor",
            "source_selection_policy": "primary_window_sensor_with_archive_fallback",
            "composite": "median",
            "qa_method": "sensor_specific_qa_pixel_and_radsat",
            "scaling_formula": "DN * 0.0000275 + (-0.2)",
            "method_version": "ndvi_landsat_c2_l2_v2",
            "comparability_note": (
                "Landsat C2 L2 NDVI is not directly comparable to Sentinel-2 MSI NDVI "
                "without explicit cross-sensor calibration. "
                "Landsat coverage is 1985-2017; Sentinel-2 coverage begins in 2018."
            ),
        },
        notes=(
            "LT05 primary 1985-2011; LE07 bridge ~2012-2013; "
            "LC08 primary 2013-2017. Sensor selected per task by full-date-window "
            "eligibility. Public layer in the current release-state audit; keep it scientifically distinct from Sentinel-2 NDVI."
        ),
    ),
}


def get_layer(key: str) -> LayerRegistryEntry:
    """Return a LayerRegistryEntry by key, or raise ValueError."""
    try:
        return LAYER_REGISTRY[key]
    except KeyError:
        available = ", ".join(sorted(LAYER_REGISTRY.keys()))
        raise ValueError(f"Unknown layer key: {key!r}. Available: {available}")


# ---------------------------------------------------------------------------
# Named sync plans
# ---------------------------------------------------------------------------


@dataclass
class SyncPlan:
    name: str
    description: str
    layer_keys: List[str]
    admin_level: str
    years: List[int]
    seasons: List[str]


NAMED_PLANS: dict = {

    "ndvi_2025_lga": SyncPlan(
        name="ndvi_2025_lga",
        description=(
            "NDVI for all 23 Kaduna LGAs, year 2025, all three seasons "
            "(annual, wet_season, dry_season).  Uses existing Sentinel-2 SR logic."
        ),
        layer_keys=["ndvi"],
        admin_level="lga",
        years=[2025],
        seasons=["annual", "wet_season", "dry_season"],
    ),

    # Operational plan — 2021–2025 window only.
    # All six roadmap layers are listed so the dry run shows current scope.
    # Runnable layers: NDVI, Rainfall, LST, and Landsat NDVI.
    # Database-derived layers: rainfall_anomaly and drought_index.
    # flood_hazard and lulc still require method decisions.
    "lga_atlas_current_era": SyncPlan(
        name="lga_atlas_current_era",
        description=(
            "Current-era operational plan for all six roadmap layers at LGA level, "
            "years 2021-2025 (5-year window).  "
            "NDVI, Rainfall, LST, and Landsat NDVI are runnable.  "
            "rainfall_anomaly and drought_index are database-derived.  "
            "flood_hazard and lulc still require method decisions."
        ),
        layer_keys=["ndvi", "rainfall", "lst", "flood_hazard", "drought_index", "lulc"],
        admin_level="lga",
        years=[2021, 2022, 2023, 2024, 2025],
        seasons=["annual", "wet_season", "dry_season"],
    ),

    # Historical planning reference — full source-supported year ranges per layer.
    # years spans 1981–2025 as the broadest envelope; each layer's valid_year_min/max
    # in the registry narrows the effective range automatically:
    #   NDVI       : 2017–2025  (Sentinel-2 SR Harmonized)
    #   Rainfall   : 1981–2025  (CHIRPS v2.0)
    #   LST        : 2001–2025  (MODIS MOD11A1)
    #   Landsat NDVI: 1985–2017 (historical backfill)
    #   rainfall_anomaly / drought_index: database-derived from saved rainfall totals
    #   Flood/LULC: method decision required before any year can be scheduled
    "lga_atlas_historical": SyncPlan(
        name="lga_atlas_historical",
        description=(
            "Historical planning reference for all six roadmap layers at LGA level.  "
            "Year envelope: 1981-2025; effective range per layer is determined by each "
            "layer's source-supported coverage in the registry.  "
            "DRY RUN ONLY — shows full potential scope once all layers are unblocked."
        ),
        layer_keys=["ndvi", "rainfall", "lst", "flood_hazard", "drought_index", "lulc"],
        admin_level="lga",
        years=list(range(1981, 2026)),   # 45 years; per-layer filtering applies
        seasons=["annual", "wet_season", "dry_season"],
    ),

    # ------------------------------------------------------------------
    # Production bulk plans
    # ------------------------------------------------------------------

    # Sentinel-2 NDVI: complete comparable record 2018–2025.
    # 2017 excluded: Sentinel-2 SR Harmonized data not reliably comparable
    # before the full constellation was stable.
    # 2025 records already exist; --skip-existing will skip them (69 records).
    # Expected scope: 8 yr × 3 seasons × 23 LGAs = 552 tasks.
    # Expected pending with --skip-existing: 483.
    "ndvi_sentinel_complete_lga": SyncPlan(
        name="ndvi_sentinel_complete_lga",
        description=(
            "Sentinel-2 SR Harmonized NDVI for all 23 Kaduna LGAs, years 2018-2025 "
            "(8 years), all three seasons (annual, wet_season, dry_season).  "
            "2017 excluded: not included in the comparable full-constellation window.  "
            "2025 records already exist and will be skipped with --skip-existing.  "
            "Scope: 8 × 3 × 23 = 552 tasks total; 483 pending after skipping 2025."
        ),
        layer_keys=["ndvi"],
        admin_level="lga",
        years=list(range(2018, 2026)),   # 2018 to 2025 inclusive
        seasons=["annual", "wet_season", "dry_season"],
    ),

    # CHIRPS rainfall: 2025 pilot (small validation run before committing to full history).
    # 1 yr × 3 seasons × 23 LGAs = 69 tasks.
    "rainfall_chirps_2025_lga": SyncPlan(
        name="rainfall_chirps_2025_lga",
        description=(
            "CHIRPS v2.0 accumulated rainfall for all 23 Kaduna LGAs, year 2025 only, "
            "all three seasons (annual, wet_season, dry_season).  "
            "Validation pilot — run before committing to full historical backfill.  "
            "Scope: 1 × 3 × 23 = 69 tasks."
        ),
        layer_keys=["rainfall"],
        admin_level="lga",
        years=[2025],
        seasons=["annual", "wet_season", "dry_season"],
    ),

    # CHIRPS rainfall: full historical record 1981–2025.
    # 2026 excluded: not a complete calendar year.
    # dry_season 1981 excluded (season_year_min=1982 on the rainfall layer):
    #   CHIRPS begins 1981-01-01; dry_season 1981 = Nov 1980–Mar 1981 is incomplete.
    # Actual scope: annual 45×23=1,035 + wet_season 45×23=1,035 + dry_season 44×23=1,012
    #             = 3,082 tasks.
    "rainfall_chirps_historical_lga": SyncPlan(
        name="rainfall_chirps_historical_lga",
        description=(
            "CHIRPS v2.0 accumulated rainfall for all 23 Kaduna LGAs, "
            "years 1981-2025 (45 years), all three seasons.  "
            "2026 excluded: not a complete calendar year.  "
            "dry_season 1981 excluded: CHIRPS begins 1981-01-01; Nov 1980–Mar 1981 is "
            "outside the available record.  "
            "Effective scope: annual 1,035 + wet_season 1,035 + dry_season 1,012 = 3,082 tasks."
        ),
        layer_keys=["rainfall"],
        admin_level="lga",
        years=list(range(1981, 2026)),   # 1981 to 2025 inclusive; 2026 excluded
        seasons=["annual", "wet_season", "dry_season"],
    ),

    # Landsat NDVI pilot — restrict at CLI with --admin-codes 19006,19009,19018
    # (Jaba, Kaduna North, Makarfi).  6 years x 3 seasons x 3 LGAs = 54 tasks.
    "ndvi_landsat_pilot_lga": SyncPlan(
        name="ndvi_landsat_pilot_lga",
        description=(
            "Landsat NDVI 3-LGA pilot. Use --admin-codes 19006,19009,19018 to restrict "
            "to Jaba, Kaduna North, and Makarfi. "
            "6 years x 3 seasons x 3 LGAs = 54 pilot tasks."
        ),
        layer_keys=["ndvi_landsat"],
        admin_level="lga",
        years=[1985, 1990, 2000, 2005, 2012, 2017],
        seasons=["annual", "wet_season", "dry_season"],
    ),

    # Landsat NDVI full historical backfill — all 23 Kaduna LGAs, 1985-2017.
    # 33 years x 3 seasons x 23 LGAs = 2,277 tasks.
    "ndvi_landsat_historical_lga": SyncPlan(
        name="ndvi_landsat_historical_lga",
        description=(
            "Landsat C2 L2 NDVI for all 23 Kaduna LGAs, 1985-2017 (33 years), "
            "all three seasons. Full historical backfill. "
            "Expected scope: 33 x 3 x 23 = 2,277 tasks."
        ),
        layer_keys=["ndvi_landsat"],
        admin_level="lga",
        years=list(range(1985, 2018)),
        seasons=["annual", "wet_season", "dry_season"],
    ),

    # LST (MODIS MOD11A1) pilot — 2025 only.
    # 1 yr × 3 seasons × 23 LGAs = 69 tasks.
    "lst_modis_2025_lga": SyncPlan(
        name="lst_modis_2025_lga",
        description=(
            "MODIS MOD11A1 daytime LST for all 23 Kaduna LGAs, year 2025 only, "
            "all three seasons (annual, wet_season, dry_season).  "
            "Validation pilot before committing to full historical backfill.  "
            "Scope: 1 × 3 × 23 = 69 tasks."
        ),
        layer_keys=["lst"],
        admin_level="lga",
        years=[2025],
        seasons=["annual", "wet_season", "dry_season"],
    ),

    # LST (MODIS MOD11A1) full historical backfill — 2001–2025.
    # 2001 is the first complete seasonal year for MOD11A1 (launch 2000-02-24).
    # 25 years × 3 seasons × 23 LGAs = 1,725 tasks.
    "lst_modis_historical_lga": SyncPlan(
        name="lst_modis_historical_lga",
        description=(
            "MODIS MOD11A1 daytime LST for all 23 Kaduna LGAs, years 2001-2025 "
            "(25 years), all three seasons (annual, wet_season, dry_season).  "
            "2001 is the first complete seasonal year for MOD11A1.  "
            "Expected scope: 25 × 3 × 23 = 1,725 tasks."
        ),
        layer_keys=["lst"],
        admin_level="lga",
        years=list(range(2001, 2026)),   # 2001 to 2025 inclusive
        seasons=["annual", "wet_season", "dry_season"],
    ),
}


def get_plan(name: str) -> SyncPlan:
    """Return a SyncPlan by name, or raise ValueError."""
    try:
        return NAMED_PLANS[name]
    except KeyError:
        available = ", ".join(sorted(NAMED_PLANS.keys()))
        raise ValueError(f"Unknown plan: {name!r}. Available plans: {available}")


# ---------------------------------------------------------------------------
# Land Cover named plans  (used by sync_lulc, not sync_climate_atlas)
# ---------------------------------------------------------------------------


@dataclass
class LulcSyncPlan:
    name: str
    description: str
    provider_key: str
    admin_level: str
    composite_window: str
    years: List[int]
    admin_codes: List[str]   # empty list = all LGAs in the GeoJSON


LULC_NAMED_PLANS: dict = {

    # 5 Kaduna LGAs × 2 years (2018, 2024) = 10 pilot tasks.
    # Pilot LGAs: Birnin Gwari (19001), Kachia (19008), Kaduna North (19009),
    # Soba (19021), Zaria (19023).  Run --dry-run first; validate class sums
    # and cross-check against satellite imagery before Phase C2 live execution.
    "lulc_dw_5lga_pilot_2018_2024": LulcSyncPlan(
        name="lulc_dw_5lga_pilot_2018_2024",
        description=(
            "Dynamic World v1 pilot: 5 Kaduna LGAs × 2 years (2018, 2024), "
            "wet-season mode composite (May 1 – Oct 31).  "
            "LGAs: Birnin Gwari, Kachia, Kaduna North, Soba, Zaria.  "
            "Validate class sums and visual plausibility before full 23-LGA run.  "
            "Scope: 2 years × 5 LGAs = 10 tasks."
        ),
        provider_key="dynamic_world_v1",
        admin_level="lga",
        composite_window="wet_season",
        years=[2018, 2024],
        admin_codes=["19001", "19008", "19009", "19021", "19023"],
    ),

    # Sep-Oct (late_wet_season) methodology pilot — same 5 LGAs as original pilot.
    # Compares Sep-Oct window against existing May-Oct wet_season results.
    # NOT change analysis, NOT degradation, NOT trend analysis.
    "lulc_dw_5lga_latewet_pilot_2018_2024": LulcSyncPlan(
        name="lulc_dw_5lga_latewet_pilot_2018_2024",
        description=(
            "Phase 1A methodology pilot: Dynamic World v1 Sep–Oct composite "
            "(late_wet_season) for 5 Kaduna LGAs × 2 years (2018, 2024).  "
            "Compares Sep–Oct window against existing May–Oct wet_season snapshots to "
            "assess whether Sep–Oct avoids the systematic Jul–Aug cloud coverage gap.  "
            "Single-year snapshots only — NOT change analysis, NOT degradation, "
            "NOT deforestation, NOT trend analysis.  "
            "LGAs: Birnin Gwari, Kachia, Kaduna North, Soba, Zaria.  "
            "Scope: 2 years × 5 LGAs = 10 tasks."
        ),
        provider_key="dynamic_world_v1",
        admin_level="lga",
        composite_window="late_wet_season",
        years=[2018, 2024],
        admin_codes=["19001", "19008", "19009", "19021", "19023"],
    ),

    # Phase 1 first full-LGA validation year under the adopted late_wet_season method.
    # Single year (2024), all 23 LGAs.  Visual QA must pass before committing to
    # 2018–2024 full-history backfill.  NOT change analysis.  Keep is_public=False.
    "lulc_dw_latewet_2024_23lga_validation": LulcSyncPlan(
        name="lulc_dw_latewet_2024_23lga_validation",
        description=(
            "Phase 1 Annual LULC full-LGA validation: Dynamic World v1, "
            "late_wet_season composite (Sep 1–Oct 31, peak months Sep+Oct, "
            "method_version dw_latewet_mode_v1), all 23 Kaduna LGAs, year 2024.  "
            "First full-LGA run under the adopted Phase 1 methodology.  "
            "Run after the 5-LGA Sep–Oct pilot confirmed adequate quality (4/5 high, "
            "1/5 medium) and eliminated the wet_season bare-ground cloud artifact.  "
            "Single-year snapshot only — NOT change analysis, NOT degradation, "
            "NOT deforestation, NOT trend analysis.  "
            "Keep is_public=False until visual QA passes and Phase 1 release is "
            "explicitly approved.  "
            "Scope: 1 year × 23 LGAs = 23 tasks."
        ),
        provider_key="dynamic_world_v1",
        admin_level="lga",
        composite_window="late_wet_season",
        years=[2024],
        admin_codes=[],   # empty = all 23 LGAs from GeoJSON
    ),

    # Annual Land Use / Land Cover snapshot — all 23 Kaduna LGAs, current year.
    # Phase 1A: one snapshot year for visual QA before committing to full 2018-present backfill.
    # This is a single-year LULC snapshot.  It is NOT change analysis, NOT degradation
    # assessment, NOT deforestation or trend analysis.  Do not publish until validated.
    "lulc_dw_current_year_23lga": LulcSyncPlan(
        name="lulc_dw_current_year_23lga",
        description=(
            "Phase 1A Annual Land Use / Land Cover snapshot: all 23 Kaduna LGAs, year 2024, "
            "wet-season mode composite (May 1 – Oct 31), Dynamic World v1.  "
            "Single-year snapshot only — NOT change analysis, NOT degradation, "
            "NOT deforestation, NOT trend analysis.  "
            "Scope: 1 year × 23 LGAs = 23 tasks.  "
            "Run after pilot validates class sums; keep is_public=False until Phase 1 release approval."
        ),
        provider_key="dynamic_world_v1",
        admin_level="lga",
        composite_window="wet_season",
        years=[2024],
        admin_codes=[],   # empty = all 23 LGAs from GeoJSON
    ),

    # Full 23 Kaduna LGAs × 8 years (2018-2025) = 184 tasks.
    # Run only after lulc_dw_5lga_pilot_2018_2024 passes visual validation.
    "lulc_dw_full_2018_2025": LulcSyncPlan(
        name="lulc_dw_full_2018_2025",
        description=(
            "Dynamic World v1 full sync: all 23 Kaduna LGAs × years 2018-2025 "
            "(8 years), wet-season mode composite (May 1 – Oct 31).  "
            "Run only after pilot validation passes.  "
            "Scope: 8 years × 23 LGAs = 184 tasks."
        ),
        provider_key="dynamic_world_v1",
        admin_level="lga",
        composite_window="wet_season",
        years=list(range(2018, 2026)),
        admin_codes=[],   # empty = all LGAs from GeoJSON
    ),
}


def get_lulc_plan(name: str) -> LulcSyncPlan:
    """Return a LulcSyncPlan by name, or raise ValueError."""
    try:
        return LULC_NAMED_PLANS[name]
    except KeyError:
        available = ", ".join(sorted(LULC_NAMED_PLANS.keys()))
        raise ValueError(f"Unknown lulc plan: {name!r}. Available plans: {available}")
