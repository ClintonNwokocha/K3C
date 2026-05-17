from rest_framework import serializers

from core.models import EmissionFactor
from .models import GHGInventoryEntry


WASTE_SUBCATEGORY_LABELS = {
    "solid_waste": "Solid Waste",
    "wastewater": "Wastewater",
}

WASTE_UNIT_BY_SUBCATEGORY = {
    "solid_waste": "tonnes_waste",
    "wastewater": "persons",
}


class WasteEmissionFactorSerializer(serializers.ModelSerializer):
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


class WasteEntrySerializer(serializers.ModelSerializer):
    emission_factor_detail = WasteEmissionFactorSerializer(
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

    def get_sub_category_display(self, obj):
        return WASTE_SUBCATEGORY_LABELS.get(obj.sub_category, obj.sub_category)


class WasteEntryCreateSerializer(serializers.ModelSerializer):
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
        sub_category = attrs.get("sub_category")
        activity = attrs.get("fuel_or_activity")

        if sub_category not in WASTE_UNIT_BY_SUBCATEGORY:
            raise serializers.ValidationError("Invalid Waste sub-category.")

        factor = EmissionFactor.objects.filter(
            sector="waste",
            sub_category=sub_category,
            fuel_or_species=activity,
            is_active=True,
        ).first()

        if not factor:
            raise serializers.ValidationError(
                "No active emission factor found for this Waste activity."
            )

        attrs["emission_factor"] = factor
        attrs["unit"] = WASTE_UNIT_BY_SUBCATEGORY[sub_category]

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        unit = validated_data.pop("unit")

        return GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.WASTE,
            submitted_by=request.user,
            unit=unit,
            **validated_data
        )


class WasteEntryUpdateSerializer(serializers.ModelSerializer):
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

        sub_category = attrs.get("sub_category", instance.sub_category)
        activity = attrs.get("fuel_or_activity", instance.fuel_or_activity)

        if sub_category not in WASTE_UNIT_BY_SUBCATEGORY:
            raise serializers.ValidationError("Invalid Waste sub-category.")

        factor = EmissionFactor.objects.filter(
            sector="waste",
            sub_category=sub_category,
            fuel_or_species=activity,
            is_active=True,
        ).first()

        if not factor:
            raise serializers.ValidationError(
                "No active emission factor found for this Waste activity."
            )

        attrs["emission_factor"] = factor
        attrs["unit"] = WASTE_UNIT_BY_SUBCATEGORY[sub_category]

        return attrs

    def update(self, instance, validated_data):
        emission_factor = validated_data.pop("emission_factor")
        unit = validated_data.pop("unit")

        for field, value in validated_data.items():
            setattr(instance, field, value)

        instance.emission_factor = emission_factor
        instance.unit = unit
        instance.save()

        return instance