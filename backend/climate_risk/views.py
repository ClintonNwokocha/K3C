import csv
import io
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Avg, Count, Max, Min
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import UserProfile
from audit.utils import log_audit_action
from core.models import LGARegistry
from .models import (
    ClimateRiskDatasetUpload,
    ClimateRiskParameterRecord,
    ClimateRiskProfile,
)
from .serializers import (
    ClimateRiskDatasetUploadSerializer,
    ClimateRiskParameterRecordCreateUpdateSerializer,
    ClimateRiskParameterRecordSerializer,
    ClimateRiskProfileSerializer,
    ClimateRiskProfileUpdateSerializer,
)


SCORE_IMPORT_CONFIG = {
    "flood_scores": {
        "category": "flood",
        "score_column": "flood_score",
        "profile_field": "flood_risk_score",
    },
    "drought_scores": {
        "category": "drought",
        "score_column": "drought_score",
        "profile_field": "drought_risk_score",
    },
    "heat_scores": {
        "category": "heat",
        "score_column": "heat_score",
        "profile_field": "heat_risk_score",
    },
    "erosion_scores": {
        "category": "erosion",
        "score_column": "erosion_score",
        "profile_field": "erosion_risk_score",
    },
    "exposure_scores": {
        "category": "exposure",
        "score_column": "exposure_score",
        "profile_field": "exposure_score",
    },
    "vulnerability_scores": {
        "category": "vulnerability",
        "score_column": "vulnerability_score",
        "profile_field": "vulnerability_score",
    },
    "adaptive_capacity_scores": {
        "category": "adaptive_capacity",
        "score_column": "adaptive_capacity_score",
        "profile_field": "adaptive_capacity_score",
    },
}


CATEGORY_TO_PROFILE_FIELD = {
    "flood": "flood_risk_score",
    "drought": "drought_risk_score",
    "heat": "heat_risk_score",
    "erosion": "erosion_risk_score",
    "exposure": "exposure_score",
    "vulnerability": "vulnerability_score",
    "adaptive_capacity": "adaptive_capacity_score",
}

LOWER_VALUE_MEANS_HIGHER_RISK = {
    # Drought indicators
    "rainfall_anomaly",
    "ndvi",
    "mean_ndvi",
    "vegetation_condition_index",

    # Vulnerability indicators where higher access means lower vulnerability
    "access_to_services_index",
    "service_access_index",
}

COMMON_IGNORED_COLUMNS = {
    "lga_id",
    "lga",
    "LGA_ID",
    "lga_name",
    "lganame",
    "LGA_NAME",
    "LGANAME",
    "lga_code",
    "lgacode",
    "LGA_CODE",
    "LGACODE",
    "year",
    "data_source",
    "notes",
    "risk_class",
    "dominant_hazard",
}


KADUNA_LGA_CODE_TO_NAME = {
    "19001": "Birnin Gwari",
    "19002": "Chikun",
    "19003": "Giwa",
    "19004": "Igabi",
    "19005": "Ikara",
    "19006": "Jaba",
    "19007": "Jema'a",
    "19008": "Kachia",
    "19009": "Kaduna North",
    "19010": "Kaduna South",
    "19011": "Kagarko",
    "19012": "Kajuru",
    "19013": "Kaura",
    "19014": "Kauru",
    "19015": "Kubau",
    "19016": "Kudan",
    "19017": "Lere",
    "19018": "Makarfi",
    "19019": "Sabon Gari",
    "19020": "Sanga",
    "19021": "Soba",
    "19022": "Zangon Kataf",
    "19023": "Zaria",
}


def safe_float(value):
    if value is None:
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return value


def get_user_profile(user):
    return getattr(user, "profile", None)


def can_manage_climate_risk(user):
    if user.is_superuser:
        return True

    profile = get_user_profile(user)

    return bool(
        profile
        and profile.role in [
            UserProfile.Role.ADMIN,
            UserProfile.Role.ANALYST,
        ]
    )


def decimal_from_value(value):
    if value is None:
        return None

    text = str(value).strip()

    if text == "":
        return None

    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def validate_score(value, field_name, row_number, errors):
    score = decimal_from_value(value)

    if score is None:
        errors.append({
            "row": row_number,
            "field": field_name,
            "error": "Score is missing or not numeric.",
        })
        return None

    if score < 0 or score > 100:
        errors.append({
            "row": row_number,
            "field": field_name,
            "error": "Score must be between 0 and 100.",
        })
        return None

    return score


