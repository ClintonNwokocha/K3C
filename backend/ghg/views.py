from decimal import Decimal

from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import UserProfile
from audit.utils import log_audit_action
from core.models import EmissionFactor, NDCConstant, EquivalencyFactor
from .models import GHGInventoryEntry, GHGStateTotal
from .serializers import (
    EnergyEmissionFactorSerializer,
    EnergyEntryCreateSerializer,
    EnergyEntryUpdateSerializer,
    GHGInventoryEntrySerializer,
)


def get_user_profile(user):
    return getattr(user, "profile", None)


def serialize_entry_for_audit(entry):
    return {
        "id": entry.id,
        "sector": entry.sector,
        "sub_category": entry.sub_category,
        "fuel_or_activity": entry.fuel_or_activity,
        "lga_id": entry.lga_id,
        "year": entry.year,
        "quantity": entry.quantity,
        "unit": entry.unit,
        "co2_kg": entry.co2_kg,
        "ch4_kg": entry.ch4_kg,
        "n2o_kg": entry.n2o_kg,
        "co2e_tonnes": entry.co2e_tonnes,
        "status": entry.status,
        "notes": entry.notes,
        "reviewer_comment": entry.reviewer_comment,
        "submitted_by_id": entry.submitted_by_id,
        "approved_by_id": entry.approved_by_id,
        "submitted_at": entry.submitted_at,
        "approved_at": entry.approved_at,
    }


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


def can_edit_energy_entry(user, entry):
    if entry.status not in [
        GHGInventoryEntry.Status.DRAFT,
        GHGInventoryEntry.Status.REVISION_REQUESTED,
    ]:
        return False

    if user.is_superuser:
        return True

    profile = get_user_profile(user)

    if not profile:
        return False

    if profile.role == UserProfile.Role.ADMIN:
        return True

    if (
        profile.role == UserProfile.Role.SECTOR_FOCAL_POINT
        and profile.assigned_sector == UserProfile.Sector.ENERGY
        and entry.submitted_by_id == user.id
    ):
        return True

    return False


