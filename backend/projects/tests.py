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
