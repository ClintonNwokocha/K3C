from django.contrib.postgres.indexes import GinIndex
from django.db import models
from django.db.models import Q


class RemoteSensingLayer(models.Model):
    class LayerKey(models.TextChoices):
        NDVI = "ndvi", "NDVI / Vegetation Condition"
        NDVI_LANDSAT = "ndvi_landsat", "Historical NDVI (Landsat Collection 2)"
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


# ---------------------------------------------------------------------------
# Annual Land Use / Land Cover models
# ---------------------------------------------------------------------------
# These three models support the Land Use / Land Cover subsystem.
# They are intentionally separate from RemoteSensingLGAMetric because
# land-cover classification produces a *distribution* of class percentages
# per LGA per year, not a single scalar value.
#
# Phase 1 (current): Annual LULC snapshots, Dynamic World v1, 2018-present.
#   sync_lulc writes LandCoverDataset + LandCoverSnapshot only.
#   No change analysis in Phase 1 public release.
#
# Phase 2 (future): Historical Landsat LULC ~1984-2017 and/or change analysis.
#   build_land_cover_change writes LandCoverDerivedMetric only.
#   Do not run build_land_cover_change until Phase 2 is approved.
#   1981 LULC not supported at Dynamic World resolution — Landsat required.
#
# Write responsibilities (enforced by convention, tested in Phase A tests):
#   sync_lulc               →  LandCoverDataset + LandCoverSnapshot only
#   build_land_cover_change →  LandCoverDerivedMetric only (Phase 2/3)
#
# Phase A: model classes defined here.  No migration created.
# Phase B: django.contrib.postgres added to INSTALLED_APPS; migration 0003
#   generated and applied on dev.  GinIndex on class_pct active.
# ---------------------------------------------------------------------------


class LandCoverDataset(models.Model):
    """
    One record per sync batch: a (provider, year, composite_window, admin_level) run.

    Owns all batch-level metadata and the publication gate (is_public).
    sync_lulc creates or updates this record before writing LandCoverSnapshot rows.
    Both is_validated and is_public must be True before data is returned by the API.
    """

    class CompositeWindow(models.TextChoices):
        WET_SEASON = "wet_season", "Wet Season (May–October)"
        ANNUAL = "annual", "Annual (Jan–Dec)"

    class AdminLevel(models.TextChoices):
        LGA = "lga", "LGA"
        WARD = "ward", "Ward"

    provider = models.CharField(max_length=80)
    provider_label = models.CharField(max_length=200)
    gee_collection = models.CharField(max_length=255)
    year = models.PositiveIntegerField()
    composite_window = models.CharField(
        max_length=20,
        choices=CompositeWindow.choices,
        default=CompositeWindow.WET_SEASON,
    )
    composite_start = models.DateField()
    composite_end = models.DateField()
    method_version = models.CharField(max_length=100)
    admin_level = models.CharField(
        max_length=10,
        choices=AdminLevel.choices,
        default=AdminLevel.LGA,
    )
    snapshot_count = models.PositiveSmallIntegerField(default=0)

    is_validated = models.BooleanField(default=False)
    is_public = models.BooleanField(default=False)

    sync_log = models.ForeignKey(
        "remote_sensing.RemoteSensingSyncLog",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="land_cover_datasets",
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-year", "provider"]
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "year", "composite_window", "admin_level"],
                name="uniq_lc_dataset",
            ),
        ]
        indexes = [
            models.Index(fields=["provider", "year", "is_public"]),
        ]

    def __str__(self):
        return (
            f"{self.provider} / {self.year} / "
            f"{self.composite_window} / {self.admin_level}"
        )


