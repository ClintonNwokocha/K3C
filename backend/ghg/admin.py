from django.contrib import admin

from .models import ActivityData, CategoryStatus, GHGInventoryEntry, GHGStateTotal, LGAClimateProfile


@admin.register(GHGInventoryEntry)
class GHGInventoryEntryAdmin(admin.ModelAdmin):
    list_display = (
        "sector",
        "sub_category",
        "fuel_or_activity",
        "year",
        "quantity",
        "unit",
        "co2e_tonnes",
        "status",
        "ipcc_code",
        "method_version",
        "submitted_by",
        "created_at",
    )
    list_filter = ("sector", "sub_category", "year", "status", "method_version")
    search_fields = ("fuel_or_activity", "notes")
    readonly_fields = (
        "co2_kg",
        "ch4_kg",
        "n2o_kg",
        "co2e_tonnes",
        "co2_biogenic_kg",
        "created_at",
        "updated_at",
    )


@admin.register(GHGStateTotal)
class GHGStateTotalAdmin(admin.ModelAdmin):
    list_display = ("sector", "year", "total_co2e", "status", "calculated_at")
    list_filter = ("sector", "year", "status")


@admin.register(ActivityData)
class ActivityDataAdmin(admin.ModelAdmin):
    list_display = ("activity_key", "lga", "year", "quantity", "unit", "source_type", "confidence", "method_version")
    list_filter = ("method_version", "source_type", "confidence", "year")
    search_fields = ("activity_key", "source_name")


@admin.register(LGAClimateProfile)
class LGAClimateProfileAdmin(admin.ModelAdmin):
    list_display = ("lga", "climate_zone", "mean_annual_rainfall_mm", "mean_annual_temp_c", "montane_area_pct")


@admin.register(CategoryStatus)
class CategoryStatusAdmin(admin.ModelAdmin):
    list_display = ("ipcc_code", "name", "year", "status", "confidence", "method_version")
    list_filter = ("method_version", "status", "sector", "year")