def normalize_lga_name(value):
    return (
        str(value or "")
        .strip()
        .lower()
        .replace("’", "'")
        .replace("`", "'")
        .replace("ʻ", "'")
        .replace("-", " ")
        .replace("_", " ")
    )


def get_row_value(row, possible_keys):
    for key in possible_keys:
        value = row.get(key)

        if value is not None and str(value).strip() != "":
            return str(value).strip()

    return ""


def get_lga_from_row(row, row_number, errors):
    """
    Match uploaded GIS/CSV records to LGARegistry.

    Supported identifiers:
    - lga_id / lga / LGA_ID
    - lga_name / lganame / LGA_NAME / LGANAME
    - lga_code / lgacode / LGA_CODE / LGACODE
    """

    lga_id = get_row_value(row, ["lga_id", "lga", "LGA_ID"])

    if lga_id:
        try:
            return LGARegistry.objects.get(lga_id=int(lga_id))
        except (ValueError, LGARegistry.DoesNotExist):
            errors.append({
                "row": row_number,
                "field": "lga_id",
                "error": f"Invalid lga_id: {lga_id}.",
            })
            return None

    lga_name = get_row_value(
        row,
        [
            "lga_name",
            "lganame",
            "LGA_NAME",
            "LGANAME",
            "LGAName",
            "name",
            "NAME",
        ],
    )

    if lga_name:
        normalized_input = normalize_lga_name(lga_name)

        for lga in LGARegistry.objects.all():
            if normalize_lga_name(lga.lga_name) == normalized_input:
                return lga

        errors.append({
            "row": row_number,
            "field": "lga_name",
            "error": f"Could not match LGA name: {lga_name}.",
        })
        return None

    lga_code = get_row_value(
        row,
        [
            "lga_code",
            "lgacode",
            "LGA_CODE",
            "LGACODE",
            "lgaCode",
            "LGACode",
        ],
    )

    if lga_code:
        code_as_text = str(lga_code).strip()

        if code_as_text.endswith(".0"):
            code_as_text = code_as_text[:-2]

        mapped_name = KADUNA_LGA_CODE_TO_NAME.get(code_as_text)

        if mapped_name:
            normalized_mapped_name = normalize_lga_name(mapped_name)

            for lga in LGARegistry.objects.all():
                if normalize_lga_name(lga.lga_name) == normalized_mapped_name:
                    return lga

        errors.append({
            "row": row_number,
            "field": "lga_code",
            "error": f"Could not match LGA code: {lga_code}.",
        })
        return None

    errors.append({
        "row": row_number,
        "field": "lga_identifier",
        "error": "Missing LGA identifier. Use one of: lga_id, lga_name, lganame, lga_code, lgacode.",
    })
    return None


def read_csv_rows(uploaded_file):
    raw_text = uploaded_file.read().decode("utf-8-sig")
    stream = io.StringIO(raw_text)
    reader = csv.DictReader(stream)
    return list(reader), reader.fieldnames or []


def label_from_key(key):
    return key.replace("_", " ").replace("-", " ").title()


def serialize_profile_for_audit(profile):
    return {
        "id": profile.id,
        "lga_id": profile.lga_id,
        "lga_name": profile.lga.lga_name if profile.lga else None,
        "year": profile.year,
        "flood_risk_score": safe_float(profile.flood_risk_score),
        "drought_risk_score": safe_float(profile.drought_risk_score),
        "heat_risk_score": safe_float(profile.heat_risk_score),
        "erosion_risk_score": safe_float(profile.erosion_risk_score),
        "exposure_score": safe_float(profile.exposure_score),
        "vulnerability_score": safe_float(profile.vulnerability_score),
        "adaptive_capacity_score": safe_float(profile.adaptive_capacity_score),
        "overall_risk_score": safe_float(profile.overall_risk_score),
        "risk_level": profile.risk_level,
        "dominant_hazard": profile.dominant_hazard,
        "notes": profile.notes,
        "data_source": profile.data_source,
        "is_active": profile.is_active,
    }

