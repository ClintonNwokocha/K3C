"""
Provider registry for the KCCC Annual Land Use / Land Cover subsystem.

Defines the abstraction layer between provider-specific GEE collections and
the shared LandCoverDataset / LandCoverSnapshot storage models.

Phase 1 official methodology (adopted 2026-06-30):
  Provider  : Dynamic World v1 (GOOGLE/DYNAMICWORLD/V1)
  Window    : late_wet_season  (Sep 1 – Oct 31)
  Peak months: September + October
  method_version: dw_latewet_mode_v1
  Coverage  : 2018–present (annual snapshots)
  Product   : Annual Land Use / Land Cover — NOT change analysis

Phase 2 (future, not approved):
  Historical Landsat LULC classification, approx 1984–2017.
  Requires a separate supervised/unsupervised Landsat workflow.
  Not compatible with Dynamic World.
  1981 LULC is not supported at 10 m resolution — Landsat only.

Adding a future provider:
  1. Add a LandCoverProvider entry in LAND_COVER_PROVIDERS with enabled=False.
  2. Define its class_scheme as a dict of LandCoverClassDefinition instances.
  3. Implement the corresponding method in gee_service.py.
  4. Set enabled=True and clear block_reason only after GEE pilot validation.

sync_lulc uses LAND_COVER_PROVIDERS to validate provider keys and class codes.
build_land_cover_change (Phase 2/3 change analysis) does not call GEE and does
not depend on this registry.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple


# ---------------------------------------------------------------------------
# Per-class definition
# ---------------------------------------------------------------------------


@dataclass
class LandCoverClassDefinition:
    """Defines one land-cover class within a provider's classification scheme."""

    key: str              # storage key used in class_pct / class_areas_km2 JSON
    gee_class_code: int   # integer band value in the provider's raster output
    label: str            # human-readable display label
    show_in_selector: bool  # False for classes never expected in the AOI (e.g. snow_ice)
    default_color: str    # hex fallback colour for legend and choropleth
    order: int            # display sort order in popup table and class dropdown


# ---------------------------------------------------------------------------
# GEE compute result
# ---------------------------------------------------------------------------


@dataclass
class LandCoverComputeResult:
    """
    Raw output returned by gee_service.compute_land_cover_for_geometry.

    The management command converts class_pixel_counts to class_pct and
    class_areas_km2 before writing to LandCoverSnapshot.  This dataclass
    carries only the raw counts so the conversion is testable in Python
    without touching GEE or the database.
    """

    success: bool
    class_pixel_counts: Dict[str, int]  # {"trees": 11200, "crops": 45300, ...}
    total_pixels: int                   # all classified pixels (denominator for %)
    masked_pixels: int                  # cloud-filtered pixels excluded from total
    error: Optional[str] = None
    metadata: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Data quality helpers
# ---------------------------------------------------------------------------


def compute_quality_flag(peak_season_scene_count: int) -> str:
    """
    Classify peak-season scene coverage into a data quality tier.

    The peak months are window-specific (Jul+Aug for wet_season; Sep+Oct for
    late_wet_season) and are passed into gee_service via the peak_months param.
    This function only evaluates the resulting count — it is window-agnostic.

    Thresholds (combined scene count over the configured peak months):
        high   >= 5  — composite well-anchored in peak vegetation period
        medium  2-4  — some peak coverage; interpret cross-year changes with caution
        low     0-1  — negligible peak coverage; class percentages unreliable

    Phase 1 Sep-Oct pilot (2026-06-30): late_wet_season eliminated the
    systematic Jul-Aug cloud gap that produced 5/5 low-quality results for
    all 23 Kaduna LGAs in 2024 under the wet_season window.
    """
    if peak_season_scene_count >= 5:
        return "high"
    if peak_season_scene_count >= 2:
        return "medium"
    return "low"


# ---------------------------------------------------------------------------
# Composite window definitions
# ---------------------------------------------------------------------------


@dataclass
class CompositeWindowConfig:
    """Defines a LULC composite window: date range and peak-season quality months."""
    start_month: int
    start_day: int
    end_month: int
    end_day: int
    peak_months: Tuple[int, ...]  # months (1–12) counted for peak-season quality
    method_version: str            # distinguishes outputs from different windows


