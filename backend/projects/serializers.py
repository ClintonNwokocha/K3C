from datetime import date

from rest_framework import serializers

from .models import ClimateProject, ProjectProgressUpdate
from .performance import compute_performance_status

VALID_SDG_GOALS = set(range(1, 18))


def _progress_snapshot(obj):
    """
    Returns {"pct": Decimal|None, "disbursement": Decimal|None, "date": date|None}
    for a project's latest real progress update, computed once and cached on
    the instance. Reads pre-annotated queryset attributes (set by
    projects.views.annotate_latest_progress) when present — zero extra
    queries for list/detail GETs. Falls back to a direct single-object query
    (used for freshly created/updated instances returned straight from
    .save(), which were never annotated) — never invents a value.
    """
    cached = getattr(obj, "_progress_snapshot", None)
    if cached is not None:
        return cached

    if hasattr(obj, "latest_physical_completion_pct"):
        snapshot = {
            "pct": obj.latest_physical_completion_pct,
            "disbursement": obj.latest_financial_disbursement_naira,
            "date": obj.latest_progress_date,
        }
    else:
        latest = obj.progress_updates.order_by("-reporting_date", "-created_at").first()
        snapshot = {
            "pct": latest.physical_completion_pct if latest else None,
            "disbursement": latest.financial_disbursement_naira if latest else None,
            "date": latest.reporting_date if latest else None,
        }

    obj._progress_snapshot = snapshot
    return snapshot


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
    latest_physical_completion_pct = serializers.SerializerMethodField()
    latest_financial_disbursement_naira = serializers.SerializerMethodField()
    budget_disbursement_pct = serializers.SerializerMethodField()
    latest_progress_date = serializers.SerializerMethodField()
    performance_status = serializers.SerializerMethodField()

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
            "external_link",
            "climate_risk_relevance",
            "location_notes",
            "sdg_goals",
            "ndc_linkage_reference",
            "created_by",
            "created_by_name",
            "is_active",
            "created_at",
            "updated_at",
            "latest_physical_completion_pct",
            "latest_financial_disbursement_naira",
            "budget_disbursement_pct",
            "latest_progress_date",
            "performance_status",
        ]

    def get_latest_physical_completion_pct(self, obj):
        return _progress_snapshot(obj)["pct"]

    def get_latest_financial_disbursement_naira(self, obj):
        return _progress_snapshot(obj)["disbursement"]

    def get_latest_progress_date(self, obj):
        return _progress_snapshot(obj)["date"]

    def get_budget_disbursement_pct(self, obj):
        disbursement = _progress_snapshot(obj)["disbursement"]

        if disbursement is None or not obj.estimated_budget_naira:
            return None

        return round(float(disbursement) / float(obj.estimated_budget_naira) * 100, 2)

    def get_performance_status(self, obj):
        snapshot = _progress_snapshot(obj)

        return compute_performance_status(
            status=obj.status,
            start_date=obj.start_date,
            end_date=obj.end_date,
            latest_physical_completion_pct=snapshot["pct"],
            today=date.today(),
        )

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
            "external_link",
            "climate_risk_relevance",
            "location_notes",
            "sdg_goals",
            "ndc_linkage_reference",
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

    def validate_external_link(self, value):
        value = str(value or "").strip()

        return value or None

    def validate_sdg_goals(self, value):
        if value in (None, ""):
            return []

        if not isinstance(value, list):
            raise serializers.ValidationError("SDG goals must be a list of integers.")

        goals = []
        for item in value:
            try:
                goal = int(item)
            except (TypeError, ValueError):
                raise serializers.ValidationError(
                    f"Invalid SDG goal value: {item!r}. Must be an integer 1-17."
                )

            if goal not in VALID_SDG_GOALS:
                raise serializers.ValidationError(
                    f"Invalid SDG goal: {goal}. Must be between 1 and 17."
                )

            if goal not in goals:
                goals.append(goal)

        return sorted(goals)

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


class ProjectProgressUpdateSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ProjectProgressUpdate
        fields = [
            "id",
            "project",
            "reporting_date",
            "physical_completion_pct",
            "financial_disbursement_naira",
            "progress_notes",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["project", "created_by"]

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return ""

        return (
            getattr(obj.created_by, "full_name", "")
            or getattr(obj.created_by, "email", "")
            or str(obj.created_by)
        )

    def validate_physical_completion_pct(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError(
                "Physical completion must be between 0 and 100."
            )

        return value

    def validate_financial_disbursement_naira(self, value):
        if value < 0:
            raise serializers.ValidationError(
                "Financial disbursement cannot be negative."
            )

        return value