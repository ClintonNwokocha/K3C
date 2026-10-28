"""
Climate hazard indicators for Climate Hazard Assessment and Risk Tracking.

Four hazards per LGA, year and season, each from daily LGA-mean data
(LGADailyClimate: CHIRPS v2.0 rainfall, ERA5-Land daily maximum temperature)
or the stored SPI records:

  extreme_heat      hot days, heatwave days, days >= 40 C, hottest day
  flood             wettest day, wettest 5 days, very wet days
  drought           SPI (drought_index layer); stored, not recomputed here
  erratic_rainfall  onset delay, early cessation, short season, dry spells

Every indicator is compared with the same LGA's own 1991-2020 values for the
same season: z = (value - baseline mean) / baseline standard deviation, signed
so that a positive z is always the hazardous direction.  A hazard's composite
is the mean of its indicator z's, standardized again against the LGA's
1991-2020 composites (finalize), so each class keeps its usual frequency.  The
most unusual indicator is reported as the "driver".  Drought uses -SPI
directly.  Classes follow the SPI convention:

  z >= 2.0 Extreme, >= 1.5 Severe, >= 1.0 Moderate, otherwise Normal

and the 0-100 score is the normal-distribution percentile of z.  Pure
functions only; build_climate_hazards does the database work.
"""
from __future__ import annotations

import datetime as dt
import math
import statistics
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

METHOD_VERSION = "chart_hazards_v1"
BASELINE = (1991, 2020)
MIN_BASELINE_YEARS = 25

HOT_DAY_PERCENTILE = 90
HEATWAVE_MIN_DAYS = 3
ABSOLUTE_HOT_C = 40.0
VERY_WET_PERCENTILE = 95
WET_DAY_MM = 1.0

# Rainy season (AGRHYMET-style, Sivakumar 1988).  Onset: first day from 1 April
# when ONSET_RAIN_MM falls within ONSET_WINDOW days, not followed by a dry spell
# longer than ONSET_FALSE_SPELL days in the next ONSET_CHECK_DAYS.  Cessation:
# last wet day from 1 September that is followed by CESSATION_DRY_DAYS
# consecutive dry days.  No onset by 31 July is a failed season.
ONSET_START = (4, 1)
ONSET_LATEST = (7, 31)
ONSET_RAIN_MM = 20.0
ONSET_WINDOW = 3
ONSET_CHECK_DAYS = 30
ONSET_FALSE_SPELL = 7
CESSATION_FROM = (9, 1)
CESSATION_DRY_DAYS = 20
DRY_SPELL_DAYS = 10

HAZARD_LABELS = {
    "extreme_heat": "Extreme Heat",
    "flood": "Flood",
    "drought": "Drought",
    "erratic_rainfall": "Erratic Rainfall",
}
HAZARD_LAYER_KEYS = {key: f"hazard_{key}" for key in HAZARD_LABELS}
HAZARD_SEASONS = {
    "extreme_heat": ("annual", "hot_season"),
    "flood": ("annual", "wet_season"),
    "drought": ("annual", "wet_season", "dry_season"),
    "erratic_rainfall": ("wet_season",),
}

# Season each hazard is read from for the atlas/assistant seasons (annual,
# wet_season, dry_season).  Mirrors seasonMap in frontend climateAtlasLayers.js.
DISPLAY_SEASON = {
    "extreme_heat": {"annual": "annual", "dry_season": "hot_season", "wet_season": "annual"},
    "flood": {"annual": "annual", "dry_season": "annual", "wet_season": "wet_season"},
    "drought": {"annual": "annual", "dry_season": "dry_season", "wet_season": "wet_season"},
    "erratic_rainfall": {"annual": "wet_season", "dry_season": "wet_season", "wet_season": "wet_season"},
}

