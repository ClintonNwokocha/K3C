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
    project_image_url = serializers.SerializerMethodField()

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
            "latitude",
            "longitude",
            "project_image",
            "project_image_url",
            "public_summary",
            "public_description",
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

    def get_project_image_url(self, obj):
        if not obj.project_image:
            return ""

        request = self.context.get("request")

        if request:
            return request.build_absolute_uri(obj.project_image.url)

        return obj.project_image.url


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
            "latitude",
            "longitude",
            "project_image",
            "public_summary",
            "public_description",
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

    def validate_title(self, value):
        value = str(value or "").strip()

        if not value:
            raise serializers.ValidationError("Project title is required.")

        if len(value) < 3:
            raise serializers.ValidationError(
                "Project title must be at least 3 characters."
            )

        return value

    def validate_latitude(self, value):
        if value is None:
            return value

        if value < -90 or value > 90:
            raise serializers.ValidationError(
                "Latitude must be between -90 and 90."
            )

        return value

    def validate_longitude(self, value):
        if value is None:
            return value

        if value < -180 or value > 180:
            raise serializers.ValidationError(
                "Longitude must be between -180 and 180."
            )

        return value

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

    def validate_public_summary(self, value):
        value = str(value or "").strip()

        if len(value) > 300:
            raise serializers.ValidationError(
                "Public summary cannot exceed 300 characters."
            )

        return value

    def validate(self, attrs):
        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")

        if self.instance:
            if start_date is None:
                start_date = self.instance.start_date

            if end_date is None:
                end_date = self.instance.end_date

        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                {
                    "end_date": "End date cannot be earlier than start date."
                }
            )

        return attrs