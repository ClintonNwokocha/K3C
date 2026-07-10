import logging
from decimal import Decimal

from django.conf import settings
from django.db.models import Avg, Count, Max, Sum
from django.http import HttpResponse

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

logger = logging.getLogger(__name__)

from climate_risk.models import ClimateRiskProfile
from projects.models import ClimateProject
from reports.models import ReportDocument

try:
    from foundation.models import NDCConstant
except Exception:
    NDCConstant = None


def decimal_to_float(value):
    if value is None:
        return 0

    if isinstance(value, Decimal):
        return float(value)

    return float(value or 0)


def get_lga_name(profile):
    if not profile or not profile.lga:
        return ""

    return getattr(profile.lga, "lga_name", "") or str(profile.lga)


def get_public_file_url(request, report):
    if not report.file:
        return ""

    return request.build_absolute_uri(report.file.url)

def decimal_to_float_or_none(value):
    if value is None or value == "":
        return None

    return decimal_to_float(value)


def get_project_image_url(request, project):
    if not getattr(project, "project_image", None):
        return ""

    return request.build_absolute_uri(project.project_image.url)


def build_public_climate_summary():
    latest_year = ClimateRiskProfile.objects.aggregate(
        value=Max("year")
    ).get("value")

    profiles = ClimateRiskProfile.objects.all()

    if latest_year:
        profiles = profiles.filter(year=latest_year)

    total_lgas = profiles.count()

    high_or_very_high_lgas = profiles.filter(
        risk_level__in=["high", "very_high"]
    ).count()

    average_risk = profiles.aggregate(
        value=Avg("overall_risk_score")
    ).get("value") or 0

    highest_risk = profiles.aggregate(
        value=Max("overall_risk_score")
    ).get("value") or 0

    top_lgas = []

    for profile in profiles.order_by("-overall_risk_score")[:5]:
      top_lgas.append({
          "id": profile.id,
          "lga": profile.lga_id,
          "lga_name": get_lga_name(profile),
          "year": profile.year,
          "overall_risk_score": decimal_to_float(profile.overall_risk_score),
          "risk_level": profile.risk_level,
          "risk_level_display": profile.get_risk_level_display(),
          "flood_risk_score": decimal_to_float(profile.flood_risk_score),
          "drought_risk_score": decimal_to_float(profile.drought_risk_score),
          "heat_risk_score": decimal_to_float(profile.heat_risk_score),
          "erosion_risk_score": decimal_to_float(profile.erosion_risk_score),
          "vulnerability_score": decimal_to_float(profile.vulnerability_score),
          "adaptive_capacity_score": decimal_to_float(
              profile.adaptive_capacity_score
          ),
      })

    return {
        "latest_year": latest_year,
        "total_lgas": total_lgas,
        "high_or_very_high_lgas": high_or_very_high_lgas,
        "average_risk": decimal_to_float(average_risk),
        "highest_risk": decimal_to_float(highest_risk),
        "top_lgas": top_lgas,
    }


