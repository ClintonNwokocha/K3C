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

    class GHGSector(models.TextChoices):
        """
        The five IPCC-style inventory sectors KCCC tracks for project-level
        mitigation linkage, plus NOT_ASSESSED. Deliberately a separate
        choice set from Sector above: Sector is the project's own broader
        operating sector (includes Water, Health, Infrastructure, etc.),
        while GHGSector is strictly "which GHG inventory sector does this
        project's mitigation contribution belong to" — most adaptation-only
        projects have no defensible answer and must stay NOT_ASSESSED.
        """

        ENERGY = "energy", "Energy"
        AGRICULTURE = "agriculture", "Agriculture"
        LULUCF = "lulucf", "LULUCF"
        IPPU = "ippu", "IPPU"
        WASTE = "waste", "Waste"
        NOT_ASSESSED = "not_assessed", "Not Assessed"

    class GHGImpactType(models.TextChoices):
        EMISSION_REDUCTION = "emission_reduction", "Emission Reduction"
        AVOIDED_EMISSIONS = "avoided_emissions", "Avoided Emissions"
        CARBON_REMOVAL = "carbon_removal", "Carbon Removal"
        MIXED = "mixed_reduction_removal", "Mixed Reduction + Removal"
        NOT_ASSESSED = "not_assessed", "Not Assessed"

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

    sdg_goals = models.JSONField(
        default=list,
        blank=True,
        help_text="List of UN Sustainable Development Goal numbers (1-17) this project contributes to.",
    )

    # core.NDCConstant is a single statewide constants row (baseline/target
    # percentages), not a per-target/per-sector lookup table — every project
    # would FK to the same one row, conveying no real linkage information.
    # A free-text reference lets staff describe which NDC pledge/target/
    # sector a project contributes to without fabricating a structured NDC
    # target taxonomy that doesn't exist in the data model.
    ndc_linkage_reference = models.CharField(
        max_length=500,
        blank=True,
        help_text="Free-text reference to the NDC target/pledge/sector this project contributes to, if any.",
    )

    # --- Climate & GHG Linkage ---------------------------------------
    # Connects a project back to the climate signal that motivated it and
    # forward to its GHG inventory sector / mitigation mechanism. All seven
    # fields are optional and default to "not assessed" / null: an
    # adaptation-only project is never forced to carry a GHG classification,
    # and expected/verified tCO2e values are never inferred from budget,
    # completion, or any other proxy — only entered when a real estimate or
    # verification exists.
    climate_action_context = models.TextField(
        blank=True,
        help_text=(
            "Free-text summary of the climate signal or intervention "
            "rationale behind this project, e.g. 'Vegetation stress and "
            "drought conditions in Kachia'."
        ),
    )

    primary_ghg_sector = models.CharField(
        max_length=20,
        choices=GHGSector.choices,
        default=GHGSector.NOT_ASSESSED,
        help_text="GHG inventory sector this project's mitigation contribution belongs to, if any.",
    )

    ghg_impact_type = models.CharField(
        max_length=30,
        choices=GHGImpactType.choices,
        default=GHGImpactType.NOT_ASSESSED,
        help_text="Nature of this project's GHG mitigation mechanism, if assessed.",
    )

    expected_annual_ghg_impact_tco2e = models.DecimalField(
        max_digits=18,
        decimal_places=3,
        null=True,
        blank=True,
        help_text="Modelled/estimated annual GHG impact in tCO2e/year. Leave blank if not assessed — never inferred from budget or completion.",
    )

    verified_annual_ghg_impact_tco2e = models.DecimalField(
        max_digits=18,
        decimal_places=3,
        null=True,
        blank=True,
        help_text="Independently verified annual GHG impact in tCO2e/year. Leave blank unless real verification exists.",
    )

    ghg_methodology = models.TextField(
        blank=True,
        help_text="Methodology or evidence basis for the expected/verified GHG impact figures, if any.",
    )

    ghg_monitoring_indicator = models.TextField(
        blank=True,
        help_text="Indicator(s) used to monitor this project's ongoing GHG performance, if any.",
    )

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
            models.Index(fields=["primary_ghg_sector"]),
        ]

    def __str__(self):
        return self.title


class ProjectProgressUpdate(models.Model):
    """
    One periodic monitoring record for a ClimateProject. The most recent
    record per project (by reporting_date, then created_at) is treated as
    that project's current physical-completion/disbursement snapshot —
    computed at read time (see projects/serializers.py), never cached on
    ClimateProject itself, so it can never go stale.
    """

    project = models.ForeignKey(
        ClimateProject,
        on_delete=models.CASCADE,
        related_name="progress_updates",
    )

    reporting_date = models.DateField()

    physical_completion_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        help_text="Physical completion, 0-100.",
    )

    financial_disbursement_naira = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Cumulative amount disbursed as of this reporting date.",
    )

    progress_notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_project_progress_updates",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-reporting_date", "-created_at"]
        indexes = [
            models.Index(fields=["project", "-reporting_date"]),
        ]

    def __str__(self):
        return f"{self.project.title} - {self.reporting_date}"