def should_invert_normalization(category, parameter_key):
    """
    Normal rule:
    - For most hazard/exposure/vulnerability indicators, higher raw value = higher risk.
    - For adaptive capacity, higher raw value = stronger capacity.
    - For selected indicators like rainfall anomaly and NDVI, lower raw value = higher risk.
    """

    if category == "adaptive_capacity":
        return False

    return parameter_key in LOWER_VALUE_MEANS_HIGHER_RISK


def calculate_min_max_score(raw_value, minimum_value, maximum_value, invert=False):
    """
    Convert a raw parameter value to a 0-100 score using min-max normalization.

    If invert=True:
    - lower raw value gets higher score.
    """

    raw_value = Decimal(raw_value)
    minimum_value = Decimal(minimum_value)
    maximum_value = Decimal(maximum_value)

    if maximum_value == minimum_value:
        return Decimal("50.00")

    score = ((raw_value - minimum_value) / (maximum_value - minimum_value)) * Decimal("100")

    if invert:
        score = Decimal("100") - score

    if score < 0:
        score = Decimal("0")

    if score > 100:
        score = Decimal("100")

    return round(score, 2)


def normalize_parameter_records(year, lga_id=None, request=None):
    """
    Generate normalized_score values from raw_value.

    Scope:
    - If lga_id is provided, update only that LGA.
    - But min/max is still calculated using all active LGAs for the same year,
      category, and parameter_key.
    """

    all_records = (
        ClimateRiskParameterRecord.objects
        .filter(
            year=year,
            is_active=True,
            raw_value__isnull=False,
        )
    )

    parameter_groups = (
        all_records
        .values("category", "parameter_key")
        .annotate(
            minimum_raw=Min("raw_value"),
            maximum_raw=Max("raw_value"),
            record_count=Count("id"),
        )
    )

    updated_records = []
    skipped_groups = []

    for group in parameter_groups:
        category = group["category"]
        parameter_key = group["parameter_key"]
        minimum_raw = group["minimum_raw"]
        maximum_raw = group["maximum_raw"]

        records_to_update = all_records.filter(
            category=category,
            parameter_key=parameter_key,
        )

        if lga_id:
            records_to_update = records_to_update.filter(lga_id=lga_id)

        if not records_to_update.exists():
            continue

        invert = should_invert_normalization(category, parameter_key)

        if minimum_raw is None or maximum_raw is None:
            skipped_groups.append({
                "category": category,
                "parameter_key": parameter_key,
                "reason": "Missing minimum or maximum raw value.",
            })
            continue

        for record in records_to_update:
            old_value = ClimateRiskParameterRecordSerializer(record).data

            record.normalized_score = calculate_min_max_score(
                raw_value=record.raw_value,
                minimum_value=minimum_raw,
                maximum_value=maximum_raw,
                invert=invert,
            )
            record.save(update_fields=["normalized_score", "updated_at"])

            if request:
                log_audit_action(
                    request=request,
                    action="normalized_climate_risk_parameter_record",
                    instance=record,
                    old_value=old_value,
                    new_value=ClimateRiskParameterRecordSerializer(record).data,
                )

            updated_records.append({
                "id": record.id,
                "lga_id": record.lga_id,
                "lga_name": record.lga.lga_name,
                "year": record.year,
                "category": record.category,
                "parameter_key": record.parameter_key,
                "raw_value": float(record.raw_value),
                "normalized_score": float(record.normalized_score),
                "minimum_raw": float(minimum_raw),
                "maximum_raw": float(maximum_raw),
                "inverted": invert,
            })

    return {
        "updated_records": updated_records,
        "skipped_groups": skipped_groups,
    }


