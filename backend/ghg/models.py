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