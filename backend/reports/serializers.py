from rest_framework import serializers

from .models import ReportDocument


class ReportDocumentSerializer(serializers.ModelSerializer):
    report_type_display = serializers.CharField(
        source="get_report_type_display",
        read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )
    generated_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = ReportDocument
        fields = [
            "id",
            "title",
            "report_type",
            "report_type_display",
            "status",
            "status_display",
            "reporting_year",
            "description",
            "file",
            "file_url",
            "source_module",
            "generated_by",
            "generated_by_name",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "is_public",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]

    def get_generated_by_name(self, obj):
        if not obj.generated_by:
            return ""

        return (
            getattr(obj.generated_by, "full_name", "")
            or getattr(obj.generated_by, "email", "")
            or str(obj.generated_by)
        )

    def get_approved_by_name(self, obj):
        if not obj.approved_by:
            return ""

        return (
            getattr(obj.approved_by, "full_name", "")
            or getattr(obj.approved_by, "email", "")
            or str(obj.approved_by)
        )

    def get_file_url(self, obj):
        if not obj.file:
            return ""

        request = self.context.get("request")

        if request:
            return request.build_absolute_uri(obj.file.url)

        return obj.file.url


class ReportDocumentCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportDocument
        fields = [
            "title",
            "report_type",
            "status",
            "reporting_year",
            "description",
            "file",
            "source_module",
            "approved_by",
            "approved_at",
            "is_public",
            "is_active",
            "notes",
        ]

    def validate_reporting_year(self, value):
        if value is not None and value < 1990:
            raise serializers.ValidationError("Reporting year is too old.")

        return value