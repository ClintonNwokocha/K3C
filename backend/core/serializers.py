from rest_framework import serializers
from .models import (
    LGARegistry,
    GWPValue,
    NDCConstant,
    EquivalencyFactor,
)


class LGARegistrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LGARegistry
        fields = [
            "lga_id",
            "lga_name",
            "population",
            "area_ha",
            "state",
        ]


class GWPValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = GWPValue
        fields = [
            "id",
            "gas",
            "gwp100_ar5",
            "source",
        ]


class NDCConstantSerializer(serializers.ModelSerializer):
    class Meta:
        model = NDCConstant
        fields = [
            "id",
            "nigeria_baseline_mt",
            "kaduna_share_pct",
            "kaduna_baseline_mt",
            "target_year",
            "unconditional_pct",
            "conditional_pct",
            "is_active",
            "updated_at",
        ]


class EquivalencyFactorSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquivalencyFactor
        fields = [
            "id",
            "name",
            "divisor",
            "label",
        ]