def recompute_energy_total(year):
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

    log_audit_action(
        request=request,
        action="created_ghg_energy_entry",
        instance=entry,
        old_value=None,
        new_value=serialize_entry_for_audit(entry),
    )

    return Response(
        {
            "message": "Energy GHG entry saved successfully.",
            "entry": GHGInventoryEntrySerializer(entry).data,
        },
        status=status.HTTP_201_CREATED
    )


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_energy_entry(request, entry_id):
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

    if not can_edit_energy_entry(request.user, entry):
        return Response(
            {
                "detail": (
                    "This entry cannot be edited. Only Draft or Revision Requested "
                    "entries can be edited by the original focal point or Admin."
                )
            },
            status=status.HTTP_403_FORBIDDEN
        )

    old_value = serialize_entry_for_audit(entry)

    serializer = EnergyEntryUpdateSerializer(
        entry,
        data=request.data,
        partial=True
    )
    serializer.is_valid(raise_exception=True)
    updated_entry = serializer.save()

    log_audit_action(
        request=request,
        action="updated_ghg_energy_entry",
        instance=updated_entry,
        old_value=old_value,
        new_value=serialize_entry_for_audit(updated_entry),
    )

    return Response({
        "message": "Energy entry updated successfully.",
        "entry": GHGInventoryEntrySerializer(updated_entry).data,
    })


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

    old_value = serialize_entry_for_audit(entry)

    entry.status = GHGInventoryEntry.Status.PENDING_REVIEW
    entry.submitted_at = timezone.now()
    entry.save(update_fields=["status", "submitted_at", "updated_at"])

    log_audit_action(
        request=request,
        action="submitted_ghg_energy_entry_for_review",
        instance=entry,
        old_value=old_value,
        new_value=serialize_entry_for_audit(entry),
    )

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

    old_value = serialize_entry_for_audit(entry)

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

        log_audit_action(
            request=request,
            action="marked_ghg_energy_entry_under_review",
            instance=entry,
            old_value=old_value,
            new_value=serialize_entry_for_audit(entry),
        )

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

        log_audit_action(
            request=request,
            action="requested_revision_for_ghg_energy_entry",
            instance=entry,
            old_value=old_value,
            new_value=serialize_entry_for_audit(entry),
        )

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

        log_audit_action(
            request=request,
            action="rejected_ghg_energy_entry",
            instance=entry,
            old_value=old_value,
            new_value=serialize_entry_for_audit(entry),
        )

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

        log_audit_action(
            request=request,
            action="approved_ghg_energy_entry",
            instance=entry,
            old_value=old_value,
            new_value=serialize_entry_for_audit(entry),
        )

        return Response({
            "message": "Entry approved and included in official Energy total.",
            "entry": GHGInventoryEntrySerializer(entry).data,
        })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ghg_dashboard_summary(request):
    """
    Executive Dashboard summary for approved GHG data.

    This now combines all implemented GHG sectors:
    - Energy
    - Agriculture
    """

    implemented_sectors = [
        GHGInventoryEntry.Sector.ENERGY,
        GHGInventoryEntry.Sector.AGRICULTURE,
        GHGInventoryEntry.Sector.WASTE,
        GHGInventoryEntry.Sector.IPPU,
    ]

    sector_labels = {
        GHGInventoryEntry.Sector.ENERGY: "Energy",
        GHGInventoryEntry.Sector.AGRICULTURE: "Agriculture",
        GHGInventoryEntry.Sector.WASTE: "Waste",
        GHGInventoryEntry.Sector.IPPU: "IPPU",
    }

    approved_totals = (
        GHGStateTotal.objects
        .filter(
            sector__in=implemented_sectors,
            status="approved_only",
        )
        .order_by("sector", "year")
    )

    latest_year = (
        approved_totals
        .order_by("-year")
        .values_list("year", flat=True)
        .first()
    )

    sector_breakdown = []

    if latest_year:
        latest_sector_totals = (
            GHGStateTotal.objects
            .filter(
                sector__in=implemented_sectors,
                status="approved_only",
                year=latest_year,
            )
            .order_by("sector")
        )

        for item in latest_sector_totals:
            sector_breakdown.append({
                "sector": item.sector,
                "sector_label": sector_labels.get(item.sector, item.sector),
                "year": item.year,
                "total_co2e": float(item.total_co2e),
                "total_mtco2e": float(item.total_co2e / Decimal("1000000")),
            })

    latest_total_tco2e = sum(
        Decimal(str(item["total_co2e"])) for item in sector_breakdown
    )

    latest_total_mtco2e = latest_total_tco2e / Decimal("1000000")

    yearly_rows = (
        GHGStateTotal.objects
        .filter(
            sector__in=implemented_sectors,
            status="approved_only",
        )
        .values("year")
        .annotate(total_co2e=Sum("total_co2e"))
        .order_by("year")
    )

    yearly_totals = [
        {
            "year": row["year"],
            "total_co2e": float(row["total_co2e"] or 0),
            "total_mtco2e": float((row["total_co2e"] or 0) / Decimal("1000000")),
        }
        for row in yearly_rows
    ]

    approved_entry_count = GHGInventoryEntry.objects.filter(
        sector__in=implemented_sectors,
        status=GHGInventoryEntry.Status.APPROVED,
    ).count()

    pending_review_count = GHGInventoryEntry.objects.filter(
        sector__in=implemented_sectors,
        status=GHGInventoryEntry.Status.PENDING_REVIEW,
    ).count()

    under_review_count = GHGInventoryEntry.objects.filter(
        sector__in=implemented_sectors,
        status=GHGInventoryEntry.Status.UNDER_REVIEW,
    ).count()

    revision_requested_count = GHGInventoryEntry.objects.filter(
        sector__in=implemented_sectors,
        status=GHGInventoryEntry.Status.REVISION_REQUESTED,
    ).count()

    rejected_count = GHGInventoryEntry.objects.filter(
        sector__in=implemented_sectors,
        status=GHGInventoryEntry.Status.REJECTED,
    ).count()

    pending_by_sector = []

    for sector in implemented_sectors:
        pending_by_sector.append({
            "sector": sector,
            "sector_label": sector_labels.get(sector, sector),
            "pending_review_count": GHGInventoryEntry.objects.filter(
                sector=sector,
                status=GHGInventoryEntry.Status.PENDING_REVIEW,
            ).count(),
            "under_review_count": GHGInventoryEntry.objects.filter(
                sector=sector,
                status=GHGInventoryEntry.Status.UNDER_REVIEW,
            ).count(),
            "approved_entry_count": GHGInventoryEntry.objects.filter(
                sector=sector,
                status=GHGInventoryEntry.Status.APPROVED,
            ).count(),
        })

    ndc_constant = (
        NDCConstant.objects
        .filter(is_active=True)
        .order_by("-updated_at")
        .first()
    )

    implemented_reduction_pct = Decimal("0")
    implemented_progress_pct = Decimal("0")

    if ndc_constant and ndc_constant.kaduna_baseline_mt > 0:
        implemented_reduction_pct = (
            (ndc_constant.kaduna_baseline_mt - latest_total_mtco2e)
            / ndc_constant.kaduna_baseline_mt
        ) * Decimal("100")

        if ndc_constant.unconditional_pct > 0:
            implemented_progress_pct = (
                implemented_reduction_pct
                / ndc_constant.unconditional_pct
            ) * Decimal("100")

    cars_factor = EquivalencyFactor.objects.filter(name="cars_removed").first()
    homes_factor = EquivalencyFactor.objects.filter(name="homes_powered").first()

    cars_equivalent = Decimal("0")
    homes_equivalent = Decimal("0")

    if cars_factor and cars_factor.divisor > 0:
        cars_equivalent = latest_total_tco2e / cars_factor.divisor

    if homes_factor and homes_factor.divisor > 0:
        homes_equivalent = latest_total_tco2e / homes_factor.divisor

    return Response({
        "status": "ok",
        "message": "Cross-sector GHG dashboard summary loaded.",
        "implemented_sectors": [
            {
                "sector": sector,
                "sector_label": sector_labels.get(sector, sector),
            }
            for sector in implemented_sectors
        ],
        "ghg": {
            "latest_year": latest_year,
            "latest_total_tco2e": float(latest_total_tco2e),
            "latest_total_mtco2e": float(latest_total_mtco2e),
            "approved_entry_count": approved_entry_count,
            "pending_review_count": pending_review_count,
            "under_review_count": under_review_count,
            "revision_requested_count": revision_requested_count,
            "rejected_count": rejected_count,
            "total_review_queue_count": pending_review_count + under_review_count,
            "sector_breakdown": sector_breakdown,
            "yearly_totals": yearly_totals,
            "pending_by_sector": pending_by_sector,
            "cars_equivalent": float(cars_equivalent),
            "homes_equivalent": float(homes_equivalent),
        },
        "ndc_preview": {
            "kaduna_baseline_mt": float(ndc_constant.kaduna_baseline_mt) if ndc_constant else 0,
            "unconditional_target_pct": float(ndc_constant.unconditional_pct) if ndc_constant else 0,
            "implemented_reduction_pct": float(implemented_reduction_pct),
            "implemented_progress_pct": float(implemented_progress_pct),
            "note": "Implemented-sector preview only. This becomes official state NDC progress after all GHG sectors are implemented and approved.",
        }
    })
