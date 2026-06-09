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
        "funding_source",
        "expected_ghg_reduction_tco2e",
        "expected_beneficiaries",
        "latitude",
        "longitude",
        "is_active",
    )

    list_filter = (
        "project_type",
        "sector",
        "status",
        "priority",
        "funding_source",
        "is_active",
    )

    search_fields = (
        "title",
        "project_code",
        "description",
        "implementing_agency",
        "funding_source",
        "public_summary",
        "public_description",
        "lga__lga_name",
    )

    fieldsets = (
        (
            "Basic Project Information",
            {
                "fields": (
                    "title",
                    "project_code",
                    "project_type",
                    "sector",
                    "status",
                    "priority",
                    "lga",
                    "is_active",
                )
            },
        ),
        (
            "Public Showcase Information",
            {
                "fields": (
                    "latitude",
                    "longitude",
                    "project_image",
                    "public_summary",
                    "public_description",
                ),
                "description": (
                    "These fields control how the project appears on the public "
                    "project portfolio page, map markers, showcase cards, and "
                    "read-more panel."
                ),
            },
        ),
        (
            "Project Description and Relevance",
            {
                "fields": (
                    "description",
                    "climate_risk_relevance",
                    "location_notes",
                )
            },
        ),
        (
            "Implementation and Funding",
            {
                "fields": (
                    "implementing_agency",
                    "funding_source",
                    "estimated_budget_naira",
                    "expected_ghg_reduction_tco2e",
                    "expected_beneficiaries",
                    "start_date",
                    "end_date",
                )
            },
        ),
        (
            "System Information",
            {
                "fields": (
                    "created_by",
                )
            },
        ),
    )