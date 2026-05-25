from django.urls import path

from .views import report_document_detail, report_documents

urlpatterns = [
    path("documents/", report_documents, name="report-documents"),
    path(
        "documents/<int:report_id>/",
        report_document_detail,
        name="report-document-detail",
    ),
]