from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import UserProfile
from audit.utils import log_audit_action
from core.models import EmissionFactor
from .models import GHGInventoryEntry, GHGStateTotal
from .waste_serializers import (
    WasteEmissionFactorSerializer,
    WasteEntryCreateSerializer,
    WasteEntrySerializer,
    WasteEntryUpdateSerializer,
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


def can_access_waste_module(user):
    if user.is_superuser:
        return True

    profile = get_user_profile(user)

    if not profile:
        return False

    if profile.role in [UserProfile.Role.ADMIN, UserProfile.Role.ANALYST]:
        return True

    return (
        profile.role == UserProfile.Role.SECTOR_FOCAL_POINT
        and profile.assigned_sector == UserProfile.Sector.WASTE
    )


def can_review_ghg_entries(user):
    if user.is_superuser:
        return True

    profile = get_user_profile(user)

    return bool(
        profile
        and profile.role in [UserProfile.Role.ADMIN, UserProfile.Role.ANALYST]
    )


def can_final_approve(user):
    if user.is_superuser:
        return True

    profile = get_user_profile(user)

    return bool(profile and profile.role == UserProfile.Role.ADMIN)


def can_edit_waste_entry(user, entry):
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

    return (
        profile.role == UserProfile.Role.SECTOR_FOCAL_POINT
        and profile.assigned_sector == UserProfile.Sector.WASTE
        and entry.submitted_by_id == user.id
    )


def recompute_waste_total(year):
    total = (
        GHGInventoryEntry.objects
        .filter(
            sector=GHGInventoryEntry.Sector.WASTE,
            year=year,
            status=GHGInventoryEntry.Status.APPROVED,
        )
        .aggregate(total=Sum("co2e_tonnes"))
        .get("total")
    ) or 0

    GHGStateTotal.objects.update_or_create(
        sector=GHGInventoryEntry.Sector.WASTE,
        year=year,
        defaults={
            "total_co2e": total,
            "status": "approved_only",
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def waste_options(request):
    if not can_access_waste_module(request.user):
        return Response(
            {"detail": "You do not have access to the Waste GHG module."},
            status=status.HTTP_403_FORBIDDEN
        )

    factors = EmissionFactor.objects.filter(
        sector="waste",
        is_active=True
    ).order_by("sub_category", "fuel_or_species")

    return Response({
        "years": [2020, 2021, 2022, 2023, 2024, 2025, 2026],
        "sub_categories": [
            {
                "value": "solid_waste",
                "label": "Solid Waste",
                "unit_label": "Tonnes of municipal solid waste generated",
            },
            {
                "value": "wastewater",
                "label": "Wastewater",
                "unit_label": "Population served / population estimate",
            },
        ],
        "activities": [
            {
                "value": "open_dump",
                "label": "Open Dump",
                "sub_category": "solid_waste",
            },
            {
                "value": "managed_landfill",
                "label": "Managed Landfill",
                "sub_category": "solid_waste",
            },
            {
                "value": "population",
                "label": "Population-based Wastewater",
                "sub_category": "wastewater",
            },
        ],
        "emission_factors": WasteEmissionFactorSerializer(factors, many=True).data,
    })


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def waste_entries(request):
    if not can_access_waste_module(request.user):
        return Response(
            {"detail": "You do not have access to the Waste GHG module."},
            status=status.HTTP_403_FORBIDDEN
        )

    if request.method == "GET":
        entries = (
            GHGInventoryEntry.objects
            .select_related("emission_factor", "submitted_by", "approved_by", "lga")
            .filter(sector=GHGInventoryEntry.Sector.WASTE)
            .order_by("-year", "-created_at")
        )

        profile = get_user_profile(request.user)

        if (
            profile
            and profile.role == UserProfile.Role.SECTOR_FOCAL_POINT
            and not request.user.is_superuser
        ):
            entries = entries.filter(submitted_by=request.user)

        serializer = WasteEntrySerializer(entries, many=True)

        official_summary = (
            GHGInventoryEntry.objects
            .filter(
                sector=GHGInventoryEntry.Sector.WASTE,
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

    serializer = WasteEntryCreateSerializer(
        data=request.data,
        context={"request": request}
    )
    serializer.is_valid(raise_exception=True)
    entry = serializer.save()

    log_audit_action(
        request=request,
        action="created_ghg_waste_entry",
        instance=entry,
        old_value=None,
        new_value=serialize_entry_for_audit(entry),
    )

    return Response(
        {
            "message": "Waste GHG entry saved successfully.",
            "entry": WasteEntrySerializer(entry).data,
        },
        status=status.HTTP_201_CREATED
    )


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_waste_entry(request, entry_id):
    if not can_access_waste_module(request.user):
        return Response(
            {"detail": "You do not have access to the Waste GHG module."},
            status=status.HTTP_403_FORBIDDEN
        )

    entry = get_object_or_404(
        GHGInventoryEntry,
        id=entry_id,
        sector=GHGInventoryEntry.Sector.WASTE,
    )

    if not can_edit_waste_entry(request.user, entry):
        return Response(
            {"detail": "Only Draft or Revision Requested entries can be edited."},
            status=status.HTTP_403_FORBIDDEN
        )

    old_value = serialize_entry_for_audit(entry)

    serializer = WasteEntryUpdateSerializer(
        entry,
        data=request.data,
        partial=True
    )
    serializer.is_valid(raise_exception=True)
    updated_entry = serializer.save()

    log_audit_action(
        request=request,
        action="updated_ghg_waste_entry",
        instance=updated_entry,
        old_value=old_value,
        new_value=serialize_entry_for_audit(updated_entry),
    )

    return Response({
        "message": "Waste entry updated successfully.",
        "entry": WasteEntrySerializer(updated_entry).data,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_waste_entry(request, entry_id):
    if not can_access_waste_module(request.user):
        return Response(
            {"detail": "You do not have access to the Waste GHG module."},
            status=status.HTTP_403_FORBIDDEN
        )

    entry = get_object_or_404(
        GHGInventoryEntry,
        id=entry_id,
        sector=GHGInventoryEntry.Sector.WASTE,
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

    if entry.status not in [
        GHGInventoryEntry.Status.DRAFT,
        GHGInventoryEntry.Status.REVISION_REQUESTED,
    ]:
        return Response(
            {"detail": "Only draft or revision-requested entries can be submitted."},
            status=status.HTTP_400_BAD_REQUEST
        )

    old_value = serialize_entry_for_audit(entry)

    entry.status = GHGInventoryEntry.Status.PENDING_REVIEW
    entry.submitted_at = timezone.now()
    entry.save(update_fields=["status", "submitted_at", "updated_at"])

    log_audit_action(
        request=request,
        action="submitted_ghg_waste_entry_for_review",
        instance=entry,
        old_value=old_value,
        new_value=serialize_entry_for_audit(entry),
    )

    return Response({
        "message": "Waste entry submitted for review.",
        "entry": WasteEntrySerializer(entry).data,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def waste_review_queue(request):
    if not can_review_ghg_entries(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can access the review queue."},
            status=status.HTTP_403_FORBIDDEN
        )

    entries = (
        GHGInventoryEntry.objects
        .select_related("emission_factor", "submitted_by", "approved_by", "lga")
        .filter(
            sector=GHGInventoryEntry.Sector.WASTE,
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
        "results": WasteEntrySerializer(entries, many=True).data,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def review_waste_entry(request, entry_id):
    if not can_review_ghg_entries(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can review GHG entries."},
            status=status.HTTP_403_FORBIDDEN
        )

    entry = get_object_or_404(
        GHGInventoryEntry,
        id=entry_id,
        sector=GHGInventoryEntry.Sector.WASTE,
    )

    old_value = serialize_entry_for_audit(entry)

    action = request.data.get("action")
    reviewer_comment = request.data.get("reviewer_comment", "").strip()

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
            action="marked_ghg_waste_entry_under_review",
            instance=entry,
            old_value=old_value,
            new_value=serialize_entry_for_audit(entry),
        )

        return Response({
            "message": "Waste entry marked as under review.",
            "entry": WasteEntrySerializer(entry).data,
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
        recompute_waste_total(entry.year)

        log_audit_action(
            request=request,
            action="requested_revision_for_ghg_waste_entry",
            instance=entry,
            old_value=old_value,
            new_value=serialize_entry_for_audit(entry),
        )

        return Response({
            "message": "Revision requested.",
            "entry": WasteEntrySerializer(entry).data,
        })

    if action == "reject":
        if not can_final_approve(request.user):
            return Response(
                {"detail": "Only Admin users can reject entries."},
                status=status.HTTP_403_FORBIDDEN
            )

        if not reviewer_comment:
            return Response(
                {"detail": "Reviewer comment is required when rejecting an entry."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if entry.status not in [
            GHGInventoryEntry.Status.PENDING_REVIEW,
            GHGInventoryEntry.Status.UNDER_REVIEW,
        ]:
            return Response(
                {"detail": "Only pending or under-review entries can be rejected."},
                status=status.HTTP_400_BAD_REQUEST
            )

        entry.status = GHGInventoryEntry.Status.REJECTED
        entry.reviewer_comment = reviewer_comment
        entry.save(update_fields=["status", "reviewer_comment", "updated_at"])
        recompute_waste_total(entry.year)

        log_audit_action(
            request=request,
            action="rejected_ghg_waste_entry",
            instance=entry,
            old_value=old_value,
            new_value=serialize_entry_for_audit(entry),
        )

        return Response({
            "message": "Waste entry rejected.",
            "entry": WasteEntrySerializer(entry).data,
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
        recompute_waste_total(entry.year)

        log_audit_action(
            request=request,
            action="approved_ghg_waste_entry",
            instance=entry,
            old_value=old_value,
            new_value=serialize_entry_for_audit(entry),
        )

        return Response({
            "message": "Waste entry approved and included in official Waste total.",
            "entry": WasteEntrySerializer(entry).data,
        })

    return Response(
        {"detail": "Invalid review action."},
        status=status.HTTP_400_BAD_REQUEST
    )