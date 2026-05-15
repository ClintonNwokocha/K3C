from django.contrib import admin

from .models import GHGInventoryEntry, GHGStateTotal


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
        "submitted_by",
        "created_at",
    )
    list_filter = ("sector", "sub_category", "year", "status")
    search_fields = ("fuel_or_activity", "notes")
    readonly_fields = (
        "co2_kg",
        "ch4_kg",
        "n2o_kg",
        "co2e_tonnes",
        "created_at",
        "updated_at",
    )


@admin.register(GHGStateTotal)
class GHGStateTotalAdmin(admin.ModelAdmin):
    list_display = ("sector", "year", "total_co2e", "status", "calculated_at")
    list_filter = ("sector", "year", "status")