class LandCoverSnapshot(models.Model):
    """
    One record per LGA per LandCoverDataset.

    Owns the raw GEE classification output: class percentages and areas.
    Written only by sync_lulc; never written by build_land_cover_change.

    class_pct values must sum to [99.5, 100.5] — validated by sync_lulc at
    write time before any row is committed.  The key set must match the
    provider's class_scheme in lulc_providers.LAND_COVER_PROVIDERS.
    """

    class AdminLevel(models.TextChoices):
        LGA = "lga", "LGA"
        WARD = "ward", "Ward"

    dataset = models.ForeignKey(
        LandCoverDataset,
        on_delete=models.CASCADE,
        related_name="snapshots",
    )
    lga = models.ForeignKey(
        "core.LGARegistry",
        on_delete=models.CASCADE,
        related_name="land_cover_snapshots",
        null=True,
        blank=True,
    )
    admin_level = models.CharField(
        max_length=10,
        choices=AdminLevel.choices,
        default=AdminLevel.LGA,
    )
    admin_code = models.CharField(max_length=50, db_index=True)
    admin_name = models.CharField(max_length=150)

    total_area_km2 = models.DecimalField(max_digits=12, decimal_places=4)

    # Raw classification output.  Keys match provider class_scheme.
    # sum(class_pct.values()) validated within [99.5, 100.5] at write time.
    class_pct = models.JSONField()
    # Matching km2 values.  sum(values()) approx total_area_km2 within 0.5%.
    class_areas_km2 = models.JSONField()

    pixel_count = models.PositiveIntegerField(null=True, blank=True)
    # Percentage of pixels masked by cloud filter; quality diagnostic only.
    masked_pixel_pct = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )

    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["admin_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["dataset", "admin_level", "admin_code"],
                name="uniq_lc_snapshot",
            ),
        ]
        indexes = [
            models.Index(fields=["admin_level", "admin_code"]),
            models.Index(fields=["dataset"]),
            # JSONB GIN index: enables fast path-value queries on class_pct,
            # e.g. WHERE (class_pct->>'trees')::numeric > 15.
            GinIndex(fields=["class_pct"], name="lc_snapshot_class_pct_gin"),
        ]

    def __str__(self):
        return f"{self.dataset} / {self.admin_name}"


class LandCoverDerivedMetric(models.Model):
    """
    Arithmetic change from a specific baseline snapshot.

    Written only by build_land_cover_change; never written by sync_lulc.
    One row per (snapshot, baseline_snapshot) pair, so multiple baselines
    (e.g. 2018 and 2020) can coexist for the same snapshot without schema changes.

    class_change_pct[k] = snapshot.class_pct[k] - baseline_snapshot.class_pct[k]
    in percentage points.  sum(values()) approx 0.0 (gains and losses cancel).
    """

    snapshot = models.ForeignKey(
        LandCoverSnapshot,
        on_delete=models.CASCADE,
        related_name="derived_metrics",
    )
    baseline_snapshot = models.ForeignKey(
        LandCoverSnapshot,
        on_delete=models.CASCADE,
        related_name="derived_as_baseline",
    )
    method_version = models.CharField(
        max_length=100,
        default="lc_change_arithmetic_v1",
    )

    # Arithmetic difference per class in percentage points.
    class_change_pct = models.JSONField()

    # Denormalised summary fields for fast API responses.
    largest_gain_class = models.CharField(max_length=50, blank=True)
    largest_gain_pct = models.DecimalField(
        max_digits=7, decimal_places=3, null=True, blank=True
    )
    largest_loss_class = models.CharField(max_length=50, blank=True)
    largest_loss_pct = models.DecimalField(
        max_digits=7, decimal_places=3, null=True, blank=True
    )

    computed_at = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-computed_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["snapshot", "baseline_snapshot"],
                name="uniq_lc_derived",
            ),
        ]
        indexes = [
            models.Index(fields=["snapshot"]),
            models.Index(fields=["baseline_snapshot"]),
        ]

    def __str__(self):
        snap_year = self.snapshot.dataset.year
        base_year = self.baseline_snapshot.dataset.year
        return f"{self.snapshot.admin_name} / {snap_year} vs {base_year}"
