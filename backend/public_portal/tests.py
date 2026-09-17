import json
from io import StringIO
from decimal import Decimal
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db.models import Sum
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase, override_settings

from core.geography import KADUNA_LGAS
from core.models import EmissionFactor
from core.models import LGARegistry
from ghg.models import GHGInventoryEntry
from ghg.preview_dataset import (
    PREVIEW_BATCH_ID,
    PREVIEW_CATEGORIES,
    PREVIEW_SECTOR_TOTALS,
    PREVIEW_YEARS,
    preview_record_count,
)
from projects.models import ClimateProject
from public_portal.exposure_analytics import (
    ExposureAnalyticsService,
    ExposureMask,
)
from public_portal.management.commands.compute_flood_building_exposure import (
    Command as FloodBuildingExposureCommand,
)


SAMPLE_CACHE = {
    "method_version": "gee_high_risk_lga_context_v1",
    "methodology_version": "1.0",
    "generated_at": "2026-07-20",
    "computation_date": "2026-07-20",
    "cache_ttl_days": 90,
    "risk_year": 2025,
    "boundary_source": "frontend/public/data/kaduna_lga.geojson",
    "population": {
        "dataset_id": "WorldPop/GP/100m/pop",
        "dataset_version": "WorldPop GP 100m Nigeria annual population",
        "source_year": 2020,
        "scale_m": 100,
        "reducer": "ee.Reducer.sum via reduceRegions",
        "tile_scale": 8,
        "total": 2452399,
        "breakdown": [{"lga_name": "Zaria", "estimated_people": 609953}],
    },
    "buildings": {
        "dataset_id": "GOOGLE/Research/open-buildings/v3/polygons",
        "dataset_version": "Open Buildings v3 polygons",
        "confidence_threshold": 0.75,
        "filter": "confidence >= 0.75 and filterBounds(LGA geometry)",
        "area_field": "area_in_meters",
        "total": 526125,
        "total_footprint_area_m2": 47519607.61473088,
        "breakdown": [{"lga_name": "Zaria", "mapped_buildings": 135367}],
    },
    "flood": {
        "generated_at": "2026-07-21",
        "source": "JRC Global Surface Water v1.4 occurrence band",
        "dataset_id": "JRC/GSW1_4/GlobalSurfaceWater",
        "dataset_version": "JRC GSW v1.4",
        "band": "occurrence",
        "observation_period": "1984-2021",
        "risk_year": 2021,
        "flood_occurrence_threshold_pct": 10,
        "mask_definition": "JRC occurrence > 10%",
        "population_dataset_id": "WorldPop/GP/100m/pop",
        "population_source_year": 2020,
        "population_exposed": 37805,
        "mapped_structures_exposed": None,
        "building_area_exposed_m2": None,
        "status": "partial",
    },
}


@override_settings(USE_TZ=True)
class ExposureAnalyticsServiceTests(SimpleTestCase):
    def tearDown(self):
        ExposureAnalyticsService.clear_cache()

    @patch("public_portal.exposure_analytics._load_cached_summary")
    def test_public_summary_preserves_aggregate_fields(self, mocked_cache):
        mocked_cache.return_value = SAMPLE_CACHE

        summary = ExposureAnalyticsService().get_public_summary()

        self.assertEqual(
            summary["estimated_people_in_high_risk_lgas"],
            2452399,
        )
        self.assertEqual(summary["estimated_people_source_year"], 2020)
        self.assertEqual(
            summary["mapped_buildings_in_high_risk_lgas"],
            526125,
        )
        self.assertEqual(
            summary["mapped_buildings_confidence_threshold"],
            0.75,
        )
        self.assertEqual(
            summary["mapped_building_footprint_area_m2"],
            47519607.61473088,
        )
        self.assertEqual(
            summary["high_risk_exposure_method"]["population_dataset_id"],
            "WorldPop/GP/100m/pop",
        )
        self.assertEqual(
            summary["high_risk_exposure_method"]["buildings_dataset_id"],
            "GOOGLE/Research/open-buildings/v3/polygons",
        )
        self.assertEqual(
            summary["high_risk_exposure_cache"]["generated_at"],
            "2026-07-20",
        )
        self.assertEqual(summary["flood_population_exposed"], 37805)
        self.assertIsNone(summary["flood_structures_exposed"])
        self.assertIsNone(summary["flood_building_area_exposed"])
        self.assertEqual(
            summary["flood_dataset"],
            "JRC/GSW1_4/GlobalSurfaceWater",
        )
        self.assertEqual(summary["flood_generated_at"], "2026-07-21")

    @patch("public_portal.exposure_analytics._load_cached_summary")
    def test_flood_mask_reads_cached_flood_summary(self, mocked_cache):
        mocked_cache.return_value = SAMPLE_CACHE

        service = ExposureAnalyticsService()

        self.assertEqual(
            service.compute_population_exposure(
                ExposureAnalyticsService.flood_occurrence_mask()
            )["population_exposed"],
            37805,
        )

    @patch("public_portal.exposure_analytics._load_cached_summary")
    def test_unknown_hazard_mask_is_explicitly_not_implemented(self, mocked_cache):
        mocked_cache.return_value = SAMPLE_CACHE

        service = ExposureAnalyticsService()

        with self.assertRaises(NotImplementedError):
            service.compute_population_exposure(ExposureMask(kind="heat"))

    @patch("public_portal.exposure_analytics._load_cached_summary")
    def test_service_ignores_unvalidated_flood_building_metrics(self, mocked_cache):
        cache = json.loads(json.dumps(SAMPLE_CACHE))
        cache["flood"]["status"] = "pilot"
        cache["flood"]["validated_for_publication"] = False
        cache["flood"]["mapped_structures_exposed"] = 12
        cache["flood"]["building_area_exposed_m2"] = 345.6
        mocked_cache.return_value = cache

        summary = ExposureAnalyticsService().get_public_summary()

        self.assertEqual(summary["flood_population_exposed"], 37805)
        self.assertIsNone(summary["flood_structures_exposed"])
        self.assertIsNone(summary["flood_building_area_exposed"])

    @patch("public_portal.exposure_analytics._load_cached_summary")
    def test_validated_flood_building_metrics_are_read_when_present(self, mocked_cache):
        cache = json.loads(json.dumps(SAMPLE_CACHE))
        cache["flood"]["status"] = "validated"
        cache["flood"]["validated_for_publication"] = True
        cache["flood"]["mapped_structures_exposed"] = 12
        cache["flood"]["building_area_exposed_m2"] = 345.6
        mocked_cache.return_value = cache

        summary = ExposureAnalyticsService().get_public_summary()

        self.assertEqual(summary["flood_structures_exposed"], 12)
        self.assertEqual(summary["flood_building_area_exposed"], 345.6)


