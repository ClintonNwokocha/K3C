from django.conf import settings
from django.db import models


class LGARegistry(models.Model):
    lga_id = models.PositiveSmallIntegerField(primary_key=True)
    lga_name = models.CharField(max_length=100, unique=True)
    population = models.PositiveIntegerField(null=True, blank=True)
    area_ha = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    state = models.CharField(max_length=100, default="Kaduna")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["lga_id"]
        verbose_name = "LGA Registry"
        verbose_name_plural = "LGA Registry"

    def __str__(self):
        return f"{self.lga_id} - {self.lga_name}"


class EmissionFactor(models.Model):
    class Tier(models.TextChoices):
        TIER_1 = "tier_1", "Tier 1"
        TIER_2 = "tier_2", "Tier 2"

    sector = models.CharField(max_length=100)
    sub_category = models.CharField(max_length=150, blank=True)
    fuel_or_species = models.CharField(max_length=150)
    co2_ef = models.DecimalField(max_digits=16, decimal_places=6, null=True, blank=True)
    ch4_ef = models.DecimalField(max_digits=16, decimal_places=6, null=True, blank=True)
    n2o_ef = models.DecimalField(max_digits=16, decimal_places=6, null=True, blank=True)
    unit = models.CharField(max_length=100)
    ipcc_source = models.CharField(max_length=255, blank=True)
    tier = models.CharField(max_length=20, choices=Tier.choices, default=Tier.TIER_1)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("sector", "sub_category", "fuel_or_species", "unit", "tier")

    def __str__(self):
        return f"{self.sector} - {self.fuel_or_species} ({self.tier})"


class GWPValue(models.Model):
    gas = models.CharField(max_length=20, unique=True)
    gwp100_ar5 = models.DecimalField(max_digits=10, decimal_places=2)
    source = models.CharField(max_length=255, default="IPCC AR5")

    def __str__(self):
        return f"{self.gas}: {self.gwp100_ar5}"


class NDCConstant(models.Model):
    nigeria_baseline_mt = models.DecimalField(max_digits=12, decimal_places=3, default=317)
    kaduna_share_pct = models.DecimalField(max_digits=6, decimal_places=3, default=4.2)
    kaduna_baseline_mt = models.DecimalField(max_digits=12, decimal_places=3, default=13.3)
    target_year = models.PositiveIntegerField(default=2030)
    unconditional_pct = models.DecimalField(max_digits=6, decimal_places=2, default=47)
    conditional_pct = models.DecimalField(max_digits=6, decimal_places=2, default=50)
    is_active = models.BooleanField(default=True)

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"NDC Constants - Target {self.target_year}"


class EquivalencyFactor(models.Model):
    name = models.CharField(max_length=100, unique=True)
    divisor = models.DecimalField(max_digits=16, decimal_places=6)
    label = models.CharField(max_length=255)

    def __str__(self):
        return self.label


class AlertLog(models.Model):
    class AlertType(models.TextChoices):
        FLOOD_WARNING = "flood_warning", "Flood Warning"
        DATA_OVERDUE = "data_overdue", "Data Overdue"
        PROJECT_OFF_TRACK = "project_off_track", "Project Off Track"
        SYSTEM = "system", "System"

    class Severity(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    alert_type = models.CharField(max_length=50, choices=AlertType.choices)
    lga = models.ForeignKey(
        LGARegistry,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="alerts"
    )
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.MEDIUM)
    message = models.TextField()
    resolved = models.BooleanField(default=False)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_alerts"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.alert_type} - {self.severity}"


class AlertSubscription(models.Model):
    class DeliveryMethod(models.TextChoices):
        EMAIL = "email", "Email"
        SMS = "sms", "SMS"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="alert_subscriptions"
    )
    alert_type = models.CharField(max_length=50, choices=AlertLog.AlertType.choices)
    lga = models.ForeignKey(
        LGARegistry,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="alert_subscriptions"
    )
    delivery_method = models.CharField(
        max_length=20,
        choices=DeliveryMethod.choices,
        default=DeliveryMethod.EMAIL
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("user", "alert_type", "lga", "delivery_method")

    def __str__(self):
        return f"{self.user.username} - {self.alert_type}"