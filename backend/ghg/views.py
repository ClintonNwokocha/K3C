from django.db.models import Sum
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import UserProfile
from core.models import EmissionFactor
from .models import GHGInventoryEntry, GHGStateTotal
from .serializers import (
    EnergyEmissionFactorSerializer,
    EnergyEntryCreateSerializer,
    GHGInventoryEntrySerializer,
)


def can_access_energy_module(user):
    if user.is_superuser:
        return True

    profile = getattr(user, "profile", None)

    if not profile:
        return False

    if profile.role in [UserProfile.Role.ADMIN, UserProfile.Role.ANALYST]:
        return True

    if (
        profile.role == UserProfile.Role.SECTOR_FOCAL_POINT
        and profile.assigned_sector == UserProfile.Sector.ENERGY
    ):
        return True

    return False


def recompute_energy_total(year):
    total = (
        GHGInventoryEntry.objects
        .filter(sector="energy", year=year)
        .exclude(status=GHGInventoryEntry.Status.REJECTED)
        .aggregate(total=Sum("co2e_tonnes"))
        .get("total")
    ) or 0

    GHGStateTotal.objects.update_or_create(
        sector="energy",
        year=year,
        defaults={
            "total_co2e": total,
            "status": "computed",
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def energy_options(request):
    if not can_access_energy_module(request.user):
        return Response(
            {"detail": "You do not have access to the Energy GHG module."},
            status=status.HTTP_403_FORBIDDEN
        )

    factors = EmissionFactor.objects.filter(
        sector="energy",
        is_active=True
    ).order_by("fuel_or_species", "sub_category")

    return Response({
        "years": [2020, 2021, 2022, 2023, 2024, 2025, 2026],
        "sub_categories": [
            {
                "value": "stationary_combustion",
                "label": "Stationary Combustion"
            },
            {
                "value": "transport_combustion",
                "label": "Transport Combustion"
            },
        ],
        "fuels": [
            {"value": "diesel", "label": "Diesel / Gas Oil"},
            {"value": "petrol", "label": "Petrol / Gasoline"},
            {"value": "kerosene", "label": "Kerosene"},
            {"value": "lpg", "label": "LPG / Cooking Gas"},
            {"value": "firewood", "label": "Firewood / Wood Fuel"},
            {"value": "charcoal", "label": "Charcoal"},
            {"value": "natural_gas", "label": "Natural Gas"},
        ],
        "emission_factors": EnergyEmissionFactorSerializer(factors, many=True).data,
    })


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def energy_entries(request):
    if not can_access_energy_module(request.user):
        return Response(
            {"detail": "You do not have access to the Energy GHG module."},
            status=status.HTTP_403_FORBIDDEN
        )

    if request.method == "GET":
        entries = (
            GHGInventoryEntry.objects
            .select_related("emission_factor", "submitted_by", "lga")
            .filter(sector="energy")
            .order_by("-year", "sub_category", "fuel_or_activity")
        )

        year = request.query_params.get("year")
        if year:
            entries = entries.filter(year=year)

        serializer = GHGInventoryEntrySerializer(entries, many=True)

        summary = (
            entries
            .values("year")
            .annotate(total_co2e=Sum("co2e_tonnes"))
            .order_by("-year")
        )

        return Response({
            "count": entries.count(),
            "results": serializer.data,
            "summary": list(summary),
        })

    serializer = EnergyEntryCreateSerializer(
        data=request.data,
        context={"request": request}
    )
    serializer.is_valid(raise_exception=True)
    entry = serializer.save()

    recompute_energy_total(entry.year)

    return Response(
        {
            "message": "Energy GHG entry saved successfully.",
            "entry": GHGInventoryEntrySerializer(entry).data,
        },
        status=status.HTTP_201_CREATED
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_energy_entry(request, entry_id):
    if not can_access_energy_module(request.user):
        return Response(
            {"detail": "You do not have access to the Energy GHG module."},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        entry = GHGInventoryEntry.objects.get(id=entry_id, sector="energy")
    except GHGInventoryEntry.DoesNotExist:
        return Response(
            {"detail": "Energy entry not found."},
            status=status.HTTP_404_NOT_FOUND
        )

    entry.status = GHGInventoryEntry.Status.PENDING_REVIEW
    entry.submitted_at = timezone.now()
    entry.save(update_fields=["status", "submitted_at", "updated_at"])

    return Response({
        "message": "Energy entry submitted for review.",
        "entry": GHGInventoryEntrySerializer(entry).data,
    })