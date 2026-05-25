from django.contrib import admin

from .models import ReportDocument


@admin.register(ReportDocument)
class ReportDocumentAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "report_type",
        "status",
        "reporting_year",
        "source_module",
        "generated_by",
        "approved_by",
        "is_public",
        "is_active",
        "created_at",
    )
    list_filter = (
        "report_type",
        "status",
        "reporting_year",
        "source_module",
        "is_public",
        "is_active",
    )
    search_fields = (
        "title",
        "description",
        "source_module",
        "notes",
    )