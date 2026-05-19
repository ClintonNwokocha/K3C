from decimal import Decimal

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
    vulnerability_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    adaptive_capacity_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    overall_risk_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    risk_level = models.CharField(
        max_length=50,
        choices=RiskLevel.choices,
        default=RiskLevel.MODERATE,
    )

    notes = models.TextField(blank=True)
    data_source = models.CharField(max_length=255, default="Development seed data")
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def calculate_overall_risk(self):
        flood = self.flood_risk_score or Decimal("0")
        drought = self.drought_risk_score or Decimal("0")
        heat = self.heat_risk_score or Decimal("0")
        erosion = self.erosion_risk_score or Decimal("0")
        vulnerability = self.vulnerability_score or Decimal("0")
        adaptive_gap = Decimal("100") - (self.adaptive_capacity_score or Decimal("0"))

        score = (
            flood * Decimal("0.25")
            + drought * Decimal("0.20")
            + heat * Decimal("0.20")
            + erosion * Decimal("0.15")
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

    def save(self, *args, **kwargs):
        self.overall_risk_score = self.calculate_overall_risk()
        self.risk_level = self.classify_risk_level()
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