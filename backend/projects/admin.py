from django.contrib import admin

from .models import ClimateProject, ProjectProgressUpdate


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
        "primary_ghg_sector",
        "ghg_impact_type",
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
        "primary_ghg_sector",
        "ghg_impact_type",
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
                    "external_link",
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
                    "sdg_goals",
                    "ndc_linkage_reference",
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
            "Climate & GHG Linkage",
            {
                "fields": (
                    "climate_action_context",
                    "primary_ghg_sector",
                    "ghg_impact_type",
                    "expected_annual_ghg_impact_tco2e",
                    "verified_annual_ghg_impact_tco2e",
                    "ghg_methodology",
                    "ghg_monitoring_indicator",
                ),
                "description": (
                    "Links this project to the climate signal that motivated it and "
                    "to a GHG inventory sector / mitigation mechanism, if one is "
                    "defensible. Leave as 'Not Assessed' / blank rather than "
                    "guessing — these fields never drive the statewide GHG "
                    "inventory and must never be inferred from budget or "
                    "completion percentage."
                ),
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


@admin.register(ProjectProgressUpdate)
class ProjectProgressUpdateAdmin(admin.ModelAdmin):
    list_display = (
        "project",
        "reporting_date",
        "physical_completion_pct",
        "financial_disbursement_naira",
        "created_by",
    )

    list_filter = ("reporting_date",)

    search_fields = ("project__title", "progress_notes")