@override_settings(USE_TZ=True)
class FloodBuildingExposureCommandTests(SimpleTestCase):
    def test_command_requires_bounded_lga_scope(self):
        with self.assertRaises(CommandError):
            call_command("compute_flood_building_exposure")

    def test_default_dry_run_does_not_overwrite_production_cache(self):
        production_cache = (
            Path(__file__).resolve().parent
            / "data"
            / "high_risk_exposure_summary.json"
        )
        before = production_cache.read_text(encoding="utf-8")

        call_command("compute_flood_building_exposure", admin_code="19008")

        self.assertEqual(production_cache.read_text(encoding="utf-8"), before)

    def test_invalid_confidence_threshold_is_rejected(self):
        with self.assertRaises(CommandError):
            call_command(
                "compute_flood_building_exposure",
                admin_code="19008",
                confidence_threshold=1.25,
            )

    def test_invalid_occurrence_threshold_is_rejected(self):
        with self.assertRaises(CommandError):
            call_command(
                "compute_flood_building_exposure",
                admin_code="19008",
                occurrence_threshold=0,
            )

    def test_pilot_output_schema_is_complete(self):
        metrics = {
            "total_buildings": 100,
            "flood_exposed_buildings": 25,
            "total_building_area_m2": 1000.0,
            "flood_exposed_building_area_m2": 200.0,
        }
        command = FloodBuildingExposureCommand()
        feature = command._select_features(admin_code="19008")[0]
        payload = command._build_payload(
            feature=feature,
            confidence_threshold=0.75,
            occurrence_threshold=10,
            metrics=metrics,
            command_text="compute_flood_building_exposure --admin-code=19008 --force",
        )

        self.assertEqual(payload["status"], "pilot")
        self.assertFalse(payload["validated_for_publication"])
        self.assertEqual(payload["admin_code"], "19008")
        self.assertEqual(payload["admin_name"], "Kachia")
        self.assertEqual(payload["method"]["water_dataset"], "JRC/GSW1_4/GlobalSurfaceWater")
        self.assertEqual(
            payload["method"]["building_dataset"],
            "GOOGLE/Research/open-buildings/v3/polygons",
        )
        self.assertEqual(payload["metrics"]["exposed_buildings_percent"], 25.0)
        self.assertEqual(payload["metrics"]["exposed_area_percent"], 20.0)
        self.assertEqual(payload["provenance"]["processing_mode"], "offline")
        self.assertTrue(payload["limitations"])

    def test_totals_and_percentages_are_internally_consistent(self):
        command = FloodBuildingExposureCommand()

        metrics = command._normalize_metrics({
            "total_buildings": 80,
            "flood_exposed_buildings": 20,
            "total_building_area_m2": 500.0,
            "flood_exposed_building_area_m2": 125.0,
        })

        self.assertEqual(metrics["exposed_buildings_percent"], 25.0)
        self.assertEqual(metrics["exposed_area_percent"], 25.0)


