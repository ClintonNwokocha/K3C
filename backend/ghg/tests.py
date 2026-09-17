from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import UserProfile
from core.models import EmissionFactor, NDCConstant
from public_portal.views import build_public_ghg_summary

from .models import GHGInventoryEntry, GHGStateTotal


def make_user(username, role, assigned_sector=UserProfile.Sector.NONE):
    user = User.objects.create_user(username, password="pw")
    UserProfile.objects.create(user=user, role=role, assigned_sector=assigned_sector)
    return user


class GHGAPITestCase(TestCase):
    """Base class for GHG tests that call authenticated endpoints."""

    def setUp(self):
        self.client = APIClient()


class GHGEmissionsCalculationTests(TestCase):
    """CO2/CH4/N2O/CO2e math on GHGInventoryEntry.calculate_emissions()."""

    def setUp(self):
        self.factor = EmissionFactor.objects.create(
            sector="energy",
            sub_category="stationary_combustion",
            fuel_or_species="diesel",
            co2_ef=Decimal("2.0"),
            ch4_ef=Decimal("0.001"),
            n2o_ef=Decimal("0.0002"),
            unit="litres",
            is_active=True,
        )

    def test_co2_ch4_n2o_and_co2e_computed_correctly(self):
        entry = GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.ENERGY,
            sub_category="stationary_combustion",
            fuel_or_activity="diesel",
            year=2025,
            quantity=Decimal("100"),
            emission_factor=self.factor,
        )

        self.assertEqual(entry.co2_kg, Decimal("200.000000"))
        self.assertEqual(entry.ch4_kg, Decimal("0.100000"))
        self.assertEqual(entry.n2o_kg, Decimal("0.020000"))
        # co2e_kg = 200 + (0.1*28) + (0.02*265) = 200 + 2.8 + 5.3 = 208.1
        self.assertEqual(entry.co2e_tonnes, Decimal("0.208100"))

    def test_recalculates_on_quantity_update(self):
        entry = GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.ENERGY,
            sub_category="stationary_combustion",
            fuel_or_activity="diesel",
            year=2025,
            quantity=Decimal("100"),
            emission_factor=self.factor,
        )

        entry.quantity = Decimal("200")
        entry.save()

        self.assertEqual(entry.co2_kg, Decimal("400.000000"))
        self.assertEqual(entry.co2e_tonnes, Decimal("0.416200"))

    def test_zero_quantity_yields_zero_emissions(self):
        entry = GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.ENERGY,
            sub_category="stationary_combustion",
            fuel_or_activity="diesel",
            year=2025,
            quantity=Decimal("0"),
            emission_factor=self.factor,
        )

        self.assertEqual(entry.co2e_tonnes, Decimal("0.000000"))


