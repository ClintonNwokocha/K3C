from django.conf import settings
from django.db import models


class ReportDocument(models.Model):
    class ReportType(models.TextChoices):
        CLIMATE_RISK = "climate_risk", "Climate Risk Report"
        GHG_INVENTORY = "ghg_inventory", "GHG Inventory Report"
        PROJECT_PORTFOLIO = "project_portfolio", "Project Portfolio Report"
        NDC_PROGRESS = "ndc_progress", "NDC Progress Report"
        EXECUTIVE_BRIEF = "executive_brief", "Executive Brief"
        DATA_EXPORT = "data_export", "Data Export"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        REVIEW = "review", "Under Review"
        APPROVED = "approved", "Approved"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    title = models.CharField(max_length=255)

    report_type = models.CharField(
        max_length=50,
        choices=ReportType.choices,
        default=ReportType.OTHER,
    )

    status = models.CharField(
        max_length=50,
        choices=Status.choices,
        default=Status.DRAFT,
    )

    reporting_year = models.PositiveIntegerField(null=True, blank=True)

    description = models.TextField(blank=True)

    file = models.FileField(
        upload_to="reports/",
        null=True,
        blank=True,
    )

    source_module = models.CharField(
        max_length=100,
        blank=True,
        help_text="Example: climate_risk, ghg_inventory, project_portfolio.",
    )

    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_reports",
    )

    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_reports",
    )

    approved_at = models.DateTimeField(null=True, blank=True)

    is_public = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "title"]
        indexes = [
            models.Index(fields=["report_type"]),
            models.Index(fields=["status"]),
            models.Index(fields=["reporting_year"]),
            models.Index(fields=["source_module"]),
            models.Index(fields=["is_public"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return self.title