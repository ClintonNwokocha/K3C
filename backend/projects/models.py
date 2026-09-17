from decimal import Decimal

from django.conf import settings
from django.db import models

from core.models import LGARegistry


class ClimateProject(models.Model):
    class ProjectType(models.TextChoices):
        ADAPTATION = "adaptation", "Adaptation"
        MITIGATION = "mitigation", "Mitigation"
        CROSS_CUTTING = "cross_cutting", "Cross-cutting"

    class Sector(models.TextChoices):
        ENERGY = "energy", "Energy"
        AGRICULTURE = "agriculture", "Agriculture"
        WASTE = "waste", "Waste"
        IPPU = "ippu", "IPPU"
        LULUCF = "lulucf", "LULUCF"
        WATER = "water", "Water"
        HEALTH = "health", "Health"
        INFRASTRUCTURE = "infrastructure", "Infrastructure"
        DISASTER_RISK = "disaster_risk", "Disaster Risk Management"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        PROPOSED = "proposed", "Proposed"
        PLANNED = "planned", "Planned"
        ONGOING = "ongoing", "Ongoing"
        COMPLETED = "completed", "Completed"
        SUSPENDED = "suspended", "Suspended"
        CANCELLED = "cancelled", "Cancelled"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        VERY_HIGH = "very_high", "Very High"

    title = models.CharField(max_length=255)
    project_code = models.CharField(max_length=100, blank=True)

    project_type = models.CharField(
        max_length=50,
        choices=ProjectType.choices,
        default=ProjectType.ADAPTATION,
    )

    sector = models.CharField(
        max_length=50,
        choices=Sector.choices,
        default=Sector.OTHER,
    )

    status = models.CharField(
        max_length=50,
        choices=Status.choices,
        default=Status.PROPOSED,
    )

    priority = models.CharField(
        max_length=50,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )

    lga = models.ForeignKey(
        LGARegistry,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="climate_projects",
    )

    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Project latitude in WGS84 decimal degrees.",
    )

    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Project longitude in WGS84 decimal degrees.",
    )

    project_image = models.ImageField(
        upload_to="project_images/",
        null=True,
        blank=True,
        help_text="Public-facing project image for the project showcase.",
    )

    public_summary = models.CharField(
        max_length=300,
        blank=True,
        help_text="Short public summary shown on project showcase cards.",
    )

    public_description = models.TextField(
        blank=True,
        help_text="Longer public-facing description used for read-more details.",
    )

    description = models.TextField(blank=True)
    implementing_agency = models.CharField(max_length=255, blank=True)
    funding_source = models.CharField(max_length=255, blank=True)

    estimated_budget_naira = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    expected_ghg_reduction_tco2e = models.DecimalField(
        max_digits=18,
        decimal_places=3,
        default=Decimal("0.000"),
        help_text="Expected mitigation outcome in tonnes CO2e.",
    )

    expected_beneficiaries = models.PositiveIntegerField(default=0)

    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    external_link = models.URLField(
        max_length=500,
        null=True,
        blank=True,
        help_text="Optional external project resource link (official page, donor page, report).",
    )

    climate_risk_relevance = models.TextField(
        blank=True,
        help_text="Explain how this project responds to flood, drought, heat, erosion, vulnerability or adaptive capacity needs.",
    )

    location_notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_climate_projects",
    )

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "title"]
        indexes = [
            models.Index(fields=["project_type"]),
            models.Index(fields=["sector"]),
            models.Index(fields=["status"]),
            models.Index(fields=["priority"]),
            models.Index(fields=["lga"]),
            models.Index(fields=["latitude", "longitude"]),
            models.Index(fields=["funding_source"]),
        ]

    def __str__(self):
        return self.title