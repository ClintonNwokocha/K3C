from pathlib import Path

from rest_framework import serializers

from .models import ReportDocument


MAX_REPORT_FILE_SIZE_MB = 25
MAX_REPORT_FILE_SIZE_BYTES = MAX_REPORT_FILE_SIZE_MB * 1024 * 1024

ALLOWED_REPORT_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".csv",
    ".txt",
    ".png",
    ".jpg",
    ".jpeg",
}


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

    def validate_title(self, value):
        value = str(value or "").strip()

        if not value:
            raise serializers.ValidationError("Report title is required.")

        if len(value) < 3:
            raise serializers.ValidationError(
                "Report title must be at least 3 characters."
            )

        return value

    def validate_reporting_year(self, value):
        if value is not None and value < 1990:
            raise serializers.ValidationError("Reporting year is too old.")

        if value is not None and value > 2100:
            raise serializers.ValidationError("Reporting year is too far in the future.")

        return value

    def validate_file(self, value):
        if not value:
            return value

        file_size = getattr(value, "size", 0)

        if file_size > MAX_REPORT_FILE_SIZE_BYTES:
            raise serializers.ValidationError(
                f"File is too large. Maximum allowed size is {MAX_REPORT_FILE_SIZE_MB}MB."
            )

        extension = Path(value.name).suffix.lower()

        if extension not in ALLOWED_REPORT_EXTENSIONS:
            allowed = ", ".join(sorted(ALLOWED_REPORT_EXTENSIONS))
            raise serializers.ValidationError(
                f"Unsupported file type '{extension}'. Allowed types: {allowed}."
            )

        return value