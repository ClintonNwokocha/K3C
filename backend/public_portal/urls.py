from django.urls import path

from .views import (
    atlas_export,
    public_climate_projects,
    public_climate_risk_profiles,
    public_ghg_inventory,
    public_portal_summary,
    public_report_documents,
)

urlpatterns = [
    path("summary/", public_portal_summary, name="public-portal-summary"),
    path("climate-risk/", public_climate_risk_profiles, name="public-climate-risk"),
    path("ghg-inventory/", public_ghg_inventory, name="public-ghg-inventory"),
    path("projects/", public_climate_projects, name="public-climate-projects"),
    path("reports/", public_report_documents, name="public-report-documents"),
    path("atlas-export/", atlas_export, name="public-atlas-export"),
]
