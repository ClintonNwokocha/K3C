from decimal import Decimal

from django.conf import settings
from django.db import models

from core.models import EmissionFactor, LGARegistry


class GHGInventoryEntry(models.Model):
    class Sector(models.TextChoices):
        ENERGY = "energy", "Energy"
        AGRICULTURE = "agriculture", "Agriculture"
        LULUCF = "lulucf", "LULUCF"
        WASTE = "waste", "Waste"
        IPPU = "ippu", "IPPU"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_REVIEW = "pending_review", "Pending Review"
        UNDER_REVIEW = "under_review", "Under Review"
        REVISION_REQUESTED = "revision_requested", "Revision Requested"
        REJECTED = "rejected", "Rejected"
        APPROVED = "approved", "Approved"

    class EnergySubCategory(models.TextChoices):
        STATIONARY = "stationary_combustion", "Stationary Combustion"
        TRANSPORT = "transport_combustion", "Transport Combustion"

    sector = models.CharField(
        max_length=50,
        choices=Sector.choices,
        default=Sector.ENERGY
    )
    sub_category = models.CharField(max_length=100)
    fuel_or_activity = models.CharField(max_length=150)

    lga = models.ForeignKey(
        LGARegistry,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ghg_entries"
    )

    year = models.PositiveIntegerField()
    quantity = models.DecimalField(max_digits=18, decimal_places=3)
    unit = models.CharField(max_length=50, default="metric_tonnes")

    emission_factor = models.ForeignKey(
        EmissionFactor,
        on_delete=models.PROTECT,
        related_name="ghg_entries"
    )

    co2_kg = models.DecimalField(max_digits=20, decimal_places=6, default=0)
    ch4_kg = models.DecimalField(max_digits=20, decimal_places=6, default=0)
    n2o_kg = models.DecimalField(max_digits=20, decimal_places=6, default=0)
    co2e_tonnes = models.DecimalField(max_digits=20, decimal_places=6, default=0)
    # Memo item: biogenic CO2, never part of co2e_tonnes.
    co2_biogenic_kg = models.DecimalField(max_digits=20, decimal_places=6, default=0)

    ipcc_code = models.CharField(max_length=20, blank=True)
    method_version = models.CharField(max_length=50, blank=True, db_index=True)
    confidence = models.CharField(max_length=20, blank=True)
    activity = models.ForeignKey(
        "ActivityData",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inventory_entries"
    )

    status = models.CharField(
        max_length=50,
        choices=Status.choices,
        default=Status.DRAFT
    )

    notes = models.TextField(blank=True)
    reviewer_comment = models.TextField(blank=True)

    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="submitted_ghg_entries"
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_ghg_entries"
    )

    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def calculate_emissions(self):
        quantity = self.quantity or Decimal("0")

        co2_ef = self.emission_factor.co2_ef or Decimal("0")
        ch4_ef = self.emission_factor.ch4_ef or Decimal("0")
        n2o_ef = self.emission_factor.n2o_ef or Decimal("0")

        if self.emission_factor.is_biogenic_co2:
            self.co2_biogenic_kg = quantity * co2_ef
            self.co2_kg = Decimal("0")
        else:
            self.co2_biogenic_kg = Decimal("0")
            self.co2_kg = quantity * co2_ef
        self.ch4_kg = quantity * ch4_ef
        self.n2o_kg = quantity * n2o_ef

        co2e_kg = self.co2_kg + (self.ch4_kg * Decimal("28")) + (self.n2o_kg * Decimal("265"))
        self.co2e_tonnes = co2e_kg / Decimal("1000")

    def save(self, *args, **kwargs):
        self.calculate_emissions()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ["-year", "fuel_or_activity"]
        indexes = [
            models.Index(fields=["sector", "year", "status"]),
            models.Index(fields=["sector", "sub_category", "fuel_or_activity", "year"]),
        ]

    def __str__(self):
        return f"{self.get_sector_display()} - {self.fuel_or_activity} - {self.year}"


class Confidence(models.TextChoices):
    HIGH = "high", "High"
    MEDIUM = "medium", "Medium"
    LOW = "low", "Low"


