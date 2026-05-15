from django.contrib import admin
from .models import (
    LGARegistry,
    EmissionFactor,
    GWPValue,
    NDCConstant,
    EquivalencyFactor,
    AlertLog,
    AlertSubscription,
)


@admin.register(LGARegistry)
class LGARegistryAdmin(admin.ModelAdmin):
    list_display = ("lga_id", "lga_name", "population", "area_ha", "state")
    search_fields = ("lga_name",)
    list_filter = ("state",)


@admin.register(EmissionFactor)
class EmissionFactorAdmin(admin.ModelAdmin):
    list_display = ("sector", "sub_category", "fuel_or_species", "unit", "tier", "is_active")
    list_filter = ("sector", "tier", "is_active")
    search_fields = ("sector", "sub_category", "fuel_or_species")


@admin.register(GWPValue)
class GWPValueAdmin(admin.ModelAdmin):
    list_display = ("gas", "gwp100_ar5", "source")


@admin.register(NDCConstant)
class NDCConstantAdmin(admin.ModelAdmin):
    list_display = (
        "kaduna_baseline_mt",
        "target_year",
        "unconditional_pct",
        "conditional_pct",
        "is_active",
        "updated_at",
    )


@admin.register(EquivalencyFactor)
class EquivalencyFactorAdmin(admin.ModelAdmin):
    list_display = ("name", "divisor", "label")


@admin.register(AlertLog)
class AlertLogAdmin(admin.ModelAdmin):
    list_display = ("alert_type", "severity", "lga", "resolved", "created_at")
    list_filter = ("alert_type", "severity", "resolved")
    search_fields = ("message",)


@admin.register(AlertSubscription)
class AlertSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "alert_type", "lga", "delivery_method", "is_active")
    list_filter = ("alert_type", "delivery_method", "is_active")