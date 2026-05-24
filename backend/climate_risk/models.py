from decimal import Decimal

from django.conf import settings
from django.db import models

from core.models import LGARegistry


class ClimateRiskProfile(models.Model):
    class RiskLevel(models.TextChoices):
        LOW = "low", "Low"
        MODERATE = "moderate", "Moderate"
        HIGH = "high", "High"
        VERY_HIGH = "very_high", "Very High"

    lga = models.ForeignKey(
        LGARegistry,
        on_delete=models.CASCADE,
        related_name="climate_risk_profiles",
    )

    year = models.PositiveIntegerField(default=2025)

    flood_risk_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    drought_risk_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    heat_risk_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    erosion_risk_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    exposure_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    vulnerability_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    adaptive_capacity_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    overall_risk_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    risk_level = models.CharField(
        max_length=50,
        choices=RiskLevel.choices,
        default=RiskLevel.MODERATE,
    )

    dominant_hazard = models.CharField(max_length=50, blank=True)

    notes = models.TextField(blank=True)
    data_source = models.CharField(max_length=255, default="Development seed data")
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def calculate_overall_risk(self):
        """
        Development composite formula.

        Later, Stage 23 will move these weights into a configurable scoring engine.
        """
        flood = self.flood_risk_score or Decimal("0")
        drought = self.drought_risk_score or Decimal("0")
        heat = self.heat_risk_score or Decimal("0")
        erosion = self.erosion_risk_score or Decimal("0")
        exposure = self.exposure_score or Decimal("0")
        vulnerability = self.vulnerability_score or Decimal("0")
        adaptive_gap = Decimal("100") - (self.adaptive_capacity_score or Decimal("0"))

        score = (
            flood * Decimal("0.20")
            + drought * Decimal("0.15")
            + heat * Decimal("0.15")
            + erosion * Decimal("0.10")
            + exposure * Decimal("0.20")
            + vulnerability * Decimal("0.15")
            + adaptive_gap * Decimal("0.05")
        )

        return round(score, 2)

    def classify_risk_level(self):
        score = self.overall_risk_score

        if score >= 75:
            return self.RiskLevel.VERY_HIGH

        if score >= 60:
            return self.RiskLevel.HIGH

        if score >= 40:
            return self.RiskLevel.MODERATE

        return self.RiskLevel.LOW

    def calculate_dominant_hazard(self):
        hazard_scores = {
            "flood": self.flood_risk_score or Decimal("0"),
            "drought": self.drought_risk_score or Decimal("0"),
            "heat": self.heat_risk_score or Decimal("0"),
            "erosion": self.erosion_risk_score or Decimal("0"),
        }

        dominant_key = max(hazard_scores, key=hazard_scores.get)

        if hazard_scores[dominant_key] <= 0:
            return ""

        return dominant_key

    def save(self, *args, **kwargs):
        self.overall_risk_score = self.calculate_overall_risk()
        self.risk_level = self.classify_risk_level()
        self.dominant_hazard = self.calculate_dominant_hazard()
        super().save(*args, **kwargs)

    class Meta:
        unique_together = ("lga", "year")
        ordering = ["-overall_risk_score", "lga__lga_name"]
        indexes = [
            models.Index(fields=["year", "risk_level"]),
            models.Index(fields=["overall_risk_score"]),
        ]

    def __str__(self):
        return f"{self.lga.lga_name} - {self.year} - {self.get_risk_level_display()}"


