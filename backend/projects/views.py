from decimal import Decimal

from django.db.models import Count, Sum
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import UserProfile
from audit.utils import log_audit_action
from .models import ClimateProject
from .serializers import (
    ClimateProjectCreateUpdateSerializer,
    ClimateProjectSerializer,
)


def get_user_profile(user):
    return getattr(user, "profile", None)


def can_manage_projects(user):
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


def serialize_project_for_audit(project):
    return ClimateProjectSerializer(project).data


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def climate_projects(request):
    if request.method == "GET":
        project_type = request.query_params.get("project_type")
        sector = request.query_params.get("sector")
        status_filter = request.query_params.get("status")
        priority = request.query_params.get("priority")
        lga = request.query_params.get("lga")
        search = request.query_params.get("search")

        projects = (
            ClimateProject.objects
            .select_related("lga", "created_by")
            .filter(is_active=True)
            .order_by("-created_at", "title")
        )

        if project_type and project_type != "all":
            projects = projects.filter(project_type=project_type)

        if sector and sector != "all":
            projects = projects.filter(sector=sector)

        if status_filter and status_filter != "all":
            projects = projects.filter(status=status_filter)

        if priority and priority != "all":
            projects = projects.filter(priority=priority)

        if lga:
            projects = projects.filter(lga_id=lga)

        if search:
            projects = projects.filter(title__icontains=search)

        serializer = ClimateProjectSerializer(projects, many=True)

        total_projects = projects.count()
        total_budget = (
            projects.aggregate(value=Sum("estimated_budget_naira")).get("value")
            or Decimal("0.00")
        )
        total_ghg_reduction = (
            projects.aggregate(value=Sum("expected_ghg_reduction_tco2e")).get("value")
            or Decimal("0.000")
        )
        total_beneficiaries = (
            projects.aggregate(value=Sum("expected_beneficiaries")).get("value")
            or 0
        )

        by_status_raw = (
            projects.values("status")
            .annotate(count=Count("id"))
            .order_by("status")
        )

        by_status = {
            "proposed": 0,
            "planned": 0,
            "ongoing": 0,
            "completed": 0,
            "suspended": 0,
            "cancelled": 0,
        }

        for row in by_status_raw:
            by_status[row["status"]] = row["count"]

        by_type_raw = (
            projects.values("project_type")
            .annotate(count=Count("id"))
            .order_by("project_type")
        )

        by_type = {
            "adaptation": 0,
            "mitigation": 0,
            "cross_cutting": 0,
        }

        for row in by_type_raw:
            by_type[row["project_type"]] = row["count"]

        return Response({
            "status": "ok",
            "message": "Climate projects loaded.",
            "summary": {
                "total_projects": total_projects,
                "total_budget_naira": float(total_budget),
                "total_expected_ghg_reduction_tco2e": float(total_ghg_reduction),
                "total_expected_beneficiaries": total_beneficiaries,
                "by_status": by_status,
                "by_type": by_type,
            },
            "results": serializer.data,
        })

    if not can_manage_projects(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can create climate projects."},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = ClimateProjectCreateUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    project = serializer.save(created_by=request.user)

    log_audit_action(
        request=request,
        action="created_climate_project",
        instance=project,
        old_value=None,
        new_value=serialize_project_for_audit(project),
    )

    return Response(
        {
            "message": "Climate project created successfully.",
            "project": ClimateProjectSerializer(project).data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def climate_project_detail(request, project_id):
    project = get_object_or_404(
        ClimateProject.objects.select_related("lga", "created_by"),
        id=project_id,
    )

    if request.method == "GET":
        return Response({
            "status": "ok",
            "project": ClimateProjectSerializer(project).data,
        })

    if not can_manage_projects(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can update climate projects."},
            status=status.HTTP_403_FORBIDDEN,
        )

    old_value = serialize_project_for_audit(project)

    serializer = ClimateProjectCreateUpdateSerializer(
        project,
        data=request.data,
        partial=True,
    )
    serializer.is_valid(raise_exception=True)
    updated_project = serializer.save()

    log_audit_action(
        request=request,
        action="updated_climate_project",
        instance=updated_project,
        old_value=old_value,
        new_value=serialize_project_for_audit(updated_project),
    )

    return Response({
        "message": "Climate project updated successfully.",
        "project": ClimateProjectSerializer(updated_project).data,
    })