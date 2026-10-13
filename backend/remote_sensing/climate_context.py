"""Authoritative climate-context resolution for the Climate Briefing Assistant.

Resolves the KCCC-authoritative indicator context (statewide or LGA-scoped)
directly from the database — never from values supplied by the frontend.
The caller (views.climate_assistant) passes along the frontend's selected
indicator/year/season/LGA only as *identifiers*; every value, condition,
source, and publication status below is looked up here.

Gated by the same publication flags used by every other public
remote-sensing endpoint in this app (RemoteSensingLayer.is_public/is_active,
LandCoverDataset.is_public/is_validated) — an unpublished layer can never be
surfaced through the assistant, AI-assisted or rule-based.

Classification thresholds mirror remote_sensing/views.py's
_classify_ndvi/_classify_spi/_classify_rainfall_anomaly/_classify_lst
verbatim (the same pattern already used by
frontend/src/decision-support/climateActionSignal.js) so every surface that
talks about these indicators agrees on the same wording. Duplicated here
(rather than imported from views) to avoid a views<->context import cycle.
"""
from decimal import Decimal

from django.db.models import Max

from .lulc_providers import LAND_COVER_PROVIDERS
from .models import LandCoverDataset, RemoteSensingLGAMetric, RemoteSensingLayer

RAINFALL_BASELINE_YEARS = "1991-2020"

# Mirrors frontend/src/config/climateAtlasLayers.js — kept in sync by hand.
INDICATOR_METADATA = {
    "rainfall": {
        "label": "Rainfall Total",
        "unit": "mm",
        "data_source": "CHIRPS v2.0 Daily",
        "layer_key": "rainfall",
        "note": "Accumulated rainfall total for the selected season/year — not a rainfall anomaly.",
    },
    "rainfall_anomaly": {
        "label": "Rainfall Anomaly",
        "unit": "%",
        "data_source": f"CHIRPS v2.0 Daily, {RAINFALL_BASELINE_YEARS} LGA baseline",
        "layer_key": "rainfall_anomaly",
        "note": f"Percentage departure from the {RAINFALL_BASELINE_YEARS} local LGA rainfall baseline. Not a drought index — interpret alongside rainfall totals.",
    },
    "drought_index": {
        "label": "Meteorological Drought Conditions (SPI)",
        "unit": "SPI",
        "data_source": "CHIRPS v2.0 Daily rainfall totals",
        "layer_key": "drought_index",
        "note": f"Fixed-window precipitation-only SPI against a {RAINFALL_BASELINE_YEARS} baseline. Not agricultural, hydrological, groundwater, soil-moisture, or crop-stress drought. Only SPI <= -1.0 is a drought category.",
    },
    "ndvi": {
        "label": "Vegetation Condition (NDVI)",
        "unit": "index",
        "data_source": None,
        "layer_key": None,
        "note": "Landsat before 2018, Sentinel-2 from 2018 onward. The two sensors are not directly comparable without cross-sensor calibration.",
    },
    "lst": {
        "label": "Land Surface Temperature (Daytime)",
        "unit": "°C",
        "data_source": "MODIS Terra Daily Land Surface Temperature",
        "layer_key": "lst",
        "note": "Daytime land-surface temperature — NOT equivalent to air temperature.",
    },
    "annual_lulc": {
        "label": "Annual Land Use / Land Cover",
        "unit": "dominant class",
        "data_source": "Dynamic World v1 (Google Earth Engine, Sentinel-2)",
        "layer_key": "lulc",
        "note": "Single-year observed land-cover classification snapshot — does not constitute a land-cover change or trend claim.",
    },
    "elevation": {
        "label": "Elevation (LGA mean)",
        "unit": "m",
        "data_source": "USGS SRTMGL1 v003 (NASA SRTM mission, ~2000)",
        "layer_key": "elevation",
        "note": "Static terrain data (~2000) — not a climate variable and not a hazard forecast.",
    },
    "flood_occurrence": {
        "label": "Historical Surface Water Occurrence",
        "unit": "%",
        "data_source": "JRC Global Surface Water v1.4 (Landsat 1984-2021)",
        "layer_key": "flood_occurrence",
        "note": "Static 1984-2021 archive of observed surface water occurrence — NOT equivalent to a validated flood hazard assessment or a real-time alert.",
    },
}