# key -> (label, unit, direction): +1 when higher is more hazardous.
INDICATORS = {
    "hot_days": ("Hot days (above the LGA's 90th percentile)", "days", 1),
    "heatwave_days": ("Heatwave days (3+ hot days in a row)", "days", 1),
    "days_40c": ("Days at or above 40 °C", "days", 1),
    "txx_c": ("Hottest day", "°C", 1),
    "rx1day_mm": ("Wettest day", "mm", 1),
    "rx5day_mm": ("Wettest 5 days", "mm", 1),
    "very_wet_days": ("Very wet days (above the LGA's 95th percentile)", "days", 1),
    "spi": ("Standardized Precipitation Index", "SPI", -1),
    "onset_doy": ("Rainy season onset", "day of year", 1),
    "cessation_doy": ("Rainy season end", "day of year", -1),
    "season_length_days": ("Rainy season length", "days", -1),
    "longest_dry_spell_days": ("Longest dry spell in the season", "days", 1),
    "dry_spells_10d": ("Dry spells of 10+ days in the season", "count", 1),
}
HAZARD_INDICATORS = {
    "extreme_heat": ("hot_days", "heatwave_days", "days_40c", "txx_c"),
    "flood": ("rx1day_mm", "rx5day_mm", "very_wet_days"),
    "drought": ("spi",),
    "erratic_rainfall": ("onset_doy", "cessation_doy", "season_length_days",
                         "longest_dry_spell_days", "dry_spells_10d"),
}
# Counts of rare days can have a near-zero baseline spread; floor it so one
# extra day is not reported as an extreme departure.
SD_FLOOR = {"days": 1.0, "count": 1.0, "day of year": 3.0, "mm": 1.0, "°C": 0.3, "SPI": 0.1}


def season_window(year: int, season: str) -> Tuple[dt.date, dt.date]:
    """Inclusive window; matches sync_registry.resolve_season_dates plus hot_season."""
    if season == "annual":
        return dt.date(year, 1, 1), dt.date(year, 12, 31)
    if season == "wet_season":
        return dt.date(year, 5, 1), dt.date(year, 10, 31)
    if season == "dry_season":
        return dt.date(year - 1, 11, 1), dt.date(year, 3, 31)
    if season == "hot_season":
        return dt.date(year, 3, 1), dt.date(year, 5, 31)
    raise ValueError(f"Unknown season {season!r}")


def percentile(values: Sequence[float], pct: float) -> float:
    """Linear-interpolation percentile (numpy default)."""
    data = sorted(values)
    if not data:
        raise ValueError("percentile of empty sequence")
    k = (len(data) - 1) * pct / 100
    lo = math.floor(k)
    hi = math.ceil(k)
    return data[lo] + (data[hi] - data[lo]) * (k - lo)


def runs(flags: Iterable[bool]) -> List[int]:
    """Lengths of consecutive True runs."""
    out, current = [], 0
    for flag in flags:
        if flag:
            current += 1
        elif current:
            out.append(current)
            current = 0
    if current:
        out.append(current)
    return out


def heat_indicators(tmax: Sequence[float], hot_threshold: float) -> Dict[str, float]:
    hot = [t > hot_threshold for t in tmax]
    return {
        "hot_days": sum(hot),
        "heatwave_days": sum(r for r in runs(hot) if r >= HEATWAVE_MIN_DAYS),
        "days_40c": sum(t >= ABSOLUTE_HOT_C for t in tmax),
        "txx_c": max(tmax),
    }


def flood_indicators(rain: Sequence[float], very_wet_threshold: float) -> Dict[str, float]:
    rx5 = max(sum(rain[i:i + 5]) for i in range(max(len(rain) - 4, 1)))
    return {
        "rx1day_mm": max(rain),
        "rx5day_mm": rx5,
        "very_wet_days": sum(r > very_wet_threshold for r in rain),
    }


def rainy_season(dates: Sequence[dt.date], rain: Sequence[float], year: int) -> Dict[str, Optional[float]]:
    """Onset, cessation and in-season dry spells for one calendar year of daily rainfall."""
    by_date = dict(zip(dates, rain))
    start = dt.date(year, *ONSET_START)
    latest = dt.date(year, *ONSET_LATEST)
    end_of_year = dt.date(year, 12, 31)

    def day(d):
        return by_date.get(d, 0.0)

    onset = None
    d = start
    while d <= latest:
        window = [day(d + dt.timedelta(i)) for i in range(ONSET_WINDOW)]
        if sum(window) >= ONSET_RAIN_MM and day(d) >= WET_DAY_MM:
            after = [day(d + dt.timedelta(i)) >= WET_DAY_MM for i in range(1, ONSET_CHECK_DAYS + 1)]
            if not any(r > ONSET_FALSE_SPELL for r in runs(not w for w in after)):
                onset = d
                break
        d += dt.timedelta(1)

    if onset is None:
        return {"onset_doy": None, "cessation_doy": None, "season_length_days": 0,
                "longest_dry_spell_days": None, "dry_spells_10d": None, "failed_season": True}

    cessation = None
    d = max(dt.date(year, *CESSATION_FROM), onset)
    while d <= end_of_year:
        if day(d) >= WET_DAY_MM:
            following = [day(d + dt.timedelta(i)) for i in range(1, CESSATION_DRY_DAYS + 1)]
            if all(r < WET_DAY_MM for r in following):
                cessation = d
                break
        d += dt.timedelta(1)
    if cessation is None:
        cessation = end_of_year

    season = [day(onset + dt.timedelta(i)) for i in range((cessation - onset).days + 1)]
    spells = runs(r < WET_DAY_MM for r in season)
    return {
        "onset_doy": onset.timetuple().tm_yday,
        "cessation_doy": cessation.timetuple().tm_yday,
        "season_length_days": (cessation - onset).days + 1,
        "longest_dry_spell_days": max(spells, default=0),
        "dry_spells_10d": sum(s >= DRY_SPELL_DAYS for s in spells),
        "failed_season": False,
    }


