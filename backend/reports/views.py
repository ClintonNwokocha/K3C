from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import UserProfile
from audit.utils import log_audit_action
from .models import ReportDocument
from .serializers import (
    ReportDocumentCreateUpdateSerializer,
    ReportDocumentSerializer,
)


def get_user_profile(user):
    return getattr(user, "profile", None)


def can_manage_reports(user):
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


def serialize_report_for_audit(report, request=None):
    return ReportDocumentSerializer(
        report,
        context={"request": request} if request else {},
    ).data


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def report_documents(request):
    if request.method == "GET":
        report_type = request.query_params.get("report_type")
        status_filter = request.query_params.get("status")
        reporting_year = request.query_params.get("reporting_year")
        source_module = request.query_params.get("source_module")
        is_public = request.query_params.get("is_public")
        search = request.query_params.get("search")

        reports = (
            ReportDocument.objects
            .select_related("generated_by", "approved_by")
            .filter(is_active=True)
            .order_by("-created_at", "title")
        )

        if report_type and report_type != "all":
            reports = reports.filter(report_type=report_type)

        if status_filter and status_filter != "all":
            reports = reports.filter(status=status_filter)

        if reporting_year:
            reports = reports.filter(reporting_year=reporting_year)

        if source_module and source_module != "all":
            reports = reports.filter(source_module=source_module)

        if is_public in ["true", "false"]:
            reports = reports.filter(is_public=is_public == "true")

        if search:
            reports = reports.filter(title__icontains=search)

        serializer = ReportDocumentSerializer(
            reports,
            many=True,
            context={"request": request},
        )

        by_type = {
            key: 0 for key, _label in ReportDocument.ReportType.choices
        }
        for row in reports.values("report_type").annotate(count=Count("id")):
            by_type[row["report_type"]] = row["count"]

        by_status = {
            key: 0 for key, _label in ReportDocument.Status.choices
        }
        for row in reports.values("status").annotate(count=Count("id")):
            by_status[row["status"]] = row["count"]

        return Response({
            "status": "ok",
            "message": "Reports loaded.",
            "summary": {
                "total_reports": reports.count(),
                "public_reports": reports.filter(is_public=True).count(),
                "approved_reports": reports.filter(status="approved").count(),
                "published_reports": reports.filter(status="published").count(),
                "by_type": by_type,
                "by_status": by_status,
            },
            "results": serializer.data,
        })

    if not can_manage_reports(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can create reports."},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = ReportDocumentCreateUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    report = serializer.save(generated_by=request.user)

    if report.status in [
        ReportDocument.Status.APPROVED,
        ReportDocument.Status.PUBLISHED,
    ] and not report.approved_at:
        report.approved_by = request.user
        report.approved_at = timezone.now()
        report.save()

    log_audit_action(
        request=request,
        action="created_report_document",
        instance=report,
        old_value=None,
        new_value=serialize_report_for_audit(report, request),
    )

    return Response(
        {
            "message": "Report created successfully.",
            "report": ReportDocumentSerializer(
                report,
                context={"request": request},
            ).data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def report_document_detail(request, report_id):
    report = get_object_or_404(
        ReportDocument.objects.select_related("generated_by", "approved_by"),
        id=report_id,
    )

    if request.method == "GET":
        return Response({
            "status": "ok",
            "report": ReportDocumentSerializer(
                report,
                context={"request": request},
            ).data,
        })

    if not can_manage_reports(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can update reports."},
            status=status.HTTP_403_FORBIDDEN,
        )

    old_value = serialize_report_for_audit(report, request)

    serializer = ReportDocumentCreateUpdateSerializer(
        report,
        data=request.data,
        partial=True,
    )
    serializer.is_valid(raise_exception=True)
    updated_report = serializer.save()

    if updated_report.status in [
        ReportDocument.Status.APPROVED,
        ReportDocument.Status.PUBLISHED,
    ] and not updated_report.approved_at:
        updated_report.approved_by = request.user
        updated_report.approved_at = timezone.now()
        updated_report.save()

    log_audit_action(
        request=request,
        action="updated_report_document",
        instance=updated_report,
        old_value=old_value,
        new_value=serialize_report_for_audit(updated_report, request),
    )

    return Response({
        "message": "Report updated successfully.",
        "report": ReportDocumentSerializer(
            updated_report,
            context={"request": request},
        ).data,
    })