COMPOSITE_WINDOW_CONFIGS: Dict[str, "CompositeWindowConfig"] = {
    # May 1 – Oct 31 (full wet season); peak months = July + August.
    # Retained for reference and cross-comparison; NOT the Phase 1 official method.
    # Produces systematic low quality in cloud-heavy years (e.g. all 23 LGAs low in 2024).
    "wet_season": CompositeWindowConfig(
        start_month=5, start_day=1,
        end_month=10, end_day=31,
        peak_months=(7, 8),
        method_version="dw_wetseason_mode_v1",
    ),
    # Sep 1 – Oct 31 (late wet season).
    # OFFICIAL Phase 1 Annual LULC method (adopted 2026-06-30).
    # Avoids the systematic Jul-Aug cloud gap over Kaduna Guinea Savanna.
    # Vegetation is still at or near full canopy closure in Sep-Oct.
    "late_wet_season": CompositeWindowConfig(
        start_month=9, start_day=1,
        end_month=10, end_day=31,
        peak_months=(9, 10),
        method_version="dw_latewet_mode_v1",
    ),
}


# ---------------------------------------------------------------------------
# Provider definition
# ---------------------------------------------------------------------------


@dataclass
class LandCoverProvider:
    """
    Describes one land-cover classification provider.

    enabled=False providers are documented stubs.  sync_lulc raises
    CommandError when an enabled=False provider key is supplied, making it
    impossible to accidentally trigger a blocked provider.
    """

    key: str                           # "dynamic_world_v1"
    label: str                         # "Dynamic World v1"
    gee_collection: str                # GEE asset path
    valid_year_min: int
    valid_year_max: Optional[int]      # None = current year
    supported_windows: Tuple[str, ...] # composite window keys
    method_version: str                # "dw_wetseason_mode_v1"
    default_scale: int                 # GEE reduceRegion scale in metres
    class_scheme: Dict[str, LandCoverClassDefinition]
    enabled: bool = True
    block_reason: str = ""


# ---------------------------------------------------------------------------
# Dynamic World v1 class scheme
# ---------------------------------------------------------------------------
#
# Source: GOOGLE/DYNAMICWORLD/V1, band "label".
# 9 classes, integer codes 0–8.
# Phase 1 composite method: mode of label band over Sep–Oct (late_wet_season).
# snow_ice (code 8) is never present in Kaduna; excluded from Atlas selector.

_DW_CLASSES: Dict[str, LandCoverClassDefinition] = {
    "water": LandCoverClassDefinition(
        key="water",
        gee_class_code=0,
        label="Water",
        show_in_selector=True,
        default_color="#4393c3",
        order=0,
    ),
    "trees": LandCoverClassDefinition(
        key="trees",
        gee_class_code=1,
        label="Trees",
        show_in_selector=True,
        default_color="#1a7837",
        order=1,
    ),
    "grass": LandCoverClassDefinition(
        key="grass",
        gee_class_code=2,
        label="Grass",
        show_in_selector=True,
        default_color="#78c679",
        order=2,
    ),
    "flooded_vegetation": LandCoverClassDefinition(
        key="flooded_vegetation",
        gee_class_code=3,
        label="Flooded Vegetation",
        show_in_selector=True,
        default_color="#41ab5d",
        order=3,
    ),
    "crops": LandCoverClassDefinition(
        key="crops",
        gee_class_code=4,
        label="Crops",
        show_in_selector=True,
        default_color="#e6550d",
        order=4,
    ),
    "shrub_scrub": LandCoverClassDefinition(
        key="shrub_scrub",
        gee_class_code=5,
        label="Shrub/Scrub",
        show_in_selector=True,
        default_color="#3690c0",
        order=5,
    ),
    "built_area": LandCoverClassDefinition(
        key="built_area",
        gee_class_code=6,
        label="Built Area",
        show_in_selector=True,
        default_color="#737373",
        order=6,
    ),
    "bare_ground": LandCoverClassDefinition(
        key="bare_ground",
        gee_class_code=7,
        label="Bare Ground",
        show_in_selector=True,
        default_color="#d95f0e",
        order=7,
    ),
    "snow_ice": LandCoverClassDefinition(
        key="snow_ice",
        gee_class_code=8,
        label="Snow/Ice",
        show_in_selector=False,  # not present in Kaduna; excluded from Atlas selector
        default_color="#f7f7f7",
        order=8,
    ),
}