FAILED_SEASON_Z = 3.0
COMPOSITE_SD_FLOOR = 0.25


def finalize(by_year: Dict[int, dict], base_years: Iterable[int]) -> None:
    """Standardize each year's composite against the baseline years' composites, in place."""
    base_years = set(base_years)
    base = [a["composite"] for y, a in by_year.items()
            if y in base_years and a["composite"] is not None and not a["failed_season"]]
    stats = None
    if len(base) >= MIN_BASELINE_YEARS:
        stats = statistics.fmean(base), max(statistics.pstdev(base), COMPOSITE_SD_FLOOR)
    for a in by_year.values():
        if a["failed_season"]:
            z = FAILED_SEASON_Z
        elif stats is None or a["composite"] is None:
            z = None
        else:
            z = round((a["composite"] - stats[0]) / stats[1], 2)
        a["z"], a["score"], a["class"] = z, score(z), classify(z)


def classify(z: Optional[float]) -> str:
    if z is None:
        return "No data"
    if z >= 2.0:
        return "Extreme"
    if z >= 1.5:
        return "Severe"
    if z >= 1.0:
        return "Moderate"
    return "Normal"


def classify_score(value: Optional[float]) -> str:
    """Class from a stored 0-100 score (the percentile of z)."""
    if value is None:
        return "No data"
    if value >= 97.7:
        return "Extreme"
    if value >= 93.3:
        return "Severe"
    if value >= 84.1:
        return "Moderate"
    return "Normal"


def score(z: Optional[float]) -> Optional[float]:
    if z is None:
        return None
    return round(100 * 0.5 * (1 + math.erf(z / math.sqrt(2))), 1)


def baseline_stats(values: Sequence[float], unit: str) -> Optional[Tuple[float, float, int]]:
    clean = [v for v in values if v is not None]
    if len(clean) < MIN_BASELINE_YEARS:
        return None
    sd = statistics.pstdev(clean)
    return statistics.fmean(clean), max(sd, SD_FLOOR.get(unit, 0.0)), len(clean)


def assess(hazard: str, values: Dict[str, Optional[float]],
           baselines: Dict[str, Optional[Tuple[float, float, int]]],
           failed_season: bool = False) -> dict:
    """
    Indicator z's and their mean (the composite) for one hazard.  z, score and
    class are provisional (z = composite) until finalize() standardizes the
    composite; drought is final as is (z = -SPI).
    """
    indicators = {}
    best = None
    for key in HAZARD_INDICATORS[hazard]:
        label, unit, direction = INDICATORS[key]
        value = values.get(key)
        base = baselines.get(key)
        z = None
        if value is not None and base is not None:
            z = round(direction * (value - base[0]) / base[1], 2)
        indicators[key] = {
            "label": label, "unit": unit, "value": None if value is None else round(value, 2),
            "baseline_mean": None if base is None else round(base[0], 2), "z": z,
        }
        if z is not None and (best is None or z > indicators[best]["z"]):
            best = key
    zs = [item["z"] for item in indicators.values() if item["z"] is not None]
    composite = round(statistics.fmean(zs), 3) if zs else None
    hazard_z = composite
    if failed_season and hazard == "erratic_rainfall":
        hazard_z, best = FAILED_SEASON_Z, "onset_doy"
    return {
        "hazard": hazard,
        "label": HAZARD_LABELS[hazard],
        "composite": composite,
        "z": hazard_z,
        "score": score(hazard_z),
        "class": classify(hazard_z),
        "driver": best,
        "driver_label": INDICATORS[best][0] if best else None,
        "failed_season": failed_season,
        "indicators": indicators,
    }