class ActivityData(models.Model):
    """
    One activity input for the Tier 1 inventory (an area burned, a headcount,
    a population), with where it came from.  Written by sync_inventory_activity
    (Earth Engine) and load_open_activity_data (open statistics).
    """

    class SourceType(models.TextChoices):
        REMOTE_SENSING = "remote_sensing", "Remote sensing"
        STATISTIC = "statistic", "Published statistic"
        ALLOCATION = "allocation", "National statistic allocated by proxy"
        IPCC_DEFAULT = "ipcc_default", "IPCC default"

    lga = models.ForeignKey(
        LGARegistry,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ghg_activity_data"
    )
    year = models.PositiveIntegerField()
    ipcc_code = models.CharField(max_length=20, blank=True)
    activity_key = models.CharField(max_length=120)
    quantity = models.DecimalField(max_digits=20, decimal_places=4)
    unit = models.CharField(max_length=50)
    source_type = models.CharField(max_length=30, choices=SourceType.choices)
    source_name = models.CharField(max_length=255)
    method_version = models.CharField(max_length=50)
    confidence = models.CharField(max_length=20, choices=Confidence.choices)
    metadata = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("lga", "year", "activity_key", "method_version")
        indexes = [models.Index(fields=["activity_key", "year"])]
        ordering = ["year", "activity_key"]

    def __str__(self):
        where = self.lga.lga_name if self.lga else "Kaduna"
        return f"{where} {self.year} {self.activity_key} = {self.quantity} {self.unit}"


class LGAClimateProfile(models.Model):
    """IPCC climate zone per LGA, fixed from 1991-2020 climate normals."""

    class Zone(models.TextChoices):
        TROPICAL_MOIST = "tropical_moist", "Tropical moist"
        TROPICAL_DRY = "tropical_dry", "Tropical dry"

    lga = models.OneToOneField(LGARegistry, on_delete=models.CASCADE, related_name="climate_profile")
    mean_annual_rainfall_mm = models.DecimalField(max_digits=8, decimal_places=1)
    mean_annual_temp_c = models.DecimalField(max_digits=5, decimal_places=2)
    montane_area_pct = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    climate_zone = models.CharField(max_length=30, choices=Zone.choices)
    source = models.CharField(max_length=255)
    method_version = models.CharField(max_length=50)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_wet(self):
        return self.climate_zone == self.Zone.TROPICAL_MOIST

    def __str__(self):
        return f"{self.lga.lga_name}: {self.get_climate_zone_display()}"


class CategoryStatus(models.Model):
    """Whether each IPCC category was estimated, and if not, why (notation keys)."""

    class Status(models.TextChoices):
        ESTIMATED = "estimated", "Estimated"
        PROVISIONAL = "provisional", "Provisional (not in totals)"
        NOT_OCCURRING = "NO", "Not occurring"
        NOT_ESTIMATED = "NE", "Not estimated"
        INCLUDED_ELSEWHERE = "IE", "Included elsewhere"

    ipcc_code = models.CharField(max_length=20)
    name = models.CharField(max_length=150)
    sector = models.CharField(max_length=50, choices=GHGInventoryEntry.Sector.choices)
    year = models.PositiveIntegerField()
    status = models.CharField(max_length=20, choices=Status.choices)
    confidence = models.CharField(max_length=20, choices=Confidence.choices, blank=True)
    reason = models.TextField(blank=True)
    method_version = models.CharField(max_length=50)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("ipcc_code", "year", "method_version")
        ordering = ["year", "ipcc_code"]

    def __str__(self):
        return f"{self.year} {self.ipcc_code} {self.status}"


class GHGStateTotal(models.Model):
    sector = models.CharField(max_length=50, choices=GHGInventoryEntry.Sector.choices)
    year = models.PositiveIntegerField()
    total_co2e = models.DecimalField(max_digits=20, decimal_places=6, default=0)
    status = models.CharField(max_length=50, default="computed")
    calculated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("sector", "year")
        ordering = ["-year", "sector"]

    def __str__(self):
        return f"{self.sector} - {self.year}: {self.total_co2e} tCO2e"