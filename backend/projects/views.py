import csv
import io
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, Sum
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import UserProfile
from audit.utils import log_audit_action
from core.models import LGARegistry
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


def decimal_from_value(value):
    if value is None:
        return Decimal("0")

    text = str(value).strip()

    if text == "":
        return Decimal("0")

    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def int_from_value(value):
    if value is None:
        return 0

    text = str(value).strip()

    if text == "":
        return 0

    try:
        return int(float(text))
    except ValueError:
        return None


def normalize_lga_name(value):
    return (
        str(value or "")
        .strip()
        .lower()
        .replace("’", "'")
        .replace("`", "'")
        .replace("ʻ", "'")
        .replace("-", " ")
        .replace("_", " ")
    )


def get_row_value(row, possible_keys):
    for key in possible_keys:
        value = row.get(key)

        if value is not None and str(value).strip() != "":
            return str(value).strip()

    return ""


def get_lga_from_project_row(row, row_number, errors):
    lga_id = get_row_value(row, ["lga_id", "lga", "LGA_ID"])

    if lga_id:
        try:
            return LGARegistry.objects.get(lga_id=int(lga_id))
        except (ValueError, LGARegistry.DoesNotExist):
            errors.append({
                "row": row_number,
                "field": "lga_id",
                "error": f"Invalid lga_id: {lga_id}.",
            })
            return None

    lga_name = get_row_value(
        row,
        [
            "lga_name",
            "lganame",
            "LGA_NAME",
            "LGANAME",
            "LGAName",
            "name",
            "NAME",
        ],
    )

    if lga_name:
        normalized_input = normalize_lga_name(lga_name)

        for lga in LGARegistry.objects.all():
            if normalize_lga_name(lga.lga_name) == normalized_input:
                return lga

        errors.append({
            "row": row_number,
            "field": "lga_name",
            "error": f"Could not match LGA name: {lga_name}.",
        })
        return None

    return None


def read_csv_rows(uploaded_file):
    raw_text = uploaded_file.read().decode("utf-8-sig")
    stream = io.StringIO(raw_text)
    reader = csv.DictReader(stream)
    return list(reader), reader.fieldnames or []


def normalize_choice(value, default_value):
    text = str(value or "").strip().lower().replace(" ", "_").replace("-", "_")

    if not text:
        return default_value

    return text


