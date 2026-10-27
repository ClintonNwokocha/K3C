import csv
from decimal import Decimal as D
from io import StringIO

from django.core.management import call_command
from django.test import SimpleTestCase, TestCase

from core.models import EmissionFactor, LGARegistry
from ghg.management.commands.sync_inventory_activity import interpolate_epochs
from ghg.models import ActivityData, CategoryStatus, GHGInventoryEntry, GHGStateTotal, LGAClimateProfile
from ghg.tier1 import METHOD_VERSION, engine
from ghg.tier1 import calculators as calc
from ghg.tier1 import factors as F

DRY = {"19001": {"wet": False, "temp_c": D("24.9")}}
WET = {"19001": {"wet": True, "temp_c": D("25.6")}}


def lines_for(lines, ipcc_code, source_key=None):
    return [l for l in lines if l.ipcc_code == ipcc_code and (source_key is None or l.source_key == source_key)]


class Tier1CalculatorTests(SimpleTestCase):
    """Worked examples from the GHG Inventory Methodology document (section 17)."""

    def test_cattle_enteric_matches_methodology_example(self):
        activity = {("19001", 2022, "livestock.head.other_cattle"): D("1000")}
        line = lines_for(calc.livestock(activity, DRY, ["19001"], [2022]), "3.A.1")[0]
        self.assertEqual(line.ch4, D("31"))
        self.assertEqual(line.co2e_tonnes, D("868"))

    def test_manure_band_follows_temperature(self):
        activity = {("19001", 2022, "livestock.head.swine"): D("100")}
        cool = lines_for(calc.livestock(activity, DRY, ["19001"], [2022]), "3.A.2", "swine__temperate")
        warm = lines_for(calc.livestock(activity, WET, ["19001"], [2022]), "3.A.2", "swine__warm")
        self.assertEqual(cool[0].ch4, D("1"))
        self.assertEqual(warm[0].ch4, D("2"))

    def test_savanna_fire_matches_methodology_example(self):
        activity = {("19001", 2022, "fire.burned_ha.grass"): D("10000")}
        line = calc.fires(activity, DRY, ["19001"], [2022])[0]
        self.assertEqual(line.quantity * line.ch4, D("92000.0"))
        self.assertAlmostEqual(float(line.co2e_tonnes), 4802, places=0)

    def test_rice_rainfed_matches_methodology_example(self):
        activity = {("19001", 2022, "crops.rice_area_ha"): D("1000")}
        line = lines_for(calc.soils_and_rice(activity, DRY, ["19001"], [2022]), "3.C.7")[0]
        self.assertAlmostEqual(float(line.quantity * line.ch4 / 1000), 43.68, places=2)

    def test_fertiliser_converts_n2o_n_to_n2o(self):
        activity = {("19001", 2022, "fertiliser.synthetic_n_kg"): D("1000000")}
        direct = lines_for(calc.soils_and_rice(activity, DRY, ["19001"], [2022]), "3.C.4")[0]
        self.assertAlmostEqual(float(direct.quantity * direct.n2o), 15714.29, places=1)

    def test_leaching_only_in_wet_zone(self):
        activity = {("19001", 2022, "fertiliser.synthetic_n_kg"): D("1000")}
        dry = lines_for(calc.soils_and_rice(activity, DRY, ["19001"], [2022]), "3.C.5")[0]
        wet = lines_for(calc.soils_and_rice(activity, WET, ["19001"], [2022]), "3.C.5")[0]
        self.assertLess(dry.n2o, wet.n2o)
        self.assertEqual(dry.n2o, F.FRAC_GASF * F.EF4_VOLATILISATION * F.N2O_N_TO_N2O)

    def test_firewood_co2_is_memo_only(self):
        activity = {("19001", 2022, "energy.woodfuel_t"): D("1")}
        line = calc.cooking(activity, DRY, ["19001"], [2022])[0]
        self.assertTrue(line.biogenic_co2)
        self.assertEqual(line.co2, D("1747.2000"))
        self.assertAlmostEqual(float(line.co2e_tonnes), 0.147576, places=6)

    def test_first_order_decay_reaches_steady_state(self):
        deposits = {y: D("1000") for y in range(1975, 2026)}
        ch4 = calc.fod_methane_t(deposits, F.SWDS_K["wet"], [2025])
        steady = D("1000") * F.DOC_BULK * F.DOCF * F.SWDS_MCF * F.CH4_FRACTION_F * D("16") / D("12")
        self.assertAlmostEqual(float(ch4[2025]), float(steady), delta=0.1)

    def test_first_order_decay_starts_year_after_deposit(self):
        ch4 = calc.fod_methane_t({2020: D("1000")}, F.SWDS_K["dry"], [2020, 2021])
        self.assertEqual(ch4[2020], D("0"))
        self.assertGreater(ch4[2021], D("0"))

    def test_wastewater_mcf_uses_sanitation_mix(self):
        activity = {
            ("19001", 2022, "population.total"): D("1000"),
            ("19001", 2022, "population.urban"): D("1000"),
        }
        line = lines_for(calc.waste(activity, DRY, ["19001"], [2022]), "4.D.1")[0]
        self.assertAlmostEqual(float(line.ch4), 13.505 * 0.6 * 0.23, places=4)

    def test_land_conversion_is_provisional(self):
        activity = {("19001", 2022, "lulc.transition_ha.trees>crops"): D("10")}
        agb = {"trees": D("15"), "crops": D("10")}
        lines = calc.land_use_change(activity, DRY, ["19001"], [2022], agb)
        self.assertTrue(lines)
        self.assertTrue(all(l.provisional for l in lines))
        loss = [l for l in lines if l.source_key == "trees>crops_biomass_loss"][0]
        expected = (D("15") * (1 + F.ROOT_SHOOT_TREES) - D("10")) * F.CARBON_FRACTION * F.C_TO_CO2 * 1000
        self.assertEqual(loss.co2, expected)

    def test_interpolate_ghsl_epochs(self):
        epochs = {2020: 100.0, 2025: 150.0}
        self.assertEqual(interpolate_epochs(epochs, 2022), 120.0)
        self.assertEqual(interpolate_epochs(epochs, 2030), 150.0)


