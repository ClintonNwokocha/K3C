from decimal import Decimal

from django.db.models import Avg, Count, Max
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import UserProfile
from audit.utils import log_audit_action
from .models import ClimateRiskParameterRecord, ClimateRiskProfile
from .serializers import (
    ClimateRiskParameterRecordCreateUpdateSerializer,
    ClimateRiskParameterRecordSerializer,
    ClimateRiskProfileSerializer,
    ClimateRiskProfileUpdateSerializer,
)


def get_user_profile(user):
    return getattr(user, "profile", None)


def can_manage_climate_risk(user):
    if user.is_superuser:
        return True

    profile = get_user_profile(user)

    return bool(
        profile
        and profile.role in [
            UserProfile.Role.ADMIN,
            UserProfile.Role.ANALYST,
        ]
    )


def serialize_profile_for_audit(profile):
    return {
        "id": profile.id,
        "lga_id": profile.lga_id,
        "lga_name": profile.lga.lga_name if profile.lga else None,
        "year": profile.year,
        "flood_risk_score": profile.flood_risk_score,
        "drought_risk_score": profile.drought_risk_score,
        "heat_risk_score": profile.heat_risk_score,
        "erosion_risk_score": profile.erosion_risk_score,
        "vulnerability_score": profile.vulnerability_score,
        "adaptive_capacity_score": profile.adaptive_capacity_score,
        "overall_risk_score": profile.overall_risk_score,
        "risk_level": profile.risk_level,
        "notes": profile.notes,
        "data_source": profile.data_source,
        "is_active": profile.is_active,
    }


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


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_climate_risk_profile(request, profile_id):
    if not can_manage_climate_risk(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can update climate risk profiles."},
            status=status.HTTP_403_FORBIDDEN,
        )

    profile = get_object_or_404(
        ClimateRiskProfile.objects.select_related("lga"),
        id=profile_id,
    )

    old_value = serialize_profile_for_audit(profile)

    serializer = ClimateRiskProfileUpdateSerializer(
        profile,
        data=request.data,
        partial=True,
    )
    serializer.is_valid(raise_exception=True)
    updated_profile = serializer.save()

    log_audit_action(
        request=request,
        action="updated_climate_risk_profile",
        instance=updated_profile,
        old_value=old_value,
        new_value=serialize_profile_for_audit(updated_profile),
    )

    return Response({
        "message": "Climate risk profile updated successfully.",
        "profile": ClimateRiskProfileSerializer(updated_profile).data,
    })

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def climate_risk_parameter_records(request):
    if request.method == "GET":
        year = request.query_params.get("year")
        lga = request.query_params.get("lga")
        category = request.query_params.get("category")

        records = (
            ClimateRiskParameterRecord.objects
            .select_related("lga")
            .filter(is_active=True)
            .order_by("lga__lga_name", "category", "parameter_label")
        )

        if year:
            records = records.filter(year=year)

        if lga:
            records = records.filter(lga_id=lga)

        if category and category != "all":
            records = records.filter(category=category)

        return Response({
            "status": "ok",
            "message": "Climate risk parameter records loaded.",
            "count": records.count(),
            "results": ClimateRiskParameterRecordSerializer(records, many=True).data,
        })

    if not can_manage_climate_risk(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can create climate risk parameter records."},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = ClimateRiskParameterRecordCreateUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    record = serializer.save()

    log_audit_action(
        request=request,
        action="created_climate_risk_parameter_record",
        instance=record,
        old_value=None,
        new_value=ClimateRiskParameterRecordSerializer(record).data,
    )

    return Response(
        {
            "message": "Climate risk parameter record created successfully.",
            "record": ClimateRiskParameterRecordSerializer(record).data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_climate_risk_parameter_record(request, record_id):
    if not can_manage_climate_risk(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can update climate risk parameter records."},
            status=status.HTTP_403_FORBIDDEN,
        )

    record = get_object_or_404(
        ClimateRiskParameterRecord.objects.select_related("lga"),
        id=record_id,
    )

    old_value = ClimateRiskParameterRecordSerializer(record).data

    serializer = ClimateRiskParameterRecordCreateUpdateSerializer(
        record,
        data=request.data,
        partial=True,
    )
    serializer.is_valid(raise_exception=True)
    updated_record = serializer.save()

    log_audit_action(
        request=request,
        action="updated_climate_risk_parameter_record",
        instance=updated_record,
        old_value=old_value,
        new_value=ClimateRiskParameterRecordSerializer(updated_record).data,
    )

    return Response({
        "message": "Climate risk parameter record updated successfully.",
        "record": ClimateRiskParameterRecordSerializer(updated_record).data,
    })