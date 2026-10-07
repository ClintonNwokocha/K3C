from unittest.mock import patch

from django.db.utils import OperationalError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase


class HealthCheckTests(APITestCase):
    """Focused tests for the platform-standard GET /api/health endpoint,
    and a regression check that the existing /api/core/health/ endpoint is
    unchanged — both are served by the same core.views.health_check view."""

    def setUp(self):
        self.client = APIClient()

    def test_platform_health_ok(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["database"], "ok")

    def test_platform_health_url_name_resolves(self):
        self.assertEqual(reverse("platform-health-check"), "/api/health")

    def test_existing_core_health_endpoint_unchanged(self):
        response = self.client.get("/api/core/health/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["database"], "ok")

    def test_platform_health_returns_503_when_database_unreachable(self):
        with patch("core.views.connection.cursor", side_effect=OperationalError("could not connect")):
            response = self.client.get("/api/health")

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["status"], "error")
        self.assertEqual(response.data["database"], "unreachable")

    def test_platform_health_failure_does_not_leak_exception_detail(self):
        with patch(
            "core.views.connection.cursor",
            side_effect=OperationalError("password authentication failed for user \"secret\""),
        ):
            response = self.client.get("/api/health")

        body_text = str(response.data)
        self.assertNotIn("password", body_text)
        self.assertNotIn("authentication failed", body_text)

    def test_platform_health_does_not_expose_credentials(self):
        response = self.client.get("/api/health")

        body_text = str(response.data).lower()
        for leaked_term in ("password", "secret_key", "database_password"):
            self.assertNotIn(leaked_term, body_text)
