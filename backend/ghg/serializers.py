from rest_framework import serializers

from core.models import EmissionFactor
from .models import GHGInventoryEntry


class EnergyEmissionFactorSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmissionFactor
        fields = [
            "id",
            "sector",
            "sub_category",
            "fuel_or_species",
            "co2_ef",
            "ch4_ef",
            "n2o_ef",
            "unit",
            "tier",
        ]


class GHGInventoryEntrySerializer(serializers.ModelSerializer):
    emission_factor_detail = EnergyEmissionFactorSerializer(
        source="emission_factor",
        read_only=True
    )
    submitted_by_username = serializers.CharField(
        source="submitted_by.username",
        read_only=True
    )
    approved_by_username = serializers.CharField(
        source="approved_by.username",
        read_only=True
    )
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True
    )
    sub_category_display = serializers.SerializerMethodField()
    lga_name = serializers.CharField(
        source="lga.lga_name",
        read_only=True
    )

    class Meta:
        model = GHGInventoryEntry
        fields = [
            "id",
            "sector",
            "sub_category",
            "sub_category_display",
            "fuel_or_activity",
            "lga",
            "lga_name",
            "year",
            "quantity",
            "unit",
            "emission_factor",
            "emission_factor_detail",
            "co2_kg",
            "ch4_kg",
            "n2o_kg",
            "co2e_tonnes",
            "status",
            "status_display",
            "notes",
            "reviewer_comment",
            "submitted_by_username",
            "approved_by_username",
            "submitted_at",
            "approved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "sector",
            "co2_kg",
            "ch4_kg",
            "n2o_kg",
            "co2e_tonnes",
            "submitted_by_username",
            "approved_by_username",
            "submitted_at",
            "approved_at",
            "created_at",
            "updated_at",
        ]

    def get_sub_category_display(self, obj):
        labels = {
            "stationary_combustion": "Stationary Combustion",
            "transport_combustion": "Transport Combustion",
        }
        return labels.get(obj.sub_category, obj.sub_category)


class EnergyEntryCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = GHGInventoryEntry
        fields = [
            "sub_category",
            "fuel_or_activity",
            "lga",
            "year",
            "quantity",
            "notes",
            "status",
        ]

    def validate_status(self, value):
        if value != GHGInventoryEntry.Status.DRAFT:
            raise serializers.ValidationError("New entries can only be created as draft.")
        return value

    def validate(self, attrs):
        fuel = attrs.get("fuel_or_activity")
        sub_category = attrs.get("sub_category")

        factor = EmissionFactor.objects.filter(
            sector="energy",
            sub_category=sub_category,
            fuel_or_species=fuel,
            is_active=True,
        ).first()

        if not factor:
            raise serializers.ValidationError(
                "No active emission factor found for this fuel and sub-category."
            )

        attrs["emission_factor"] = factor
        return attrs

    def create(self, validated_data):
        request = self.context["request"]

        entry = GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.ENERGY,
            submitted_by=request.user,
            unit="metric_tonnes",
            **validated_data
        )

        return entry


class EnergyEntryUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = GHGInventoryEntry
        fields = [
            "sub_category",
            "fuel_or_activity",
            "lga",
            "year",
            "quantity",
            "notes",
        ]

    def validate(self, attrs):
        instance = self.instance

        fuel = attrs.get("fuel_or_activity", instance.fuel_or_activity)
        sub_category = attrs.get("sub_category", instance.sub_category)

        factor = EmissionFactor.objects.filter(
            sector="energy",
            sub_category=sub_category,
            fuel_or_species=fuel,
            is_active=True,
        ).first()

        if not factor:
            raise serializers.ValidationError(
                "No active emission factor found for this fuel and sub-category."
            )

        attrs["emission_factor"] = factor
        return attrs

    def update(self, instance, validated_data):
        emission_factor = validated_data.pop("emission_factor")

        for field, value in validated_data.items():
            setattr(instance, field, value)

        instance.emission_factor = emission_factor
        instance.save()

        return instance