def build_public_project_summary(request):
    projects = ClimateProject.objects.filter(is_active=True)

    total_projects = projects.count()

    total_ghg_reduction = projects.aggregate(
        value=Sum("expected_ghg_reduction_tco2e")
    ).get("value") or Decimal("0.000")

    total_beneficiaries = projects.aggregate(
        value=Sum("expected_beneficiaries")
    ).get("value") or 0

    by_status = {
        key: 0 for key, _label in ClimateProject.Status.choices
    }

    for row in projects.values("status").annotate(count=Count("id")):
        by_status[row["status"]] = row["count"]

    by_type = {
        key: 0 for key, _label in ClimateProject.ProjectType.choices
    }

    for row in projects.values("project_type").annotate(count=Count("id")):
        by_type[row["project_type"]] = row["count"]

    priority_rank = {
        "very_high": 4,
        "high": 3,
        "medium": 2,
        "low": 1,
    }

    sorted_projects = sorted(
        projects.select_related("lga")[:100],
        key=lambda project: (
            priority_rank.get(project.priority, 0),
            project.expected_ghg_reduction_tco2e,
        ),
        reverse=True,
    )

    def serialize_public_project(project):
        return {
            "id": project.id,
            "title": project.title,
            "project_code": project.project_code,
            "project_type": project.project_type,
            "project_type_display": project.get_project_type_display(),
            "sector": project.sector,
            "sector_display": project.get_sector_display(),
            "status": project.status,
            "status_display": project.get_status_display(),
            "priority": project.priority,
            "priority_display": project.get_priority_display(),
            "lga": project.lga_id,
            "lga_name": getattr(project.lga, "lga_name", "") if project.lga else "",
            "latitude": decimal_to_float_or_none(project.latitude),
            "longitude": decimal_to_float_or_none(project.longitude),
            "project_image_url": get_project_image_url(request, project),
            "public_summary": project.public_summary or "",
            "public_description": project.public_description or "",
            "funding_source": project.funding_source or "Not specified",
            "expected_ghg_reduction_tco2e": decimal_to_float(
                project.expected_ghg_reduction_tco2e
            ),
            "expected_beneficiaries": project.expected_beneficiaries,
        }

    public_projects = [
        serialize_public_project(project) for project in sorted_projects
    ]

    return {
        "total_projects": total_projects,
        "total_expected_ghg_reduction_tco2e": decimal_to_float(
            total_ghg_reduction
        ),
        "total_expected_beneficiaries": total_beneficiaries,
        "by_status": by_status,
        "by_type": by_type,
        "top_projects": public_projects[:5],
        "public_projects": public_projects,
    }


def build_public_ghg_summary():
    constants = None

    if NDCConstant is not None:
        try:
            constants = NDCConstant.objects.order_by("-id").first()
        except Exception:
            constants = None

    kaduna_baseline_mt = (
        getattr(constants, "kaduna_baseline_mt", None)
        or Decimal("13.3")
    )

    nigeria_baseline_mt = (
        getattr(constants, "nigeria_baseline_mt", None)
        or Decimal("317")
    )

    kaduna_share_pct = (
        getattr(constants, "kaduna_share_pct", None)
        or Decimal("4.2")
    )

    target_year = getattr(constants, "target_year", None) or 2030

    unconditional_pct = (
        getattr(constants, "unconditional_pct", None)
        or Decimal("47")
    )

    conditional_pct = (
        getattr(constants, "conditional_pct", None)
        or Decimal("50")
    )

    return {
        "baseline_label": "Kaduna State GHG baseline",
        "baseline_reference": "NDC reference baseline",
        "baseline_emissions_mtco2e": decimal_to_float(kaduna_baseline_mt),
        "baseline_emissions_tco2e": decimal_to_float(kaduna_baseline_mt) * 1000000,
        "nigeria_baseline_mtco2e": decimal_to_float(nigeria_baseline_mt),
        "kaduna_share_pct": decimal_to_float(kaduna_share_pct),
        "target_year": target_year,
        "unconditional_reduction_target_pct": decimal_to_float(unconditional_pct),
        "conditional_reduction_target_pct": decimal_to_float(conditional_pct),
    }

