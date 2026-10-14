import io
from datetime import date, timedelta
from decimal import Decimal

import openpyxl
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import UserProfile
from core.models import LGARegistry

from .models import ClimateProject, ProjectProgressUpdate
from .performance import (
    AT_RISK,
    NOT_ASSESSED,
    OFF_TRACK,
    ON_TRACK,
    compute_performance_status,
)
from .views import _impact_is_unassessed, _sum_decimal


def make_user(username, role, assigned_sector=UserProfile.Sector.NONE):
    user = User.objects.create_user(username, password="pw")
    UserProfile.objects.create(user=user, role=role, assigned_sector=assigned_sector)
    return user


def make_project(**overrides):
    defaults = {
        "title": "Test Climate Project",
        "project_type": ClimateProject.ProjectType.ADAPTATION,
        "sector": ClimateProject.Sector.AGRICULTURE,
        "status": ClimateProject.Status.ONGOING,
        "estimated_budget_naira": Decimal("1000000.00"),
    }
    defaults.update(overrides)
    return ClimateProject.objects.create(**defaults)


class ProjectsAPITestCase(TestCase):
    """Base class for projects tests that call authenticated endpoints."""

    def setUp(self):
        self.client = APIClient()
        self.admin = make_user("pm_admin", UserProfile.Role.ADMIN)
        self.analyst = make_user("pm_analyst", UserProfile.Role.ANALYST)
        self.sfp = make_user(
            "pm_sfp", UserProfile.Role.SECTOR_FOCAL_POINT, UserProfile.Sector.ENERGY
        )
        self.lga = LGARegistry.objects.create(lga_id=901, lga_name="Test LGA")


