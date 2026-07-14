from collections import Counter
from decimal import Decimal
from urllib.parse import urlencode

from django.conf import settings
from django.db.models import Avg, Max, Min
from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsInternalUser
from audit.utils import log_screening_access
from climate_risk.models import ClimateRiskProfile
from core.models import LGARegistry

from .gee_service import _KADUNA_BBOX, gee_service
from .lulc_providers import LAND_COVER_PROVIDERS
from .models import LandCoverDataset, LandCoverSnapshot, RemoteSensingLayer, RemoteSensingLGAMetric
from .serializers import RemoteSensingLayerSerializer, RemoteSensingLGAMetricSerializer

# Official Google Dynamic World v1 class colours.
# These are the canonical DW palette used in published Google/WRI maps.
_DW_PREVIEW_COLORS = {
    "water":              "#419BDF",
    "trees":              "#397D49",
    "grass":              "#88B053",
    "flooded_vegetation": "#7A87C6",
    "crops":              "#E49635",
    "shrub_scrub":        "#DFC35A",
    "built_area":         "#C4281B",
    "bare_ground":        "#A59B8F",
    "snow_ice":           "#B39FE1",
}


def _build_lulc_classes(provider):
    return {
        key: {
            "label": cls.label,
            "color": _DW_PREVIEW_COLORS.get(key, cls.default_color),
        }
        for key, cls in provider.class_scheme.items()
    }


def decimal_to_float(value):
    if value is None:
        return None

    if isinstance(value, Decimal):
        return float(value)

    return float(value)


