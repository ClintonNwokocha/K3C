from rest_framework import serializers

from .models import HealthFacility


class HealthFacilitySerializer(serializers.ModelSerializer):
    facility_type_display = serializers.CharField(
        source="get_facility_type_display", read_only=True
    )
    ownership_display = serializers.CharField(
        source="get_ownership_display", read_only=True
    )
    functional_status_display = serializers.CharField(
        source="get_functional_status_display", read_only=True
    )
    # GeoJSON Point computed from lat/lng. When PostGIS PointField is added,
    # this can switch to a GeoFeatureModelSerializer without changing the API shape.
    geometry = serializers.SerializerMethodField()

    class Meta:
        model = HealthFacility
        fields = [
            "id",
            "name",
            "facility_type",
            "facility_type_display",
            "ownership",
            "ownership_display",
            "state",
            "lga",
            "lga_name",
            "ward",
            "latitude",
            "longitude",
            "geometry",
            "functional_status",
            "functional_status_display",
            "bed_capacity",
            "population_served",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_geometry(self, obj):
        if obj.latitude is None or obj.longitude is None:
            return None
        return {
            "type": "Point",
            "coordinates": [float(obj.longitude), float(obj.latitude)],
        }


class HealthFacilitySummarySerializer(serializers.ModelSerializer):
    """Lightweight serializer for list responses (omits counts and geometry detail)."""

    facility_type_display = serializers.CharField(
        source="get_facility_type_display", read_only=True
    )
    functional_status_display = serializers.CharField(
        source="get_functional_status_display", read_only=True
    )

    class Meta:
        model = HealthFacility
        fields = [
            "id",
            "name",
            "facility_type",
            "facility_type_display",
            "ownership",
            "functional_status",
            "functional_status_display",
            "lga_name",
            "ward",
            "latitude",
            "longitude",
        ]
        read_only_fields = fields