# Suggested questions adapt to the selected indicator — shown by the frontend
# whether the answer came from AI or the rule-based fallback.
_GENERIC_SUGGESTED_QUESTIONS = [
    "What does this indicator mean?",
    "How does this compare with the historical baseline?",
    "What limitations should I consider?",
]
SUGGESTED_QUESTIONS_BY_INDICATOR = {
    "rainfall": _GENERIC_SUGGESTED_QUESTIONS + ["What does this mean for farming?"],
    "rainfall_anomaly": _GENERIC_SUGGESTED_QUESTIONS + ["What does this mean for farming?"],
    "drought_index": _GENERIC_SUGGESTED_QUESTIONS + [
        "What does this mean for farmers?",
        "What actions could planners consider?",
    ],
    "ndvi": _GENERIC_SUGGESTED_QUESTIONS + ["What does this mean for farming?"],
    "lst": _GENERIC_SUGGESTED_QUESTIONS + ["Which LGAs require attention?"],
    "annual_lulc": _GENERIC_SUGGESTED_QUESTIONS,
    "elevation": _GENERIC_SUGGESTED_QUESTIONS,
    "flood_occurrence": _GENERIC_SUGGESTED_QUESTIONS + ["What actions could planners consider?"],
}


def _decimal_to_float(value):
    return float(value) if isinstance(value, Decimal) else value


def _classify_ndvi(value: float) -> str:
    if value >= 0.60:
        return "healthy vegetation"
    if value >= 0.35:
        return "moderate vegetation"
    return "sparse/stressed vegetation"


def _classify_spi(value: float) -> str:
    if value <= -2.0:
        return "extreme drought condition"
    if value <= -1.5:
        return "severe drought condition"
    if value <= -1.0:
        return "moderate drought condition"
    if value < 1.0:
        return "near normal"
    if value < 1.5:
        return "moderately wet"
    if value < 2.0:
        return "very wet"
    return "extremely wet"


def _classify_rainfall_anomaly(value: float) -> str:
    if value > 10.0:
        return "wetter than baseline"
    if value >= -10.0:
        return "near baseline"
    return "drier than baseline"


def _classify_lst(value: float) -> str:
    if value < 28.0:
        return "relatively cooler surface conditions"
    if value <= 36.0:
        return "moderate surface temperature"
    return "relatively hotter surface conditions"


_CLASSIFIERS = {
    "ndvi": _classify_ndvi,
    "drought_index": _classify_spi,
    "rainfall_anomaly": _classify_rainfall_anomaly,
    "lst": _classify_lst,
}


def _resolve_layer_key(indicator: str, year: int | None) -> str | None:
    if indicator == "ndvi":
        # No explicit year (None) defaults to the current Sentinel-2 era —
        # only an explicitly requested pre-2018 year routes to Landsat.
        return "ndvi_landsat" if (year is not None and year < 2018) else "ndvi"
    return INDICATOR_METADATA.get(indicator, {}).get("layer_key")


def _public_active_layer(layer_key: str):
    return RemoteSensingLayer.objects.filter(key=layer_key, is_public=True, is_active=True).first()


def _build_metric_entry(metric, indicator: str) -> dict:
    value = _decimal_to_float(metric.mean_value)
    classifier = _CLASSIFIERS.get(indicator)
    entry = {
        "indicator": indicator,
        "label": INDICATOR_METADATA.get(indicator, {}).get("label", indicator),
        "value": value,
        "unit": metric.unit or INDICATOR_METADATA.get(indicator, {}).get("unit"),
        "data_source": metric.data_source or INDICATOR_METADATA.get(indicator, {}).get("data_source"),
    }
    if classifier is not None and value is not None:
        entry["condition"] = classifier(value)
    return entry