class Tier1EngineTests(TestCase):
    def setUp(self):
        self.lga = LGARegistry.objects.create(lga_id=19001, lga_name="Birnin Gwari")
        LGAClimateProfile.objects.create(
            lga=self.lga,
            mean_annual_rainfall_mm=D("1100"),
            mean_annual_temp_c=D("25.0"),
            climate_zone=LGAClimateProfile.Zone.TROPICAL_MOIST,
            source="test",
            method_version=METHOD_VERSION,
        )
        rows = [
            ("livestock.head.other_cattle", 2022, D("1000")),
            ("fire.burned_ha.grass", 2022, D("500")),
            ("energy.woodfuel_t", 2022, D("100")),
            ("population.total", 2022, D("10000")),
            ("population.urban", 2022, D("4000")),
            ("lulc.transition_ha.trees>crops", 2022, D("10")),
        ]
        for key, year, qty in rows:
            ActivityData.objects.create(
                lga=self.lga, year=year, activity_key=key, quantity=qty, unit="u",
                source_type=ActivityData.SourceType.REMOTE_SENSING, source_name="test",
                method_version=METHOD_VERSION, confidence="low",
            )
        for dw_class, agb in (("trees", D("15")), ("crops", D("10"))):
            ActivityData.objects.create(
                lga=None, year=2020, activity_key=f"lulc.agb_t_per_ha.{dw_class}", quantity=agb,
                unit="t_dm_per_ha", source_type=ActivityData.SourceType.REMOTE_SENSING,
                source_name="test", method_version=METHOD_VERSION, confidence="low",
            )

    def test_run_writes_entries_for_review_and_lulucf_as_draft(self):
        engine.run([2022])
        entries = GHGInventoryEntry.objects.filter(method_version=METHOD_VERSION)
        self.assertTrue(entries.exists())
        self.assertFalse(entries.filter(sector="lulucf").exclude(status=GHGInventoryEntry.Status.DRAFT).exists())
        self.assertFalse(entries.exclude(sector="lulucf").exclude(status=GHGInventoryEntry.Status.PENDING_REVIEW).exists())
        self.assertEqual(
            CategoryStatus.objects.filter(year=2022, method_version=METHOD_VERSION).count(),
            len(engine.CATEGORY_REGISTER),
        )

    def test_firewood_entry_keeps_co2_out_of_total(self):
        engine.run([2022])
        wood = GHGInventoryEntry.objects.get(method_version=METHOD_VERSION, fuel_or_activity="firewood")
        self.assertEqual(wood.co2_kg, D("0"))
        self.assertEqual(wood.co2_biogenic_kg, D("174720.000000"))
        self.assertTrue(wood.emission_factor.is_biogenic_co2)
        self.assertFalse(wood.emission_factor.is_active)

    def test_approved_run_updates_state_totals_without_lulucf(self):
        engine.run([2022], status=GHGInventoryEntry.Status.APPROVED)
        agriculture = GHGStateTotal.objects.get(sector="agriculture", year=2022)
        self.assertGreater(agriculture.total_co2e, 0)
        lulucf = GHGStateTotal.objects.get(sector="lulucf", year=2022)
        self.assertEqual(lulucf.total_co2e, 0)

    def test_public_explorer_labels_tier1_as_provisional(self):
        from public_portal.views import build_public_ghg_inventory_explorer

        engine.run([2022], status=GHGInventoryEntry.Status.APPROVED)
        payload = build_public_ghg_inventory_explorer({"year": "2022"})
        self.assertEqual(payload["inventory_status"]["code"], "provisional_tier1_estimate")
        method = payload["method"]
        self.assertEqual(method["year"], 2022)
        self.assertIn("1.A.3.b", [c["ipcc_code"] for c in method["not_estimated"]])
        self.assertIn("1.B.1", [c["ipcc_code"] for c in method["not_occurring"]])
        self.assertAlmostEqual(method["biogenic_co2_memo_tco2"], 174.72, places=2)
        self.assertGreater(method["lulucf_provisional_tco2e"], 0)
        # LULUCF is held back from the published total.
        self.assertNotIn("lulucf", {r["sector"] for r in payload["records"]})

    def test_rerun_replaces_instead_of_duplicating(self):
        engine.run([2022])
        first = GHGInventoryEntry.objects.filter(method_version=METHOD_VERSION).count()
        engine.run([2022])
        self.assertEqual(GHGInventoryEntry.objects.filter(method_version=METHOD_VERSION).count(), first)

    def test_dry_run_writes_nothing(self):
        result = engine.run([2022], dry_run=True)
        self.assertGreater(result["lines"], 0)
        self.assertFalse(GHGInventoryEntry.objects.filter(method_version=METHOD_VERSION).exists())

    def test_compute_command_reports_totals(self):
        call_command("compute_tier1_inventory", "--years", "2022", "--dry-run", stdout=StringIO())
        self.assertFalse(GHGInventoryEntry.objects.filter(method_version=METHOD_VERSION).exists())

    def test_energy_seed_marks_biomass_biogenic(self):
        call_command("seed_energy_factors", stdout=StringIO())
        wood = EmissionFactor.objects.get(sector="energy", sub_category="stationary_combustion", fuel_or_species="firewood")
        diesel = EmissionFactor.objects.get(sector="energy", sub_category="transport_combustion", fuel_or_species="diesel")
        self.assertTrue(wood.is_biogenic_co2)
        self.assertGreater(wood.ch4_ef, 0)
        self.assertAlmostEqual(float(diesel.co2_ef), 3186.3, places=1)


