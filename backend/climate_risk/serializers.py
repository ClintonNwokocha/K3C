from rest_framework import serializers

from .models import ClimateRiskProfile


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
            "vulnerability_score",
            "adaptive_capacity_score",
            "overall_risk_score",
            "risk_level",
            "risk_level_display",
            "notes",
            "data_source",
            "is_active",
            "created_at",
            "updated_at",
        ]