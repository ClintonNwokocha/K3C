from django.contrib import admin

from .models import RemoteSensingLayer, RemoteSensingLGAMetric, RemoteSensingSyncLog


@admin.register(RemoteSensingLayer)
class RemoteSensingLayerAdmin(admin.ModelAdmin):
    list_display = ("key", "label", "is_public", "is_active", "last_synced_at")
    list_filter = ("is_public", "is_active")
    search_fields = ("key", "label", "gee_dataset", "gee_band")


@admin.register(RemoteSensingLGAMetric)
class RemoteSensingLGAMetricAdmin(admin.ModelAdmin):
    list_display = ("layer", "lga", "year", "month", "mean_value", "unit", "data_source")
    list_filter = ("layer", "year", "month")
    search_fields = ("lga__lga_name", "layer__key", "data_source")


@admin.register(RemoteSensingSyncLog)
class RemoteSensingSyncLogAdmin(admin.ModelAdmin):
    list_display = ("layer", "status", "started_at", "completed_at")
    list_filter = ("status", "layer")
    search_fields = ("message",)