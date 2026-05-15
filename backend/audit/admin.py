from django.contrib import admin
from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("user", "action", "table_name", "record_id", "timestamp")
    list_filter = ("action", "table_name", "timestamp")
    search_fields = ("table_name", "record_id")
    readonly_fields = ("user", "action", "table_name", "record_id", "old_value", "new_value", "ip_address", "timestamp")