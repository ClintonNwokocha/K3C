from django.db import models


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
    layer = models.ForeignKey(
        RemoteSensingLayer,
        on_delete=models.CASCADE,
        related_name="lga_metrics",
    )
    lga = models.ForeignKey(
        "core.LGARegistry",
        on_delete=models.CASCADE,
        related_name="remote_sensing_metrics",
    )

    year = models.PositiveIntegerField()
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
        unique_together = ("layer", "lga", "year", "month")
        ordering = ["lga__lga_name", "-year", "-month"]
        indexes = [
            models.Index(fields=["year", "month"]),
            models.Index(fields=["layer", "year"]),
            models.Index(fields=["lga", "year"]),
        ]

    def __str__(self):
        period = f"{self.year}-{self.month:02d}" if self.month else str(self.year)
        return f"{self.layer.key} - {self.lga.lga_name} - {period}"


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