class LoadOpenActivityDataTests(TestCase):
    def test_allocates_faostat_to_lgas(self):
        from ghg.management.commands.load_open_activity_data import DATA_DIR

        # Registry ids are 1-23 as on staging, not the boundary codes; the
        # loader matches on LGA name.
        with open(DATA_DIR / "lga_shares.csv", encoding="utf-8") as fh:
            names = sorted({r["lganame"] for r in csv.DictReader(fh)})
        for lga_id, name in enumerate(names, start=1):
            LGARegistry.objects.create(lga_id=lga_id, lga_name=name)
        call_command("load_open_activity_data", "--years", "2022", stdout=StringIO())

        cattle = sum(
            a.quantity for a in ActivityData.objects.filter(year=2022, activity_key__in=[
                "livestock.head.dairy_cattle", "livestock.head.other_cattle"])
        )
        # Kaduna holds ~3.4% of Nigeria's cattle in GLW3; FAOSTAT 2022 herd is ~20.9 M.
        self.assertAlmostEqual(float(cattle) / 20862418, 0.0344, places=3)
        rice = ActivityData.objects.filter(year=2022, activity_key="crops.rice_area_ha")
        self.assertEqual(rice.count(), 23)

    def test_missing_registry_lga_is_reported_by_name(self):
        from ghg.tier1.lgas import registry_by_lgacode

        LGARegistry.objects.create(lga_id=1, lga_name="Jema'a")
        self.assertEqual(registry_by_lgacode({"19007": "Jema’a"})["19007"].lga_id, 1)
        with self.assertRaisesMessage(ValueError, "Zaria (19023)"):
            registry_by_lgacode({"19023": "Zaria"})
