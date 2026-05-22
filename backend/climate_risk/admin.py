from django.contrib import admin

from .models import (
    ClimateRiskDatasetUpload,
    ClimateRiskParameterRecord,
    ClimateRiskProfile,
)


@admin.register(ClimateRiskProfile)
class ClimateRiskProfileAdmin(admin.ModelAdmin):
    list_display = (
        "lga",
        "year",
        "overall_risk_score",
        "risk_level",
        "dominant_hazard",
        "flood_risk_score",
        "drought_risk_score",
        "heat_risk_score",
        "erosion_risk_score",
        "exposure_score",
        "vulnerability_score",
        "adaptive_capacity_score",
    )
    list_filter = ("year", "risk_level", "is_active")
    search_fields = ("lga__lga_name", "notes", "data_source")
    readonly_fields = (
        "overall_risk_score",
        "risk_level",
        "dominant_hazard",
        "created_at",
        "updated_at",
    )


@admin.register(ClimateRiskParameterRecord)
class ClimateRiskParameterRecordAdmin(admin.ModelAdmin):
    list_display = (
        "lga",
        "year",
        "category",
        "parameter_label",
        "raw_value",
        "unit",
        "normalized_score",
        "data_source",
        "is_active",
    )
    list_filter = ("year", "category", "is_active")
    search_fields = (
        "lga__lga_name",
        "parameter_key",
        "parameter_label",
        "data_source",
        "notes",
    )


@admin.register(ClimateRiskDatasetUpload)
class ClimateRiskDatasetUploadAdmin(admin.ModelAdmin):
    list_display = (
        "dataset_type",
        "year",
        "original_filename",
        "status",
        "row_count",
        "imported_count",
        "failed_count",
        "uploaded_by",
        "created_at",
    )
    list_filter = ("dataset_type", "year", "status")
    search_fields = ("original_filename",)
    readonly_fields = (
        "dataset_type",
        "year",
        "original_filename",
        "status",
        "row_count",
        "imported_count",
        "failed_count",
        "validation_errors",
        "summary",
        "uploaded_by",
        "created_at",
    )