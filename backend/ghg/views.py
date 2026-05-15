from django.db.models import Sum
from django.shortcuts import get_object_or_404
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


def get_user_profile(user):
    return getattr(user, "profile", None)


def can_access_energy_module(user):
    if user.is_superuser:
        return True

    profile = get_user_profile(user)

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


def can_review_ghg_entries(user):
    if user.is_superuser:
        return True

    profile = get_user_profile(user)

    if not profile:
        return False

    return profile.role in [
        UserProfile.Role.ADMIN,
        UserProfile.Role.ANALYST,
    ]


def can_final_approve(user):
    if user.is_superuser:
        return True

    profile = get_user_profile(user)

    if not profile:
        return False

    return profile.role == UserProfile.Role.ADMIN


def recompute_energy_total(year):
    """
    Official totals should use approved records only.
    Drafts, pending review records, rejected records, and revision-requested
    records must not feed official dashboard/report totals.
    """
    total = (
        GHGInventoryEntry.objects
        .filter(
            sector=GHGInventoryEntry.Sector.ENERGY,
            year=year,
            status=GHGInventoryEntry.Status.APPROVED,
        )
        .aggregate(total=Sum("co2e_tonnes"))
        .get("total")
    ) or 0

    GHGStateTotal.objects.update_or_create(
        sector=GHGInventoryEntry.Sector.ENERGY,
        year=year,
        defaults={
            "total_co2e": total,
            "status": "approved_only",
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
            .select_related("emission_factor", "submitted_by", "approved_by", "lga")
            .filter(sector=GHGInventoryEntry.Sector.ENERGY)
            .order_by("-year", "-created_at")
        )

        profile = get_user_profile(request.user)

        if (
            profile
            and profile.role == UserProfile.Role.SECTOR_FOCAL_POINT
            and not request.user.is_superuser
        ):
            entries = entries.filter(submitted_by=request.user)

        year = request.query_params.get("year")
        if year:
            entries = entries.filter(year=year)

        serializer = GHGInventoryEntrySerializer(entries, many=True)

        official_summary = (
            GHGInventoryEntry.objects
            .filter(
                sector=GHGInventoryEntry.Sector.ENERGY,
                status=GHGInventoryEntry.Status.APPROVED,
            )
            .values("year")
            .annotate(total_co2e=Sum("co2e_tonnes"))
            .order_by("-year")
        )

        return Response({
            "count": entries.count(),
            "results": serializer.data,
            "summary": list(official_summary),
        })

    serializer = EnergyEntryCreateSerializer(
        data=request.data,
        context={"request": request}
    )
    serializer.is_valid(raise_exception=True)
    entry = serializer.save()

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

    entry = get_object_or_404(
        GHGInventoryEntry,
        id=entry_id,
        sector=GHGInventoryEntry.Sector.ENERGY,
    )

    profile = get_user_profile(request.user)

    if (
        profile
        and profile.role == UserProfile.Role.SECTOR_FOCAL_POINT
        and entry.submitted_by != request.user
        and not request.user.is_superuser
    ):
        return Response(
            {"detail": "You can only submit your own entries."},
            status=status.HTTP_403_FORBIDDEN
        )

    allowed_statuses = [
        GHGInventoryEntry.Status.DRAFT,
        GHGInventoryEntry.Status.REVISION_REQUESTED,
    ]

    if entry.status not in allowed_statuses:
        return Response(
            {"detail": f"Only draft or revision-requested entries can be submitted. Current status: {entry.status}"},
            status=status.HTTP_400_BAD_REQUEST
        )

    entry.status = GHGInventoryEntry.Status.PENDING_REVIEW
    entry.submitted_at = timezone.now()
    entry.save(update_fields=["status", "submitted_at", "updated_at"])

    return Response({
        "message": "Energy entry submitted for review.",
        "entry": GHGInventoryEntrySerializer(entry).data,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def energy_review_queue(request):
    if not can_review_ghg_entries(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can access the review queue."},
            status=status.HTTP_403_FORBIDDEN
        )

    entries = (
        GHGInventoryEntry.objects
        .select_related("emission_factor", "submitted_by", "approved_by", "lga")
        .filter(
            sector=GHGInventoryEntry.Sector.ENERGY,
            status__in=[
                GHGInventoryEntry.Status.PENDING_REVIEW,
                GHGInventoryEntry.Status.UNDER_REVIEW,
                GHGInventoryEntry.Status.REVISION_REQUESTED,
                GHGInventoryEntry.Status.REJECTED,
                GHGInventoryEntry.Status.APPROVED,
            ],
        )
        .order_by("-submitted_at", "-created_at")
    )

    return Response({
        "count": entries.count(),
        "results": GHGInventoryEntrySerializer(entries, many=True).data,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def review_energy_entry(request, entry_id):
    if not can_review_ghg_entries(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can review GHG entries."},
            status=status.HTTP_403_FORBIDDEN
        )

    entry = get_object_or_404(
        GHGInventoryEntry,
        id=entry_id,
        sector=GHGInventoryEntry.Sector.ENERGY,
    )

    action = request.data.get("action")
    reviewer_comment = request.data.get("reviewer_comment", "").strip()

    valid_actions = [
        "mark_under_review",
        "request_revision",
        "reject",
        "approve",
    ]

    if action not in valid_actions:
        return Response(
            {"detail": "Invalid review action."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if action == "mark_under_review":
        if entry.status != GHGInventoryEntry.Status.PENDING_REVIEW:
            return Response(
                {"detail": "Only pending review entries can be marked under review."},
                status=status.HTTP_400_BAD_REQUEST
            )

        entry.status = GHGInventoryEntry.Status.UNDER_REVIEW
        entry.reviewer_comment = reviewer_comment
        entry.save(update_fields=["status", "reviewer_comment", "updated_at"])

        return Response({
            "message": "Entry marked as under review.",
            "entry": GHGInventoryEntrySerializer(entry).data,
        })

    if action == "request_revision":
        if entry.status not in [
            GHGInventoryEntry.Status.PENDING_REVIEW,
            GHGInventoryEntry.Status.UNDER_REVIEW,
        ]:
            return Response(
                {"detail": "Only pending or under-review entries can be returned for revision."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not reviewer_comment:
            return Response(
                {"detail": "Reviewer comment is required when requesting revision."},
                status=status.HTTP_400_BAD_REQUEST
            )

        entry.status = GHGInventoryEntry.Status.REVISION_REQUESTED
        entry.reviewer_comment = reviewer_comment
        entry.save(update_fields=["status", "reviewer_comment", "updated_at"])

        recompute_energy_total(entry.year)

        return Response({
            "message": "Revision requested.",
            "entry": GHGInventoryEntrySerializer(entry).data,
        })

    if action == "reject":
        if not can_final_approve(request.user):
            return Response(
                {"detail": "Only Admin users can reject entries."},
                status=status.HTTP_403_FORBIDDEN
            )

        if entry.status not in [
            GHGInventoryEntry.Status.PENDING_REVIEW,
            GHGInventoryEntry.Status.UNDER_REVIEW,
        ]:
            return Response(
                {"detail": "Only pending or under-review entries can be rejected."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not reviewer_comment:
            return Response(
                {"detail": "Reviewer comment is required when rejecting an entry."},
                status=status.HTTP_400_BAD_REQUEST
            )

        entry.status = GHGInventoryEntry.Status.REJECTED
        entry.reviewer_comment = reviewer_comment
        entry.save(update_fields=["status", "reviewer_comment", "updated_at"])

        recompute_energy_total(entry.year)

        return Response({
            "message": "Entry rejected.",
            "entry": GHGInventoryEntrySerializer(entry).data,
        })

    if action == "approve":
        if not can_final_approve(request.user):
            return Response(
                {"detail": "Only Admin users can approve entries."},
                status=status.HTTP_403_FORBIDDEN
            )

        if entry.status not in [
            GHGInventoryEntry.Status.PENDING_REVIEW,
            GHGInventoryEntry.Status.UNDER_REVIEW,
        ]:
            return Response(
                {"detail": "Only pending or under-review entries can be approved."},
                status=status.HTTP_400_BAD_REQUEST
            )

        entry.status = GHGInventoryEntry.Status.APPROVED
        entry.approved_by = request.user
        entry.approved_at = timezone.now()
        entry.reviewer_comment = reviewer_comment
        entry.save(update_fields=[
            "status",
            "approved_by",
            "approved_at",
            "reviewer_comment",
            "updated_at",
        ])

        recompute_energy_total(entry.year)

        return Response({
            "message": "Entry approved and included in official Energy total.",
            "entry": GHGInventoryEntrySerializer(entry).data,
        })