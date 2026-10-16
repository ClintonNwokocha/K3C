from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from projects.management.commands.generate_climate_proposals import (
    DISCLAIMER,
    ghg_proposal,
    risk_proposal,
    strongest_hazard,
)
from projects.models import ClimateProject


def _profile(**over):
    base = dict(
        lga=SimpleNamespace(lga_name="Testville"), lga_id=99, year=2025,
        flood_risk_score=Decimal("40"), drought_risk_score=Decimal("50"),
        heat_risk_score=Decimal("76"), erosion_risk_score=Decimal("30"),
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
        p = _profile(flood_risk_score=zero, drought_risk_score=zero, heat_risk_score=zero, erosion_risk_score=zero)
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