def resolve_climate_context(
    *,
    indicator: str,
    year: int | None,
    season: str,
    period: str | None,
    admin_code: str | None,
    lga_name: str | None,
) -> dict:
    """Returns a plain-dict context object safe to (a) hand to Grok as
    grounding evidence and (b) render directly as the rule-based fallback.

    `status` is one of:
      - "ok"                 — indicator resolved, value(s) available
      - "no_data"             — indicator/layer is published but no stored
                                 metric matches this year/season/scope
      - "not_published"       — indicator exists but is gated off (never
                                 returns the underlying value)
      - "lga_not_found"       — an LGA was requested but doesn't resolve
      - "unknown_indicator"   — indicator key not recognised
    """
    if indicator not in INDICATOR_METADATA:
        return {"status": "unknown_indicator", "indicator": indicator}

    meta = INDICATOR_METADATA[indicator]
    scope_requested = bool(admin_code or lga_name)
    scope = {"type": "lga" if scope_requested else "statewide", "name": lga_name or None}

    # LULC uses a separate model family (distribution, not a scalar metric).
    if indicator == "annual_lulc":
        return _resolve_lulc_context(scope=scope, admin_code=admin_code, lga_name=lga_name, year=year)

    layer_key = _resolve_layer_key(indicator, year)
    layer = _public_active_layer(layer_key) if layer_key else None
    if layer is None:
        return {
            "status": "not_published",
            "indicator": indicator,
            "indicator_label": meta["label"],
            "scope": scope,
        }

    base_qs = RemoteSensingLGAMetric.objects.filter(
        layer=layer, admin_level="lga", season=season, mean_value__isnull=False
    )

    if scope_requested:
        lga_qs = base_qs.filter(admin_code=admin_code) if admin_code else base_qs.filter(admin_name__iexact=lga_name)
        probe = lga_qs.first()

        if probe is None:
            # lga_qs is already narrowed to this layer/season — confirm
            # whether the LGA identifier resolves at all (any layer/year)
            # before declaring "unknown LGA" vs. just "no data for this
            # indicator/period" (never silently fall back to statewide).
            identity_qs = RemoteSensingLGAMetric.objects.filter(admin_level="lga")
            identity_qs = identity_qs.filter(admin_code=admin_code) if admin_code else identity_qs.filter(admin_name__iexact=lga_name)
            identity_row = identity_qs.first()
            if identity_row is None:
                return {"status": "lga_not_found", "indicator": indicator, "scope": scope}
            resolved_code, resolved_name = identity_row.admin_code, identity_row.admin_name
        else:
            resolved_code, resolved_name = probe.admin_code, probe.admin_name

        scope = {"type": "lga", "name": resolved_name}

        latest_available = lga_qs.aggregate(value=Max("year"))["value"]
        target_year = year if (year and lga_qs.filter(year=year).exists()) else latest_available
        metric = lga_qs.filter(year=target_year).first() if target_year else None

        if metric is None:
            return {
                "status": "no_data",
                "indicator": indicator,
                "indicator_label": meta["label"],
                "scope": scope,
                "latest_available_year": latest_available,
            }

        primary = _build_metric_entry(metric, indicator)
        adjacent = _build_adjacent_indicators(admin_code=resolved_code, admin_name=resolved_name, year=target_year, season=season, exclude=indicator)
    else:
        latest_available = base_qs.aggregate(value=Max("year"))["value"]
        target_year = year if (year and base_qs.filter(year=year).exists()) else latest_available
        rows = base_qs.filter(year=target_year) if target_year else base_qs.none()

        if not rows.exists():
            return {
                "status": "no_data",
                "indicator": indicator,
                "indicator_label": meta["label"],
                "scope": scope,
                "latest_available_year": latest_available,
            }

        values = [_decimal_to_float(r.mean_value) for r in rows]
        mean_value = sum(values) / len(values) if values else None
        classifier = _CLASSIFIERS.get(indicator)
        primary = {
            "indicator": indicator,
            "label": meta["label"],
            "value": mean_value,
            "unit": meta["unit"],
            "data_source": meta["data_source"],
            "lga_count": len(values),
        }
        if classifier is not None and mean_value is not None:
            primary["condition"] = classifier(mean_value)
        adjacent = []

    return {
        "status": "ok",
        "indicator": indicator,
        "indicator_label": meta["label"],
        "scope": scope,
        "year": target_year,
        "season": season,
        "period": period,
        "value": primary.get("value"),
        "unit": primary.get("unit"),
        "condition": primary.get("condition"),
        "data_source": primary.get("data_source"),
        "lga_count": primary.get("lga_count"),
        "latest_available_year": latest_available,
        "baseline_reference": RAINFALL_BASELINE_YEARS if indicator in ("rainfall_anomaly", "drought_index") else None,
        "methodology_note": meta["note"],
        "adjacent_indicators": adjacent,
        "publication_status": "published",
    }