class PublicGHGInventoryEndpointTests(TestCase):
    def setUp(self):
        self.factor = EmissionFactor.objects.create(
            sector="energy",
            sub_category="stationary_combustion",
            fuel_or_species="diesel",
            co2_ef=Decimal("2.680000"),
            ch4_ef=Decimal("0.001000"),
            n2o_ef=Decimal("0.000100"),
            unit="litres",
            ipcc_source="Test factor",
        )

    def _create_factor(
        self,
        *,
        sector="energy",
        sub_category="stationary_combustion",
        fuel_or_species="diesel",
        co2_ef=Decimal("2.680000"),
        ch4_ef=Decimal("0.001000"),
        n2o_ef=Decimal("0.000100"),
        unit="litres",
    ):
        return EmissionFactor.objects.create(
            sector=sector,
            sub_category=sub_category,
            fuel_or_species=fuel_or_species,
            co2_ef=co2_ef,
            ch4_ef=ch4_ef,
            n2o_ef=n2o_ef,
            unit=unit,
            ipcc_source="Test factor",
        )

    def _create_lga(self, lga_id=1, lga_name="Birnin Gwari"):
        return LGARegistry.objects.create(
            lga_id=lga_id,
            lga_name=lga_name,
            state="Kaduna",
        )

    def _create_entry(
        self,
        status,
        quantity="1000",
        *,
        sector=GHGInventoryEntry.Sector.ENERGY,
        sub_category="stationary_combustion",
        fuel_or_activity="diesel",
        year=2025,
        emission_factor=None,
        lga=None,
    ):
        return GHGInventoryEntry.objects.create(
            sector=sector,
            sub_category=sub_category,
            fuel_or_activity=fuel_or_activity,
            lga=lga,
            year=year,
            quantity=Decimal(quantity),
            unit="litres",
            emission_factor=emission_factor or self.factor,
            status=status,
        )

    def test_public_ghg_inventory_exposes_approved_records_only(self):
        approved = self._create_entry(GHGInventoryEntry.Status.APPROVED)
        self._create_entry(GHGInventoryEntry.Status.UNDER_REVIEW, "500")

        response = self.client.get("/api/public/ghg-inventory/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(
            payload["inventory_status"]["label"],
            "Official inventory published",
        )
        self.assertEqual(payload["inventory_status"]["approved_entry_count"], 1)
        self.assertEqual(payload["inventory_status"]["non_public_entry_count"], 1)
        self.assertEqual(len(payload["records"]), 1)
        self.assertEqual(payload["records"][0]["id"], approved.id)
        self.assertEqual(payload["records"][0]["data_status"], "Official inventory value")
        self.assertFalse(
            payload["inventory_status"]["project_reductions_are_inventory"]
        )

    def test_metadata_sectors_are_stable_when_selected_year_lacks_records(self):
        self._create_entry(GHGInventoryEntry.Status.APPROVED, year=2025)

        response = self.client.get("/api/public/ghg-inventory/?year=2020")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        sectors = payload["metadata"]["sectors"]
        self.assertEqual(
            [sector["value"] for sector in sectors],
            ["agriculture", "energy", "ippu", "lulucf", "waste"],
        )
        self.assertIn(
            {
                "value": "ippu",
                "label": "Industrial Processes and Product Use",
            },
            sectors,
        )
        self.assertEqual(payload["records"], [])

    def test_metadata_categories_are_derived_across_all_public_years(self):
        waste_factor = self._create_factor(
            sector="waste",
            sub_category="solid_waste",
            fuel_or_species="open_dump",
            co2_ef=Decimal("0"),
            ch4_ef=Decimal("40"),
            n2o_ef=Decimal("0"),
        )
        self._create_entry(GHGInventoryEntry.Status.APPROVED, year=2025)
        self._create_entry(
            GHGInventoryEntry.Status.APPROVED,
            sector=GHGInventoryEntry.Sector.WASTE,
            sub_category="solid_waste",
            fuel_or_activity="open_dump",
            year=2020,
            emission_factor=waste_factor,
        )

        response = self.client.get("/api/public/ghg-inventory/?year=2025")

        self.assertEqual(response.status_code, 200)
        categories = response.json()["metadata"]["categories"]
        self.assertIn(
            {
                "value": "solid_waste",
                "label": "Solid Waste",
                "sector": "waste",
            },
            categories,
        )

    def test_non_public_records_do_not_contribute_to_public_metadata(self):
        waste_factor = self._create_factor(
            sector="waste",
            sub_category="wastewater",
            fuel_or_species="domestic_wastewater",
        )
        self._create_entry(GHGInventoryEntry.Status.APPROVED)
        self._create_entry(
            GHGInventoryEntry.Status.UNDER_REVIEW,
            sector=GHGInventoryEntry.Sector.WASTE,
            sub_category="wastewater",
            fuel_or_activity="domestic_wastewater",
            emission_factor=waste_factor,
        )

        response = self.client.get("/api/public/ghg-inventory/")

        self.assertEqual(response.status_code, 200)
        category_values = {
            category["value"]
            for category in response.json()["metadata"]["categories"]
        }
        self.assertEqual(category_values, {"stationary_combustion"})

    def test_valid_unavailable_filter_combination_returns_empty_records(self):
        self._create_entry(GHGInventoryEntry.Status.APPROVED, year=2025)

        response = self.client.get(
            "/api/public/ghg-inventory/?year=2025&sector=waste"
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["records"], [])
        self.assertIsNone(payload["summary"]["published_total_emissions_tco2e"])
        self.assertEqual(payload["summary"]["matching_record_count"], 0)
        self.assertEqual(
            payload["inventory_status"]["code"],
            "official_inventory_published",
        )

    def test_metadata_geographies_include_state_and_all_kaduna_lgas(self):
        self._create_entry(GHGInventoryEntry.Status.APPROVED)

        response = self.client.get("/api/public/ghg-inventory/")

        self.assertEqual(response.status_code, 200)
        geographies = response.json()["metadata"]["geographies"]
        self.assertEqual(geographies[0], {"value": "all", "label": "All geographies"})
        self.assertEqual(geographies[1], {"value": "statewide", "label": "Kaduna State"})
        self.assertEqual(
            [row["label"] for row in geographies[2:]],
            KADUNA_LGAS,
        )
        self.assertEqual(len(geographies), 25)

    def test_metadata_geographies_do_not_shrink_when_year_is_filtered(self):
        self._create_entry(GHGInventoryEntry.Status.APPROVED, year=2025)

        unfiltered = self.client.get("/api/public/ghg-inventory/").json()
        filtered = self.client.get("/api/public/ghg-inventory/?year=2020").json()

        self.assertEqual(
            filtered["metadata"]["geographies"],
            unfiltered["metadata"]["geographies"],
        )
        self.assertEqual(filtered["records"], [])

    def test_metadata_geographies_do_not_depend_on_approved_lga_records(self):
        zaria = self._create_lga(lga_id=23, lga_name="Zaria")
        self._create_entry(GHGInventoryEntry.Status.APPROVED, lga=zaria)

        response = self.client.get("/api/public/ghg-inventory/")

        self.assertEqual(response.status_code, 200)
        geographies = response.json()["metadata"]["geographies"]
        self.assertIn({"value": "lga:Zaria", "label": "Zaria"}, geographies)
        self.assertIn({"value": "lga:Kachia", "label": "Kachia"}, geographies)

    def test_lga_without_public_inventory_returns_empty_records(self):
        self._create_entry(GHGInventoryEntry.Status.APPROVED)

        response = self.client.get("/api/public/ghg-inventory/?geography=lga:Kachia")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["records"], [])
        self.assertIsNone(payload["summary"]["published_total_emissions_tco2e"])
        self.assertEqual(payload["summary"]["matching_record_count"], 0)
        self.assertIn(
            {"value": "lga:Kachia", "label": "Kachia"},
            payload["metadata"]["geographies"],
        )

    def test_non_public_lga_records_do_not_affect_public_results(self):
        kachia = self._create_lga(lga_id=8, lga_name="Kachia")
        self._create_entry(GHGInventoryEntry.Status.APPROVED)
        self._create_entry(
            GHGInventoryEntry.Status.UNDER_REVIEW,
            quantity="500",
            lga=kachia,
        )

        response = self.client.get("/api/public/ghg-inventory/?geography=lga:Kachia")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["records"], [])
        self.assertEqual(payload["inventory_status"]["non_public_entry_count"], 1)

    def test_incomplete_lga_coverage_disables_ghg_map_eligibility(self):
        zaria = self._create_lga(lga_id=23, lga_name="Zaria")
        self._create_entry(
            GHGInventoryEntry.Status.APPROVED,
            year=2025,
            lga=zaria,
        )

        response = self.client.get(
            "/api/public/ghg-inventory/?year_from=2025&year_to=2025"
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["map"]["eligible"])
        self.assertEqual(payload["map"]["coverage_count"], 1)
        self.assertEqual(payload["map"]["expected_count"], 23)

    def test_chart_series_aggregate_approved_public_records_only(self):
        waste_factor = self._create_factor(
            sector="waste",
            sub_category="solid_waste",
            fuel_or_species="open_dump",
            co2_ef=Decimal("1000"),
            ch4_ef=Decimal("0"),
            n2o_ef=Decimal("0"),
        )
        approved = self._create_entry(
            GHGInventoryEntry.Status.APPROVED,
            quantity="1000",
            year=2020,
        )
        self._create_entry(
            GHGInventoryEntry.Status.UNDER_REVIEW,
            quantity="999999",
            year=2020,
        )
        self._create_entry(
            GHGInventoryEntry.Status.APPROVED,
            quantity="1",
            sector=GHGInventoryEntry.Sector.WASTE,
            sub_category="solid_waste",
            fuel_or_activity="open_dump",
            year=2020,
            emission_factor=waste_factor,
        )
        ClimateProject.objects.create(
            title="Mitigation project estimate",
            project_type=ClimateProject.ProjectType.MITIGATION,
            sector=ClimateProject.Sector.ENERGY,
            expected_ghg_reduction_tco2e=Decimal("999999.000"),
            is_active=True,
        )

        response = self.client.get(
            "/api/public/ghg-inventory/?year_from=2020&year_to=2020&breakout=sector"
        )

        self.assertEqual(response.status_code, 200)
        chart = response.json()["chart"]
        energy_series = next(row for row in chart["series"] if row["key"] == "energy")
        waste_series = next(row for row in chart["series"] if row["key"] == "waste")
        self.assertAlmostEqual(
            energy_series["values"][0]["value"],
            float(approved.co2e_tonnes),
            places=6,
        )
        self.assertAlmostEqual(waste_series["values"][0]["value"], 1.0, places=6)
        self.assertAlmostEqual(
            chart["totals_by_year"][0]["value"],
            float(approved.co2e_tonnes) + 1.0,
            places=6,
        )

    def test_chart_aggregation_by_year_and_breakout_dimension_is_correct(self):
        self._create_entry(
            GHGInventoryEntry.Status.APPROVED,
            quantity="1000",
            year=2020,
        )
        self._create_entry(
            GHGInventoryEntry.Status.APPROVED,
            quantity="2000",
            year=2022,
        )

        response = self.client.get(
            "/api/public/ghg-inventory/?year_from=2020&year_to=2022&breakout=category"
        )

        self.assertEqual(response.status_code, 200)
        chart = response.json()["chart"]
        self.assertEqual(chart["years"], [2020, 2022])
        self.assertNotIn(2021, chart["years"])
        series = chart["series"][0]
        self.assertEqual(series["key"], "stationary_combustion")
        self.assertAlmostEqual(series["values"][0]["value"], 2.7345, places=6)
        self.assertAlmostEqual(series["values"][1]["value"], 5.469, places=6)

    def test_unavailable_valid_combination_returns_empty_chart_data(self):
        self._create_entry(GHGInventoryEntry.Status.APPROVED, year=2025)

        response = self.client.get(
            "/api/public/ghg-inventory/?year_from=2020&year_to=2025&sector=waste&breakout=sector"
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["records"], [])
        self.assertEqual(payload["chart"]["series"], [])
        self.assertEqual(payload["chart"]["table"]["rows"], [])
        self.assertIsNone(payload["summary"]["published_total_emissions_tco2e"])

    def test_chart_geography_filter_uses_canonical_lga_value(self):
        zaria = self._create_lga(lga_id=23, lga_name="Zaria")
        self._create_entry(
            GHGInventoryEntry.Status.APPROVED,
            year=2025,
            lga=zaria,
        )

        response = self.client.get(
            "/api/public/ghg-inventory/?geography=lga:Zaria&breakout=sector"
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["records"]), 1)
        self.assertEqual(payload["chart"]["series"][0]["key"], "energy")

    def test_chart_percentage_change_uses_available_boundary_years(self):
        self._create_entry(
            GHGInventoryEntry.Status.APPROVED,
            quantity="1000",
            year=2020,
        )
        self._create_entry(
            GHGInventoryEntry.Status.APPROVED,
            quantity="2000",
            year=2025,
        )

        response = self.client.get(
            "/api/public/ghg-inventory/?year_from=2020&year_to=2025&breakout=sector"
        )

        self.assertEqual(response.status_code, 200)
        gross_change = response.json()["chart"]["change"]["gross_total"]
        self.assertEqual(gross_change["start_year"], 2020)
        self.assertEqual(gross_change["end_year"], 2025)
        self.assertAlmostEqual(gross_change["change_pct"], 100.0, places=6)
        self.assertEqual(gross_change["description"], "Increased by 100.0%")

    def test_chart_table_totals_equal_chart_totals(self):
        self._create_entry(
            GHGInventoryEntry.Status.APPROVED,
            quantity="1000",
            year=2020,
        )
        self._create_entry(
            GHGInventoryEntry.Status.APPROVED,
            quantity="2000",
            year=2022,
        )

        response = self.client.get(
            "/api/public/ghg-inventory/?year_from=2020&year_to=2022&breakout=sector"
        )

        self.assertEqual(response.status_code, 200)
        chart = response.json()["chart"]
        total_row = chart["table"]["rows"][0]
        self.assertEqual(total_row["key"], "gross_total")
        self.assertEqual(
            total_row["values"],
            [
                {"year": row["year"], "value": row["value"]}
                for row in chart["totals_by_year"]
            ],
        )

    def test_chart_gas_breakout_splits_supported_gas_components(self):
        mixed_factor = self._create_factor(
            fuel_or_species="diesel_mixed_gas_test",
            co2_ef=Decimal("1000"),
            ch4_ef=Decimal("1"),
            n2o_ef=Decimal("0"),
        )
        self._create_entry(
            GHGInventoryEntry.Status.APPROVED,
            quantity="1",
            year=2025,
            fuel_or_activity="diesel_mixed_gas_test",
            emission_factor=mixed_factor,
        )

        response = self.client.get(
            "/api/public/ghg-inventory/?year_from=2025&year_to=2025&breakout=gas"
        )

        self.assertEqual(response.status_code, 200)
        series = response.json()["chart"]["series"]
        self.assertEqual([row["key"] for row in series], ["CO2", "CH4"])
        self.assertAlmostEqual(series[0]["values"][0]["value"], 1.0, places=6)
        self.assertAlmostEqual(series[1]["values"][0]["value"], 0.028, places=6)


