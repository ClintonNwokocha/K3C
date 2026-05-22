from rest_framework import serializers

from .models import (
    ClimateRiskDatasetUpload,
    ClimateRiskParameterRecord,
    ClimateRiskProfile,
)


class ClimateRiskProfileSerializer(serializers.ModelSerializer):
    lga_name = serializers.CharField(source="lga.lga_name", read_only=True)
    lga_id = serializers.IntegerField(source="lga.lga_id", read_only=True)
    risk_level_display = serializers.CharField(
        source="get_risk_level_display",
        read_only=True,
    )

    class Meta:
        model = ClimateRiskProfile
        fields = [
            "id",
            "lga",
            "lga_id",
            "lga_name",
            "year",
            "flood_risk_score",
            "drought_risk_score",
            "heat_risk_score",
            "erosion_risk_score",
            "exposure_score",
            "vulnerability_score",
            "adaptive_capacity_score",
            "overall_risk_score",
            "risk_level",
            "risk_level_display",
            "dominant_hazard",
            "notes",
            "data_source",
            "is_active",
            "created_at",
            "updated_at",
        ]


class ClimateRiskProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClimateRiskProfile
        fields = [
            "flood_risk_score",
            "drought_risk_score",
            "heat_risk_score",
            "erosion_risk_score",
            "exposure_score",
            "vulnerability_score",
            "adaptive_capacity_score",
            "notes",
            "data_source",
            "is_active",
        ]

    def validate(self, attrs):
        score_fields = [
            "flood_risk_score",
            "drought_risk_score",
            "heat_risk_score",
            "erosion_risk_score",
            "exposure_score",
            "vulnerability_score",
            "adaptive_capacity_score",
        ]

        for field in score_fields:
            value = attrs.get(field)

            if value is None:
                continue

            if value < 0 or value > 100:
                raise serializers.ValidationError({
                    field: "Score must be between 0 and 100."
                })

        return attrs


class ClimateRiskParameterRecordSerializer(serializers.ModelSerializer):
    lga_name = serializers.CharField(source="lga.lga_name", read_only=True)
    category_display = serializers.CharField(
        source="get_category_display",
        read_only=True,
    )

    class Meta:
        model = ClimateRiskParameterRecord
        fields = [
            "id",
            "lga",
            "lga_name",
            "year",
            "category",
            "category_display",
            "parameter_key",
            "parameter_label",
            "raw_value",
            "unit",
            "normalized_score",
            "data_source",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        ]


class ClimateRiskParameterRecordCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClimateRiskParameterRecord
        fields = [
            "lga",
            "year",
            "category",
            "parameter_key",
            "parameter_label",
            "raw_value",
            "unit",
            "normalized_score",
            "data_source",
            "notes",
            "is_active",
        ]

    def validate_normalized_score(self, value):
        if value is None:
            return value

        if value < 0 or value > 100:
            raise serializers.ValidationError(
                "Normalized score must be between 0 and 100."
            )

        return value


class ClimateRiskDatasetUploadSerializer(serializers.ModelSerializer):
    dataset_type_display = serializers.CharField(
        source="get_dataset_type_display",
        read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )
    uploaded_by_username = serializers.CharField(
        source="uploaded_by.username",
        read_only=True,
    )

    class Meta:
        model = ClimateRiskDatasetUpload
        fields = [
            "id",
            "dataset_type",
            "dataset_type_display",
            "year",
            "original_filename",
            "status",
            "status_display",
            "row_count",
            "imported_count",
            "failed_count",
            "validation_errors",
            "summary",
            "uploaded_by_username",
            "created_at",
        ]