# ---------------------------------------------------------------------------
# Provider registry
# ---------------------------------------------------------------------------

LAND_COVER_PROVIDERS: Dict[str, LandCoverProvider] = {

    # ------------------------------------------------------------------
    # Dynamic World v1 — ENABLED (Phase A ready)
    # ------------------------------------------------------------------
    # Phase 1 official method: late_wet_season / dw_latewet_mode_v1 (adopted 2026-06-30).
    # method_version here is the provider-level default fallback used when no window
    # override is supplied.  sync_lulc always passes window_config.method_version
    # explicitly, so this field documents the adopted Phase 1 default.
    "dynamic_world_v1": LandCoverProvider(
        key="dynamic_world_v1",
        label="Dynamic World v1",
        gee_collection="GOOGLE/DYNAMICWORLD/V1",
        valid_year_min=2018,
        valid_year_max=None,   # current year
        supported_windows=("wet_season", "late_wet_season"),
        method_version="dw_latewet_mode_v1",   # Phase 1 official window
        default_scale=10,
        enabled=True,
        class_scheme=_DW_CLASSES,
    ),

    # ------------------------------------------------------------------
    # ESRI Annual LULC — DISABLED stub
    # ------------------------------------------------------------------
    "esri_annual_lulc": LandCoverProvider(
        key="esri_annual_lulc",
        label="ESRI Annual LULC 10m",
        gee_collection="projects/sat-io/open-earth-engine-library/ESRI_LULC10",
        valid_year_min=2017,
        valid_year_max=2022,
        supported_windows=("annual",),
        method_version="esri_lulc10_annual_v1",
        default_scale=10,
        enabled=False,
        block_reason=(
            "ESRI Annual LULC ends at 2022 and will not be extended.  "
            "Enable only if a specific historical comparison against Dynamic World "
            "is required and the cross-product methodology is formally documented.  "
            "class_scheme must be populated before enabling."
        ),
        class_scheme={},  # populate before enabling
    ),

    # ------------------------------------------------------------------
    # ESA WorldCover v200 — DISABLED stub
    # ------------------------------------------------------------------
    "esa_worldcover_v200": LandCoverProvider(
        key="esa_worldcover_v200",
        label="ESA WorldCover v200",
        gee_collection="ESA/WorldCover/v200",
        valid_year_min=2021,
        valid_year_max=2021,
        supported_windows=("annual",),
        method_version="esa_worldcover_v200_single_scene_v1",
        default_scale=10,
        enabled=False,
        block_reason=(
            "ESA WorldCover v200 covers 2021 only (single scene, no annual composite).  "
            "Enable only if a validated cross-product comparison with Dynamic World 2021 "
            "is specifically required and its methodology is formally documented.  "
            "class_scheme must be populated before enabling."
        ),
        class_scheme={},  # populate before enabling
    ),

    # ------------------------------------------------------------------
    # Custom Landsat supervised classifier — DISABLED stub
    # ------------------------------------------------------------------
    "landsat_supervised_v1": LandCoverProvider(
        key="landsat_supervised_v1",
        label="Landsat Supervised Classification (Custom)",
        gee_collection="",
        valid_year_min=1990,
        valid_year_max=None,
        supported_windows=("annual",),
        method_version="",
        default_scale=30,
        enabled=False,
        block_reason=(
            "Custom Landsat supervised classifier not yet designed.  "
            "Requires training data collection, accuracy assessment, and formal method "
            "approval before any GEE implementation.  Do not schedule."
        ),
        class_scheme={},  # not yet designed
    ),
}


# ---------------------------------------------------------------------------
# Registry accessor
# ---------------------------------------------------------------------------


def get_provider(key: str) -> LandCoverProvider:
    """Return a LandCoverProvider by key, or raise ValueError."""
    try:
        return LAND_COVER_PROVIDERS[key]
    except KeyError:
        available = ", ".join(sorted(LAND_COVER_PROVIDERS))
        raise ValueError(
            f"Unknown land-cover provider: {key!r}.  Available: {available}"
        )