class PreviewGHGManagementCommandTests(TestCase):
    def _call_seed(self, *args):
        out = StringIO()
        call_command("seed_preview_ghg", *args, stdout=out)
        return out.getvalue()

    def _call_clear(self, *args):
        out = StringIO()
        call_command("clear_preview_ghg", *args, stdout=out)
        return out.getvalue()

    def _create_genuine_entry(self):
        factor = EmissionFactor.objects.create(
            sector="energy",
            sub_category="stationary_combustion",
            fuel_or_species="genuine_diesel",
            co2_ef=Decimal("2.680000"),
            ch4_ef=Decimal("0.001000"),
            n2o_ef=Decimal("0.000100"),
            unit="litres",
            ipcc_source="Genuine approved factor",
        )
        return GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.ENERGY,
            sub_category="stationary_combustion",
            fuel_or_activity="genuine_diesel",
            year=2025,
            quantity=Decimal("1000"),
            unit="litres",
            emission_factor=factor,
            status=GHGInventoryEntry.Status.APPROVED,
            notes="genuine-entry",
        )

    def test_seed_requires_confirm_before_writing(self):
        with self.assertRaises(CommandError):
            self._call_seed("--batch-id", PREVIEW_BATCH_ID)

    def test_seed_dry_run_writes_nothing(self):
        output = self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--dry-run")

        self.assertIn("dry_run=true", output)
        self.assertEqual(GHGInventoryEntry.objects.count(), 0)
        self.assertEqual(EmissionFactor.objects.count(), 0)

    def test_seed_command_is_idempotent_and_tags_every_record(self):
        first = self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")
        second = self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        self.assertIn(f"proposed={preview_record_count()}", first)
        self.assertIn(f"created={preview_record_count()}", first)
        self.assertIn("obsolete_preview=0", second)
        self.assertIn(f"unchanged={preview_record_count()}", second)
        self.assertEqual(
            GHGInventoryEntry.objects.filter(notes=PREVIEW_BATCH_ID).count(),
            preview_record_count(),
        )
        self.assertFalse(
            GHGInventoryEntry.objects.filter(notes=PREVIEW_BATCH_ID)
            .exclude(status=GHGInventoryEntry.Status.APPROVED)
            .exists()
        )

    def test_seed_replaces_obsolete_sparse_preview_records_inside_same_batch(self):
        factor = EmissionFactor.objects.create(
            sector="energy",
            sub_category="stationary_combustion",
            fuel_or_species="old_preview_factor",
            co2_ef=Decimal("1000"),
            ch4_ef=Decimal("0"),
            n2o_ef=Decimal("0"),
            unit="preview_tco2e",
            ipcc_source="Old preview factor",
        )
        obsolete = GHGInventoryEntry.objects.create(
            sector=GHGInventoryEntry.Sector.ENERGY,
            sub_category="stationary_combustion",
            fuel_or_activity="KCCC Preview Inventory Dataset - old sparse row",
            year=2020,
            quantity=Decimal("1"),
            unit="preview_tco2e",
            emission_factor=factor,
            status=GHGInventoryEntry.Status.APPROVED,
            notes=PREVIEW_BATCH_ID,
        )

        output = self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        self.assertIn("obsolete_preview=1", output)
        self.assertFalse(GHGInventoryEntry.objects.filter(id=obsolete.id).exists())
        self.assertEqual(
            GHGInventoryEntry.objects.filter(notes=PREVIEW_BATCH_ID).count(),
            preview_record_count(),
        )

    def test_preview_covers_all_lgas_and_statewide_records(self):
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        preview_entries = GHGInventoryEntry.objects.filter(notes=PREVIEW_BATCH_ID)
        self.assertEqual(
            preview_entries.filter(lga__isnull=True).count(),
            len(PREVIEW_YEARS) * len(PREVIEW_CATEGORIES),
        )
        self.assertEqual(
            preview_entries.exclude(lga__isnull=True)
            .values("lga__lga_name")
            .distinct()
            .count(),
            23,
        )
        self.assertEqual(
            set(
                preview_entries.exclude(lga__isnull=True)
                .values_list("lga__lga_name", flat=True)
                .distinct()
            ),
            set(KADUNA_LGAS),
        )

    def test_preview_years_are_continuous_and_each_sector_has_annual_values(self):
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        preview_entries = GHGInventoryEntry.objects.filter(
            notes=PREVIEW_BATCH_ID,
            lga__isnull=True,
        )
        self.assertEqual(
            list(preview_entries.values_list("year", flat=True).distinct().order_by("year")),
            PREVIEW_YEARS,
        )
        for year in PREVIEW_YEARS:
            self.assertEqual(
                set(
                    preview_entries.filter(year=year)
                    .values_list("sector", flat=True)
                    .distinct()
                ),
                {
                    GHGInventoryEntry.Sector.ENERGY,
                    GHGInventoryEntry.Sector.AGRICULTURE,
                    GHGInventoryEntry.Sector.IPPU,
                    GHGInventoryEntry.Sector.LULUCF,
                    GHGInventoryEntry.Sector.WASTE,
                },
            )

    def test_preview_statewide_sector_totals_are_balanced(self):
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        preview_entries = GHGInventoryEntry.objects.filter(
            notes=PREVIEW_BATCH_ID,
            lga__isnull=True,
        )
        expected_ranges = {
            GHGInventoryEntry.Sector.ENERGY: (Decimal("38"), Decimal("45")),
            GHGInventoryEntry.Sector.AGRICULTURE: (Decimal("23"), Decimal("29")),
            GHGInventoryEntry.Sector.IPPU: (Decimal("10"), Decimal("15")),
            GHGInventoryEntry.Sector.WASTE: (Decimal("8"), Decimal("12")),
            GHGInventoryEntry.Sector.LULUCF: (Decimal("8"), Decimal("14")),
        }

        for year in PREVIEW_YEARS:
            yearly_total = preview_entries.filter(year=year).aggregate(
                value=Sum("co2e_tonnes")
            )["value"]
            expected_total = sum(PREVIEW_SECTOR_TOTALS[year].values())
            self.assertAlmostEqual(float(yearly_total), float(expected_total), places=2)

            for sector, expected_sector_total in PREVIEW_SECTOR_TOTALS[year].items():
                sector_total = preview_entries.filter(
                    year=year,
                    sector=sector,
                ).aggregate(value=Sum("co2e_tonnes"))["value"]
                self.assertAlmostEqual(
                    float(sector_total),
                    float(expected_sector_total),
                    places=2,
                )
                share_pct = (sector_total / yearly_total) * Decimal("100")
                lower, upper = expected_ranges[sector]
                self.assertGreaterEqual(share_pct, lower)
                self.assertLessEqual(share_pct, upper)

    def test_required_preview_categories_have_annual_values(self):
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        preview_entries = GHGInventoryEntry.objects.filter(
            notes=PREVIEW_BATCH_ID,
            lga__isnull=True,
        )
        required_categories = {category["sub_category"] for category in PREVIEW_CATEGORIES}
        for year in PREVIEW_YEARS:
            self.assertEqual(
                set(
                    preview_entries.filter(year=year)
                    .values_list("sub_category", flat=True)
                ),
                required_categories,
            )

    def test_genuine_records_are_not_modified_by_seed(self):
        genuine = self._create_genuine_entry()

        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")
        genuine.refresh_from_db()

        self.assertEqual(genuine.notes, "genuine-entry")
        self.assertEqual(genuine.fuel_or_activity, "genuine_diesel")
        self.assertEqual(genuine.status, GHGInventoryEntry.Status.APPROVED)

    def test_public_endpoint_uses_preview_batch_without_mixing_genuine_records(self):
        genuine = self._create_genuine_entry()
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        response = self.client.get(
            "/api/public/ghg-inventory/?year_from=2020&year_to=2020&breakout=sector"
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["preview"]["preview_batch_active"])
        self.assertEqual(payload["preview"]["preview_batch_id"], PREVIEW_BATCH_ID)
        self.assertEqual(payload["preview"]["genuine_record_count"], 1)
        self.assertNotIn(genuine.id, [record["id"] for record in payload["records"]])
        self.assertTrue(all(record["lga"] is None for record in payload["records"]))
        self.assertTrue(
            all(record["preview_batch_id"] == PREVIEW_BATCH_ID for record in payload["records"])
        )

    def test_preview_batch_map_view_is_eligible_and_contains_23_lgas(self):
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        response = self.client.get(
            "/api/public/ghg-inventory/?year_from=2020&year_to=2025&breakout=sector"
        )

        self.assertEqual(response.status_code, 200)
        ghg_map = response.json()["map"]
        self.assertTrue(ghg_map["eligible"])
        self.assertEqual(ghg_map["year"], 2025)
        self.assertEqual(ghg_map["coverage_count"], 23)
        self.assertEqual(len(ghg_map["records"]), 23)
        self.assertEqual(
            {record["lga_name"] for record in ghg_map["records"]},
            set(KADUNA_LGAS),
        )

    def test_selected_to_year_controls_ghg_map_year(self):
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        response = self.client.get(
            "/api/public/ghg-inventory/?year_from=2020&year_to=2024&breakout=sector"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["map"]["year"], 2024)

    def test_ghg_map_filters_affect_lga_values(self):
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        all_payload = self.client.get(
            "/api/public/ghg-inventory/?year_from=2025&year_to=2025"
        ).json()
        energy_payload = self.client.get(
            "/api/public/ghg-inventory/?year_from=2025&year_to=2025&sector=energy"
        ).json()
        category_payload = self.client.get(
            "/api/public/ghg-inventory/?year_from=2025&year_to=2025&sector=energy&category=electricity_generation"
        ).json()
        gas_payload = self.client.get(
            "/api/public/ghg-inventory/?year_from=2025&year_to=2025&gas=CH4"
        ).json()

        self.assertGreater(all_payload["map"]["total"], energy_payload["map"]["total"])
        self.assertGreater(
            energy_payload["map"]["total"],
            category_payload["map"]["total"],
        )
        self.assertGreater(all_payload["map"]["total"], gas_payload["map"]["total"])
        self.assertTrue(energy_payload["map"]["eligible"])
        self.assertTrue(category_payload["map"]["eligible"])
        self.assertTrue(gas_payload["map"]["eligible"])

    def test_statewide_and_lga_preview_records_do_not_double_count(self):
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        all_payload = self.client.get(
            "/api/public/ghg-inventory/?year_from=2020&year_to=2020&breakout=sector"
        ).json()
        zaria_payload = self.client.get(
            "/api/public/ghg-inventory/?year_from=2020&year_to=2020&geography=lga:Zaria&breakout=sector"
        ).json()
        statewide_total = GHGInventoryEntry.objects.filter(
            notes=PREVIEW_BATCH_ID,
            year=2020,
            lga__isnull=True,
        ).aggregate(value=Sum("co2e_tonnes"))["value"]
        lga_total = GHGInventoryEntry.objects.filter(
            notes=PREVIEW_BATCH_ID,
            year=2020,
            lga__lga_name="Zaria",
        ).aggregate(value=Sum("co2e_tonnes"))["value"]

        self.assertAlmostEqual(
            all_payload["chart"]["totals_by_year"][0]["value"],
            float(statewide_total),
            places=2,
        )
        self.assertAlmostEqual(
            zaria_payload["chart"]["totals_by_year"][0]["value"],
            float(lga_total),
            places=2,
        )
        self.assertLess(
            zaria_payload["chart"]["totals_by_year"][0]["value"],
            all_payload["chart"]["totals_by_year"][0]["value"],
        )

    def test_ghg_map_total_equals_sum_of_lga_values_and_chart_statewide_total(self):
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        payload = self.client.get(
            "/api/public/ghg-inventory/?year_from=2020&year_to=2025&breakout=sector"
        ).json()
        map_total = sum(record["value"] for record in payload["map"]["records"])
        chart_total = payload["chart"]["totals_by_year"][-1]["value"]

        self.assertAlmostEqual(payload["map"]["total"], map_total, places=2)
        self.assertAlmostEqual(payload["map"]["total"], chart_total, places=2)

    def test_statewide_totals_equal_lga_aggregates(self):
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        for category in PREVIEW_CATEGORIES:
            statewide = GHGInventoryEntry.objects.get(
                notes=PREVIEW_BATCH_ID,
                year=2025,
                lga__isnull=True,
                sub_category=category["sub_category"],
            )
            lga_sum = GHGInventoryEntry.objects.filter(
                notes=PREVIEW_BATCH_ID,
                year=2025,
                lga__isnull=False,
                sub_category=category["sub_category"],
            ).aggregate(value=Sum("co2e_tonnes"))["value"]

            self.assertAlmostEqual(
                float(statewide.co2e_tonnes),
                float(lga_sum),
                places=2,
            )

    def test_preview_gas_totals_reconcile_with_co2e_totals(self):
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        payload = self.client.get(
            "/api/public/ghg-inventory/?year_from=2025&year_to=2025&breakout=gas"
        ).json()
        gas_total = sum(
            series["values"][0]["value"]
            for series in payload["chart"]["series"]
        )

        self.assertAlmostEqual(
            gas_total,
            payload["chart"]["totals_by_year"][0]["value"],
            places=2,
        )

    def test_preview_chart_and_table_totals_reconcile(self):
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        payload = self.client.get(
            "/api/public/ghg-inventory/?year_from=2020&year_to=2025&breakout=gas"
        ).json()
        chart = payload["chart"]
        table_total_row = chart["table"]["rows"][0]

        self.assertEqual(
            table_total_row["values"],
            [
                {"year": row["year"], "value": row["value"]}
                for row in chart["totals_by_year"]
            ],
        )
        self.assertEqual(chart["years"], PREVIEW_YEARS)
        self.assertTrue(chart["csv_rows"])
        self.assertTrue(
            all(row["preview_batch_id"] == PREVIEW_BATCH_ID for row in chart["csv_rows"])
        )

    def test_preview_period_change_uses_selected_boundary_years(self):
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        payload = self.client.get(
            "/api/public/ghg-inventory/?year_from=2020&year_to=2025&breakout=sector"
        ).json()
        gross_change = payload["chart"]["change"]["gross_total"]
        totals = payload["chart"]["totals_by_year"]
        expected = ((totals[-1]["value"] - totals[0]["value"]) / totals[0]["value"]) * 100

        self.assertEqual(gross_change["start_year"], 2020)
        self.assertEqual(gross_change["end_year"], 2025)
        self.assertAlmostEqual(gross_change["change_pct"], expected, places=6)

    def test_project_reductions_are_excluded_from_ghg_map(self):
        ClimateProject.objects.create(
            title="Large mitigation project",
            project_code="KCCC-MAP-TEST",
            project_type="mitigation",
            sector="energy",
            status="planned",
            priority="high",
            expected_ghg_reduction_tco2e=Decimal("999999999"),
            expected_beneficiaries=100,
            is_active=True,
        )
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        payload = self.client.get(
            "/api/public/ghg-inventory/?year_from=2025&year_to=2025"
        ).json()
        lga_total = GHGInventoryEntry.objects.filter(
            notes=PREVIEW_BATCH_ID,
            year=2025,
            lga__isnull=False,
        ).aggregate(value=Sum("co2e_tonnes"))["value"]

        self.assertAlmostEqual(payload["map"]["total"], float(lga_total), places=2)

    def test_clear_dry_run_deletes_nothing(self):
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        output = self._call_clear("--batch-id", PREVIEW_BATCH_ID, "--dry-run")

        self.assertIn("dry_run=true", output)
        self.assertEqual(
            GHGInventoryEntry.objects.filter(notes=PREVIEW_BATCH_ID).count(),
            preview_record_count(),
        )

    def test_confirmed_cleanup_removes_only_preview_batch(self):
        genuine = self._create_genuine_entry()
        self._call_seed("--batch-id", PREVIEW_BATCH_ID, "--confirm")

        output = self._call_clear("--batch-id", PREVIEW_BATCH_ID, "--confirm")
        genuine.refresh_from_db()

        self.assertIn(f"removed={preview_record_count()}", output)
        self.assertFalse(
            GHGInventoryEntry.objects.filter(notes=PREVIEW_BATCH_ID).exists()
        )
        self.assertEqual(GHGInventoryEntry.objects.filter(id=genuine.id).count(), 1)
        response = self.client.get("/api/public/ghg-inventory/")
        self.assertFalse(response.json()["preview"]["preview_batch_active"])
        self.assertFalse(response.json()["map"]["eligible"])
