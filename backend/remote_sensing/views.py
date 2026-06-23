from decimal import Decimal

from django.db.models import Avg, Max, Min
from django.shortcuts import get_object_or_404

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from climate_risk.models import ClimateRiskProfile
from core.models import LGARegistry

from .gee_service import gee_service
from .models import RemoteSensingLayer, RemoteSensingLGAMetric
from .serializers import RemoteSensingLayerSerializer, RemoteSensingLGAMetricSerializer


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

    return Response({
        "status": "ok",
        "message": "Remote sensing layers loaded.",
        "results": RemoteSensingLayerSerializer(layers, many=True).data,
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

    metrics_count = RemoteSensingLGAMetric.objects.count()

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