def _build_adjacent_indicators(*, admin_code, admin_name, year, season, exclude):
    adjacent = []
    for key in ("rainfall", "rainfall_anomaly", "drought_index", "ndvi" if year >= 2018 else "ndvi_landsat", "lst"):
        indicator = "ndvi" if key in ("ndvi", "ndvi_landsat") else key
        if indicator == exclude:
            continue
        layer = _public_active_layer(key)
        if layer is None:
            continue
        qs = RemoteSensingLGAMetric.objects.filter(
            layer=layer, admin_level="lga", year=year, season=season, mean_value__isnull=False
        )
        metric = qs.filter(admin_code=admin_code).first() if admin_code else qs.filter(admin_name__iexact=admin_name).first()
        if metric is not None:
            adjacent.append(_build_metric_entry(metric, indicator))
    return adjacent


def _resolve_lulc_context(*, scope, admin_code, lga_name, year):
    dataset = (
        LandCoverDataset.objects
        .filter(provider="dynamic_world_v1", admin_level="lga", is_public=True, is_validated=True)
        .order_by("-year")
        .first()
    )
    meta = INDICATOR_METADATA["annual_lulc"]
    if dataset is None:
        return {
            "status": "not_published",
            "indicator": "annual_lulc",
            "indicator_label": meta["label"],
            "scope": scope,
        }

    snapshots = dataset.snapshots.filter(admin_level="lga")
    if scope["type"] == "lga":
        snap = (
            snapshots.filter(admin_code=admin_code).first()
            if admin_code else snapshots.filter(admin_name__iexact=lga_name).first()
        )
        if snap is None:
            return {"status": "lga_not_found", "indicator": "annual_lulc", "scope": scope}
        pct = snap.class_pct or {}
        dom_class = max(pct, key=lambda k: pct[k]) if pct else None
        provider_obj = LAND_COVER_PROVIDERS.get("dynamic_world_v1")
        dom_label = (provider_obj.class_scheme.get(dom_class).label if (provider_obj and dom_class and provider_obj.class_scheme.get(dom_class)) else dom_class)
        return {
            "status": "ok",
            "indicator": "annual_lulc",
            "indicator_label": meta["label"],
            "scope": {"type": "lga", "name": snap.admin_name},
            "year": dataset.year,
            "value": dom_label,
            "dominant_pct": round(float(pct[dom_class]), 2) if dom_class else None,
            "unit": meta["unit"],
            "data_source": meta["data_source"],
            "latest_available_year": dataset.year,
            "methodology_note": meta["note"],
            "adjacent_indicators": [],
            "publication_status": "published",
        }

    return {
        "status": "ok",
        "indicator": "annual_lulc",
        "indicator_label": meta["label"],
        "scope": scope,
        "year": dataset.year,
        "value": None,
        "lga_count": snapshots.count(),
        "unit": meta["unit"],
        "data_source": meta["data_source"],
        "latest_available_year": dataset.year,
        "methodology_note": meta["note"],
        "adjacent_indicators": [],
        "publication_status": "published",
    }


