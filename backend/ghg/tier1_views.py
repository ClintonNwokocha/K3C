from django.db.models import Count, Max, Min
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import ActivityData, CategoryStatus, LGAClimateProfile
from .tier1 import METHOD_VERSION
from .tier1 import factors as F


@api_view(["GET"])
@permission_classes([AllowAny])
def tier1_method(request):
    """
    Public method note for the Tier 1 inventory: which IPCC categories are
    estimated (and how confidently), which are not occurring or not
    estimated and why, where each activity input comes from, and which
    default values still need checking.
    """
    year = request.query_params.get("year")
    statuses = CategoryStatus.objects.filter(method_version=METHOD_VERSION)
    if year:
        statuses = statuses.filter(year=year)
    else:
        latest = statuses.aggregate(value=Max("year"))["value"]
        statuses = statuses.filter(year=latest)

    sources = (
        ActivityData.objects
        .filter(method_version=METHOD_VERSION)
        .values("source_type", "source_name", "confidence")
        .annotate(records=Count("id"), first_year=Min("year"), last_year=Max("year"))
        .order_by("source_type", "source_name")
    )

    zones = (
        LGAClimateProfile.objects
        .select_related("lga")
        .values("lga__lga_name", "climate_zone", "mean_annual_rainfall_mm", "mean_annual_temp_c")
        .order_by("lga__lga_name")
    )

    return Response({
        "method_version": METHOD_VERSION,
        "guideline": F.GUIDELINE,
        "gwp": {"set": "AR5", "CH4": float(F.GWP_CH4), "N2O": float(F.GWP_N2O)},
        "categories": [
            {
                "ipcc_code": s.ipcc_code,
                "name": s.name,
                "sector": s.sector,
                "year": s.year,
                "status": s.status,
                "status_label": s.get_status_display(),
                "confidence": s.confidence,
                "reason": s.reason,
            }
            for s in statuses
        ],
        "activity_sources": list(sources),
        "climate_zones": [
            {
                "lga": z["lga__lga_name"],
                "zone": z["climate_zone"],
                "rainfall_mm": float(z["mean_annual_rainfall_mm"]),
                "temp_c": float(z["mean_annual_temp_c"]),
            }
            for z in zones
        ],
        "values_to_verify": F.VERIFY,
        "notes": [
            "Totals exclude LULUCF (3.B), which is provisional until land-cover map accuracy is assessed.",
            "CO2 from firewood and charcoal is reported as a memo item, not in totals.",
            "Livestock, crop, fertiliser and wood fuel inputs are national FAOSTAT values allocated to LGAs by maps.",
        ],
    })
