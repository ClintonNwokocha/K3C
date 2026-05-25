from django.contrib import admin

from .models import ClimateProject


@admin.register(ClimateProject)
class ClimateProjectAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "project_type",
        "sector",
        "status",
        "priority",
        "lga",
        "estimated_budget_naira",
        "expected_ghg_reduction_tco2e",
        "expected_beneficiaries",
        "is_active",
    )
    list_filter = (
        "project_type",
        "sector",
        "status",
        "priority",
        "is_active",
    )
    search_fields = (
        "title",
        "project_code",
        "description",
        "implementing_agency",
        "funding_source",
        "lga__lga_name",
    )