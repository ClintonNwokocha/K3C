from django.urls import path

from .views import public_portal_summary, public_report_documents

urlpatterns = [
    path("summary/", public_portal_summary, name="public-portal-summary"),
    path("reports/", public_report_documents, name="public-report-documents"),
]