"""
Earth Engine activity layers for the IPCC Tier 1 inventory (open-data method v1).

Every function issues ONE reduceRegions call covering all Kaduna LGAs, so a full
2018-2025 backfill costs a few dozen Earth Engine requests, well inside the
SYNC_MONTHLY_TASK_CAP quota guard used by scripts/run-sync.sh.

Layers
------
climate      CHIRPS 1991-2020 mean annual rainfall, ERA5-Land 1991-2020 mean 2 m
             air temperature, SRTM share of land above 1,000 m.  Drives the IPCC
             climate zone (wet/dry, montane) used to select emission factors.
population   GHSL P2023A population (100 m) and degree-of-urbanisation (SMOD) for
             the 5-year epochs 1975-2030, plus the Nigeria total for national
             downscaling.  Interpolated to single years by the caller.
burned_area  MODIS MCD64A1 burned area for a calendar year, split by the Dynamic
             World late-wet-season land class of the previous year.
lulc         Dynamic World late-wet-season mode composites for three consecutive
             years; a from->to transition is counted only when the new class
             persists into the following year (filters single-year flicker).
biomass      GEDI L4B mean above-ground biomass density by Dynamic World class.

All functions take the parsed kaduna_lga.geojson features and return plain
dicts keyed by lgacode.  They raise on Earth Engine errors; callers decide
how to report them.
"""

from __future__ import annotations

from typing import Dict, Iterable, List

# Dynamic World v1 label codes (GOOGLE/DYNAMICWORLD/V1 'label' band).
DW_CLASSES = {
    0: "water",
    1: "trees",
    2: "grass",
    3: "flooded_vegetation",
    4: "crops",
    5: "shrub_scrub",
    6: "built",
    7: "bare",
    8: "snow_ice",
}

GHSL_EPOCHS = (1975, 1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025, 2030)

# GHSL SMOD 23 = dense urban cluster, 30 = urban centre.  The broader DEGURBA
# "urban" (>= 21) puts ~70% of Kaduna in towns, far above census definitions,
# so only dense clusters and centres count as urban here.
GHSL_URBAN_MIN_SMOD = 23

# Kaduna is in the West Africa Sentinel-2 swath; Sep-Oct is the agreed
# late-wet-season window (remote_sensing/lulc_providers.py, dw_latewet_mode_v1).
DW_WINDOW = ("09-01", "11-01")


def _ee():
    import ee  # imported lazily so the module loads without earthengine-api

    return ee


def _lga_collection(features: Iterable[dict]):
    ee = _ee()
    return ee.FeatureCollection([
        ee.Feature(ee.Geometry(f["geometry"]), {"lgacode": str(f["properties"]["lgacode"])})
        for f in features
    ])


def _kaduna_geometry(features: Iterable[dict]):
    return _lga_collection(features).geometry()


def _by_lga(fc_info: dict) -> Dict[str, dict]:
    return {
        feat["properties"]["lgacode"]: feat["properties"]
        for feat in fc_info["features"]
    }


def _grouped(props: dict, key_name: str) -> Dict[int, float]:
    return {
        int(group[key_name]): float(group["sum"])
        for group in props.get("groups", [])
        if group.get("sum") is not None
    }


def dw_composite(year: int, region):
    """Dynamic World late-wet-season (Sep-Oct) per-pixel mode label for one year."""
    ee = _ee()
    start, end = (f"{year}-{DW_WINDOW[0]}", f"{year}-{DW_WINDOW[1]}")
    return (
        ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
        .filterDate(start, end)
        .filterBounds(region)
        .select("label")
        .mode()
        .rename("label")
    )


# ---------------------------------------------------------------------------
# Climate profile
# ---------------------------------------------------------------------------

def compute_climate_profile(features: List[dict]) -> Dict[str, dict]:
    """
    Returns {lgacode: {"rain_mm": float, "temp_c": float, "montane_pct": float}}.
    """
    ee = _ee()
    lgas = _lga_collection(features)

    rain = (
        ee.ImageCollection("UCSB-CHG/CHIRPS/PENTAD")
        .filterDate("1991-01-01", "2021-01-01")
        .select("precipitation")
        .sum()
        .divide(30)
        .rename("rain_mm")
    )
    temp = (
        ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR")
        .filterDate("1991-01-01", "2021-01-01")
        .select("temperature_2m")
        .mean()
        .subtract(273.15)
        .rename("temp_c")
    )
    montane = (
        ee.Image("USGS/SRTMGL1_003")
        .gt(1000)
        .multiply(100)
        .rename("montane_pct")
    )

    stats = rain.addBands(temp).addBands(montane).reduceRegions(
        collection=lgas,
        reducer=ee.Reducer.mean(),
        scale=1000,
    )
    out = {}
    for code, props in _by_lga(stats.getInfo()).items():
        out[code] = {
            "rain_mm": props.get("rain_mm"),
            "temp_c": props.get("temp_c"),
            "montane_pct": props.get("montane_pct"),
        }
    return out


# ---------------------------------------------------------------------------
# Population (GHSL)
# ---------------------------------------------------------------------------

def _ghsl_bands(epochs: Iterable[int]):
    ee = _ee()
    image = None
    for epoch in epochs:
        pop = ee.Image(f"JRC/GHSL/P2023A/GHS_POP/{epoch}").select("population_count")
        smod = ee.Image(f"JRC/GHSL/P2023A/GHS_SMOD_V2-0/{epoch}").select("smod_code")
        urban = pop.updateMask(smod.gte(GHSL_URBAN_MIN_SMOD))
        bands = pop.rename(f"pop_{epoch}").addBands(urban.rename(f"urb_{epoch}"))
        image = bands if image is None else image.addBands(bands)
    return image