def build_public_reports_summary(request):
    reports = ReportDocument.objects.filter(
        is_active=True,
        is_public=True,
        status=ReportDocument.Status.PUBLISHED,
    )

    by_type = {
        key: 0 for key, _label in ReportDocument.ReportType.choices
    }

    for row in reports.values("report_type").annotate(count=Count("id")):
        by_type[row["report_type"]] = row["count"]

    recent_reports = []

    report_type_labels = dict(ReportDocument.ReportType.choices)

    for report in reports.order_by("-created_at")[:5]:
        recent_reports.append({
            "id": report.id,
            "title": report.title,
            "report_type": report.report_type,
            "report_type_display": report_type_labels.get(
                report.report_type,
                report.report_type,
            ),
            "reporting_year": report.reporting_year,
            "description": report.description,
            "source_module": report.source_module,
            "file_url": get_public_file_url(request, report),
            "created_at": report.created_at,
        })

    return {
        "total_public_reports": reports.count(),
        "by_type": by_type,
        "recent_reports": recent_reports,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def public_portal_summary(request):
    return Response({
        "status": "ok",
        "message": "Public portal summary loaded.",
        "summary": {
            "climate_risk": build_public_climate_summary(),
            "ghg_inventory": build_public_ghg_summary(),
            "projects": build_public_project_summary(request),
            "reports": build_public_reports_summary(request),
        },
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def public_climate_risk_profiles(request):
    year = request.query_params.get("year")

    latest_year = ClimateRiskProfile.objects.aggregate(
        value=Max("year")
    ).get("value")

    profiles = ClimateRiskProfile.objects.select_related("lga").all()

    if year:
        profiles = profiles.filter(year=year)
    elif latest_year:
        profiles = profiles.filter(year=latest_year)

    profiles = profiles.order_by("lga__lga_name")

    results = []

    for profile in profiles:
        results.append({
            "id": profile.id,
            "lga": profile.lga_id,
            "lga_name": get_lga_name(profile),
            "year": profile.year,
            "overall_risk_score": decimal_to_float(profile.overall_risk_score),
            "risk_level": profile.risk_level,
            "risk_level_display": profile.get_risk_level_display(),
            "flood_risk_score": decimal_to_float(profile.flood_risk_score),
            "drought_risk_score": decimal_to_float(profile.drought_risk_score),
            "heat_risk_score": decimal_to_float(profile.heat_risk_score),
            "erosion_risk_score": decimal_to_float(profile.erosion_risk_score),
            "exposure_score": decimal_to_float(profile.exposure_score),
            "vulnerability_score": decimal_to_float(profile.vulnerability_score),
            "adaptive_capacity_score": decimal_to_float(
                profile.adaptive_capacity_score
            ),
        })

    risk_counts = {
        "low": profiles.filter(risk_level="low").count(),
        "moderate": profiles.filter(risk_level="moderate").count(),
        "high": profiles.filter(risk_level="high").count(),
        "very_high": profiles.filter(risk_level="very_high").count(),
    }

    return Response({
        "status": "ok",
        "message": "Public climate risk profiles loaded.",
        "summary": {
            "year": int(year) if year else latest_year,
            "total_lgas": profiles.count(),
            "risk_counts": risk_counts,
        },
        "results": results,
    })

@api_view(["GET"])
@permission_classes([AllowAny])
def public_report_documents(request):
    report_type = request.query_params.get("report_type")
    reporting_year = request.query_params.get("reporting_year")
    search = request.query_params.get("search")

    reports = (
        ReportDocument.objects
        .filter(
            is_active=True,
            is_public=True,
            status=ReportDocument.Status.PUBLISHED,
        )
        .order_by("-created_at", "title")
    )

    if report_type and report_type != "all":
        reports = reports.filter(report_type=report_type)

    if reporting_year:
        reports = reports.filter(reporting_year=reporting_year)

    if search:
        reports = reports.filter(title__icontains=search)

    report_type_labels = dict(ReportDocument.ReportType.choices)

    by_type = {
        key: 0 for key, _label in ReportDocument.ReportType.choices
    }

    for row in reports.values("report_type").annotate(count=Count("id")):
        by_type[row["report_type"]] = row["count"]

    results = []

    for report in reports:
        results.append({
            "id": report.id,
            "title": report.title,
            "report_type": report.report_type,
            "report_type_display": report_type_labels.get(
                report.report_type,
                report.report_type,
            ),
            "reporting_year": report.reporting_year,
            "description": report.description,
            "source_module": report.source_module,
            "file_url": get_public_file_url(request, report),
            "created_at": report.created_at,
            "updated_at": report.updated_at,
        })

    return Response({
        "status": "ok",
        "message": "Public reports loaded.",
        "summary": {
            "total_public_reports": reports.count(),
            "by_type": by_type,
        },
        "results": results,
    })
@api_view(["GET"])
@permission_classes([AllowAny])
def public_climate_projects(request):
    project_type = request.query_params.get("project_type")
    sector = request.query_params.get("sector")
    status_filter = request.query_params.get("status")
    funding_source = request.query_params.get("funding_source")
    search = request.query_params.get("search")

    projects = (
        ClimateProject.objects
        .select_related("lga")
        .filter(is_active=True)
        .order_by("-created_at", "title")
    )

    if project_type and project_type != "all":
        projects = projects.filter(project_type=project_type)

    if sector and sector != "all":
        projects = projects.filter(sector=sector)

    if status_filter and status_filter != "all":
        projects = projects.filter(status=status_filter)

    if funding_source and funding_source != "all":
        projects = projects.filter(funding_source=funding_source)

    if search:
        projects = projects.filter(title__icontains=search)

    total_ghg_reduction = projects.aggregate(
        value=Sum("expected_ghg_reduction_tco2e")
    ).get("value") or Decimal("0.000")

    total_beneficiaries = projects.aggregate(
        value=Sum("expected_beneficiaries")
    ).get("value") or 0

    by_status = {
        key: 0 for key, _label in ClimateProject.Status.choices
    }

    for row in projects.values("status").annotate(count=Count("id")):
        by_status[row["status"]] = row["count"]

    by_type = {
        key: 0 for key, _label in ClimateProject.ProjectType.choices
    }

    for row in projects.values("project_type").annotate(count=Count("id")):
        by_type[row["project_type"]] = row["count"]

    results = []

    for project in projects:
        results.append({
            "id": project.id,
            "title": project.title,
            "project_code": project.project_code,
            "project_type": project.project_type,
            "project_type_display": project.get_project_type_display(),
            "sector": project.sector,
            "sector_display": project.get_sector_display(),
            "status": project.status,
            "status_display": project.get_status_display(),
            "priority": project.priority,
            "priority_display": project.get_priority_display(),
            "lga": project.lga_id,
            "lga_name": getattr(project.lga, "lga_name", "") if project.lga else "",
            "latitude": decimal_to_float_or_none(project.latitude),
            "longitude": decimal_to_float_or_none(project.longitude),
            "project_image_url": get_project_image_url(request, project),
            "public_summary": project.public_summary or "",
            "public_description": project.public_description or "",
            "funding_source": project.funding_source or "Not specified",
            "expected_ghg_reduction_tco2e": decimal_to_float(
                project.expected_ghg_reduction_tco2e
            ),
            "expected_beneficiaries": project.expected_beneficiaries,
            "climate_risk_relevance": project.climate_risk_relevance,
        })

    return Response({
        "status": "ok",
        "message": "Public climate projects loaded.",
        "summary": {
            "total_projects": projects.count(),
            "total_expected_ghg_reduction_tco2e": decimal_to_float(
                total_ghg_reduction
            ),
            "total_expected_beneficiaries": total_beneficiaries,
            "by_status": by_status,
            "by_type": by_type,
        },
        "results": results,
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def atlas_export(request):
    from playwright.sync_api import sync_playwright

    variable = request.query_params.get("variable", "overall")
    year     = request.query_params.get("year", "2025")
    basemap  = request.query_params.get("basemap", "satellite")

    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    url = (
        f"{frontend_url}/public/climate-atlas"
        f"?export=1&variable={variable}&year={year}&basemap={basemap}"
    )

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
            )
            page = context.new_page()
            # domcontentloaded avoids stalling on continuous tile requests
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            # Wait for Leaflet map container to mount
            page.wait_for_selector(".leaflet-container", timeout=20000)
            # Wait for React to signal GeoJSON is loaded and map is ready
            page.wait_for_function(
                "document.body.dataset.atlasExportReady === '1'",
                timeout=25000,
            )
            # Wait until several tile images have fully decoded (naturalWidth > 0)
            page.wait_for_function(
                """() => {
                    const imgs = document.querySelectorAll('.leaflet-tile-pane img');
                    if (imgs.length === 0) return false;
                    const loaded = Array.from(imgs).filter(
                        i => i.complete && i.naturalWidth > 0
                    );
                    return loaded.length >= Math.min(4, imgs.length);
                }""",
                timeout=20000,
            )
            # Final settle for sub-pixel tile paint
            page.wait_for_timeout(2000)
            png_bytes = page.screenshot(type="png")
            context.close()
            browser.close()

        response = HttpResponse(png_bytes, content_type="image/png")
        response["Content-Disposition"] = (
            f'attachment; filename="kccc-atlas-{variable}-{year}.png"'
        )
        return response

    except Exception as err:
        logger.exception("atlas_export failed for url=%s", url)
        detail = str(err) if settings.DEBUG else "Export failed. Please try again."
        return Response({"error": detail}, status=500)