class GHGCreateEditPermissionTests(GHGAPITestCase):
    """Create/edit permissions and sector-scoping via the Energy endpoints."""

    def setUp(self):
        super().setUp()
        self.factor = EmissionFactor.objects.create(
            sector="energy",
            sub_category="stationary_combustion",
            fuel_or_species="diesel",
            co2_ef=Decimal("2.0"),
            ch4_ef=Decimal("0.001"),
            n2o_ef=Decimal("0.0002"),
            unit="litres",
            is_active=True,
        )
        self.admin = make_user("admin1", UserProfile.Role.ADMIN)
        self.analyst = make_user("analyst1", UserProfile.Role.ANALYST)
        self.energy_sfp = make_user(
            "energy_sfp", UserProfile.Role.SECTOR_FOCAL_POINT, UserProfile.Sector.ENERGY
        )
        self.waste_sfp = make_user(
            "waste_sfp", UserProfile.Role.SECTOR_FOCAL_POINT, UserProfile.Sector.WASTE
        )

    def _create_payload(self):
        return {
            "sub_category": "stationary_combustion",
            "fuel_or_activity": "diesel",
            "year": 2025,
            "quantity": "100",
            "notes": "",
            "status": "draft",
        }

    def test_energy_focal_point_can_create_entry(self):
        self.client.force_authenticate(user=self.energy_sfp)
        response = self.client.post(
            "/api/ghg/energy/entries/", self._create_payload(), format="json"
        )
        self.assertEqual(response.status_code, 201)

    def test_focal_point_of_other_sector_is_forbidden(self):
        self.client.force_authenticate(user=self.waste_sfp)
        response = self.client.post(
            "/api/ghg/energy/entries/", self._create_payload(), format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_and_analyst_can_create_in_any_sector(self):
        for user in [self.admin, self.analyst]:
            self.client.force_authenticate(user=user)
            response = self.client.post(
                "/api/ghg/energy/entries/", self._create_payload(), format="json"
            )
            self.assertEqual(response.status_code, 201)

    def test_focal_point_can_edit_own_draft_entry(self):
        self.client.force_authenticate(user=self.energy_sfp)
        create_response = self.client.post(
            "/api/ghg/energy/entries/", self._create_payload(), format="json"
        )
        entry_id = create_response.data["entry"]["id"]

        response = self.client.patch(
            f"/api/ghg/energy/entries/{entry_id}/",
            {"quantity": "150"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["entry"]["quantity"], "150.000")

    def test_focal_point_cannot_edit_someone_elses_entry(self):
        self.client.force_authenticate(user=self.energy_sfp)
        create_response = self.client.post(
            "/api/ghg/energy/entries/", self._create_payload(), format="json"
        )
        entry_id = create_response.data["entry"]["id"]

        other_sfp = make_user(
            "energy_sfp_2", UserProfile.Role.SECTOR_FOCAL_POINT, UserProfile.Sector.ENERGY
        )
        self.client.force_authenticate(user=other_sfp)
        response = self.client.patch(
            f"/api/ghg/energy/entries/{entry_id}/",
            {"quantity": "150"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_approved_entry_cannot_be_edited(self):
        entry = GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.ENERGY,
            sub_category="stationary_combustion",
            fuel_or_activity="diesel",
            year=2025,
            quantity=Decimal("100"),
            emission_factor=self.factor,
            status=GHGInventoryEntry.Status.APPROVED,
            submitted_by=self.energy_sfp,
        )

        self.client.force_authenticate(user=self.energy_sfp)
        response = self.client.patch(
            f"/api/ghg/energy/entries/{entry.id}/",
            {"quantity": "150"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)


class GHGSectorFocalPointScopingTests(GHGAPITestCase):
    """Sector focal points only see their own submitted entries; admin/analyst see all."""

    def setUp(self):
        super().setUp()
        self.factor = EmissionFactor.objects.create(
            sector="energy",
            sub_category="stationary_combustion",
            fuel_or_species="diesel",
            co2_ef=Decimal("2.0"),
            unit="litres",
            is_active=True,
        )
        self.sfp_a = make_user(
            "sfp_a", UserProfile.Role.SECTOR_FOCAL_POINT, UserProfile.Sector.ENERGY
        )
        self.sfp_b = make_user(
            "sfp_b", UserProfile.Role.SECTOR_FOCAL_POINT, UserProfile.Sector.ENERGY
        )
        self.admin = make_user("admin2", UserProfile.Role.ADMIN)

        GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.ENERGY,
            sub_category="stationary_combustion",
            fuel_or_activity="diesel",
            year=2025,
            quantity=Decimal("10"),
            emission_factor=self.factor,
            submitted_by=self.sfp_a,
        )
        GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.ENERGY,
            sub_category="stationary_combustion",
            fuel_or_activity="diesel",
            year=2025,
            quantity=Decimal("20"),
            emission_factor=self.factor,
            submitted_by=self.sfp_b,
        )

    def test_focal_point_sees_only_own_entries(self):
        self.client.force_authenticate(user=self.sfp_a)
        response = self.client.get("/api/ghg/energy/entries/")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["submitted_by_username"], "sfp_a"
        )

    def test_admin_sees_all_entries(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/ghg/energy/entries/")
        self.assertEqual(response.data["count"], 2)


class GHGStatusWorkflowTests(GHGAPITestCase):
    """draft -> pending_review -> under_review -> revision_requested / rejected / approved."""

    def setUp(self):
        super().setUp()
        self.factor = EmissionFactor.objects.create(
            sector="energy",
            sub_category="stationary_combustion",
            fuel_or_species="diesel",
            co2_ef=Decimal("2.0"),
            unit="litres",
            is_active=True,
        )
        self.admin = make_user("admin3", UserProfile.Role.ADMIN)
        self.analyst = make_user("analyst3", UserProfile.Role.ANALYST)
        self.sfp = make_user(
            "sfp3", UserProfile.Role.SECTOR_FOCAL_POINT, UserProfile.Sector.ENERGY
        )
        self.entry = GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.ENERGY,
            sub_category="stationary_combustion",
            fuel_or_activity="diesel",
            year=2025,
            quantity=Decimal("100"),
            emission_factor=self.factor,
            submitted_by=self.sfp,
        )

    def test_submit_moves_draft_to_pending_review(self):
        self.client.force_authenticate(user=self.sfp)
        response = self.client.post(f"/api/ghg/energy/entries/{self.entry.id}/submit/")
        self.assertEqual(response.status_code, 200)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, GHGInventoryEntry.Status.PENDING_REVIEW)
        self.assertIsNotNone(self.entry.submitted_at)

    def test_mark_under_review_from_pending(self):
        self.entry.status = GHGInventoryEntry.Status.PENDING_REVIEW
        self.entry.save(update_fields=["status"])

        self.client.force_authenticate(user=self.analyst)
        response = self.client.post(
            f"/api/ghg/energy/entries/{self.entry.id}/review/",
            {"action": "mark_under_review"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, GHGInventoryEntry.Status.UNDER_REVIEW)

    def test_request_revision_requires_comment(self):
        self.entry.status = GHGInventoryEntry.Status.PENDING_REVIEW
        self.entry.save(update_fields=["status"])

        self.client.force_authenticate(user=self.analyst)
        response = self.client.post(
            f"/api/ghg/energy/entries/{self.entry.id}/review/",
            {"action": "request_revision", "reviewer_comment": ""},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_request_revision_with_comment_succeeds(self):
        self.entry.status = GHGInventoryEntry.Status.PENDING_REVIEW
        self.entry.save(update_fields=["status"])

        self.client.force_authenticate(user=self.analyst)
        response = self.client.post(
            f"/api/ghg/energy/entries/{self.entry.id}/review/",
            {"action": "request_revision", "reviewer_comment": "Please recheck fuel volume."},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.entry.refresh_from_db()
        self.assertEqual(
            self.entry.status, GHGInventoryEntry.Status.REVISION_REQUESTED
        )
        self.assertEqual(
            self.entry.reviewer_comment, "Please recheck fuel volume."
        )

    def test_analyst_cannot_reject(self):
        self.entry.status = GHGInventoryEntry.Status.PENDING_REVIEW
        self.entry.save(update_fields=["status"])

        self.client.force_authenticate(user=self.analyst)
        response = self.client.post(
            f"/api/ghg/energy/entries/{self.entry.id}/review/",
            {"action": "reject", "reviewer_comment": "Not valid."},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_analyst_cannot_approve(self):
        self.entry.status = GHGInventoryEntry.Status.PENDING_REVIEW
        self.entry.save(update_fields=["status"])

        self.client.force_authenticate(user=self.analyst)
        response = self.client.post(
            f"/api/ghg/energy/entries/{self.entry.id}/review/",
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_can_reject(self):
        self.entry.status = GHGInventoryEntry.Status.PENDING_REVIEW
        self.entry.save(update_fields=["status"])

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/ghg/energy/entries/{self.entry.id}/review/",
            {"action": "reject", "reviewer_comment": "Evidence insufficient."},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, GHGInventoryEntry.Status.REJECTED)

    def test_admin_can_approve(self):
        self.entry.status = GHGInventoryEntry.Status.PENDING_REVIEW
        self.entry.save(update_fields=["status"])

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/ghg/energy/entries/{self.entry.id}/review/",
            {"action": "approve", "reviewer_comment": ""},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, GHGInventoryEntry.Status.APPROVED)
        self.assertEqual(self.entry.approved_by_id, self.admin.id)
        self.assertIsNotNone(self.entry.approved_at)


class GHGApprovedTotalRecomputeTests(GHGAPITestCase):
    """GHGStateTotal cache is rebuilt from approved entries only, on every review action."""

    def setUp(self):
        super().setUp()
        self.factor = EmissionFactor.objects.create(
            sector="energy",
            sub_category="stationary_combustion",
            fuel_or_species="diesel",
            co2_ef=Decimal("2.0"),
            unit="litres",
            is_active=True,
        )
        self.admin = make_user("admin4", UserProfile.Role.ADMIN)

    def _make_entry(self, quantity, status):
        return GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.ENERGY,
            sub_category="stationary_combustion",
            fuel_or_activity="diesel",
            year=2025,
            quantity=Decimal(quantity),
            emission_factor=self.factor,
            status=status,
        )

    def test_total_only_counts_approved_entries(self):
        approved = self._make_entry("100", GHGInventoryEntry.Status.PENDING_REVIEW)
        self._make_entry("999", GHGInventoryEntry.Status.DRAFT)

        self.client.force_authenticate(user=self.admin)
        self.client.post(
            f"/api/ghg/energy/entries/{approved.id}/review/",
            {"action": "approve", "reviewer_comment": ""},
            format="json",
        )

        total = GHGStateTotal.objects.get(
            sector=GHGInventoryEntry.Sector.ENERGY, year=2025
        )
        # 100 * co2_ef(2.0) = 200kg co2 -> 0.2 tCO2e (no ch4/n2o factor set)
        self.assertEqual(total.total_co2e, Decimal("0.200000"))

    def test_rejecting_an_approved_years_only_entry_zeroes_the_total(self):
        entry = self._make_entry("100", GHGInventoryEntry.Status.PENDING_REVIEW)

        self.client.force_authenticate(user=self.admin)
        self.client.post(
            f"/api/ghg/energy/entries/{entry.id}/review/",
            {"action": "approve", "reviewer_comment": ""},
            format="json",
        )

        entry.status = GHGInventoryEntry.Status.PENDING_REVIEW
        entry.save(update_fields=["status"])

        self.client.post(
            f"/api/ghg/energy/entries/{entry.id}/review/",
            {"action": "reject", "reviewer_comment": "Revoking approval."},
            format="json",
        )

        total = GHGStateTotal.objects.get(
            sector=GHGInventoryEntry.Sector.ENERGY, year=2025
        )
        self.assertEqual(total.total_co2e, Decimal("0"))


class GHGDashboardSummaryTests(GHGAPITestCase):
    """Cross-sector dashboard-summary endpoint calculations."""

    def setUp(self):
        super().setUp()
        self.admin = make_user("admin5", UserProfile.Role.ADMIN)
        self.energy_factor = EmissionFactor.objects.create(
            sector="energy",
            sub_category="stationary_combustion",
            fuel_or_species="diesel",
            co2_ef=Decimal("2.0"),
            unit="litres",
            is_active=True,
        )
        self.agriculture_factor = EmissionFactor.objects.create(
            sector="agriculture",
            sub_category="enteric_fermentation",
            fuel_or_species="dairy_cattle",
            co2_ef=Decimal("1.0"),
            unit="head",
            is_active=True,
        )

        GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.ENERGY,
            sub_category="stationary_combustion",
            fuel_or_activity="diesel",
            year=2025,
            quantity=Decimal("100"),
            emission_factor=self.energy_factor,
            status=GHGInventoryEntry.Status.APPROVED,
        )
        GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.AGRICULTURE,
            sub_category="enteric_fermentation",
            fuel_or_activity="dairy_cattle",
            year=2025,
            quantity=Decimal("50"),
            emission_factor=self.agriculture_factor,
            status=GHGInventoryEntry.Status.APPROVED,
        )
        GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.ENERGY,
            sub_category="stationary_combustion",
            fuel_or_activity="diesel",
            year=2025,
            quantity=Decimal("999"),
            emission_factor=self.energy_factor,
            status=GHGInventoryEntry.Status.PENDING_REVIEW,
        )

        GHGStateTotal.objects.update_or_create(
            sector=GHGInventoryEntry.Sector.ENERGY,
            year=2025,
            defaults={"total_co2e": Decimal("0.200000"), "status": "approved_only"},
        )
        GHGStateTotal.objects.update_or_create(
            sector=GHGInventoryEntry.Sector.AGRICULTURE,
            year=2025,
            defaults={"total_co2e": Decimal("0.050000"), "status": "approved_only"},
        )

    def test_sector_breakdown_and_totals(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/ghg/dashboard-summary/")
        self.assertEqual(response.status_code, 200)

        ghg = response.data["ghg"]
        self.assertEqual(ghg["latest_year"], 2025)
        self.assertAlmostEqual(ghg["latest_total_tco2e"], 0.25, places=6)

        breakdown_by_sector = {
            row["sector"]: row["total_co2e"] for row in ghg["sector_breakdown"]
        }
        self.assertAlmostEqual(breakdown_by_sector["energy"], 0.2, places=6)
        self.assertAlmostEqual(breakdown_by_sector["agriculture"], 0.05, places=6)
        # Sectors with no approved data yet still appear, at zero.
        self.assertIn("waste", breakdown_by_sector)
        self.assertAlmostEqual(breakdown_by_sector["waste"], 0, places=6)

    def test_review_queue_counts_exclude_approved_and_draft(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/ghg/dashboard-summary/")

        ghg = response.data["ghg"]
        self.assertEqual(ghg["approved_entry_count"], 2)
        self.assertEqual(ghg["pending_review_count"], 1)
        self.assertEqual(ghg["total_review_queue_count"], 1)

    def test_ndc_preview_uses_active_ndc_constant(self):
        NDCConstant.objects.create(
            kaduna_baseline_mt=Decimal("13.3"),
            unconditional_pct=Decimal("47"),
            is_active=True,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/ghg/dashboard-summary/")

        ndc_preview = response.data["ndc_preview"]
        self.assertEqual(ndc_preview["kaduna_baseline_mt"], 13.3)
        self.assertEqual(
            ndc_preview["note"],
            "Implemented-sector preview only. This becomes official state "
            "NDC progress after all GHG sectors are implemented and approved.",
        )


class GHGPublicInternalReconciliationTests(GHGAPITestCase):
    """Compare the internal ghg_dashboard_summary NDC figures against the
    public portal's build_public_ghg_summary(), which draws on the same
    NDCConstant row but is a structurally separate code path.
    """

    def setUp(self):
        super().setUp()
        self.admin = make_user("admin6", UserProfile.Role.ADMIN)
        NDCConstant.objects.create(
            kaduna_baseline_mt=Decimal("13.3"),
            nigeria_baseline_mt=Decimal("317"),
            kaduna_share_pct=Decimal("4.2"),
            target_year=2030,
            unconditional_pct=Decimal("47"),
            conditional_pct=Decimal("50"),
            is_active=True,
        )

    def test_baseline_constants_agree_between_public_and_internal(self):
        self.client.force_authenticate(user=self.admin)
        internal = self.client.get("/api/ghg/dashboard-summary/").data
        public = build_public_ghg_summary()

        self.assertEqual(
            internal["ndc_preview"]["kaduna_baseline_mt"],
            public["baseline_emissions_mtco2e"],
        )
        self.assertEqual(
            internal["ndc_preview"]["unconditional_target_pct"],
            public["unconditional_reduction_target_pct"],
        )

    def test_public_summary_does_not_expose_actual_sector_emissions(self):
        """Documents current behavior: build_public_ghg_summary() only
        returns static NDC baseline constants — it does not query
        GHGInventoryEntry/GHGStateTotal at all, so it can never reflect
        real approved sector totals or a sector breakdown. This is a
        known data-quality gap (see assessment report), not something
        fixed in this change; this test pins current behavior so a
        future fix is a deliberate, visible change here.
        """
        public = build_public_ghg_summary()

        self.assertNotIn("sector_breakdown", public)
        self.assertNotIn("total_emissions_tco2e", public)
        self.assertNotIn("by_sector", public)
