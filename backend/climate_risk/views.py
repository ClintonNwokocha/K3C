from decimal import Decimal

from django.db.models import Avg, Count, Max

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ClimateRiskProfile
from .serializers import ClimateRiskProfileSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def climate_risk_profiles(request):
    year = request.query_params.get("year")
    risk_level = request.query_params.get("risk_level")

    profiles = (
        ClimateRiskProfile.objects
        .select_related("lga")
        .filter(is_active=True)
        .order_by("-overall_risk_score", "lga__lga_name")
    )

    if year:
        profiles = profiles.filter(year=year)

    if risk_level and risk_level != "all":
        profiles = profiles.filter(risk_level=risk_level)

    serializer = ClimateRiskProfileSerializer(profiles, many=True)

    available_years = (
        ClimateRiskProfile.objects
        .filter(is_active=True)
        .values_list("year", flat=True)
        .distinct()
        .order_by("-year")
    )

    total_lgas = profiles.count()

    average_overall = (
        profiles.aggregate(value=Avg("overall_risk_score")).get("value")
        or Decimal("0")
    )

    highest_score = (
        profiles.aggregate(value=Max("overall_risk_score")).get("value")
        or Decimal("0")
    )

    risk_counts_raw = (
        profiles
        .values("risk_level")
        .annotate(count=Count("id"))
        .order_by("risk_level")
    )

    risk_counts = {
        "low": 0,
        "moderate": 0,
        "high": 0,
        "very_high": 0,
    }

    for row in risk_counts_raw:
        risk_counts[row["risk_level"]] = row["count"]

    return Response({
        "status": "ok",
        "message": "Climate risk profiles loaded.",
        "filters": {
            "year": year,
            "risk_level": risk_level or "all",
        },
        "available_years": list(available_years),
        "summary": {
            "total_lgas": total_lgas,
            "average_overall_risk": float(average_overall),
            "highest_overall_risk": float(highest_score),
            "risk_counts": risk_counts,
            "high_or_very_high_count": risk_counts["high"] + risk_counts["very_high"],
        },
        "top_lgas": serializer.data[:5],
        "results": serializer.data,
    })