from decimal import Decimal
from datetime import date, datetime

from .models import AuditLog


def make_json_safe(value):
    if isinstance(value, dict):
        return {key: make_json_safe(item) for key, item in value.items()}

    if isinstance(value, list):
        return [make_json_safe(item) for item in value]

    if isinstance(value, Decimal):
        return str(value)

    if isinstance(value, (date, datetime)):
        return value.isoformat()

    return value


def get_client_ip(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")

    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    return request.META.get("REMOTE_ADDR")


def log_audit_action(request, action, instance, old_value=None, new_value=None):
    user = request.user if request.user and request.user.is_authenticated else None

    AuditLog.objects.create(
        user=user,
        action=action,
        table_name=instance._meta.db_table,
        record_id=str(instance.pk),
        old_value=make_json_safe(old_value),
        new_value=make_json_safe(new_value),
        ip_address=get_client_ip(request),
    )