def recalculate_profile_from_parameters(profile):
    """
    Recalculate category indexes from ClimateRiskParameterRecord.normalized_score.

    Raw values are stored as evidence. This function only uses normalized_score.
    """

    category_scores = (
        ClimateRiskParameterRecord.objects
        .filter(
            lga=profile.lga,
            year=profile.year,
            is_active=True,
            normalized_score__isnull=False,
        )
        .values("category")
        .annotate(score=Avg("normalized_score"))
    )

    updated_fields = []

    for row in category_scores:
        category = row["category"]
        score = row["score"]

        profile_field = CATEGORY_TO_PROFILE_FIELD.get(category)

        if not profile_field:
            continue

        setattr(profile, profile_field, score)
        updated_fields.append(profile_field)

    if updated_fields:
        profile.data_source = "Calculated from parameter normalized scores"
        profile.save()

    return {
        "profile": profile,
        "updated_fields": updated_fields,
        "category_count": len(updated_fields),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def climate_risk_profiles(request):
    year = request.query_params.get("year")
    risk_level = request.query_params.get("risk_level")

    profiles = (
        ClimateRiskProfile.objects
        .select_related("lga")
        .filter(is_active=True)
        .order_by("-overall_risk_score", "lga__lga_name")
    )

    if year:
        profiles = profiles.filter(year=year)

    if risk_level and risk_level != "all":
        profiles = profiles.filter(risk_level=risk_level)

    serializer = ClimateRiskProfileSerializer(profiles, many=True)

    available_years = (
        ClimateRiskProfile.objects
        .filter(is_active=True)
        .values_list("year", flat=True)
        .distinct()
        .order_by("-year")
    )

    total_lgas = profiles.count()
    average_overall = (
        profiles.aggregate(value=Avg("overall_risk_score")).get("value")
        or Decimal("0")
    )
    highest_score = (
        profiles.aggregate(value=Max("overall_risk_score")).get("value")
        or Decimal("0")
    )

    risk_counts_raw = (
        profiles
        .values("risk_level")
        .annotate(count=Count("id"))
        .order_by("risk_level")
    )

    risk_counts = {
        "low": 0,
        "moderate": 0,
        "high": 0,
        "very_high": 0,
    }

    for row in risk_counts_raw:
        risk_counts[row["risk_level"]] = row["count"]

    return Response({
        "status": "ok",
        "message": "Climate risk profiles loaded.",
        "filters": {
            "year": year,
            "risk_level": risk_level or "all",
        },
        "available_years": list(available_years),
        "summary": {
            "total_lgas": total_lgas,
            "average_overall_risk": float(average_overall),
            "highest_overall_risk": float(highest_score),
            "risk_counts": risk_counts,
            "high_or_very_high_count": risk_counts["high"] + risk_counts["very_high"],
        },
        "top_lgas": serializer.data[:5],
        "results": serializer.data,
    })


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_climate_risk_profile(request, profile_id):
    if not can_manage_climate_risk(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can update climate risk profiles."},
            status=status.HTTP_403_FORBIDDEN,
        )

    profile = get_object_or_404(
        ClimateRiskProfile.objects.select_related("lga"),
        id=profile_id,
    )

    old_value = serialize_profile_for_audit(profile)

    serializer = ClimateRiskProfileUpdateSerializer(
        profile,
        data=request.data,
        partial=True,
    )
    serializer.is_valid(raise_exception=True)
    updated_profile = serializer.save()

    log_audit_action(
        request=request,
        action="updated_climate_risk_profile",
        instance=updated_profile,
        old_value=old_value,
        new_value=serialize_profile_for_audit(updated_profile),
    )

    return Response({
        "message": "Climate risk profile updated successfully.",
        "profile": ClimateRiskProfileSerializer(updated_profile).data,
    })


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def climate_risk_parameter_records(request):
    if request.method == "GET":
        year = request.query_params.get("year")
        lga = request.query_params.get("lga")
        category = request.query_params.get("category")

        records = (
            ClimateRiskParameterRecord.objects
            .select_related("lga")
            .filter(is_active=True)
            .order_by("lga__lga_name", "category", "parameter_label")
        )

        if year:
            records = records.filter(year=year)

        if lga:
            records = records.filter(lga_id=lga)

        if category and category != "all":
            records = records.filter(category=category)

        return Response({
            "status": "ok",
            "message": "Climate risk parameter records loaded.",
            "count": records.count(),
            "results": ClimateRiskParameterRecordSerializer(records, many=True).data,
        })

    if not can_manage_climate_risk(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can create climate risk parameter records."},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = ClimateRiskParameterRecordCreateUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    record = serializer.save()

    log_audit_action(
        request=request,
        action="created_climate_risk_parameter_record",
        instance=record,
        old_value=None,
        new_value=ClimateRiskParameterRecordSerializer(record).data,
    )

    return Response(
        {
            "message": "Climate risk parameter record created successfully.",
            "record": ClimateRiskParameterRecordSerializer(record).data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_climate_risk_parameter_record(request, record_id):
    if not can_manage_climate_risk(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can update climate risk parameter records."},
            status=status.HTTP_403_FORBIDDEN,
        )

    record = get_object_or_404(
        ClimateRiskParameterRecord.objects.select_related("lga"),
        id=record_id,
    )

    old_value = ClimateRiskParameterRecordSerializer(record).data

    serializer = ClimateRiskParameterRecordCreateUpdateSerializer(
        record,
        data=request.data,
        partial=True,
    )
    serializer.is_valid(raise_exception=True)
    updated_record = serializer.save()

    log_audit_action(
        request=request,
        action="updated_climate_risk_parameter_record",
        instance=updated_record,
        old_value=old_value,
        new_value=ClimateRiskParameterRecordSerializer(updated_record).data,
    )

    return Response({
        "message": "Climate risk parameter record updated successfully.",
        "record": ClimateRiskParameterRecordSerializer(updated_record).data,
    })


def import_score_csv(upload_record, rows, fieldnames, request):
    config = SCORE_IMPORT_CONFIG[upload_record.dataset_type]
    category = config["category"]
    score_column = config["score_column"]
    profile_field = config["profile_field"]

    errors = []
    imported_count = 0
    year = upload_record.year

    identifier_columns = {
        "lga_id",
        "lga",
        "LGA_ID",
        "lga_name",
        "lganame",
        "LGA_NAME",
        "LGANAME",
        "lga_code",
        "lgacode",
        "LGA_CODE",
        "LGACODE",
    }

    if not identifier_columns.intersection(set(fieldnames)):
        errors.append({
            "row": 0,
            "field": "lga_identifier",
            "error": "CSV must include one LGA identifier column: lga_id, lga_name, lganame, lga_code, or lgacode.",
        })
        return 0, len(rows), errors

    if score_column not in fieldnames:
        errors.append({
            "row": 0,
            "field": score_column,
            "error": f"CSV must include {score_column} column.",
        })
        return 0, len(rows), errors

    for index, row in enumerate(rows, start=2):
        lga = get_lga_from_row(row, index, errors)

        if not lga:
            continue

        row_year = row.get("year") or year

        try:
            row_year = int(row_year)
        except ValueError:
            errors.append({
                "row": index,
                "field": "year",
                "error": f"Invalid year: {row_year}.",
            })
            continue

        score = validate_score(row.get(score_column), score_column, index, errors)

        if score is None:
            continue

        profile, _ = ClimateRiskProfile.objects.get_or_create(
            lga=lga,
            year=row_year,
            defaults={
                "data_source": upload_record.original_filename,
            },
        )

        old_value = serialize_profile_for_audit(profile)

        setattr(profile, profile_field, score)
        profile.data_source = upload_record.original_filename
        profile.save()

        log_audit_action(
            request=request,
            action=f"imported_{upload_record.dataset_type}",
            instance=profile,
            old_value=old_value,
            new_value=serialize_profile_for_audit(profile),
        )

        ignored_columns = set(COMMON_IGNORED_COLUMNS)
        ignored_columns.add(score_column)

        for key, value in row.items():
            if key in ignored_columns:
                continue

            raw_value = decimal_from_value(value)

            if raw_value is None:
                continue

            ClimateRiskParameterRecord.objects.update_or_create(
                lga=lga,
                year=row_year,
                category=category,
                parameter_key=key,
                defaults={
                    "parameter_label": label_from_key(key),
                    "raw_value": raw_value,
                    "unit": "",
                    "normalized_score": None,
                    "data_source": upload_record.original_filename,
                    "notes": f"Imported from {upload_record.original_filename}",
                    "is_active": True,
                },
            )

        imported_count += 1

    return imported_count, len(rows) - imported_count, errors


def import_parameter_records_csv(upload_record, rows, fieldnames, request):
    required_columns = {
        "category",
        "parameter_key",
        "parameter_label",
        "raw_value",
    }

    errors = []
    imported_count = 0

    missing_columns = required_columns - set(fieldnames)

    identifier_columns = {
        "lga_id",
        "lga",
        "LGA_ID",
        "lga_name",
        "lganame",
        "LGA_NAME",
        "LGANAME",
        "lga_code",
        "lgacode",
        "LGA_CODE",
        "LGACODE",
    }

    if not identifier_columns.intersection(set(fieldnames)):
        errors.append({
            "row": 0,
            "field": "lga_identifier",
            "error": "CSV must include one LGA identifier column: lga_id, lga_name, lganame, lga_code, or lgacode.",
        })
        return 0, len(rows), errors

    if missing_columns:
        errors.append({
            "row": 0,
            "field": "columns",
            "error": f"Missing required columns: {', '.join(sorted(missing_columns))}.",
        })
        return 0, len(rows), errors

    valid_categories = {
        choice[0] for choice in ClimateRiskParameterRecord.Category.choices
    }

    for index, row in enumerate(rows, start=2):
        lga = get_lga_from_row(row, index, errors)

        if not lga:
            continue

        row_year = row.get("year") or upload_record.year

        try:
            row_year = int(row_year)
        except ValueError:
            errors.append({
                "row": index,
                "field": "year",
                "error": f"Invalid year: {row_year}.",
            })
            continue

        category = str(row.get("category", "")).strip()

        if category not in valid_categories:
            errors.append({
                "row": index,
                "field": "category",
                "error": f"Invalid category: {category}.",
            })
            continue

        raw_value = decimal_from_value(row.get("raw_value"))

        if raw_value is None:
            errors.append({
                "row": index,
                "field": "raw_value",
                "error": "Raw value must be numeric.",
            })
            continue

        normalized_score = None

        if row.get("normalized_score") not in [None, ""]:
            normalized_score = validate_score(
                row.get("normalized_score"),
                "normalized_score",
                index,
                errors,
            )

            if normalized_score is None:
                continue

        record, created = ClimateRiskParameterRecord.objects.update_or_create(
            lga=lga,
            year=row_year,
            category=category,
            parameter_key=row.get("parameter_key"),
            defaults={
                "parameter_label": row.get("parameter_label"),
                "raw_value": raw_value,
                "unit": row.get("unit", ""),
                "normalized_score": normalized_score,
                "data_source": row.get("data_source") or upload_record.original_filename,
                "notes": row.get("notes", ""),
                "is_active": True,
            },
        )

        log_audit_action(
            request=request,
            action=(
                "created_climate_risk_parameter_record_import"
                if created
                else "updated_climate_risk_parameter_record_import"
            ),
            instance=record,
            old_value=None,
            new_value=ClimateRiskParameterRecordSerializer(record).data,
        )

        imported_count += 1

    return imported_count, len(rows) - imported_count, errors


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def climate_risk_dataset_uploads(request):
    if request.method == "GET":
        uploads = ClimateRiskDatasetUpload.objects.select_related("uploaded_by").all()

        return Response({
            "status": "ok",
            "message": "Climate risk dataset uploads loaded.",
            "results": ClimateRiskDatasetUploadSerializer(uploads, many=True).data,
        })

    if not can_manage_climate_risk(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can upload climate risk datasets."},
            status=status.HTTP_403_FORBIDDEN,
        )

    dataset_type = request.data.get("dataset_type")
    year = request.data.get("year") or 2025
    uploaded_file = request.FILES.get("file")

    valid_dataset_types = {
        choice[0] for choice in ClimateRiskDatasetUpload.DatasetType.choices
    }

    if dataset_type not in valid_dataset_types:
        return Response(
            {"detail": "Invalid dataset type."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not uploaded_file:
        return Response(
            {"detail": "CSV file is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not uploaded_file.name.lower().endswith(".csv"):
        return Response(
            {"detail": "Only CSV files are supported in this import endpoint."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        year = int(year)
    except ValueError:
        return Response(
            {"detail": "Year must be a valid number."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    upload_record = ClimateRiskDatasetUpload.objects.create(
        dataset_type=dataset_type,
        year=year,
        original_filename=uploaded_file.name,
        uploaded_by=request.user,
        status=ClimateRiskDatasetUpload.Status.PROCESSING,
    )

    try:
        rows, fieldnames = read_csv_rows(uploaded_file)

        with transaction.atomic():
            if dataset_type in SCORE_IMPORT_CONFIG:
                imported_count, failed_count, errors = import_score_csv(
                    upload_record=upload_record,
                    rows=rows,
                    fieldnames=fieldnames,
                    request=request,
                )
            elif dataset_type == ClimateRiskDatasetUpload.DatasetType.PARAMETER_RECORDS:
                imported_count, failed_count, errors = import_parameter_records_csv(
                    upload_record=upload_record,
                    rows=rows,
                    fieldnames=fieldnames,
                    request=request,
                )
            else:
                imported_count = 0
                failed_count = len(rows)
                errors = [{
                    "row": 0,
                    "field": "dataset_type",
                    "error": "This dataset type is not yet supported by the importer.",
                }]

        if imported_count == 0 and errors:
            upload_record.status = ClimateRiskDatasetUpload.Status.FAILED
        elif errors:
            upload_record.status = ClimateRiskDatasetUpload.Status.COMPLETED_WITH_ERRORS
        else:
            upload_record.status = ClimateRiskDatasetUpload.Status.COMPLETED

        upload_record.row_count = len(rows)
        upload_record.imported_count = imported_count
        upload_record.failed_count = failed_count
        upload_record.validation_errors = errors
        upload_record.summary = {
            "columns": fieldnames,
            "dataset_type": dataset_type,
            "year": year,
        }
        upload_record.save()

    except Exception as exc:
        upload_record.status = ClimateRiskDatasetUpload.Status.FAILED
        upload_record.validation_errors = [{
            "row": 0,
            "field": "file",
            "error": str(exc),
        }]
        upload_record.save()

        return Response(
            {
                "detail": "Import failed.",
                "upload": ClimateRiskDatasetUploadSerializer(upload_record).data,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response({
        "message": "Dataset upload processed.",
        "upload": ClimateRiskDatasetUploadSerializer(upload_record).data,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def recalculate_climate_risk_scores(request):
    if not can_manage_climate_risk(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can recalculate climate risk scores."},
            status=status.HTTP_403_FORBIDDEN,
        )

    year = request.data.get("year")
    lga_id = request.data.get("lga")

    if not year:
        return Response(
            {"detail": "Year is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        year = int(year)
    except ValueError:
        return Response(
            {"detail": "Year must be a valid number."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    profiles = (
        ClimateRiskProfile.objects
        .select_related("lga")
        .filter(year=year, is_active=True)
    )

    if lga_id:
        profiles = profiles.filter(lga_id=lga_id)

    updated_profiles = []
    skipped_profiles = []

    for profile in profiles:
        old_value = serialize_profile_for_audit(profile)

        result = recalculate_profile_from_parameters(profile)

        if result["updated_fields"]:
            updated_profile = result["profile"]

            log_audit_action(
                request=request,
                action="recalculated_climate_risk_scores",
                instance=updated_profile,
                old_value=old_value,
                new_value=serialize_profile_for_audit(updated_profile),
            )

            updated_profiles.append({
                "id": updated_profile.id,
                "lga_id": updated_profile.lga_id,
                "lga_name": updated_profile.lga.lga_name,
                "year": updated_profile.year,
                "updated_fields": result["updated_fields"],
                "overall_risk_score": float(updated_profile.overall_risk_score),
                "risk_level": updated_profile.risk_level,
                "dominant_hazard": updated_profile.dominant_hazard,
            })
        else:
            skipped_profiles.append({
                "id": profile.id,
                "lga_id": profile.lga_id,
                "lga_name": profile.lga.lga_name,
                "year": profile.year,
                "reason": "No active parameter records with normalized_score found.",
            })

    return Response({
        "message": "Climate risk scores recalculated.",
        "year": year,
        "updated_count": len(updated_profiles),
        "skipped_count": len(skipped_profiles),
        "updated_profiles": updated_profiles,
        "skipped_profiles": skipped_profiles,
    })

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def normalize_climate_risk_parameters(request):
    if not can_manage_climate_risk(request.user):
        return Response(
            {"detail": "Only Admin and Analyst users can normalize climate risk parameters."},
            status=status.HTTP_403_FORBIDDEN,
        )

    year = request.data.get("year")
    lga_id = request.data.get("lga")

    if not year:
        return Response(
            {"detail": "Year is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        year = int(year)
    except ValueError:
        return Response(
            {"detail": "Year must be a valid number."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    result = normalize_parameter_records(
        year=year,
        lga_id=lga_id,
        request=request,
    )

    return Response({
        "message": "Climate risk parameter records normalized.",
        "year": year,
        "updated_count": len(result["updated_records"]),
        "skipped_count": len(result["skipped_groups"]),
        "updated_records": result["updated_records"],
        "skipped_groups": result["skipped_groups"],
    })