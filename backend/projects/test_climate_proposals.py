from decimal import Decimal
from types import SimpleNamespace

from django.core.management import call_command
from django.test import SimpleTestCase, TestCase

from projects.management.commands.generate_climate_proposals import (
    DISCLAIMER,
    ghg_proposal,
    risk_proposal,
    strongest_hazard,
)
from climate_risk.models import ClimateRiskProfile
from core.models import LGARegistry
from projects.models import ClimateProject


def _profile(**over):
    base = dict(
        lga=SimpleNamespace(lga_name="Testville"), lga_id=99, year=2025,
        flood_risk_score=Decimal("40"), drought_risk_score=Decimal("50"),
        heat_risk_score=Decimal("76"), erratic_rainfall_risk_score=Decimal("20"),
        erosion_risk_score=Decimal("30"),
        overall_risk_score=Decimal("61.1"), risk_level="high",
        get_risk_level_display=lambda: "High", data_source="KS-CCC development seed data",
    )
    base.update(over)
    return SimpleNamespace(**base)


class ClimateProposalRuleTests(SimpleTestCase):
    def test_strongest_hazard_is_highest_score(self):
        self.assertEqual(strongest_hazard(_profile())[0], "heat")

    def test_no_hazard_when_all_scores_zero(self):
        zero = Decimal("0")
        p = _profile(flood_risk_score=zero, drought_risk_score=zero, heat_risk_score=zero,
                     erratic_rainfall_risk_score=zero, erosion_risk_score=zero)
        self.assertIsNone(risk_proposal(p))

    def test_risk_proposal_is_proposed_concept_without_numbers(self):
        data = risk_proposal(_profile())
        self.assertEqual(data["project_code"], "PROP-RISK-99-heat-2025")
        self.assertIn(DISCLAIMER, data["public_description"])
        self.assertIn("development/test data", data["description"])  # seed data is stated openly
        for forbidden in ("estimated_budget_naira", "expected_ghg_reduction_tco2e", "expected_annual_ghg_impact_tco2e"):
            self.assertNotIn(forbidden, data)
        self.assertLessEqual(len(data["public_summary"]), 300)

    def test_calculated_profile_is_not_labelled_as_seed(self):
        data = risk_proposal(_profile(data_source="Calculated from parameter normalized scores"))
        self.assertNotIn("development/test data", data["description"])

    def test_ghg_proposal_is_statewide_mitigation(self):
        data = ghg_proposal("energy", Decimal("148518"), 2025, preview=True)
        self.assertIsNone(data["lga"])
        self.assertEqual(data["project_type"], ClimateProject.ProjectType.MITIGATION)
        self.assertIn("not the official inventory", data["description"])


class ClimateProposalCycleTests(TestCase):
    def setUp(self):
        self.lga = LGARegistry.objects.create(lga_id=8, lga_name="Kachia")
        self.profile = ClimateRiskProfile.objects.create(
            lga=self.lga, year=2025, flood_risk_score=90, drought_risk_score=80,
            heat_risk_score=80, erratic_rainfall_risk_score=95, exposure_score=0,
            vulnerability_score=80, adaptive_capacity_score=10, data_source="KS-CCC development seed data",
        )

    def run_cmd(self):
        call_command("generate_climate_proposals", "--ghg-top", "0", verbosity=0)

    def test_creates_once_and_is_idempotent(self):
        self.assertEqual(self.profile.risk_level, "high")
        self.run_cmd()
        self.run_cmd()
        qs = ClimateProject.objects.filter(project_code="PROP-RISK-8-erratic_rainfall-2025")
        self.assertEqual(qs.count(), 1)
        p = qs.get()
        self.assertEqual(p.status, "proposed")
        self.assertIsNotNone(p.auto_generated_at)

    def test_refreshes_when_data_changes_until_staff_edit(self):
        self.run_cmd()
        ClimateRiskProfile.objects.filter(pk=self.profile.pk).update(overall_risk_score=Decimal("70.00"))
        self.profile.refresh_from_db()
        self.run_cmd()
        p = ClimateProject.objects.get(project_code="PROP-RISK-8-erratic_rainfall-2025")
        self.assertIn("70.00", p.description)  # refreshed from new data

        p.title = "Kachia: edited by staff"
        p.save()
        ClimateRiskProfile.objects.filter(pk=self.profile.pk).update(overall_risk_score=Decimal("71.00"))
        self.run_cmd()
        p.refresh_from_db()
        self.assertEqual(p.title, "Kachia: edited by staff")
        self.assertNotIn("71.00", p.description)  # left alone after a staff edit
