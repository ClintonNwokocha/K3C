from django.urls import path

from .views import (
    public_climate_projects,
    public_climate_risk_profiles,
    public_portal_summary,
    public_report_documents,
)

urlpatterns = [
    path("summary/", public_portal_summary, name="public-portal-summary"),
    path("climate-risk/", public_climate_risk_profiles, name="public-climate-risk"),
    path("projects/", public_climate_projects, name="public-climate-projects"),
    path("reports/", public_report_documents, name="public-report-documents"),
]