# ---------------------------------------------------------------------------
# Rule-based answer assembly — the same deterministic fallback used whether
# AI is disabled, unconfigured, or fails. Never invents a value: everything
# below reads only from the context dict built by resolve_climate_context().
# ---------------------------------------------------------------------------

# Screening-level action vocabulary from the KCCC completion spec — mirrors
# the existing Climate Action Signal framework's intent (deriveActionPathways
# in frontend/src/utils/climatePathways.js) without duplicating its scoring;
# this only maps an already-computed condition to suggested-action wording.
def _action_considerations(indicator: str, context: dict) -> list[str]:
    condition = context.get("condition")
    value = context.get("value")

    if indicator == "drought_index" and condition and "drought" in condition:
        return ["soil moisture conservation", "irrigation planning", "drought-resilient crop choices"]
    if indicator == "rainfall_anomaly" and condition == "drier than baseline":
        return ["soil moisture conservation", "irrigation planning"]
    if indicator == "rainfall_anomaly" and condition == "wetter than baseline":
        return ["drainage inspection", "erosion controls"]
    if indicator == "ndvi" and condition == "sparse/stressed vegetation":
        return ["vegetation restoration", "soil moisture conservation"]
    if indicator == "lst" and condition == "relatively hotter surface conditions":
        return ["water-resource monitoring", "vegetation restoration"]
    if indicator == "flood_occurrence" and isinstance(value, (int, float)) and value >= 15:
        return ["drainage inspection", "flood preparedness", "water-resource monitoring"]
    return []


def _farmer_interpretation(indicator: str, context: dict) -> str | None:
    condition = context.get("condition")

    if indicator == "ndvi" and condition:
        if condition == "healthy vegetation":
            return "Vegetation cover appears healthy for this period."
        if condition == "moderate vegetation":
            return "Vegetation cover is moderate — worth monitoring alongside rainfall conditions."
        return "Vegetation appears sparse or stressed, which can signal moisture or land-cover stress worth monitoring."

    if indicator == "drought_index" and condition:
        if "drought" in condition:
            return f"A {condition} is recorded — this is a precipitation-only signal, not a confirmed agricultural or hydrological drought."
        return "Precipitation is near or above normal against the baseline window."

    if indicator == "rainfall_anomaly" and condition:
        if condition == "drier than baseline":
            return f"Rainfall is below the {RAINFALL_BASELINE_YEARS} baseline for this period."
        if condition == "wetter than baseline":
            return f"Rainfall is above the {RAINFALL_BASELINE_YEARS} baseline for this period."
        return f"Rainfall is near the {RAINFALL_BASELINE_YEARS} baseline for this period."

    if indicator == "lst" and condition:
        return "This is daytime land-surface temperature, not air temperature — interpret any heat-stress implication with that distinction in mind."

    if indicator == "flood_occurrence":
        return "This reflects historical surface-water presence over 1984–2021, not a current flood warning or a validated flood hazard assessment."

    return None


def _format_value(entry: dict) -> str:
    value = entry.get("value")
    unit = entry.get("unit")

    if value is None:
        return "No data"

    if isinstance(value, (int, float)):
        if unit == "%" and entry.get("indicator") == "rainfall_anomaly":
            return f"{value:+.1f}%"
        if unit == "%":
            return f"{value:.1f}%"
        if unit == "SPI":
            return f"{value:.2f}"
        if unit == "index":
            return f"{value:.3f}"
        if unit == "°C":
            return f"{value:.1f}°C"
        if unit == "mm":
            return f"{round(value)} mm"
        if unit == "m":
            return f"{round(value)} m"
        return str(value)

    # LULC dominant-class label (string value).
    pct = entry.get("dominant_pct")
    return f"{value}{f' ({pct:.1f}%)' if pct is not None else ''}"


def _evidence_rows(context: dict) -> list[dict]:
    rows = []
    if context.get("value") is not None:
        rows.append({
            "label": context.get("indicator_label", context.get("indicator")),
            "value": _format_value(context),
            "source": context.get("data_source") or "KCCC Climate Atlas",
        })
    for adjacent in context.get("adjacent_indicators", [])[:3]:
        if adjacent.get("value") is not None:
            rows.append({
                "label": adjacent.get("label"),
                "value": _format_value(adjacent),
                "source": adjacent.get("data_source") or "KCCC Climate Atlas",
            })
    return rows