def compute_population(features: List[dict], epochs=GHSL_EPOCHS) -> Dict[str, dict]:
    """
    Returns {lgacode: {epoch: {"total": float, "urban": float}}} plus a
    "NGA" key holding Nigeria totals for the same epochs.
    """
    ee = _ee()
    image = _ghsl_bands(epochs)

    lga_stats = image.reduceRegions(
        collection=_lga_collection(features),
        reducer=ee.Reducer.sum(),
        scale=100,
    ).getInfo()

    nigeria = (
        ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017")
        .filter(ee.Filter.eq("country_na", "Nigeria"))
        .geometry()
    )
    nga_stats = image.select([f"pop_{e}" for e in epochs]).reduceRegion(
        reducer=ee.Reducer.sum(),
        geometry=nigeria,
        scale=100,
        maxPixels=1e11,
        tileScale=4,
    ).getInfo()

    out: Dict[str, dict] = {}
    for code, props in _by_lga(lga_stats).items():
        out[code] = {
            epoch: {
                "total": props.get(f"pop_{epoch}") or 0.0,
                "urban": props.get(f"urb_{epoch}") or 0.0,
            }
            for epoch in epochs
        }
    out["NGA"] = {epoch: {"total": nga_stats.get(f"pop_{epoch}") or 0.0} for epoch in epochs}
    return out


# ---------------------------------------------------------------------------
# Burned area (MCD64A1)
# ---------------------------------------------------------------------------

def compute_burned_area(features: List[dict], year: int) -> Dict[str, Dict[str, float]]:
    """
    Returns {lgacode: {dw_class_name: burned_ha}} for calendar year `year`.

    The fuel class is the Dynamic World late-wet-season composite of the
    previous year: the vegetation standing when the dry season began.
    """
    ee = _ee()
    lgas = _lga_collection(features)
    region = lgas.geometry()

    burned = (
        ee.ImageCollection("MODIS/061/MCD64A1")
        .filterDate(f"{year}-01-01", f"{year + 1}-01-01")
        .select("BurnDate")
        .max()
        .gt(0)
    )
    land = dw_composite(year - 1, region)
    hectares = ee.Image.pixelArea().divide(10000).updateMask(burned)

    stats = hectares.addBands(land).reduceRegions(
        collection=lgas,
        reducer=ee.Reducer.sum().group(groupField=1, groupName="cls"),
        scale=100,
        tileScale=4,
    ).getInfo()

    out = {}
    for code, props in _by_lga(stats).items():
        out[code] = {
            DW_CLASSES.get(cls, str(cls)): ha
            for cls, ha in _grouped(props, "cls").items()
        }
    return out


# ---------------------------------------------------------------------------
# Land-use change (Dynamic World)
# ---------------------------------------------------------------------------

def compute_lulc_transitions(features: List[dict], year: int, confirm: bool = True) -> Dict[str, Dict[str, float]]:
    """
    Returns {lgacode: {"trees>crops": ha, ...}} for changes between the
    composites of year-1 and year.  With confirm=True the new class must also
    be present in the year+1 composite.
    """
    ee = _ee()
    lgas = _lga_collection(features)
    region = lgas.geometry()

    before = dw_composite(year - 1, region)
    after = dw_composite(year, region)
    changed = before.neq(after)
    if confirm:
        changed = changed.And(dw_composite(year + 1, region).eq(after))

    code = before.multiply(10).add(after).rename("code")
    hectares = ee.Image.pixelArea().divide(10000).updateMask(changed)

    stats = hectares.addBands(code).reduceRegions(
        collection=lgas,
        reducer=ee.Reducer.sum().group(groupField=1, groupName="code"),
        scale=100,
        tileScale=4,
    ).getInfo()

    out = {}
    for lga_code, props in _by_lga(stats).items():
        transitions = {}
        for pair, ha in _grouped(props, "code").items():
            src = DW_CLASSES.get(pair // 10, str(pair // 10))
            dst = DW_CLASSES.get(pair % 10, str(pair % 10))
            transitions[f"{src}>{dst}"] = ha
        out[lga_code] = transitions
    return out


# ---------------------------------------------------------------------------
# Biomass (GEDI L4B)
# ---------------------------------------------------------------------------

def compute_biomass_by_class(features: List[dict], reference_year: int = 2020) -> Dict[str, Dict[str, float]]:
    """
    Returns {lgacode: {dw_class_name: mean AGBD t dm/ha}} from GEDI L4B
    (2019-2023 mean), stratified by the Dynamic World composite of
    `reference_year`.
    """
    ee = _ee()
    lgas = _lga_collection(features)
    region = lgas.geometry()

    agbd = ee.Image("LARSE/GEDI/GEDI04_B_002").select("MU")
    land = dw_composite(reference_year, region)

    stats = agbd.addBands(land).reduceRegions(
        collection=lgas,
        reducer=ee.Reducer.mean().group(groupField=1, groupName="cls"),
        scale=100,
        tileScale=4,
    ).getInfo()

    out = {}
    for code, props in _by_lga(stats).items():
        out[code] = {
            DW_CLASSES.get(int(group["cls"]), str(group["cls"])): float(group["mean"])
            for group in props.get("groups", [])
            if group.get("mean") is not None
        }
    return out