def import_projects_csv(uploaded_file, request):
    rows, fieldnames = read_csv_rows(uploaded_file)

    required_columns = {"title"}
    missing_columns = required_columns - set(fieldnames)

    errors = []
    imported_count = 0
    updated_count = 0

    if missing_columns:
        errors.append({
            "row": 0,
            "field": "columns",
            "error": f"Missing required columns: {', '.join(sorted(missing_columns))}.",
        })
        return {
            "row_count": len(rows),
            "imported_count": 0,
            "updated_count": 0,
            "failed_count": len(rows),
            "errors": errors,
        }

    valid_project_types = {choice[0] for choice in ClimateProject.ProjectType.choices}
    valid_sectors = {choice[0] for choice in ClimateProject.Sector.choices}
    valid_statuses = {choice[0] for choice in ClimateProject.Status.choices}
    valid_priorities = {choice[0] for choice in ClimateProject.Priority.choices}

    for index, row in enumerate(rows, start=2):
        title = str(row.get("title") or "").strip()

        if not title:
            errors.append({
                "row": index,
                "field": "title",
                "error": "Project title is required.",
            })
            continue

        project_code = str(row.get("project_code") or "").strip()

        project_type = normalize_choice(
            row.get("project_type"),
            ClimateProject.ProjectType.ADAPTATION,
        )

        sector = normalize_choice(
            row.get("sector"),
            ClimateProject.Sector.OTHER,
        )

        status_value = normalize_choice(
            row.get("status"),
            ClimateProject.Status.PROPOSED,
        )

        priority = normalize_choice(
            row.get("priority"),
            ClimateProject.Priority.MEDIUM,
        )

        if project_type not in valid_project_types:
            errors.append({
                "row": index,
                "field": "project_type",
                "error": f"Invalid project_type: {project_type}.",
            })
            continue

        if sector not in valid_sectors:
            errors.append({
                "row": index,
                "field": "sector",
                "error": f"Invalid sector: {sector}.",
            })
            continue

        if status_value not in valid_statuses:
            errors.append({
                "row": index,
                "field": "status",
                "error": f"Invalid status: {status_value}.",
            })
            continue

        if priority not in valid_priorities:
            errors.append({
                "row": index,
                "field": "priority",
                "error": f"Invalid priority: {priority}.",
            })
            continue

        estimated_budget_naira = decimal_from_value(row.get("estimated_budget_naira"))
        expected_ghg_reduction_tco2e = decimal_from_value(
            row.get("expected_ghg_reduction_tco2e")
        )
        expected_beneficiaries = int_from_value(row.get("expected_beneficiaries"))

        if estimated_budget_naira is None or estimated_budget_naira < 0:
            errors.append({
                "row": index,
                "field": "estimated_budget_naira",
                "error": "Budget must be a non-negative number.",
            })
            continue

        if (
            expected_ghg_reduction_tco2e is None
            or expected_ghg_reduction_tco2e < 0
        ):
            errors.append({
                "row": index,
                "field": "expected_ghg_reduction_tco2e",
                "error": "Expected GHG reduction must be a non-negative number.",
            })
            continue

        if expected_beneficiaries is None or expected_beneficiaries < 0:
            errors.append({
                "row": index,
                "field": "expected_beneficiaries",
                "error": "Expected beneficiaries must be a non-negative integer.",
            })
            continue

        lga = get_lga_from_project_row(row, index, errors)

        start_date = str(row.get("start_date") or "").strip() or None
        end_date = str(row.get("end_date") or "").strip() or None

        defaults = {
            "title": title,
            "project_type": project_type,
            "sector": sector,
            "status": status_value,
            "priority": priority,
            "lga": lga,
            "description": row.get("description", ""),
            "implementing_agency": row.get("implementing_agency", ""),
            "funding_source": row.get("funding_source", ""),
            "estimated_budget_naira": estimated_budget_naira,
            "expected_ghg_reduction_tco2e": expected_ghg_reduction_tco2e,
            "expected_beneficiaries": expected_beneficiaries,
            "start_date": start_date,
            "end_date": end_date,
            "climate_risk_relevance": row.get("climate_risk_relevance", ""),
            "location_notes": row.get("location_notes", ""),
            "created_by": request.user,
            "is_active": True,
        }

        if project_code:
            project, created = ClimateProject.objects.update_or_create(
                project_code=project_code,
                defaults=defaults,
            )
        else:
            project = ClimateProject.objects.create(
                project_code="",
                **defaults,
            )
            created = True

        log_audit_action(
            request=request,
            action=(
                "created_climate_project_import"
                if created
                else "updated_climate_project_import"
            ),
            instance=project,
            old_value=None,
            new_value=serialize_project_for_audit(project),
        )

        if created:
            imported_count += 1
        else:
            updated_count += 1

    failed_count = len(rows) - imported_count - updated_count

    return {
        "row_count": len(rows),
        "imported_count": imported_count,
        "updated_count": updated_count,
        "failed_count": failed_count,
        "errors": errors,
    }


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


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def import_climate_projects(request):
    if not can_manage_projects(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can import climate projects."},
            status=status.HTTP_403_FORBIDDEN,
        )

    uploaded_file = request.FILES.get("file")

    if not uploaded_file:
        return Response(
            {"detail": "CSV file is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not uploaded_file.name.lower().endswith(".csv"):
        return Response(
            {"detail": "Only CSV files are supported."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with transaction.atomic():
            result = import_projects_csv(uploaded_file, request)
    except Exception as exc:
        return Response(
            {
                "detail": "Project import failed.",
                "error": str(exc),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response({
        "message": "Climate project CSV import processed.",
        "result": result,
    })