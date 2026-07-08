import csv
import io
import os
import tempfile

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .models import HealthFacility

User = get_user_model()

LIST_URL = "/api/infrastructure/health-facilities/"
SUMMARY_URL = "/api/infrastructure/health-facilities/summary/"


def _make_facility(**kwargs):
    defaults = {
        "name": "Test Health Centre",
        "facility_type": HealthFacility.FacilityType.PRIMARY_HEALTH_CENTRE,
        "ownership": HealthFacility.Ownership.PUBLIC,
        "state": "Kaduna",
        "lga_name": "Kaduna North",
        "ward": "Kawo",
        "latitude": "10.5200000",
        "longitude": "7.4400000",
        "functional_status": HealthFacility.FunctionalStatus.FUNCTIONAL,
        "bed_capacity": 20,
        "population_served": 5000,
    }
    defaults.update(kwargs)
    return HealthFacility.objects.create(**defaults)


class HealthFacilityModelTests(TestCase):
    def test_str_representation(self):
        facility = _make_facility(name="Kawo PHC", lga_name="Kaduna North")
        self.assertIn("Kawo PHC", str(facility))
        self.assertIn("Primary Health Centre", str(facility))

    def test_default_functional_status_is_unknown(self):
        facility = HealthFacility.objects.create(
            name="Unknown PHC",
            state="Kaduna",
            lga_name="Igabi",
        )
        self.assertEqual(facility.functional_status, HealthFacility.FunctionalStatus.UNKNOWN)

    def test_nullable_coordinates_allowed(self):
        facility = HealthFacility.objects.create(
            name="No Coords PHC",
            state="Kaduna",
            lga_name="Giwa",
        )
        self.assertIsNone(facility.latitude)
        self.assertIsNone(facility.longitude)

    def test_nullable_lga_fk_allowed(self):
        facility = HealthFacility.objects.create(
            name="Unlinked PHC",
            state="Kaduna",
            lga_name="Birnin Gwari",
        )
        self.assertIsNone(facility.lga)

    def test_bed_capacity_and_population_are_optional(self):
        facility = HealthFacility.objects.create(
            name="Sparse PHC",
            state="Kaduna",
            lga_name="Zaria",
        )
        self.assertIsNone(facility.bed_capacity)
        self.assertIsNone(facility.population_served)


class HealthFacilityApiAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_list_requires_authentication(self):
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, 401)

    def test_detail_requires_authentication(self):
        facility = _make_facility()
        response = self.client.get(f"{LIST_URL}{facility.pk}/")
        self.assertEqual(response.status_code, 401)

    def test_summary_requires_authentication(self):
        response = self.client.get(SUMMARY_URL)
        self.assertEqual(response.status_code, 401)


class HealthFacilityApiListTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="staff", password="testpass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.f1 = _make_facility(
            name="Kawo PHC",
            lga_name="Kaduna North",
            facility_type=HealthFacility.FacilityType.PRIMARY_HEALTH_CENTRE,
            functional_status=HealthFacility.FunctionalStatus.FUNCTIONAL,
        )
        self.f2 = _make_facility(
            name="Zaria General Hospital",
            lga_name="Zaria",
            facility_type=HealthFacility.FacilityType.SECONDARY_HOSPITAL,
            functional_status=HealthFacility.FunctionalStatus.PARTIAL,
        )
        self.f3 = _make_facility(
            name="Igabi Dispensary",
            lga_name="Igabi",
            facility_type=HealthFacility.FacilityType.DISPENSARY,
            functional_status=HealthFacility.FunctionalStatus.NON_FUNCTIONAL,
        )

    def test_list_returns_all_facilities(self):
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)

    def test_filter_by_facility_type(self):
        response = self.client.get(LIST_URL, {"facility_type": "phc"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["name"], "Kawo PHC")

    def test_filter_by_functional_status(self):
        response = self.client.get(LIST_URL, {"functional_status": "partial"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["name"], "Zaria General Hospital")

    def test_filter_by_lga_name(self):
        response = self.client.get(LIST_URL, {"lga_name": "Igabi"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["name"], "Igabi Dispensary")

    def test_list_serializer_fields(self):
        response = self.client.get(LIST_URL)
        result = response.data["results"][0]
        expected_fields = {
            "id", "name", "facility_type", "facility_type_display",
            "ownership", "functional_status", "functional_status_display",
            "lga_name", "ward", "latitude", "longitude",
        }
        self.assertEqual(set(result.keys()), expected_fields)

    def test_detail_includes_geometry(self):
        response = self.client.get(f"{LIST_URL}{self.f1.pk}/")
        self.assertEqual(response.status_code, 200)
        geometry = response.data["geometry"]
        self.assertIsNotNone(geometry)
        self.assertEqual(geometry["type"], "Point")
        self.assertEqual(len(geometry["coordinates"]), 2)
        self.assertAlmostEqual(geometry["coordinates"][0], 7.44, places=2)
        self.assertAlmostEqual(geometry["coordinates"][1], 10.52, places=2)

    def test_detail_geometry_null_when_no_coords(self):
        no_coord = HealthFacility.objects.create(
            name="No Coord PHC",
            state="Kaduna",
            lga_name="Kachia",
        )
        response = self.client.get(f"{LIST_URL}{no_coord.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["geometry"])

    def test_detail_display_fields_present(self):
        response = self.client.get(f"{LIST_URL}{self.f1.pk}/")
        self.assertIn("facility_type_display", response.data)
        self.assertIn("ownership_display", response.data)
        self.assertIn("functional_status_display", response.data)


class HealthFacilitySummaryApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="staff2", password="testpass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        _make_facility(
            name="PHC A",
            lga_name="Igabi",
            facility_type=HealthFacility.FacilityType.PRIMARY_HEALTH_CENTRE,
            functional_status=HealthFacility.FunctionalStatus.FUNCTIONAL,
        )
        _make_facility(
            name="PHC B",
            lga_name="Igabi",
            facility_type=HealthFacility.FacilityType.PRIMARY_HEALTH_CENTRE,
            functional_status=HealthFacility.FunctionalStatus.PARTIAL,
        )
        _make_facility(
            name="Hospital C",
            lga_name="Zaria",
            facility_type=HealthFacility.FacilityType.SECONDARY_HOSPITAL,
            functional_status=HealthFacility.FunctionalStatus.FUNCTIONAL,
        )

    def test_summary_returns_total(self):
        response = self.client.get(SUMMARY_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 3)

    def test_summary_by_facility_type(self):
        response = self.client.get(SUMMARY_URL)
        by_type = {row["facility_type"]: row["count"] for row in response.data["by_facility_type"]}
        self.assertEqual(by_type["phc"], 2)
        self.assertEqual(by_type["secondary"], 1)

    def test_summary_by_functional_status(self):
        response = self.client.get(SUMMARY_URL)
        by_status = {row["functional_status"]: row["count"] for row in response.data["by_functional_status"]}
        self.assertEqual(by_status["functional"], 2)
        self.assertEqual(by_status["partial"], 1)

    def test_summary_by_lga(self):
        response = self.client.get(SUMMARY_URL)
        by_lga = {row["lga_name"]: row["count"] for row in response.data["by_lga"]}
        self.assertEqual(by_lga["Igabi"], 2)
        self.assertEqual(by_lga["Zaria"], 1)


def _write_temp_csv(rows, headers=None):
    """Write rows to a NamedTemporaryFile CSV and return the path. Caller must unlink."""
    if headers is None and rows:
        headers = list(rows[0].keys())
    fd, path = tempfile.mkstemp(suffix=".csv")
    with os.fdopen(fd, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=headers or [])
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    return path


class HealthFacilityImportCommandTests(TestCase):
    def test_invalid_functional_status_rejected(self):
        path = _write_temp_csv([
            {
                "name": "Test PHC",
                "lga_name": "Kaduna North",
                "facility_type": "phc",
                "functional_status": "BADSTATUS",
            }
        ])
        try:
            out = io.StringIO()
            call_command("import_health_facilities", path, stdout=out)
            self.assertEqual(HealthFacility.objects.count(), 0)
            self.assertIn("Skipped: 1", out.getvalue())
        finally:
            os.unlink(path)

    def test_update_existing_updates_row(self):
        existing = _make_facility(
            name="Kawo PHC",
            lga_name="Kaduna North",
            bed_capacity=10,
        )
        path = _write_temp_csv([
            {
                "name": "Kawo PHC",
                "lga_name": "Kaduna North",
                "facility_type": "phc",
                "functional_status": "functional",
                "bed_capacity": "50",
            }
        ])
        try:
            out = io.StringIO()
            call_command("import_health_facilities", path, "--update-existing", stdout=out)
            existing.refresh_from_db()
            self.assertEqual(existing.bed_capacity, 50)
            self.assertIn("Updated: 1", out.getvalue())
        finally:
            os.unlink(path)

    def test_missing_required_columns_fails_cleanly(self):
        path = _write_temp_csv(
            [{"lga_name": "Kaduna North", "facility_type": "phc"}],
            headers=["lga_name", "facility_type"],
        )
        try:
            with self.assertRaises(CommandError) as ctx:
                call_command("import_health_facilities", path)
            self.assertIn("name", str(ctx.exception))
        finally:
            os.unlink(path)