# ---------------------------------------------------------------------------
# SDG goal validation
# ---------------------------------------------------------------------------
class SdgGoalsValidationTests(ProjectsAPITestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.admin)

    def base_payload(self, **overrides):
        payload = {
            "title": "SDG Linked Project",
            "project_type": "adaptation",
            "sector": "agriculture",
            "status": "proposed",
            "priority": "medium",
            "estimated_budget_naira": "0",
            "expected_ghg_reduction_tco2e": "0",
            "expected_beneficiaries": "0",
        }
        payload.update(overrides)
        return payload

    def test_valid_sdg_goals_accepted_and_deduplicated_sorted(self):
        response = self.client.post(
            "/api/portfolio/projects/",
            self.base_payload(sdg_goals=[13, 2, 13, 1]),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["project"]["sdg_goals"], [1, 2, 13])

    def test_sdg_goal_zero_rejected(self):
        response = self.client.post(
            "/api/portfolio/projects/",
            self.base_payload(sdg_goals=[0]),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sdg_goals", response.data)

    def test_sdg_goal_above_17_rejected(self):
        response = self.client.post(
            "/api/portfolio/projects/",
            self.base_payload(sdg_goals=[18]),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sdg_goals", response.data)

    def test_non_list_sdg_goals_rejected(self):
        response = self.client.post(
            "/api/portfolio/projects/",
            self.base_payload(sdg_goals="13"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("sdg_goals", response.data)

    def test_empty_sdg_goals_allowed(self):
        response = self.client.post(
            "/api/portfolio/projects/",
            self.base_payload(sdg_goals=[]),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["project"]["sdg_goals"], [])

    def test_ndc_linkage_reference_round_trips(self):
        response = self.client.post(
            "/api/portfolio/projects/",
            self.base_payload(ndc_linkage_reference="Unconditional target - Agriculture"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            response.data["project"]["ndc_linkage_reference"],
            "Unconditional target - Agriculture",
        )


# ---------------------------------------------------------------------------
# ProjectProgressUpdate: validation, permissions, latest-progress selection
# ---------------------------------------------------------------------------
class ProjectProgressUpdateTests(ProjectsAPITestCase):
    def setUp(self):
        super().setUp()
        self.project = make_project(lga=self.lga)
        self.url = f"/api/portfolio/projects/{self.project.id}/progress/"

    def test_physical_completion_above_100_rejected(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self.url,
            {
                "reporting_date": "2026-01-01",
                "physical_completion_pct": "101",
                "financial_disbursement_naira": "0",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("physical_completion_pct", response.data)

    def test_physical_completion_negative_rejected(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self.url,
            {
                "reporting_date": "2026-01-01",
                "physical_completion_pct": "-1",
                "financial_disbursement_naira": "0",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("physical_completion_pct", response.data)

    def test_physical_completion_boundary_values_accepted(self):
        self.client.force_authenticate(user=self.admin)
        for pct in ("0", "100"):
            response = self.client.post(
                self.url,
                {
                    "reporting_date": "2026-01-01",
                    "physical_completion_pct": pct,
                    "financial_disbursement_naira": "0",
                },
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_negative_financial_disbursement_rejected(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self.url,
            {
                "reporting_date": "2026-01-01",
                "physical_completion_pct": "50",
                "financial_disbursement_naira": "-1",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("financial_disbursement_naira", response.data)

    def test_sector_focal_point_cannot_create_progress_update(self):
        self.client.force_authenticate(user=self.sfp)
        response = self.client.post(
            self.url,
            {
                "reporting_date": "2026-01-01",
                "physical_completion_pct": "50",
                "financial_disbursement_naira": "0",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(ProjectProgressUpdate.objects.count(), 0)

    def test_analyst_can_create_progress_update(self):
        self.client.force_authenticate(user=self.analyst)
        response = self.client.post(
            self.url,
            {
                "reporting_date": "2026-01-01",
                "physical_completion_pct": "50",
                "financial_disbursement_naira": "100000",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_any_authenticated_user_can_list_progress_updates(self):
        ProjectProgressUpdate.objects.create(
            project=self.project,
            reporting_date=date(2026, 1, 1),
            physical_completion_pct=Decimal("40"),
            created_by=self.admin,
        )
        self.client.force_authenticate(user=self.sfp)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

    def test_latest_progress_selected_by_reporting_date_not_creation_order(self):
        # Created out of chronological order on purpose: the most recent
        # creation is an OLDER reporting_date, so this proves selection is
        # driven by reporting_date, not insertion order.
        ProjectProgressUpdate.objects.create(
            project=self.project,
            reporting_date=date(2026, 3, 1),
            physical_completion_pct=Decimal("70"),
        )
        ProjectProgressUpdate.objects.create(
            project=self.project,
            reporting_date=date(2026, 1, 1),
            physical_completion_pct=Decimal("20"),
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f"/api/portfolio/projects/{self.project.id}/")
        # SerializerMethodField passes the raw model value through
        # untouched (no coerce-to-string, unlike a plain DecimalField), so
        # response.data holds real Decimal/date objects here, not their
        # JSON-rendered string forms.
        self.assertEqual(
            response.data["project"]["latest_physical_completion_pct"], Decimal("70.00")
        )
        self.assertEqual(
            response.data["project"]["latest_progress_date"], date(2026, 3, 1)
        )

    def test_budget_disbursement_pct_computed_from_real_budget(self):
        project = make_project(lga=self.lga, estimated_budget_naira=Decimal("200000.00"))
        ProjectProgressUpdate.objects.create(
            project=project,
            reporting_date=date(2026, 1, 1),
            physical_completion_pct=Decimal("50"),
            financial_disbursement_naira=Decimal("50000.00"),
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f"/api/portfolio/projects/{project.id}/")
        self.assertEqual(response.data["project"]["budget_disbursement_pct"], 25.0)

    def test_budget_disbursement_pct_none_when_no_budget(self):
        project = make_project(lga=self.lga, estimated_budget_naira=Decimal("0"))
        ProjectProgressUpdate.objects.create(
            project=project,
            reporting_date=date(2026, 1, 1),
            physical_completion_pct=Decimal("50"),
            financial_disbursement_naira=Decimal("50000.00"),
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f"/api/portfolio/projects/{project.id}/")
        self.assertIsNone(response.data["project"]["budget_disbursement_pct"])

    def test_project_with_no_progress_updates_returns_none_fields(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f"/api/portfolio/projects/{self.project.id}/")
        self.assertIsNone(response.data["project"]["latest_physical_completion_pct"])
        self.assertIsNone(response.data["project"]["latest_financial_disbursement_naira"])
        self.assertIsNone(response.data["project"]["latest_progress_date"])
        self.assertEqual(response.data["project"]["performance_status"], NOT_ASSESSED)


# ---------------------------------------------------------------------------
# Centralized RAG calculation — pure function, no DB
# ---------------------------------------------------------------------------
class PerformanceStatusCalculationTests(TestCase):
    def test_completed_status_is_always_on_track(self):
        result = compute_performance_status(
            status="completed",
            start_date=date(2020, 1, 1),
            end_date=date(2020, 2, 1),
            latest_physical_completion_pct=Decimal("10"),
            today=date(2026, 1, 1),
        )
        self.assertEqual(result, ON_TRACK)

    def test_missing_dates_is_not_assessed(self):
        result = compute_performance_status(
            status="ongoing",
            start_date=None,
            end_date=None,
            latest_physical_completion_pct=Decimal("50"),
            today=date(2026, 1, 1),
        )
        self.assertEqual(result, NOT_ASSESSED)

    def test_missing_progress_is_not_assessed(self):
        result = compute_performance_status(
            status="ongoing",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            latest_physical_completion_pct=None,
            today=date(2026, 6, 1),
        )
        self.assertEqual(result, NOT_ASSESSED)

    def test_invalid_date_range_is_not_assessed(self):
        # start == end == today: end_date is not yet "passed" (today is not
        # strictly after it), so this correctly falls through to the
        # total_duration <= 0 check rather than the end-date-passed rule.
        result = compute_performance_status(
            status="ongoing",
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 1),
            latest_physical_completion_pct=Decimal("50"),
            today=date(2026, 6, 1),
        )
        self.assertEqual(result, NOT_ASSESSED)

    def test_end_date_passed_and_incomplete_is_off_track(self):
        result = compute_performance_status(
            status="ongoing",
            start_date=date(2025, 1, 1),
            end_date=date(2025, 12, 31),
            latest_physical_completion_pct=Decimal("90"),
            today=date(2026, 1, 15),
        )
        self.assertEqual(result, OFF_TRACK)

    def test_on_track_when_actual_matches_expected(self):
        # 100-day project, 50 days elapsed -> expected 50%; actual 50%.
        result = compute_performance_status(
            status="ongoing",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 4, 11),
            latest_physical_completion_pct=Decimal("50"),
            today=date(2026, 2, 20),
        )
        self.assertEqual(result, ON_TRACK)

    def test_on_track_within_10_point_tolerance(self):
        # expected ~50%, actual 41% -> diff -9, still on_track.
        result = compute_performance_status(
            status="ongoing",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 4, 11),
            latest_physical_completion_pct=Decimal("41"),
            today=date(2026, 2, 20),
        )
        self.assertEqual(result, ON_TRACK)

    def test_at_risk_between_10_and_25_points_behind(self):
        # expected ~50%, actual 30% -> diff -20 -> at_risk.
        result = compute_performance_status(
            status="ongoing",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 4, 11),
            latest_physical_completion_pct=Decimal("30"),
            today=date(2026, 2, 20),
        )
        self.assertEqual(result, AT_RISK)

    def test_off_track_more_than_25_points_behind(self):
        # expected ~50%, actual 10% -> diff -40 -> off_track.
        result = compute_performance_status(
            status="ongoing",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 4, 11),
            latest_physical_completion_pct=Decimal("10"),
            today=date(2026, 2, 20),
        )
        self.assertEqual(result, OFF_TRACK)

    def test_ahead_of_schedule_is_on_track(self):
        result = compute_performance_status(
            status="ongoing",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            latest_physical_completion_pct=Decimal("90"),
            today=date(2026, 2, 1),
        )
        self.assertEqual(result, ON_TRACK)


# ---------------------------------------------------------------------------
# Portfolio analytics: sector / geographic / funding-source / implementation rate
# ---------------------------------------------------------------------------
class PortfolioSummaryAnalyticsTests(ProjectsAPITestCase):
    def setUp(self):
        super().setUp()
        self.other_lga = LGARegistry.objects.create(lga_id=902, lga_name="Other Test LGA")
        self.client.force_authenticate(user=self.admin)

    def test_sector_distribution_summary(self):
        make_project(sector="agriculture", lga=self.lga)
        make_project(sector="agriculture", lga=self.lga, title="Second Ag Project")
        make_project(sector="energy", lga=self.lga, title="Energy Project")

        response = self.client.get("/api/portfolio/projects/")
        by_sector = {row["sector"]: row["count"] for row in response.data["summary"]["by_sector"]}
        self.assertEqual(by_sector.get("agriculture"), 2)
        self.assertEqual(by_sector.get("energy"), 1)

    def test_geographic_distribution_summary_including_unassigned(self):
        make_project(lga=self.lga)
        make_project(lga=self.other_lga, title="Other LGA Project")
        make_project(lga=None, title="Statewide Project")

        response = self.client.get("/api/portfolio/projects/")
        by_lga = {row["lga_name"]: row["count"] for row in response.data["summary"]["by_lga"]}
        self.assertEqual(by_lga.get("Test LGA"), 1)
        self.assertEqual(by_lga.get("Other Test LGA"), 1)
        self.assertEqual(by_lga.get("Not specified"), 1)

    def test_funding_source_distribution_summary(self):
        make_project(funding_source="State Budget", lga=self.lga)
        make_project(funding_source="State Budget", lga=self.lga, title="Second")
        make_project(funding_source="", lga=self.lga, title="No Source")

        response = self.client.get("/api/portfolio/projects/")
        by_source = {
            row["funding_source"]: row["count"]
            for row in response.data["summary"]["by_funding_source"]
        }
        self.assertEqual(by_source.get("State Budget"), 2)
        self.assertEqual(by_source.get("Not specified"), 1)

    def test_average_implementation_rate_excludes_unassessed_projects(self):
        assessed = make_project(lga=self.lga, title="Assessed Project")
        make_project(lga=self.lga, title="Never Reported Project")

        ProjectProgressUpdate.objects.create(
            project=assessed,
            reporting_date=date(2026, 1, 1),
            physical_completion_pct=Decimal("60"),
        )

        response = self.client.get("/api/portfolio/projects/")
        summary = response.data["summary"]
        self.assertEqual(summary["assessed_project_count"], 1)
        self.assertEqual(summary["average_implementation_rate"], 60.0)

    def test_average_implementation_rate_none_when_nothing_assessed(self):
        make_project(lga=self.lga)

        response = self.client.get("/api/portfolio/projects/")
        summary = response.data["summary"]
        self.assertEqual(summary["assessed_project_count"], 0)
        self.assertIsNone(summary["average_implementation_rate"])

    def test_off_track_and_at_risk_counts_reflect_real_projects(self):
        off_track_project = make_project(
            lga=self.lga,
            title="Off Track Project",
            status="ongoing",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 4, 11),
        )
        ProjectProgressUpdate.objects.create(
            project=off_track_project,
            reporting_date=date.today(),
            physical_completion_pct=Decimal("5"),
        )

        response = self.client.get("/api/portfolio/projects/")
        summary = response.data["summary"]
        self.assertGreaterEqual(summary["off_track_count"], 1)


# ---------------------------------------------------------------------------
# Bulk import: CSV regression + new XLSX support
# ---------------------------------------------------------------------------
class ProjectImportTests(ProjectsAPITestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.admin)
        self.url = "/api/portfolio/projects/import/"

    def test_csv_import_still_works(self):
        csv_content = (
            "title,sector,project_type,status,priority,estimated_budget_naira\n"
            "CSV Imported Project,agriculture,adaptation,proposed,medium,500000\n"
        )
        upload = SimpleUploadedFile(
            "projects.csv", csv_content.encode("utf-8"), content_type="text/csv"
        )
        response = self.client.post(self.url, {"file": upload}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["result"]["imported_count"], 1)
        self.assertEqual(response.data["result"]["failed_count"], 0)
        self.assertTrue(
            ClimateProject.objects.filter(title="CSV Imported Project").exists()
        )

    def test_csv_import_reports_row_level_errors(self):
        csv_content = (
            "title,sector,project_type,status,priority,estimated_budget_naira\n"
            ",agriculture,adaptation,proposed,medium,500000\n"
        )
        upload = SimpleUploadedFile(
            "projects.csv", csv_content.encode("utf-8"), content_type="text/csv"
        )
        response = self.client.post(self.url, {"file": upload}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["result"]["failed_count"], 1)
        self.assertEqual(response.data["result"]["errors"][0]["field"], "title")

    def test_xlsx_import_works(self):
        workbook = openpyxl.Workbook()
        worksheet = workbook.active
        worksheet.append(
            ["title", "sector", "project_type", "status", "priority", "estimated_budget_naira"]
        )
        worksheet.append(
            ["XLSX Imported Project", "energy", "mitigation", "planned", "high", 750000]
        )
        buffer = io.BytesIO()
        workbook.save(buffer)
        buffer.seek(0)

        upload = SimpleUploadedFile(
            "projects.xlsx",
            buffer.read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response = self.client.post(self.url, {"file": upload}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["result"]["imported_count"], 1)
        self.assertEqual(response.data["result"]["failed_count"], 0)
        project = ClimateProject.objects.get(title="XLSX Imported Project")
        self.assertEqual(project.sector, "energy")
        self.assertEqual(project.estimated_budget_naira, Decimal("750000.00"))

    def test_unsupported_file_extension_rejected(self):
        upload = SimpleUploadedFile(
            "projects.txt", b"title\nFoo\n", content_type="text/plain"
        )
        response = self.client.post(self.url, {"file": upload}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sector_focal_point_cannot_import(self):
        self.client.force_authenticate(user=self.sfp)
        csv_content = "title,sector\nShould Not Import,agriculture\n"
        upload = SimpleUploadedFile(
            "projects.csv", csv_content.encode("utf-8"), content_type="text/csv"
        )
        response = self.client.post(self.url, {"file": upload}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ---------------------------------------------------------------------------
# _sum_decimal: pure aggregation helper, no DB — None must mean "never
# quantified", never silently collapse to 0.
# ---------------------------------------------------------------------------
class SumDecimalHelperTests(TestCase):
    def test_empty_list_is_none(self):
        self.assertIsNone(_sum_decimal([]))

    def test_all_none_is_none(self):
        self.assertIsNone(_sum_decimal([None, None]))

    def test_single_real_zero_is_zero_not_none(self):
        self.assertEqual(_sum_decimal([Decimal("0")]), 0.0)

    def test_real_value_mixed_with_none_sums_only_real_values(self):
        self.assertEqual(_sum_decimal([Decimal("100"), None]), 100.0)

    def test_two_real_zeros_is_zero(self):
        self.assertEqual(_sum_decimal([Decimal("0"), Decimal("0")]), 0.0)


class ImpactUnassessedHelperTests(TestCase):
    def test_not_assessed_impact_type_is_unassessed_even_with_values(self):
        self.assertTrue(
            _impact_is_unassessed(
                ClimateProject.GHGImpactType.NOT_ASSESSED, Decimal("10"), Decimal("5")
            )
        )

    def test_assessed_impact_type_with_no_values_is_unassessed(self):
        self.assertTrue(
            _impact_is_unassessed(
                ClimateProject.GHGImpactType.EMISSION_REDUCTION, None, None
            )
        )

    def test_assessed_impact_type_with_a_value_is_assessed(self):
        self.assertFalse(
            _impact_is_unassessed(
                ClimateProject.GHGImpactType.EMISSION_REDUCTION, Decimal("10"), None
            )
        )


# ---------------------------------------------------------------------------
# Climate & GHG linkage fields: controlled values, optionality, validation
# ---------------------------------------------------------------------------
class ClimateGhgLinkageFieldTests(ProjectsAPITestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.admin)

    def base_payload(self, **overrides):
        payload = {
            "title": "GHG Linked Project",
            "project_type": "mitigation",
            "sector": "energy",
            "status": "proposed",
            "priority": "medium",
            "estimated_budget_naira": "0",
            "expected_ghg_reduction_tco2e": "0",
            "expected_beneficiaries": "0",
        }
        payload.update(overrides)
        return payload

    def test_valid_primary_ghg_sector_accepted(self):
        response = self.client.post(
            "/api/portfolio/projects/",
            self.base_payload(primary_ghg_sector="energy"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["project"]["primary_ghg_sector"], "energy")

    def test_invalid_primary_ghg_sector_rejected(self):
        response = self.client.post(
            "/api/portfolio/projects/",
            self.base_payload(primary_ghg_sector="transport"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("primary_ghg_sector", response.data)

    def test_valid_ghg_impact_type_accepted(self):
        response = self.client.post(
            "/api/portfolio/projects/",
            self.base_payload(ghg_impact_type="carbon_removal"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["project"]["ghg_impact_type"], "carbon_removal")

    def test_invalid_ghg_impact_type_rejected(self):
        response = self.client.post(
            "/api/portfolio/projects/",
            self.base_payload(ghg_impact_type="offsetting"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ghg_impact_type", response.data)

    def test_adaptation_only_project_can_remain_not_assessed(self):
        response = self.client.post(
            "/api/portfolio/projects/",
            self.base_payload(project_type="adaptation", sector="water"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        project = response.data["project"]
        self.assertEqual(project["primary_ghg_sector"], "not_assessed")
        self.assertEqual(project["ghg_impact_type"], "not_assessed")
        self.assertIsNone(project["expected_annual_ghg_impact_tco2e"])
        self.assertIsNone(project["verified_annual_ghg_impact_tco2e"])

    def test_negative_expected_annual_ghg_impact_rejected(self):
        response = self.client.post(
            "/api/portfolio/projects/",
            self.base_payload(expected_annual_ghg_impact_tco2e="-5"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expected_annual_ghg_impact_tco2e", response.data)

    def test_negative_verified_annual_ghg_impact_rejected(self):
        response = self.client.post(
            "/api/portfolio/projects/",
            self.base_payload(verified_annual_ghg_impact_tco2e="-1"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("verified_annual_ghg_impact_tco2e", response.data)

    def test_existing_project_created_before_field_existed_migrates_safely(self):
        # make_project() passes none of the new fields, simulating a row
        # that existed before this migration — it must load with safe
        # defaults, never raise, and never show a fabricated number.
        project = make_project(lga=self.lga)
        response = self.client.get(f"/api/portfolio/projects/{project.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data["project"]
        self.assertEqual(data["primary_ghg_sector"], "not_assessed")
        self.assertEqual(data["ghg_impact_type"], "not_assessed")
        self.assertIsNone(data["expected_annual_ghg_impact_tco2e"])
        self.assertIsNone(data["verified_annual_ghg_impact_tco2e"])
        self.assertEqual(data["climate_action_context"], "")

    def test_serializer_exposes_all_ghg_linkage_fields(self):
        response = self.client.post(
            "/api/portfolio/projects/",
            self.base_payload(
                climate_action_context="Vegetation stress and drought conditions in Kachia",
                primary_ghg_sector="agriculture",
                ghg_impact_type="avoided_emissions",
                expected_annual_ghg_impact_tco2e="120.5",
                verified_annual_ghg_impact_tco2e="0",
                ghg_methodology="IPCC Tier 1 default factors",
                ghg_monitoring_indicator="Hectares under improved practice",
            ),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        project = response.data["project"]
        self.assertEqual(
            project["climate_action_context"],
            "Vegetation stress and drought conditions in Kachia",
        )
        self.assertEqual(project["primary_ghg_sector"], "agriculture")
        self.assertEqual(project["primary_ghg_sector_display"], "Agriculture")
        self.assertEqual(project["ghg_impact_type"], "avoided_emissions")
        self.assertEqual(project["ghg_impact_type_display"], "Avoided Emissions")
        self.assertEqual(
            Decimal(str(project["expected_annual_ghg_impact_tco2e"])), Decimal("120.500")
        )
        self.assertEqual(
            Decimal(str(project["verified_annual_ghg_impact_tco2e"])), Decimal("0.000")
        )
        self.assertEqual(project["ghg_methodology"], "IPCC Tier 1 default factors")
        self.assertEqual(
            project["ghg_monitoring_indicator"], "Hectares under improved practice"
        )

    def test_no_fabricated_defaults_when_only_budget_and_completion_known(self):
        # A project with a real budget and a reported physical completion
        # must NOT acquire any GHG numbers just because those other fields
        # are populated.
        project = make_project(
            lga=self.lga, estimated_budget_naira=Decimal("5000000.00")
        )
        ProjectProgressUpdate.objects.create(
            project=project,
            reporting_date=date(2026, 1, 1),
            physical_completion_pct=Decimal("80"),
        )
        response = self.client.get(f"/api/portfolio/projects/{project.id}/")
        data = response.data["project"]
        self.assertIsNone(data["expected_annual_ghg_impact_tco2e"])
        self.assertIsNone(data["verified_annual_ghg_impact_tco2e"])
        self.assertEqual(data["primary_ghg_sector"], "not_assessed")


# ---------------------------------------------------------------------------
# Project-GHG sector aggregation endpoint
# ---------------------------------------------------------------------------
class ProjectGhgSectorSummaryTests(ProjectsAPITestCase):
    def setUp(self):
        super().setUp()
        self.url = "/api/portfolio/projects/ghg-summary/"

    def test_requires_authentication(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_any_authenticated_user_can_read_summary(self):
        self.client.force_authenticate(user=self.sfp)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_sector_project_counts_and_status_buckets(self):
        make_project(
            title="Energy Concept",
            primary_ghg_sector="energy",
            status="proposed",
            lga=self.lga,
        )
        make_project(
            title="Energy Planned",
            primary_ghg_sector="energy",
            status="planned",
            lga=self.lga,
        )
        make_project(
            title="Energy Ongoing",
            primary_ghg_sector="energy",
            status="ongoing",
            lga=self.lga,
        )
        make_project(
            title="Energy Completed",
            primary_ghg_sector="energy",
            status="completed",
            lga=self.lga,
        )
        make_project(
            title="Energy Suspended",
            primary_ghg_sector="energy",
            status="suspended",
            lga=self.lga,
        )
        make_project(
            title="Energy Cancelled",
            primary_ghg_sector="energy",
            status="cancelled",
            lga=self.lga,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        energy = next(
            row for row in response.data["sectors"] if row["sector"] == "energy"
        )
        self.assertEqual(energy["project_count"], 6)
        self.assertEqual(energy["concept_count"], 2)  # proposed + planned
        self.assertEqual(energy["ongoing_count"], 1)
        self.assertEqual(energy["completed_count"], 1)
        self.assertEqual(energy["other_status_count"], 2)  # suspended + cancelled

    def test_unassessed_sector_project_count_excludes_real_sectors(self):
        make_project(title="Unassessed Project", lga=self.lga)  # default not_assessed
        make_project(
            title="Energy Project", primary_ghg_sector="energy", lga=self.lga
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response.data["unassessed_sector_project_count"], 1)
        energy = next(
            row for row in response.data["sectors"] if row["sector"] == "energy"
        )
        self.assertEqual(energy["project_count"], 1)

    def test_unassessed_impact_project_count_for_known_sector(self):
        # Sector known (energy) but impact type never characterized.
        make_project(
            title="Sector Known No Impact Type",
            primary_ghg_sector="energy",
            ghg_impact_type="not_assessed",
            lga=self.lga,
        )
        # Sector known, impact type characterized, but never quantified.
        make_project(
            title="Sector Known Impact Type No Numbers",
            primary_ghg_sector="energy",
            ghg_impact_type="emission_reduction",
            lga=self.lga,
        )
        # Fully assessed and quantified.
        make_project(
            title="Fully Assessed",
            primary_ghg_sector="energy",
            ghg_impact_type="emission_reduction",
            expected_annual_ghg_impact_tco2e=Decimal("50"),
            lga=self.lga,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        energy = next(
            row for row in response.data["sectors"] if row["sector"] == "energy"
        )
        self.assertEqual(energy["project_count"], 3)
        self.assertEqual(energy["unassessed_impact_project_count"], 2)
        self.assertEqual(energy["expected_annual_impact_tco2e"], 50.0)

    def test_reduction_avoided_and_removal_breakdown_separated(self):
        make_project(
            title="Reduction Project",
            primary_ghg_sector="lulucf",
            ghg_impact_type="emission_reduction",
            expected_annual_ghg_impact_tco2e=Decimal("100"),
            verified_annual_ghg_impact_tco2e=Decimal("90"),
            lga=self.lga,
        )
        make_project(
            title="Avoided Emissions Project",
            primary_ghg_sector="lulucf",
            ghg_impact_type="avoided_emissions",
            expected_annual_ghg_impact_tco2e=Decimal("30"),
            lga=self.lga,
        )
        make_project(
            title="Removal Project",
            primary_ghg_sector="lulucf",
            ghg_impact_type="carbon_removal",
            expected_annual_ghg_impact_tco2e=Decimal("200"),
            verified_annual_ghg_impact_tco2e=Decimal("180"),
            lga=self.lga,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        lulucf = next(
            row for row in response.data["sectors"] if row["sector"] == "lulucf"
        )
        self.assertEqual(lulucf["expected_reduction_avoided_tco2e"], 130.0)
        self.assertEqual(lulucf["verified_reduction_avoided_tco2e"], 90.0)
        self.assertEqual(lulucf["expected_removal_tco2e"], 200.0)
        self.assertEqual(lulucf["verified_removal_tco2e"], 180.0)
        # Overall sector total still includes both buckets.
        self.assertEqual(lulucf["expected_annual_impact_tco2e"], 330.0)
        self.assertEqual(lulucf["verified_annual_impact_tco2e"], 270.0)

    def test_mixed_impact_type_counted_in_totals_but_not_in_breakdown(self):
        make_project(
            title="Mixed Impact Project",
            primary_ghg_sector="waste",
            ghg_impact_type="mixed_reduction_removal",
            expected_annual_ghg_impact_tco2e=Decimal("75"),
            lga=self.lga,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        waste = next(
            row for row in response.data["sectors"] if row["sector"] == "waste"
        )
        self.assertEqual(waste["expected_annual_impact_tco2e"], 75.0)
        self.assertIsNone(waste["expected_reduction_avoided_tco2e"])
        self.assertIsNone(waste["expected_removal_tco2e"])

    def test_inactive_projects_excluded_from_summary(self):
        make_project(
            title="Inactive Energy Project",
            primary_ghg_sector="energy",
            is_active=False,
            lga=self.lga,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        energy = next(
            row for row in response.data["sectors"] if row["sector"] == "energy"
        )
        self.assertEqual(energy["project_count"], 0)

    def test_totals_aggregate_across_sectors_without_touching_inventory(self):
        make_project(
            title="Energy Reduction",
            primary_ghg_sector="energy",
            ghg_impact_type="emission_reduction",
            expected_annual_ghg_impact_tco2e=Decimal("40"),
            lga=self.lga,
        )
        make_project(
            title="Agriculture Removal",
            primary_ghg_sector="agriculture",
            ghg_impact_type="carbon_removal",
            expected_annual_ghg_impact_tco2e=Decimal("60"),
            lga=self.lga,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        totals = response.data["totals"]
        self.assertEqual(totals["mitigation_linked_project_count"], 2)
        self.assertEqual(totals["expected_annual_impact_tco2e"], 100.0)
        self.assertEqual(totals["expected_reduction_avoided_tco2e"], 40.0)
        self.assertEqual(totals["expected_removal_tco2e"], 60.0)