class ClimateRiskParameterRecord(models.Model):
    class Category(models.TextChoices):
        FLOOD = "flood", "Flood"
        DROUGHT = "drought", "Drought"
        HEAT = "heat", "Heat"
        EROSION = "erosion", "Erosion"
        EXPOSURE = "exposure", "Exposure"
        VULNERABILITY = "vulnerability", "Vulnerability"
        ADAPTIVE_CAPACITY = "adaptive_capacity", "Adaptive Capacity"

    lga = models.ForeignKey(
        LGARegistry,
        on_delete=models.CASCADE,
        related_name="climate_risk_parameter_records",
    )

    year = models.PositiveIntegerField(default=2025)

    category = models.CharField(
        max_length=50,
        choices=Category.choices,
    )

    parameter_key = models.SlugField(max_length=100)
    parameter_label = models.CharField(max_length=150)

    raw_value = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    unit = models.CharField(max_length=50, blank=True)

    normalized_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Optional 0-100 normalized score. Later this will be calculated automatically.",
    )

    data_source = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("lga", "year", "category", "parameter_key")
        ordering = ["lga__lga_name", "category", "parameter_label"]
        indexes = [
            models.Index(fields=["year", "category"]),
            models.Index(fields=["lga", "year"]),
        ]

    def __str__(self):
        return f"{self.lga.lga_name} - {self.year} - {self.parameter_label}"


class ClimateRiskDatasetUpload(models.Model):
    class DatasetType(models.TextChoices):
        FLOOD_SCORES = "flood_scores", "Flood Scores CSV"
        DROUGHT_SCORES = "drought_scores", "Drought Scores CSV"
        HEAT_SCORES = "heat_scores", "Heat Scores CSV"
        EROSION_SCORES = "erosion_scores", "Erosion Scores CSV"
        EXPOSURE_SCORES = "exposure_scores", "Exposure Scores CSV"
        VULNERABILITY_SCORES = "vulnerability_scores", "Vulnerability Scores CSV"
        ADAPTIVE_CAPACITY_SCORES = (
            "adaptive_capacity_scores",
            "Adaptive Capacity Scores CSV",
        )
        PARAMETER_RECORDS = "parameter_records", "Generic Parameter Records CSV"

    class Status(models.TextChoices):
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        COMPLETED_WITH_ERRORS = "completed_with_errors", "Completed with Errors"
        FAILED = "failed", "Failed"

    dataset_type = models.CharField(
        max_length=80,
        choices=DatasetType.choices,
    )

    year = models.PositiveIntegerField(default=2025)

    original_filename = models.CharField(max_length=255)

    status = models.CharField(
        max_length=50,
        choices=Status.choices,
        default=Status.PROCESSING,
    )

    row_count = models.PositiveIntegerField(default=0)
    imported_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)

    validation_errors = models.JSONField(default=list, blank=True)
    summary = models.JSONField(default=dict, blank=True)

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="climate_risk_dataset_uploads",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["dataset_type", "year"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.get_dataset_type_display()} - {self.year} - {self.status}"
    

class ClimateInfrastructureAsset(models.Model):
    class AssetType(models.TextChoices):
        SCHOOL = "school", "School"
        HOSPITAL = "hospital", "Hospital"
        MARKET = "market", "Market"
        ROAD_BRIDGE = "road_bridge", "Road / Bridge"
        WATER_FACILITY = "water_facility", "Water Facility"
        SETTLEMENT = "settlement", "Settlement"
        GOVERNMENT_FACILITY = "government_facility", "Government Facility"
        OTHER = "other", "Other"

    class RiskStatus(models.TextChoices):
        LOW = "low", "Low"
        MODERATE = "moderate", "Moderate"
        HIGH = "high", "High"
        VERY_HIGH = "very_high", "Very High"

    lga = models.ForeignKey(
        LGARegistry,
        on_delete=models.CASCADE,
        related_name="climate_infrastructure_assets",
    )

    year = models.PositiveIntegerField(default=2025)

    asset_type = models.CharField(
        max_length=50,
        choices=AssetType.choices,
        default=AssetType.OTHER,
    )

    asset_name = models.CharField(max_length=255)

    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)

    exposure_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="Normalized exposure score from 0 to 100.",
    )

    risk_status = models.CharField(
        max_length=50,
        choices=RiskStatus.choices,
        default=RiskStatus.MODERATE,
    )

    data_source = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["lga__lga_name", "asset_type", "asset_name"]
        indexes = [
            models.Index(fields=["lga", "year"]),
            models.Index(fields=["asset_type"]),
            models.Index(fields=["risk_status"]),
        ]

    def __str__(self):
        return f"{self.asset_name} - {self.lga.lga_name}"