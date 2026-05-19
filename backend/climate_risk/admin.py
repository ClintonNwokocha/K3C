from django.contrib import admin

from .models import ClimateRiskProfile


@admin.register(ClimateRiskProfile)
class ClimateRiskProfileAdmin(admin.ModelAdmin):
    list_display = (
        "lga",
        "year",
        "overall_risk_score",
        "risk_level",
        "flood_risk_score",
        "drought_risk_score",
        "heat_risk_score",
        "vulnerability_score",
        "adaptive_capacity_score",
    )
    list_filter = ("year", "risk_level", "is_active")
    search_fields = ("lga__lga_name", "notes", "data_source")
    readonly_fields = (
        "overall_risk_score",
        "risk_level",
        "created_at",
        "updated_at",
    )