def _build_limitations(context: dict, scope: dict) -> list[str]:
    limitations = []
    note = context.get("methodology_note")
    if note:
        limitations.append(note)

    if scope["type"] == "lga":
        limitations.append(
            f"This result is specific to {scope.get('name')} and should not be generalised to all of Kaduna State."
        )
    else:
        limitations.append(
            "This result is statewide (aggregated across Kaduna LGAs) and does not represent any single LGA."
        )

    limitations.append(
        "Satellite-derived estimate aggregated to administrative boundaries — not a ground-based measurement."
    )
    return limitations


def build_rule_based_answer(question: str, context: dict) -> dict:
    """Deterministic, data-grounded answer — used as the AI fallback and as
    the answer whenever AI is disabled. `question` is accepted for parity
    with the AI path's signature but intentionally does not change which
    facts are reported (only a future free-text match could do that safely)."""
    del question  # Current rule-based engine answers from context only.

    indicator = context.get("indicator")
    meta = INDICATOR_METADATA.get(indicator, {})
    label = context.get("indicator_label") or meta.get("label") or indicator or "This indicator"
    suggested = SUGGESTED_QUESTIONS_BY_INDICATOR.get(indicator, _GENERIC_SUGGESTED_QUESTIONS)
    scope = context.get("scope") or {"type": "statewide", "name": None}
    scope_phrase = (
        f"{scope['name']} LGA" if scope.get("type") == "lga" and scope.get("name") else "Kaduna State (statewide)"
    )
    status = context.get("status")

    if status == "unknown_indicator":
        return {
            "answer": (
                "This question refers to an indicator that isn't available in the Climate Atlas. "
                "Try rainfall, rainfall anomaly, NDVI/vegetation, drought (SPI), land surface temperature, "
                "land cover, elevation, or historical surface water."
            ),
            "evidence": [],
            "limitations": [],
            "suggested_questions": _GENERIC_SUGGESTED_QUESTIONS,
        }

    if status == "not_published":
        return {
            "answer": f"Insufficient published KCCC data is available for {label} in {scope_phrase}. This layer is not yet published for public release.",
            "evidence": [],
            "limitations": ["Only published, validated KCCC datasets are used — unpublished or internal-preview layers are never surfaced here."],
            "suggested_questions": suggested,
        }

    if status == "lga_not_found":
        return {
            "answer": f"'{scope.get('name') or 'The requested LGA'}' could not be matched to a Kaduna LGA in the KCCC climate database. Please check the LGA name and try again.",
            "evidence": [],
            "limitations": [],
            "suggested_questions": suggested,
        }

    if status == "no_data":
        latest = context.get("latest_available_year")
        latest_note = f" The latest available year for {label} in {scope_phrase} is {latest}." if latest else ""
        return {
            "answer": f"Insufficient published KCCC data is available for {label} in {scope_phrase} for the selected year/season.{latest_note}",
            "evidence": [],
            "limitations": [meta["note"]] if meta.get("note") else [],
            "suggested_questions": suggested,
        }

    # status == "ok"
    sentence = f"{label} for {scope_phrase} ({context.get('season')} {context.get('year')}): {_format_value(context)}."
    condition = context.get("condition")
    if condition:
        sentence += f" This indicates {condition}."

    interpretation = _farmer_interpretation(indicator, context)
    if interpretation:
        sentence += f" {interpretation}"

    actions = _action_considerations(indicator, context)
    if actions:
        sentence += (
            " Screening-level considerations for planners: " + "; ".join(actions) + ". "
            "These are suggested considerations only, not approved interventions, and require field verification."
        )

    return {
        "answer": sentence,
        "evidence": _evidence_rows(context),
        "limitations": _build_limitations(context, scope),
        "suggested_questions": suggested,
    }
