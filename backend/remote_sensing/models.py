from django.db import models
from django.db.models import Q


class RemoteSensingLayer(models.Model):
    class LayerKey(models.TextChoices):
        NDVI = "ndvi", "NDVI / Vegetation Condition"
        LST = "lst", "Land Surface Temperature"
        TEMPERATURE_ANOMALY = "temperature_anomaly", "Temperature Anomaly"
        RAINFALL = "rainfall", "Rainfall"
        RAINFALL_ANOMALY = "rainfall_anomaly", "Rainfall Anomaly"
        FLOOD_HAZARD = "flood_hazard", "Flood Hazard"
        FLOOD_OCCURRENCE = "flood_occurrence", "Flood Occurrence"
        DROUGHT_INDEX = "drought_index", "Drought Index"
        LULC = "lulc", "Land Use / Land Cover"
        ELEVATION = "elevation", "Elevation / Terrain"
        TREE_COVER = "tree_cover", "Tree Cover"
        FOREST_CHANGE = "forest_change", "Forest Change"

    key = models.CharField(max_length=80, choices=LayerKey.choices, unique=True)
    label = models.CharField(max_length=150)
    description = models.TextField(blank=True)

    gee_dataset = models.CharField(max_length=255, blank=True)
    gee_band = models.CharField(max_length=120, blank=True)

    visualization = models.JSONField(default=dict, blank=True)
    is_public = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    last_synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["label"]

    def __str__(self):
        return self.label


class RemoteSensingLGAMetric(models.Model):
    class AdminLevel(models.TextChoices):
        LGA = "lga", "LGA"
        WARD = "ward", "Ward"

    class Season(models.TextChoices):
        ANNUAL = "annual", "Annual"
        WET_SEASON = "wet_season", "Wet Season"
        DRY_SEASON = "dry_season", "Dry Season"

    layer = models.ForeignKey(
        RemoteSensingLayer,
        on_delete=models.CASCADE,
        related_name="lga_metrics",
    )
    # Nullable so ward-level records (which have no LGARegistry row) can be stored.
    lga = models.ForeignKey(
        "core.LGARegistry",
        on_delete=models.CASCADE,
        related_name="remote_sensing_metrics",
        null=True,
        blank=True,
    )

    admin_level = models.CharField(
        max_length=10,
        choices=AdminLevel.choices,
        default=AdminLevel.LGA,
    )
    # lgacode or wardcode — canonical identity key for GEE sync records.
    admin_code = models.CharField(max_length=50, blank=True, db_index=True)
    # lganame or wardname — denormalised display name.
    admin_name = models.CharField(max_length=150, blank=True)

    year = models.PositiveIntegerField()
    # Named multi-month period used by the GEE sync pipeline.
    season = models.CharField(
        max_length=20,
        choices=Season.choices,
        default=Season.ANNUAL,
        blank=True,
    )
    # Kept for backward-compat with the CSV import command (monthly granularity).
    month = models.PositiveSmallIntegerField(null=True, blank=True)

    mean_value = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    min_value = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    max_value = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    anomaly_value = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)

    unit = models.CharField(max_length=50, blank=True)
    data_source = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["admin_name", "-year"]
        constraints = [
            # Backward-compat: CSV-imported LGA records keyed by FK + year + month.
            models.UniqueConstraint(
                fields=["layer", "lga", "year", "month"],
                condition=Q(lga__isnull=False),
                name="uniq_rs_lga_month",
            ),
            # GEE sync records keyed by admin identity + year + season.
            models.UniqueConstraint(
                fields=["layer", "admin_level", "admin_code", "year", "season"],
                name="uniq_rs_admin_season",
            ),
        ]
        indexes = [
            models.Index(fields=["admin_level", "admin_code"]),
            models.Index(fields=["layer", "year", "season"]),
            models.Index(fields=["lga", "year"]),
        ]

    def __str__(self):
        label = self.admin_name or (self.lga.lga_name if self.lga else "—")
        period = f"{self.year}-{self.month:02d}" if self.month else f"{self.year}/{self.season}"
        return f"{self.layer.key} - {label} - {period}"


class RemoteSensingSyncLog(models.Model):
    class Status(models.TextChoices):
        STARTED = "started", "Started"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    layer = models.ForeignKey(
        RemoteSensingLayer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sync_logs",
    )

    status = models.CharField(max_length=30, choices=Status.choices, default=Status.STARTED)
    message = models.TextField(blank=True)
    details = models.JSONField(default=dict, blank=True)

    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        layer_key = self.layer.key if self.layer else "all"
        return f"{layer_key} - {self.status}"
