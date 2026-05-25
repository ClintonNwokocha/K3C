from rest_framework import serializers

from .models import ClimateProject


class ClimateProjectSerializer(serializers.ModelSerializer):
    lga_name = serializers.CharField(source="lga.lga_name", read_only=True)
    project_type_display = serializers.CharField(
        source="get_project_type_display",
        read_only=True,
    )
    sector_display = serializers.CharField(
        source="get_sector_display",
        read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )
    priority_display = serializers.CharField(
        source="get_priority_display",
        read_only=True,
    )
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ClimateProject
        fields = [
            "id",
            "title",
            "project_code",
            "project_type",
            "project_type_display",
            "sector",
            "sector_display",
            "status",
            "status_display",
            "priority",
            "priority_display",
            "lga",
            "lga_name",
            "description",
            "implementing_agency",
            "funding_source",
            "estimated_budget_naira",
            "expected_ghg_reduction_tco2e",
            "expected_beneficiaries",
            "start_date",
            "end_date",
            "climate_risk_relevance",
            "location_notes",
            "created_by",
            "created_by_name",
            "is_active",
            "created_at",
            "updated_at",
        ]

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return ""

        return (
            getattr(obj.created_by, "full_name", "")
            or getattr(obj.created_by, "email", "")
            or str(obj.created_by)
        )


class ClimateProjectCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClimateProject
        fields = [
            "title",
            "project_code",
            "project_type",
            "sector",
            "status",
            "priority",
            "lga",
            "description",
            "implementing_agency",
            "funding_source",
            "estimated_budget_naira",
            "expected_ghg_reduction_tco2e",
            "expected_beneficiaries",
            "start_date",
            "end_date",
            "climate_risk_relevance",
            "location_notes",
            "is_active",
        ]

    def validate_estimated_budget_naira(self, value):
        if value < 0:
            raise serializers.ValidationError("Budget cannot be negative.")
        return value

    def validate_expected_ghg_reduction_tco2e(self, value):
        if value < 0:
            raise serializers.ValidationError(
                "Expected GHG reduction cannot be negative."
            )
        return value

    def validate_expected_beneficiaries(self, value):
        if value < 0:
            raise serializers.ValidationError(
                "Expected beneficiaries cannot be negative."
            )
        return value