def get_latest_year():
    metric_year = RemoteSensingLGAMetric.objects.aggregate(value=Max("year")).get("value")
    risk_year = ClimateRiskProfile.objects.aggregate(value=Max("year")).get("value")
    return metric_year or risk_year


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def gee_status(request):
    result = gee_service.status()

    return Response({
        "status": "ok" if result.available else "unavailable",
        "gee": result.data,
        "error": result.error,
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def remote_sensing_layers(request):
    layers = RemoteSensingLayer.objects.filter(
        is_active=True,
        is_public=True,
    ).order_by("label")

    results = list(RemoteSensingLayerSerializer(layers, many=True).data)

    # LULC uses LandCoverDataset (not RemoteSensingLayer), so it is injected as a
    # synthetic catalogue entry rather than a RemoteSensingLayer row.  Only the
    # late_wet_season baseline (2018-2025) counts toward public availability.
    lulc_published = LandCoverDataset.objects.filter(
        composite_window="late_wet_season",
        is_public=True,
        is_validated=True,
    ).exists()
    if lulc_published:
        results.append({
            "key": "annual_lulc",
            "label": "Annual Land Use / Land Cover",
            "unit": "dominant class",
            "description": (
                "Dynamic World v1 annual land-use / land-cover classification. "
                "Sep–Oct composite (late_wet_season), 2018–2025. "
                "23 Kaduna LGAs."
            ),
            "source": None,
            "band": None,
            "gee_dataset": None,
            "gee_band": None,
            "visualization": None,
            "last_synced_at": None,
        })

    return Response({
        "status": "ok",
        "message": "Remote sensing layers loaded.",
        "results": results,
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def tile_url(request, layer):
    layer_obj = get_object_or_404(
        RemoteSensingLayer,
        key=layer,
        is_active=True,
        is_public=True,
    )

    result = gee_service.get_tile_url(
        layer_key=layer_obj.key,
        visualization=layer_obj.visualization,
    )

    return Response({
        "status": "ok" if result.available else "unavailable",
        "message": (
            "Tile URL generated."
            if result.available
            else "Tile URL is not available yet. Configure GEE credentials and layer logic."
        ),
        "layer": RemoteSensingLayerSerializer(layer_obj).data,
        "tile": result.data,
        "error": result.error,
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def lga_stats(request):
    layer_key = request.query_params.get("layer", "ndvi")
    year = request.query_params.get("year")
    month = request.query_params.get("month")
    season = request.query_params.get("season")
    admin_level = request.query_params.get("admin_level", "lga")

    valid_admin_levels = {c[0] for c in RemoteSensingLGAMetric.AdminLevel.choices}
    if admin_level not in valid_admin_levels:
        return Response(
            {"status": "error", "message": f"Invalid admin_level. Valid values: {', '.join(sorted(valid_admin_levels))}"},
            status=400,
        )

    layer_obj = get_object_or_404(
        RemoteSensingLayer,
        key=layer_key,
        is_active=True,
        is_public=True,
    )

    metrics = RemoteSensingLGAMetric.objects.select_related("lga", "layer").filter(
        layer=layer_obj,
        admin_level=admin_level,
        mean_value__isnull=False,
    )

    # Resolve the year: use the explicit request or find the latest stored year.
    requested_year = int(year) if year else None
    if requested_year:
        resolved_year = requested_year
        metrics = metrics.filter(year=resolved_year)
    else:
        resolved_year = metrics.aggregate(value=Max("year")).get("value")
        if resolved_year:
            metrics = metrics.filter(year=resolved_year)

    if season:
        metrics = metrics.filter(season=season)

    if month:
        metrics = metrics.filter(month=month)

    summary = metrics.aggregate(
        mean_value=Avg("mean_value"),
        min_value=Min("min_value"),
        max_value=Max("max_value"),
        anomaly_value=Avg("anomaly_value"),
    )

    return Response({
        "status": "ok",
        "message": "LGA remote sensing statistics loaded.",
        "filters": {
            "layer": layer_key,
            "admin_level": admin_level,
            "requested_year": requested_year,
            "year": resolved_year,
            "season": season or None,
            "month": int(month) if month else None,
        },
        "summary": {
            "count": metrics.count(),
            "mean_value": decimal_to_float(summary.get("mean_value")),
            "min_value": decimal_to_float(summary.get("min_value")),
            "max_value": decimal_to_float(summary.get("max_value")),
            "anomaly_value": decimal_to_float(summary.get("anomaly_value")),
        },
        "results": RemoteSensingLGAMetricSerializer(metrics, many=True).data,
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def lga_profile(request, lga):
    year = request.query_params.get("year") or get_latest_year()

    lga_obj = get_object_or_404(LGARegistry, lga_id=lga)

    metrics = RemoteSensingLGAMetric.objects.select_related("layer", "lga").filter(
        lga=lga_obj,
        mean_value__isnull=False,
    )

    if year:
        metrics = metrics.filter(year=year)

    risk_profile = (
        ClimateRiskProfile.objects
        .filter(lga=lga_obj, year=year, is_active=True)
        .first()
        if year
        else None
    )

    risk = None

    if risk_profile:
        risk = {
            "id": risk_profile.id,
            "year": risk_profile.year,
            "overall_risk_score": decimal_to_float(risk_profile.overall_risk_score),
            "risk_level": risk_profile.risk_level,
            "risk_level_display": risk_profile.get_risk_level_display(),
            "dominant_hazard": risk_profile.dominant_hazard,
            "flood_risk_score": decimal_to_float(risk_profile.flood_risk_score),
            "drought_risk_score": decimal_to_float(risk_profile.drought_risk_score),
            "heat_risk_score": decimal_to_float(risk_profile.heat_risk_score),
            "erosion_risk_score": decimal_to_float(risk_profile.erosion_risk_score),
            "exposure_score": decimal_to_float(risk_profile.exposure_score),
            "vulnerability_score": decimal_to_float(risk_profile.vulnerability_score),
            "adaptive_capacity_score": decimal_to_float(risk_profile.adaptive_capacity_score),
        }

    return Response({
        "status": "ok",
        "message": "LGA climate profile loaded.",
        "lga": {
            "id": lga_obj.lga_id,
            "name": lga_obj.lga_name,
        },
        "year": year,
        "risk_profile": risk,
        "remote_sensing_metrics": RemoteSensingLGAMetricSerializer(metrics, many=True).data,
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def dashboard_kpis(request):
    latest_year = get_latest_year()

    risk_profiles = ClimateRiskProfile.objects.filter(is_active=True)

    if latest_year:
        risk_profiles = risk_profiles.filter(year=latest_year)

    high_or_very_high = risk_profiles.filter(
        risk_level__in=["high", "very_high"]
    ).count()

    avg_risk = risk_profiles.aggregate(
        value=Avg("overall_risk_score")
    ).get("value")

    layers_count = RemoteSensingLayer.objects.filter(
        is_active=True,
        is_public=True,
    ).count()

    metrics_count = RemoteSensingLGAMetric.objects.filter(mean_value__isnull=False).count()

    return Response({
        "status": "ok",
        "message": "Climate intelligence KPIs loaded.",
        "results": {
            "latest_year": latest_year,
            "total_lgas_with_risk_profiles": risk_profiles.count(),
            "high_or_very_high_risk_lgas": high_or_very_high,
            "average_risk_score": decimal_to_float(avg_risk),
            "active_remote_sensing_layers": layers_count,
            "stored_lga_remote_sensing_metrics": metrics_count,
            "gee_status": gee_service.status().data,
        },
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def ai_hotspots(request):
    """
    Lightweight placeholder endpoint.

    No fake AI is used here. It simply exposes highest-risk LGAs from existing
    ClimateRiskProfile records until a real hotspot model is connected.
    """
    year = request.query_params.get("year") or get_latest_year()

    profiles = ClimateRiskProfile.objects.select_related("lga").filter(
        is_active=True,
    )

    if year:
        profiles = profiles.filter(year=year)

    profiles = profiles.order_by("-overall_risk_score")[:10]

    results = []

    for profile in profiles:
        results.append({
            "lga": profile.lga_id,
            "lga_name": profile.lga.lga_name,
            "year": profile.year,
            "overall_risk_score": decimal_to_float(profile.overall_risk_score),
            "risk_level": profile.risk_level,
            "risk_level_display": profile.get_risk_level_display(),
            "dominant_hazard": profile.dominant_hazard,
            "basis": "Existing ClimateRiskProfile database record",
        })

    return Response({
        "status": "ok",
        "message": "Hotspots loaded from existing risk records. No AI model is connected yet.",
        "results": results,
    })


# ---------------------------------------------------------------------------
# Classification helpers — Climate Intelligence Engine E1
# Rule-based only. No AI or LLM is called.
# ---------------------------------------------------------------------------


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
    # Cautious relative wording only. Do not imply air temperature.
    if value < 28.0:
        return "relatively cooler surface conditions"
    if value <= 36.0:
        return "moderate surface temperature"
    return "relatively hotter surface conditions"


def _overall_status(spi_cond, ra_cond, ndvi_cond, lst_cond) -> str:
    _drought_conds = {
        "extreme drought condition",
        "severe drought condition",
        "moderate drought condition",
    }
    if spi_cond in _drought_conds:
        return "possible dry-condition signal"
    if ra_cond == "drier than baseline":
        return "possible dry-condition signal"
    if lst_cond == "relatively hotter surface conditions":
        return "possible heat-stress signal"
    if ndvi_cond == "sparse/stressed vegetation":
        return "watch vegetation and rainfall conditions"
    return "generally stable climate conditions"


def _build_ci_summary(indicators: dict) -> dict:
    ndvi_cond = (indicators.get("ndvi") or {}).get("condition")
    spi_cond  = (indicators.get("spi")  or {}).get("condition")
    ra_cond   = (indicators.get("rainfall_anomaly") or {}).get("condition")
    lst_cond  = (indicators.get("lst")  or {}).get("condition")
    lulc      = indicators.get("lulc")

    _drought_conds = {
        "extreme drought condition",
        "severe drought condition",
        "moderate drought condition",
    }
    if spi_cond in _drought_conds:
        drought_condition = spi_cond
    elif ra_cond == "drier than baseline":
        drought_condition = "possible dry-condition signal"
    else:
        drought_condition = "near normal"

    return {
        "vegetation_condition": ndvi_cond or "no data",
        "water_condition":      ra_cond   or "no data",
        "heat_condition":       lst_cond  or "no data",
        "drought_condition":    drought_condition,
        "dominant_land_cover":  (lulc or {}).get("dominant_label"),
        "overall_status":       _overall_status(spi_cond, ra_cond, ndvi_cond, lst_cond),
    }


def _build_ci_briefing(indicators: dict):
    lines = []
    cautions = []

    ra = indicators.get("rainfall_anomaly")
    r  = indicators.get("rainfall")
    if ra:
        cond = ra.get("condition", "near baseline")
        if cond == "wetter than baseline":
            lines.append("Rainfall is above the long-term baseline.")
        elif cond == "drier than baseline":
            lines.append("Rainfall is below the long-term baseline.")
        else:
            lines.append("Rainfall is near the long-term baseline.")
    elif r:
        lines.append("Rainfall data is available for this period.")

    ndvi = indicators.get("ndvi")
    if ndvi:
        cond = ndvi.get("condition", "")
        if cond == "healthy vegetation":
            lines.append("Vegetation condition is healthy.")
        elif cond == "moderate vegetation":
            lines.append("Vegetation condition is moderate.")
        else:
            lines.append("Vegetation condition is sparse or stressed.")

    spi = indicators.get("spi")
    if spi:
        cond = spi.get("condition", "near normal")
        if "drought" in cond:
            lines.append(f"A {cond} signal is recorded.")
        elif cond in ("moderately wet", "very wet", "extremely wet"):
            lines.append(f"SPI indicates {cond} conditions.")
        else:
            lines.append("SPI indicates near-normal moisture conditions.")

    lst = indicators.get("lst")
    if lst:
        cond = lst.get("condition", "moderate surface temperature")
        lines.append(f"Land surface temperature indicates {cond}.")

    lulc = indicators.get("lulc")
    if lulc:
        if lulc.get("is_public") and lulc.get("is_validated"):
            cautions.append(
                "LULC data is an observed land-cover classification (Dynamic World v1). "
                "Does not constitute a land-cover change claim."
            )
        else:
            cautions.append(
                "LULC data is an internal preview only. Not published. Not validated."
            )
        lines.append("No land-cover change claim is made.")

    return lines, cautions


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def climate_intelligence(request):
    """
    Climate Intelligence Engine E1.

    Aggregates LGA-level climate indicators (rainfall, rainfall anomaly, SPI,
    NDVI, LST, and optionally LULC) into one structured object per LGA.

    Rule-based summaries only. No AI or LLM is called.
    Does not trigger GEE, sync commands, or any DB write.

    Query params:
        year                 – integer; defaults to latest available for this season
        season               – annual | wet_season | dry_season  (default: annual)
        admin_level          – lga | ward  (default: lga)
        include_lulc_preview – true | false  (default: false)
                               LULC notice reflects the dataset's actual is_public/is_validated flags.
    """
    year_param  = request.query_params.get("year")
    season      = request.query_params.get("season", "annual")
    admin_level = request.query_params.get("admin_level", "lga")
    lulc_param  = request.query_params.get("include_lulc_preview", "false").lower()
    include_lulc = lulc_param in ("true", "1")

    valid_seasons = {c[0] for c in RemoteSensingLGAMetric.Season.choices}
    if season not in valid_seasons:
        return Response(
            {"status": "error", "message": f"Invalid season. Valid: {', '.join(sorted(valid_seasons))}"},
            status=400,
        )

    valid_admin_levels = {c[0] for c in RemoteSensingLGAMetric.AdminLevel.choices}
    if admin_level not in valid_admin_levels:
        return Response(
            {"status": "error", "message": f"Invalid admin_level. Valid: {', '.join(sorted(valid_admin_levels))}"},
            status=400,
        )

    try:
        year = int(year_param) if year_param else None
    except (ValueError, TypeError):
        return Response({"status": "error", "message": "Invalid year parameter."}, status=400)

    if year is None:
        year = (
            RemoteSensingLGAMetric.objects
            .filter(admin_level=admin_level, season=season, mean_value__isnull=False)
            .aggregate(value=Max("year"))["value"]
        )

    filters_out = {
        "year": year,
        "season": season,
        "admin_level": admin_level,
        "include_lulc_preview": include_lulc,
    }

    if year is None:
        return Response({"status": "ok", "filters": filters_out, "results": []})

    # Sentinel-2 NDVI for >= 2018; Landsat for earlier years.
    ndvi_key = "ndvi" if year >= 2018 else "ndvi_landsat"
    target_keys = ["rainfall", "rainfall_anomaly", "drought_index", ndvi_key, "lst"]

    metrics_qs = (
        RemoteSensingLGAMetric.objects
        .select_related("layer")
        .filter(
            layer__key__in=target_keys,
            admin_level=admin_level,
            year=year,
            season=season,
            mean_value__isnull=False,
        )
    )

    # Group by admin_code; first-seen metric wins per layer key.
    by_admin: dict = {}
    for m in metrics_qs:
        code = m.admin_code
        if code not in by_admin:
            by_admin[code] = {"admin_name": m.admin_name, "metrics": {}}
        by_admin[code]["metrics"].setdefault(m.layer.key, m)

    # LULC: most recent dynamic_world_v1 dataset, any composite window.
    lulc_by_admin: dict = {}
    if include_lulc:
        dataset = (
            LandCoverDataset.objects
            .filter(provider="dynamic_world_v1", admin_level=admin_level)
            .order_by("-year")
            .first()
        )
        if dataset:
            provider_obj = LAND_COVER_PROVIDERS.get("dynamic_world_v1")
            for snap in dataset.snapshots.filter(admin_level=admin_level):
                pct = snap.class_pct or {}
                dom_class = max(pct, key=lambda k: pct[k]) if pct else None
                dom_label = None
                if dom_class and provider_obj:
                    cls_def = provider_obj.class_scheme.get(dom_class)
                    dom_label = cls_def.label if cls_def else dom_class
                meta = snap.metadata or {}
                lulc_by_admin[snap.admin_code] = {
                    "year": dataset.year,
                    "dominant_class": dom_class,
                    "dominant_label": dom_label,
                    "dominant_pct": round(float(pct[dom_class]), 2) if dom_class else None,
                    "quality_flag": meta.get("quality_flag", "unknown"),
                    "is_public": dataset.is_public,
                    "is_validated": dataset.is_validated,
                    "notice": (
                        "Dynamic World v1 · observed land-cover classification"
                        if dataset.is_public and dataset.is_validated
                        else "Internal preview only"
                    ),
                }

    results = []
    for admin_code, entry in sorted(by_admin.items(), key=lambda x: x[1]["admin_name"]):
        m = entry["metrics"]
        indicators: dict = {}

        r = m.get("rainfall")
        if r is not None:
            indicators["rainfall"] = {
                "value":       decimal_to_float(r.mean_value),
                "unit":        "mm",
                "label":       "Rainfall Total",
                "data_source": r.data_source or "CHIRPS",
            }

        ra = m.get("rainfall_anomaly")
        if ra is not None:
            anom_val = decimal_to_float(ra.mean_value)
            indicators["rainfall_anomaly"] = {
                "value":     anom_val,
                "unit":      "%",
                "label":     "Rainfall Anomaly",
                "condition": _classify_rainfall_anomaly(anom_val),
            }

        di = m.get("drought_index")
        if di is not None:
            spi_val = decimal_to_float(di.mean_value)
            indicators["spi"] = {
                "value":     spi_val,
                "unit":      "SPI",
                "label":     "Meteorological Drought Conditions",
                "condition": _classify_spi(spi_val),
            }

        ndvi_m = m.get(ndvi_key)
        if ndvi_m is not None:
            ndvi_val = decimal_to_float(ndvi_m.mean_value)
            indicators["ndvi"] = {
                "value":     ndvi_val,
                "unit":      "index",
                "label":     "Vegetation Condition",
                "condition": _classify_ndvi(ndvi_val),
            }

        lst_m = m.get("lst")
        if lst_m is not None:
            lst_val = decimal_to_float(lst_m.mean_value)
            indicators["lst"] = {
                "value":     lst_val,
                "unit":      "°C",
                "label":     "Land Surface Temperature",
                "condition": _classify_lst(lst_val),
            }

        if include_lulc:
            lulc_data = lulc_by_admin.get(admin_code)
            if lulc_data:
                indicators["lulc"] = lulc_data

        briefing, cautions = _build_ci_briefing(indicators)

        results.append({
            "admin_code":  admin_code,
            "admin_name":  entry["admin_name"],
            "indicators":  indicators,
            "summary":     _build_ci_summary(indicators),
            "briefing":    briefing,
            "cautions":    cautions,
        })

    return Response({
        "status":  "ok",
        "filters": filters_out,
        "results": results,
    })


_CI_PROFILE_METHOD_NOTES = [
    "Rainfall metrics are derived from CHIRPS satellite-rainfall estimates aggregated to LGA boundaries.",
    "SPI (Standardised Precipitation Index) is a precipitation-only index and does not represent hydrological or agricultural drought.",
    "LST values are land surface temperature measured by satellite sensor and are not equivalent to air temperature.",
    "Where included, LULC data is a Dynamic World v1 annual classification snapshot and does not constitute land-cover change analysis.",
]


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def climate_intelligence_profile(request):
    """
    Climate Intelligence Engine E5 — focused LGA-level profile.

    Returns one complete intelligence profile for a single LGA identified
    by admin_code or admin_name.

    Rule-based only. No AI or LLM is called.
    Does not trigger GEE, sync commands, or any DB write.

    Query params:
        admin_code           – canonical LGA code (admin_code or admin_name required)
        admin_name           – LGA display name, case-insensitive
        year                 – integer; defaults to latest available for this LGA and season
        season               – annual | wet_season | dry_season  (default: annual)
        include_lulc_preview – true | false  (default: false)
                               LULC notice reflects the dataset's actual is_public/is_validated flags.
    """
    admin_code_param = request.query_params.get("admin_code", "").strip()
    admin_name_param = request.query_params.get("admin_name", "").strip()
    year_param = request.query_params.get("year")
    season = request.query_params.get("season", "annual")
    lulc_param = request.query_params.get("include_lulc_preview", "false").lower()
    include_lulc = lulc_param in ("true", "1")

    if not admin_code_param and not admin_name_param:
        return Response(
            {"status": "error", "message": "Provide admin_code or admin_name to identify an LGA."},
            status=400,
        )

    valid_seasons = {c[0] for c in RemoteSensingLGAMetric.Season.choices}
    if season not in valid_seasons:
        return Response(
            {"status": "error", "message": f"Invalid season. Valid: {', '.join(sorted(valid_seasons))}"},
            status=400,
        )

    try:
        year = int(year_param) if year_param else None
    except (ValueError, TypeError):
        return Response({"status": "error", "message": "Invalid year parameter."}, status=400)

    # Resolve identifier to stored metrics.
    base_qs = RemoteSensingLGAMetric.objects.filter(admin_level="lga")
    if admin_code_param:
        base_qs = base_qs.filter(admin_code=admin_code_param)
    else:
        base_qs = base_qs.filter(admin_name__iexact=admin_name_param)

    probe = base_qs.first()
    if probe is None:
        identifier = f"admin_code={admin_code_param!r}" if admin_code_param else f"admin_name={admin_name_param!r}"
        return Response(
            {"status": "error", "message": f"No climate intelligence data found for {identifier}."},
            status=404,
        )

    resolved_code = probe.admin_code
    resolved_name = probe.admin_name

    if year is None:
        year = (
            base_qs.filter(season=season, mean_value__isnull=False)
            .aggregate(value=Max("year"))["value"]
            or base_qs.aggregate(value=Max("year"))["value"]
        )

    ndvi_key = "ndvi" if (year or 0) >= 2018 else "ndvi_landsat"
    target_keys = ["rainfall", "rainfall_anomaly", "drought_index", ndvi_key, "lst"]

    metrics_qs = (
        RemoteSensingLGAMetric.objects
        .select_related("layer")
        .filter(
            layer__key__in=target_keys,
            admin_level="lga",
            admin_code=resolved_code,
            year=year,
            season=season,
            mean_value__isnull=False,
        )
    ) if year else RemoteSensingLGAMetric.objects.none()

    m: dict = {}
    for metric in metrics_qs:
        m.setdefault(metric.layer.key, metric)

    indicators: dict = {}

    r = m.get("rainfall")
    if r is not None:
        indicators["rainfall"] = {
            "value":       decimal_to_float(r.mean_value),
            "unit":        "mm",
            "label":       "Rainfall Total",
            "data_source": r.data_source or "CHIRPS",
        }

    ra = m.get("rainfall_anomaly")
    if ra is not None:
        anom_val = decimal_to_float(ra.mean_value)
        indicators["rainfall_anomaly"] = {
            "value":     anom_val,
            "unit":      "%",
            "label":     "Rainfall Anomaly",
            "condition": _classify_rainfall_anomaly(anom_val),
        }

    di = m.get("drought_index")
    if di is not None:
        spi_val = decimal_to_float(di.mean_value)
        indicators["spi"] = {
            "value":     spi_val,
            "unit":      "SPI",
            "label":     "Meteorological Drought Conditions",
            "condition": _classify_spi(spi_val),
        }

    ndvi_m = m.get(ndvi_key)
    if ndvi_m is not None:
        ndvi_val = decimal_to_float(ndvi_m.mean_value)
        indicators["ndvi"] = {
            "value":     ndvi_val,
            "unit":      "index",
            "label":     "Vegetation Condition",
            "condition": _classify_ndvi(ndvi_val),
        }

    lst_m = m.get("lst")
    if lst_m is not None:
        lst_val = decimal_to_float(lst_m.mean_value)
        indicators["lst"] = {
            "value":     lst_val,
            "unit":      "°C",
            "label":     "Land Surface Temperature",
            "condition": _classify_lst(lst_val),
        }

    lulc_data = None
    if include_lulc:
        dataset = (
            LandCoverDataset.objects
            .filter(provider="dynamic_world_v1", admin_level="lga")
            .order_by("-year")
            .first()
        )
        if dataset:
            provider_obj = LAND_COVER_PROVIDERS.get("dynamic_world_v1")
            snap = dataset.snapshots.filter(admin_level="lga", admin_code=resolved_code).first()
            if snap:
                pct = snap.class_pct or {}
                dom_class = max(pct, key=lambda k: pct[k]) if pct else None
                dom_label = None
                if dom_class and provider_obj:
                    cls_def = provider_obj.class_scheme.get(dom_class)
                    dom_label = cls_def.label if cls_def else dom_class
                meta = snap.metadata or {}
                lulc_data = {
                    "year":           dataset.year,
                    "dominant_class": dom_class,
                    "dominant_label": dom_label,
                    "dominant_pct":   round(float(pct[dom_class]), 2) if dom_class else None,
                    "quality_flag":   meta.get("quality_flag", "unknown"),
                    "is_public":      dataset.is_public,
                    "is_validated":   dataset.is_validated,
                    "notice": (
                        "Dynamic World v1 · observed land-cover classification"
                        if dataset.is_public and dataset.is_validated
                        else "Internal preview only"
                    ),
                }
                indicators["lulc"] = lulc_data

    briefing, cautions = _build_ci_briefing(indicators)
    summary = _build_ci_summary(indicators)
    headline = summary.get("overall_status", "generally stable climate conditions").capitalize()

    return Response({
        "status": "ok",
        "profile": {
            "admin_code":    resolved_code,
            "admin_name":    resolved_name,
            "year":          year,
            "season":        season,
            "headline":      headline,
            "sections": {
                "rainfall":    {
                    "total":   indicators.get("rainfall"),
                    "anomaly": indicators.get("rainfall_anomaly"),
                },
                "vegetation":  indicators.get("ndvi"),
                "temperature": indicators.get("lst"),
                "drought":     indicators.get("spi"),
                "land_cover":  lulc_data,
            },
            "briefing":      briefing,
            "cautions":      cautions,
            "method_notes":  _CI_PROFILE_METHOD_NOTES,
        },
    })


_FORBIDDEN_PREVIEW_PARAMS = frozenset({
    "include_lulc_preview",
    "internal_lulc_preview",
    "internal_flood_preview",
    "internal_elevation_preview",
})

_SCREENING_ALLOWED_SEASONS = None   # resolved lazily from model choices
_SCREENING_ALLOWED_ADMIN_LEVELS = None


@api_view(["GET"])
@permission_classes([IsInternalUser])
def climate_action_screening(request):
    """
    Internal authenticated endpoint — Climate Action Screening Matrix and Map Lens.

    Returns LGA-level climate indicators for the Climate Action Screening Matrix
    and Map Lens, visible only to authenticated internal staff users (ADMIN,
    ANALYST, SECTOR_FOCAL_POINT).  Unauthenticated requests receive 401;
    PUBLIC-role users receive 403.

    This endpoint NEVER includes:
      - LULC preview data
      - Historical Surface Water (flood occurrence)
      - Elevation / terrain
      - Any internal-preview layer
    Client-supplied preview toggle parameters are rejected with 400.

    Every successful access writes exactly one AuditLog entry with action
    "climate_action_screening_view".

    The public Climate Intelligence endpoint (/remote-sensing/climate-intelligence/)
    is NOT modified by this endpoint and remains independently accessible.

    Query params:
        year         – integer; defaults to latest available for this season/admin_level
        season       – annual | wet_season | dry_season  (default: annual)
        admin_level  – lga | ward  (default: lga)
    """
    # Hard-reject any preview toggle parameters — these are forbidden on this endpoint
    for param in _FORBIDDEN_PREVIEW_PARAMS:
        if request.query_params.get(param):
            return Response(
                {"status": "error", "message": "Unsupported query parameter for this endpoint."},
                status=400,
            )

    season = request.query_params.get("season", "annual")
    admin_level = request.query_params.get("admin_level", "lga")
    year_param = request.query_params.get("year")

    valid_seasons = {c[0] for c in RemoteSensingLGAMetric.Season.choices}
    if season not in valid_seasons:
        return Response(
            {"status": "error", "message": f"Invalid season. Valid: {', '.join(sorted(valid_seasons))}"},
            status=400,
        )

    valid_admin_levels = {c[0] for c in RemoteSensingLGAMetric.AdminLevel.choices}
    if admin_level not in valid_admin_levels:
        return Response(
            {"status": "error", "message": f"Invalid admin_level. Valid: {', '.join(sorted(valid_admin_levels))}"},
            status=400,
        )

    try:
        year = int(year_param) if year_param else None
    except (ValueError, TypeError):
        return Response({"status": "error", "message": "Invalid year parameter."}, status=400)

    if year is None:
        year = (
            RemoteSensingLGAMetric.objects
            .filter(admin_level=admin_level, season=season, mean_value__isnull=False)
            .aggregate(value=Max("year"))["value"]
        )

    filters_out = {
        "year": year,
        "season": season,
        "admin_level": admin_level,
    }

    if year is None:
        log_screening_access(request, year=None, season=season, admin_level=admin_level, result_count=0)
        return Response({"status": "ok", "filters": filters_out, "results": []})

    ndvi_key = "ndvi" if year >= 2018 else "ndvi_landsat"
    # Only the four approved indicator layers for screening — no LULC, HSW, elevation, flood
    target_keys = ["rainfall", "rainfall_anomaly", "drought_index", ndvi_key, "lst"]

    metrics_qs = (
        RemoteSensingLGAMetric.objects
        .select_related("layer")
        .filter(
            layer__key__in=target_keys,
            admin_level=admin_level,
            year=year,
            season=season,
            mean_value__isnull=False,
        )
    )

    by_admin: dict = {}
    for m in metrics_qs:
        code = m.admin_code
        if code not in by_admin:
            by_admin[code] = {"admin_name": m.admin_name, "metrics": {}}
        by_admin[code]["metrics"].setdefault(m.layer.key, m)

    results = []
    for admin_code, entry in sorted(by_admin.items(), key=lambda x: x[1]["admin_name"]):
        m = entry["metrics"]
        indicators: dict = {}

        r = m.get("rainfall")
        if r is not None:
            indicators["rainfall"] = {
                "value":       decimal_to_float(r.mean_value),
                "unit":        "mm",
                "label":       "Rainfall Total",
                "data_source": r.data_source or "CHIRPS",
            }

        ra = m.get("rainfall_anomaly")
        if ra is not None:
            anom_val = decimal_to_float(ra.mean_value)
            indicators["rainfall_anomaly"] = {
                "value":     anom_val,
                "unit":      "%",
                "label":     "Rainfall Anomaly",
                "condition": _classify_rainfall_anomaly(anom_val),
            }

        di = m.get("drought_index")
        if di is not None:
            spi_val = decimal_to_float(di.mean_value)
            indicators["spi"] = {
                "value":     spi_val,
                "unit":      "SPI",
                "label":     "Meteorological Drought Conditions",
                "condition": _classify_spi(spi_val),
            }

        ndvi_m = m.get(ndvi_key)
        if ndvi_m is not None:
            ndvi_val = decimal_to_float(ndvi_m.mean_value)
            indicators["ndvi"] = {
                "value":     ndvi_val,
                "unit":      "index",
                "label":     "Vegetation Condition",
                "condition": _classify_ndvi(ndvi_val),
            }

        lst_m = m.get("lst")
        if lst_m is not None:
            lst_val = decimal_to_float(lst_m.mean_value)
            indicators["lst"] = {
                "value":     lst_val,
                "unit":      "°C",
                "label":     "Land Surface Temperature",
                "condition": _classify_lst(lst_val),
            }

        # Explicitly excluded: lulc, flood_occurrence, elevation — never added here

        results.append({
            "admin_code": admin_code,
            "admin_name": entry["admin_name"],
            "indicators": indicators,
        })

    log_screening_access(
        request,
        year=year,
        season=season,
        admin_level=admin_level,
        result_count=len(results),
    )

    return Response({
        "status": "ok",
        "filters": filters_out,
        "results": results,
    })


_LULC_DISPLAY_MODES = frozenset({"cartographic", "raw"})
_LULC_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1"})
_MAX_LULC_ZOOM = 16


def _check_lulc_tile_gate(request):
    """
    Three-condition server-side gate for the LULC GEE tile handshake and proxy.

    All three must be simultaneously true:
      1. settings.DEBUG is True
      2. settings.KCCC_ENABLE_INTERNAL_PREVIEWS is True
      3. HTTP Host resolves to localhost or 127.0.0.1

    A client-supplied header is intentionally NOT part of this gate.
    Returns None when all conditions pass; returns a 403 Response otherwise.
    """
    if not settings.DEBUG:
        return Response(
            {"status": "forbidden", "message": "Not available outside debug mode."},
            status=403,
        )
    if not getattr(settings, "KCCC_ENABLE_INTERNAL_PREVIEWS", False):
        return Response(
            {"status": "forbidden", "message": "Internal preview is not enabled on this server."},
            status=403,
        )
    host = request.META.get("HTTP_HOST", "").split(":")[0].lower()
    if host not in _LULC_LOOPBACK_HOSTS:
        return Response(
            {"status": "forbidden", "message": "Endpoint is only accessible from localhost."},
            status=403,
        )
    return None


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def lulc_tile_url(request):
    """
    Internal preview: LULC tile handshake.

    Warms the server-side GEE map-ID cache and returns a LOCAL proxy URL
    template for Leaflet.  The authenticated GEE tile URL (which contains the
    map ID) is held server-side only and is never returned to the browser.

    Security gate: DEBUG=True AND KCCC_ENABLE_INTERNAL_PREVIEWS=True AND localhost only.
    Does NOT trigger GEE export, data sync, or any DB write.

    Query params:
        year          – integer year; default 2024
        start         – composite start date YYYY-MM-DD; default {year}-09-01
        end           – composite end date YYYY-MM-DD (exclusive); default {year}-11-01
        display_mode  – "cartographic" (default) or "raw"
    """
    gate = _check_lulc_tile_gate(request)
    if gate is not None:
        return gate

    try:
        year = int(request.query_params.get("year", 2024))
    except (ValueError, TypeError):
        return Response({"status": "error", "message": "Invalid year parameter"}, status=400)

    display_mode = request.query_params.get("display_mode", "cartographic")
    if display_mode not in _LULC_DISPLAY_MODES:
        return Response(
            {
                "status": "error",
                "message": f"Invalid display_mode: {display_mode!r}. Allowed values: cartographic, raw",
            },
            status=400,
        )

    start_date = request.query_params.get("start", f"{year}-09-01")
    end_date = request.query_params.get("end", f"{year}-11-01")

    result = gee_service.get_lulc_upstream_template(
        year=year,
        display_mode=display_mode,
        start_date=start_date,
        end_date=end_date,
    )

    if not result.available:
        return Response({
            "status": "unavailable",
            "tile": None,
            "error": result.error,
            "notice": "Internal preview only. Not published. Not validated.",
        })

    # Return a local proxy URL template — Leaflet fills {z}/{x}/{y} at render time.
    # The raw GEE map ID is never included in this response.
    qs = urlencode({"year": year, "display_mode": display_mode})
    local_template = f"/api/remote-sensing/lulc-tile/{{z}}/{{x}}/{{y}}/?{qs}"

    return Response({
        "status": "ok",
        "tile": {
            "tile_url": local_template,
            "attribution": "Dynamic World v1 · Google / WRI · Google Earth Engine",
            "year": year,
            "composite_window": "late_wet_season",
            "start_date": start_date,
            "end_date": end_date,
            "method_version": "dw_latewet_mode_v1",
            "display_mode": display_mode,
        },
        "notice": "Internal preview only. Not published. Not validated.",
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def lulc_tile_proxy(request, z, x, y):
    """
    Server-side proxy for Dynamic World v1 LULC raster tiles.

    Fetches each tile from GEE using server-side credentials so the browser
    makes only same-origin requests to /api/remote-sensing/lulc-tile/{z}/{x}/{y}/.
    The authenticated GEE upstream URL is held server-side only and never
    appears in any response body or log.

    Security gate: DEBUG=True AND KCCC_ENABLE_INTERNAL_PREVIEWS=True AND localhost.

    Coordinate constraints: 0 ≤ z ≤ 16; 0 ≤ x < 2^z; 0 ≤ y < 2^z.

    Query params (must match the handshake call that warmed the cache):
        year         – integer; default 2024
        display_mode – "cartographic" or "raw"; default "cartographic"
    """
    gate = _check_lulc_tile_gate(request)
    if gate is not None:
        return gate

    # Coordinate validation.
    if z < 0 or z > _MAX_LULC_ZOOM:
        return Response(
            {"status": "error", "message": f"z must be in [0, {_MAX_LULC_ZOOM}]."},
            status=400,
        )
    max_tile = (1 << z) - 1
    if x < 0 or x > max_tile or y < 0 or y > max_tile:
        return Response(
            {"status": "error", "message": f"x and y must be in [0, {max_tile}] for z={z}."},
            status=400,
        )

    try:
        year = int(request.query_params.get("year", 2024))
    except (ValueError, TypeError):
        return Response({"status": "error", "message": "Invalid year parameter."}, status=400)

    display_mode = request.query_params.get("display_mode", "cartographic")
    if display_mode not in _LULC_DISPLAY_MODES:
        return Response({"status": "error", "message": "Invalid display_mode."}, status=400)

    # Retrieve the cached upstream template — never log its value.
    cache_result = gee_service.get_lulc_upstream_template(year=year, display_mode=display_mode)
    if not cache_result.available:
        return Response(
            {"status": "unavailable", "message": "GEE tile service unavailable."},
            status=503,
        )

    upstream_template = cache_result.data.get("upstream_template", "")
    if not upstream_template:
        return Response(
            {"status": "unavailable", "message": "GEE tile service unavailable."},
            status=503,
        )

    png_bytes = gee_service.fetch_lulc_tile_bytes(upstream_template, z, x, y)

    if png_bytes is None:
        return Response(
            {"status": "unavailable", "message": "Tile could not be fetched from GEE."},
            status=503,
        )

    response = HttpResponse(png_bytes, content_type="image/png")
    response["Cache-Control"] = "public, max-age=600, stale-while-revalidate=60"
    return response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def lulc_preview(request):
    """
    Internal preview endpoint for Annual Land Use / Land Cover data.

    Returns existing LandCoverDataset and LandCoverSnapshot records from the
    database without requiring is_public=True.  For internal QA use only.
    Does NOT trigger GEE computation.  Does NOT mutate any database state.

    Query params:
        year          – integer year; defaults to latest available
        provider      – provider key; default "dynamic_world_v1"
        window        – composite window key; default "late_wet_season"
        admin_level   – "lga" or "ward"; default "lga"
    """
    provider_key = request.query_params.get("provider", "dynamic_world_v1")
    composite_window = request.query_params.get("window", "late_wet_season")
    admin_level = request.query_params.get("admin_level", "lga")
    year_param = request.query_params.get("year")

    provider = LAND_COVER_PROVIDERS.get(provider_key)
    if not provider:
        return Response(
            {"status": "error", "message": f"Unknown provider: {provider_key!r}"},
            status=400,
        )

    # Resolve year: explicit param, or fall back to the most recent stored year.
    try:
        year_filter = int(year_param) if year_param else None
    except (ValueError, TypeError):
        return Response({"status": "error", "message": "Invalid year parameter"}, status=400)

    base_qs = LandCoverDataset.objects.filter(
        provider=provider_key,
        composite_window=composite_window,
        admin_level=admin_level,
    )

    # All available datasets for this provider/window/admin_level — drives the
    # frontend year selector so it only shows years that actually exist.
    all_datasets = list(
        base_qs.order_by("-year").values("year", "snapshot_count")
    )
    available_years = [
        {
            "year": ds["year"],
            "snapshot_count": ds["snapshot_count"],
            "label": (
                f"{ds['year']} ({ds['snapshot_count']}-LGA pilot)"
                if ds["snapshot_count"] < 10
                else str(ds["year"])
            ),
        }
        for ds in all_datasets
    ]

    dataset_qs = base_qs
    if year_filter:
        dataset_qs = dataset_qs.filter(year=year_filter)
    dataset = dataset_qs.order_by("-year").first()

    empty_classes = _build_lulc_classes(provider)

    if dataset is None:
        return Response({
            "status": "ok",
            "dataset": None,
            "classes": empty_classes,
            "quality_summary": {"high": 0, "medium": 0, "low": 0},
            "results": [],
            "available_years": available_years,
            "notice": "No Annual Land Use / Land Cover dataset available for the requested year.",
        })

    if dataset.is_public and dataset.is_validated:
        notice = (
            "Annual Land Use / Land Cover — Dynamic World v1. Observed land-cover "
            "classification, late wet season (Sep–Oct) composite, 2018–2025."
        )
    else:
        notice = "Internal preview only. This dataset is not published and not yet validated."

    snapshots = list(
        dataset.snapshots.filter(admin_level=admin_level).order_by("admin_name")
    )

    quality_counts: Counter = Counter()
    results = []
    for snap in snapshots:
        pct = snap.class_pct or {}
        dom_class = max(pct, key=lambda k: pct[k]) if pct else None
        dom_cls_def = provider.class_scheme.get(dom_class)
        dom_label = dom_cls_def.label if dom_cls_def else dom_class
        meta = snap.metadata or {}
        flag = meta.get("quality_flag", "unknown")
        quality_counts[flag] += 1
        results.append({
            "admin_code": snap.admin_code,
            "admin_name": snap.admin_name,
            "dominant_class": dom_class,
            "dominant_label": dom_label,
            "dominant_pct": round(float(pct.get(dom_class, 0)), 2) if dom_class else None,
            "class_pct": pct,
            "class_areas_km2": snap.class_areas_km2,
            "quality_flag": flag,
            "peak_scene_count": meta.get("peak_season_scene_count"),
            "total_scene_count": meta.get("source_image_count"),
            "metadata": meta,
        })

    return Response({
        "status": "ok",
        "dataset": {
            "provider": dataset.provider,
            "provider_label": dataset.provider_label,
            "year": dataset.year,
            "composite_window": dataset.composite_window,
            "method_version": dataset.method_version,
            "snapshot_count": dataset.snapshot_count,
            "is_public": dataset.is_public,
            "is_validated": dataset.is_validated,
            "composite_start": dataset.composite_start.isoformat() if dataset.composite_start else None,
            "composite_end": dataset.composite_end.isoformat() if dataset.composite_end else None,
        },
        "classes": _build_lulc_classes(provider),
        "quality_summary": {
            "high": quality_counts.get("high", 0),
            "medium": quality_counts.get("medium", 0),
            "low": quality_counts.get("low", 0),
        },
        "results": results,
        "available_years": available_years,
        "notice": notice,
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def flood_occurrence_preview(request):
    """
    Internal preview: JRC GSW v1.4 flood occurrence metrics.

    Returns RemoteSensingLGAMetric records for the flood_occurrence layer
    without requiring is_public=True on the layer.  For internal QA use only
    — gated in the frontend via ?internal_flood_preview=1.
    Does NOT mutate any database state.
    """
    metrics = RemoteSensingLGAMetric.objects.select_related("lga", "layer").filter(
        layer__key="flood_occurrence",
        year=2021,
        season="annual",
        admin_level="lga",
        mean_value__isnull=False,
    ).order_by("admin_name")
    return Response({
        "status": "ok",
        "notice": "Internal preview only. Not published. Not active.",
        "results": RemoteSensingLGAMetricSerializer(metrics, many=True).data,
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def elevation_preview(request):
    """
    Internal preview: USGS SRTMGL1_003 elevation metrics.

    Returns RemoteSensingLGAMetric records for the elevation layer
    without requiring is_public=True on the layer.  For internal QA use only
    — gated in the frontend via ?internal_elevation_preview=1.
    Does NOT mutate any database state.
    """
    metrics = RemoteSensingLGAMetric.objects.select_related("lga", "layer").filter(
        layer__key="elevation",
        year=2000,
        season="annual",
        admin_level="lga",
        mean_value__isnull=False,
    ).order_by("admin_name")
    return Response({
        "status": "ok",
        "notice": "Internal preview only. Not published. Not active.",
        "results": RemoteSensingLGAMetricSerializer(metrics, many=True).data,
    })


_ELEVATION_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1"})


def _check_elevation_terrain_gate(request):
    """
    Three-condition server-side gate for the GEE-calling elevation endpoints.

    All three conditions must be simultaneously true:
      1. settings.DEBUG is True
      2. settings.KCCC_ENABLE_INTERNAL_PREVIEWS is True
      3. The HTTP Host header resolves to localhost or 127.0.0.1

    Returns None when all conditions pass; returns a 403 Response otherwise.
    A client-controlled request header is intentionally NOT part of this gate.
    """
    if not settings.DEBUG:
        return Response(
            {"status": "forbidden", "message": "Not available outside debug mode."},
            status=403,
        )
    if not getattr(settings, "KCCC_ENABLE_INTERNAL_PREVIEWS", False):
        return Response(
            {"status": "forbidden", "message": "Internal preview is not enabled on this server."},
            status=403,
        )
    host = request.META.get("HTTP_HOST", "").split(":")[0].lower()
    if host not in _ELEVATION_LOOPBACK_HOSTS:
        return Response(
            {"status": "forbidden", "message": "Endpoint is only accessible from localhost."},
            status=403,
        )
    return None


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def elevation_tile_url(request):
    """
    Internal preview: GEE XYZ tile URL for the USGS SRTMGL1_003 DEM clipped to Kaduna.

    Allowed only when DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=true, and the request
    originates from localhost/127.0.0.1.  Returns 403 otherwise.
    No is_public check on the layer.  Does NOT trigger any DB write or export.
    Calls GEE read-only.
    """
    gate = _check_elevation_terrain_gate(request)
    if gate is not None:
        return gate

    result = gee_service.get_elevation_tile_url()

    return Response({
        "status": "ok" if result.available else "unavailable",
        "tile": result.data,
        "error": result.error,
        "notice": "Internal preview only. Not published. Not active.",
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def elevation_sample(request):
    """
    Internal preview: sample USGS SRTMGL1_003 elevation at a single point.

    Allowed only when DEBUG=True, KCCC_ENABLE_INTERNAL_PREVIEWS=true, and the request
    originates from localhost/127.0.0.1.  Returns 403 otherwise.
    Validates that the requested point is within Kaduna State.
    Calls GEE read-only; does not write any DB state.

    Query params:
        lat  – WGS84 latitude  (decimal degrees, required)
        lng  – WGS84 longitude (decimal degrees, required)
    """
    gate = _check_elevation_terrain_gate(request)
    if gate is not None:
        return gate

    lat_str = request.query_params.get("lat", "")
    lng_str = request.query_params.get("lng", "")

    try:
        lat = float(lat_str)
        lng = float(lng_str)
    except (ValueError, TypeError):
        return Response(
            {"status": "error", "message": "lat and lng must be numeric decimal degrees."},
            status=400,
        )

    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return Response(
            {"status": "error", "message": "lat must be in [-90, 90] and lng in [-180, 180]."},
            status=400,
        )

    if not (
        _KADUNA_BBOX["lat_min"] <= lat <= _KADUNA_BBOX["lat_max"]
        and _KADUNA_BBOX["lng_min"] <= lng <= _KADUNA_BBOX["lng_max"]
    ):
        return Response(
            {
                "status": "error",
                "message": "Coordinates are outside Kaduna State.",
                "detail": "Point sampling is limited to Kaduna State.",
            },
            status=400,
        )

    result = gee_service.sample_elevation_at_point(lat=lat, lng=lng)

    if not result.available:
        if result.error == "outside_kaduna":
            return Response(
                {
                    "status": "error",
                    "message": "Coordinates are outside Kaduna State (no SRTM data at this point).",
                    "detail": "The requested point falls outside the Kaduna State boundary.",
                },
                status=400,
            )
        return Response(
            {"status": "error", "message": result.error},
            status=503,
        )

    return Response({
        "status": "ok",
        "notice": "Internal preview only. Not published. Not active.",
        "sample": result.data,
    })


_MAX_ELEVATION_TILE_ZOOM = 18


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def elevation_tile_url_public(request):
    """
    Public terrain tile handshake for the USGS SRTMGL1_003 DEM.

    Warms the server-side GEE map-ID cache and returns a local proxy URL
    template for Leaflet.  The authenticated GEE tile URL is held server-side
    only and is never returned to the browser.
    Does NOT trigger any DB write or export.

    Gate: requires is_public=True AND is_active=True on the elevation layer.
    Returns 404 until the layer has been formally published via release_layer.
    """
    get_object_or_404(RemoteSensingLayer, key="elevation", is_public=True, is_active=True)

    result = gee_service.get_elevation_upstream_template()

    if not result.available:
        return Response({
            "status": "unavailable",
            "tile": None,
            "error": result.error,
        }, status=503)

    local_template = "/api/remote-sensing/elevation-tile/{z}/{x}/{y}/"

    return Response({
        "status": "ok",
        "tile": {
            "tile_url": local_template,
            "attribution": "USGS SRTMGL1 v003 · NASA SRTM · Google Earth Engine",
            "source": "USGS/SRTMGL1_003",
            "band": "elevation",
            "vis_min_m": 400,
            "vis_max_m": 1000,
            "acquisition_year": 2000,
            "source_resolution": "~30 m (1 arc-second SRTM)",
            "method_version": "srtm_terrain_tile_v1",
        },
        "notice": (
            "Terrain context layer. Approximately 30 m SRTM source resolution, "
            "~2000 acquisition. Not survey-grade. Not a climate variable."
        ),
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def elevation_tile_proxy(request, z, x, y):
    """
    Server-side proxy for USGS SRTMGL1_003 terrain raster tiles.

    Fetches each tile from GEE using server-side credentials so the browser
    makes only same-origin requests.  The authenticated GEE upstream URL is
    held server-side only and never appears in any response body or log.

    SRTM is a static dataset — tiles are cached for 1 hour.

    Gate: requires is_public=True AND is_active=True on the elevation layer.
    Returns 404 until the layer has been formally published via release_layer.
    """
    get_object_or_404(RemoteSensingLayer, key="elevation", is_public=True, is_active=True)

    if z < 0 or z > _MAX_ELEVATION_TILE_ZOOM:
        return Response(
            {"status": "error", "message": f"z must be in [0, {_MAX_ELEVATION_TILE_ZOOM}]."},
            status=400,
        )
    max_tile = (1 << z) - 1
    if x < 0 or x > max_tile or y < 0 or y > max_tile:
        return Response(
            {"status": "error", "message": f"x and y must be in [0, {max_tile}] for z={z}."},
            status=400,
        )

    cache_result = gee_service.get_elevation_upstream_template()
    if not cache_result.available:
        return Response(
            {"status": "unavailable", "message": "GEE tile service unavailable."},
            status=503,
        )

    upstream_template = cache_result.data.get("upstream_template", "")
    if not upstream_template:
        return Response(
            {"status": "unavailable", "message": "GEE tile service unavailable."},
            status=503,
        )

    png_bytes = gee_service.fetch_elevation_tile_bytes(upstream_template, z, x, y)

    if png_bytes is None:
        return Response(
            {"status": "unavailable", "message": "Tile could not be fetched from GEE."},
            status=503,
        )

    response = HttpResponse(png_bytes, content_type="image/png")
    response["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=300"
    return response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def elevation_sample_public(request):
    """
    Public terrain point sampling.

    Samples USGS SRTMGL1_003 elevation at a single point within Kaduna State.
    Validates the requested point against the Kaduna State bounding box.
    Calls GEE read-only; does not write any DB state.
    No DEBUG/localhost gate.

    Gate: requires is_public=True AND is_active=True on the elevation layer.
    Returns 404 until the layer has been formally published via release_layer.

    Query params:
        lat  – WGS84 latitude  (decimal degrees, required)
        lng  – WGS84 longitude (decimal degrees, required)
    """
    get_object_or_404(RemoteSensingLayer, key="elevation", is_public=True, is_active=True)

    lat_str = request.query_params.get("lat", "")
    lng_str = request.query_params.get("lng", "")

    try:
        lat = float(lat_str)
        lng = float(lng_str)
    except (ValueError, TypeError):
        return Response(
            {"status": "error", "message": "lat and lng must be numeric decimal degrees."},
            status=400,
        )

    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return Response(
            {"status": "error", "message": "lat must be in [-90, 90] and lng in [-180, 180]."},
            status=400,
        )

    if not (
        _KADUNA_BBOX["lat_min"] <= lat <= _KADUNA_BBOX["lat_max"]
        and _KADUNA_BBOX["lng_min"] <= lng <= _KADUNA_BBOX["lng_max"]
    ):
        return Response(
            {
                "status": "error",
                "message": "Coordinates are outside Kaduna State.",
                "detail": "Point sampling is limited to Kaduna State.",
            },
            status=400,
        )

    result = gee_service.sample_elevation_at_point(lat=lat, lng=lng)

    if not result.available:
        if result.error == "outside_kaduna":
            return Response(
                {
                    "status": "error",
                    "message": "Coordinates are outside Kaduna State (no SRTM data at this point).",
                    "detail": "The requested point falls outside the Kaduna State boundary.",
                },
                status=400,
            )
        return Response(
            {"status": "error", "message": result.error},
            status=503,
        )

    return Response({
        "status": "ok",
        "notice": (
            "Sampled SRTM cell elevation. Approximately 30 m source resolution, "
            "~2000 acquisition. Not survey-grade."
        ),
        "sample": result.data,
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def public_elevation_summary(request):
    """
    Public endpoint: LGA Elevation Summary (SRTM approximately 2000).
    Returns only metrics if is_public=True and is_active=True on the layer.
    Bypasses GEE and returns database-backed records only.
    """
    layer = get_object_or_404(
        RemoteSensingLayer,
        key="elevation",
        is_public=True,
        is_active=True,
    )
    metrics = RemoteSensingLGAMetric.objects.select_related("lga", "layer").filter(
        layer=layer,
        year=2000,
        season="annual",
        admin_level="lga",
        mean_value__isnull=False,
    ).order_by("admin_name")
    return Response({
        "status": "ok",
        "label": "Elevation LGA Summary — SRTM approximately 2000",
        "results": RemoteSensingLGAMetricSerializer(metrics, many=True).data,
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def public_historical_surface_water(request):
    """
    Public endpoint: Historical Surface Water Occurrence (1984-2021 archive).
    Returns only metrics if is_public=True and is_active=True on the layer.
    Bypasses GEE and returns database-backed records only.
    """
    layer = get_object_or_404(
        RemoteSensingLayer,
        key="flood_occurrence",
        is_public=True,
        is_active=True,
    )
    metrics = RemoteSensingLGAMetric.objects.select_related("lga", "layer").filter(
        layer=layer,
        year=2021,
        season="annual",
        admin_level="lga",
        mean_value__isnull=False,
    ).order_by("admin_name")
    return Response({
        "status": "ok",
        "label": "Historical Surface Water Occurrence — 1984–2021 archive",
        "results": RemoteSensingLGAMetricSerializer(metrics, many=True).data,
    })

