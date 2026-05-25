from django.shortcuts import render

# Create your views here.
from datetime import date, datetime
from decimal import Decimal

from django.apps import apps
from django.db.models import Q
from django.forms.models import model_to_dict

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import UserProfile


def get_user_profile(user):
    return getattr(user, "profile", None)


def can_view_audit_logs(user):
    if user.is_superuser:
        return True

    profile = get_user_profile(user)

    return bool(profile and profile.role == UserProfile.Role.ADMIN)


def get_audit_model():
    try:
        return apps.get_model("audit", "AuditLog")
    except LookupError:
        return None


def get_model_field_names(model):
    return [field.name for field in model._meta.fields]


def get_first_existing_field(field_names, candidates):
    for candidate in candidates:
        if candidate in field_names:
            return candidate

    return None


def serialize_value(value):
    if isinstance(value, datetime):
        return value.isoformat()

    if isinstance(value, date):
        return value.isoformat()

    if isinstance(value, Decimal):
        return float(value)

    return value


def serialize_audit_log(log):
    data = {}

    for field in log._meta.fields:
        field_name = field.name
        value = getattr(log, field_name, None)

        if field.remote_field:
            data[field_name] = getattr(value, "pk", None) if value else None
            data[f"{field_name}_display"] = str(value) if value else ""
        else:
            data[field_name] = serialize_value(value)

    return data


def apply_filter_if_field_exists(queryset, field_names, field_name, value):
    if value and field_name in field_names:
        return queryset.filter(**{field_name: value})

    return queryset


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def audit_logs(request):
    if not can_view_audit_logs(request.user):
        return Response(
            {"detail": "Only Admin users can view audit logs."},
            status=403,
        )

    AuditLog = get_audit_model()

    if AuditLog is None:
        return Response(
            {
                "status": "error",
                "message": "AuditLog model was not found in the audit app.",
                "results": [],
            },
            status=404,
        )

    field_names = get_model_field_names(AuditLog)

    logs = AuditLog.objects.all()

    action = request.query_params.get("action")
    app_label = request.query_params.get("app_label")
    model_name = request.query_params.get("model_name")
    object_id = request.query_params.get("object_id")
    user_id = request.query_params.get("user")
    search = request.query_params.get("search")
    limit = request.query_params.get("limit") or "100"

    logs = apply_filter_if_field_exists(logs, field_names, "action", action)
    logs = apply_filter_if_field_exists(logs, field_names, "app_label", app_label)
    logs = apply_filter_if_field_exists(logs, field_names, "model_name", model_name)
    logs = apply_filter_if_field_exists(logs, field_names, "object_id", object_id)

    if user_id:
        user_field = get_first_existing_field(
            field_names,
            ["user", "actor", "created_by"],
        )

        if user_field:
            logs = logs.filter(**{f"{user_field}_id": user_id})

    if search:
        search_query = Q()

        for field_name in [
            "action",
            "app_label",
            "model_name",
            "object_repr",
            "object_id",
            "ip_address",
            "user_agent",
        ]:
            if field_name in field_names:
                search_query |= Q(**{f"{field_name}__icontains": search})

        if search_query:
            logs = logs.filter(search_query)

    date_field = get_first_existing_field(
        field_names,
        ["created_at", "timestamp", "created_on", "date_created"],
    )

    if date_field:
        logs = logs.order_by(f"-{date_field}")
    else:
        logs = logs.order_by("-id")

    try:
        limit = int(limit)
    except ValueError:
        limit = 100

    limit = min(max(limit, 1), 500)

    total_count = logs.count()
    results = [serialize_audit_log(log) for log in logs[:limit]]

    return Response(
        {
            "status": "ok",
            "message": "Audit logs loaded.",
            "summary": {
                "total_logs": total_count,
                "returned_logs": len(results),
                "available_fields": field_names,
                "date_field": date_field,
            },
            "results": results,
        }
    )