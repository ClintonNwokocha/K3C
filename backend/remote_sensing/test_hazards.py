import csv
import datetime as dt
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import SimpleTestCase, TestCase

from climate_risk.models import ClimateRiskProfile
from core.models import LGARegistry
from ghg.models import ActivityData
from remote_sensing import hazards as H
from remote_sensing.models import LGADailyClimate, RemoteSensingLayer, RemoteSensingLGAMetric


def days(year):
    d = dt.date(year, 1, 1)
    while d.year == year:
        yield d
        d += dt.timedelta(1)


def season_rain(year, onset=(6, 1), end=(9, 30), every=3, amount=12.0):
    """Daily rain: dry, then `amount` mm every `every` days from onset to end."""
    start, stop = dt.date(year, *onset), dt.date(year, *end)
    rain = []
    for d in days(year):
        wet = start <= d <= stop and (d - start).days % every == 0
        rain.append(amount if wet else 0.0)
    rain[(start - dt.date(year, 1, 1)).days + 1] = amount  # 24 mm over the first two days
    return list(days(year)), rain


class HazardIndicatorTests(SimpleTestCase):
    def test_heat_counts_runs_of_hot_days(self):
        tmax = [35, 39, 39, 39, 35, 39, 41, 35]
        result = H.heat_indicators(tmax, hot_threshold=38)
        self.assertEqual(result["hot_days"], 5)
        self.assertEqual(result["heatwave_days"], 3)  # only the 3-day run
        self.assertEqual(result["days_40c"], 1)
        self.assertEqual(result["txx_c"], 41)

    def test_flood_wettest_five_days(self):
        rain = [0, 10, 20, 30, 0, 5, 0, 60]
        result = H.flood_indicators(rain, very_wet_threshold=25)
        self.assertEqual(result["rx1day_mm"], 60)
        self.assertEqual(result["rx5day_mm"], 95)  # 30+0+5+0+60
        self.assertEqual(result["very_wet_days"], 2)

    def test_rainy_season_onset_end_and_dry_spells(self):
        dates, rain = season_rain(2010)
        result = H.rainy_season(dates, rain, 2010)
        self.assertEqual(result["onset_doy"], dt.date(2010, 6, 1).timetuple().tm_yday)
        # Last rain day is 29 Sep (every 3rd day from 1 Jun).
        self.assertEqual(result["cessation_doy"], dt.date(2010, 9, 29).timetuple().tm_yday)
        self.assertEqual(result["longest_dry_spell_days"], 2)
        self.assertEqual(result["dry_spells_10d"], 0)
        self.assertFalse(result["failed_season"])

    def test_no_onset_is_a_failed_season_and_extreme(self):
        dates = list(days(2010))
        result = H.rainy_season(dates, [0.0] * len(dates), 2010)
        self.assertTrue(result["failed_season"])
        assessment = H.assess("erratic_rainfall", result, {}, failed_season=True)
        self.assertEqual(assessment["class"], "Extreme")

    def test_classes_follow_spi_convention(self):
        self.assertEqual([H.classify(z) for z in (0.9, 1.0, 1.5, 2.0)], ["Normal", "Moderate", "Severe", "Extreme"])
        self.assertEqual(H.score(0), 50.0)

    def test_drought_uses_spi_sign(self):
        a = H.assess("drought", {"spi": -1.6}, {"spi": (0.0, 1.0, 30)})
        self.assertEqual((a["class"], a["z"]), ("Severe", 1.6))

    def test_composite_is_mean_z_and_driver_is_most_unusual(self):
        baselines = {k: (10.0, 2.0, 30) for k in H.HAZARD_INDICATORS["extreme_heat"]}
        a = H.assess("extreme_heat", {"hot_days": 12, "heatwave_days": 15, "days_40c": 10, "txx_c": 10}, baselines)
        self.assertEqual((a["driver"], a["composite"]), ("heatwave_days", 0.875))

    def test_finalize_standardizes_against_baseline_composites(self):
        by_year = {y: {"composite": 0.1 * (y % 2), "failed_season": False} for y in range(1991, 2021)}
        by_year[2024] = {"composite": 0.65, "failed_season": False}
        by_year[2025] = {"composite": None, "failed_season": True}
        H.finalize(by_year, range(1991, 2021))
        # Baseline composites 0/0.1: mean 0.05, sd 0.05 floored to 0.25 -> z = 2.4.
        self.assertEqual((by_year[2024]["z"], by_year[2024]["class"]), (2.4, "Extreme"))
        self.assertEqual(by_year[1992]["class"], "Normal")
        self.assertEqual(by_year[2025]["z"], H.FAILED_SEASON_Z)


class BuildClimateHazardsTests(TestCase):
    def setUp(self):
        self.lga = LGARegistry.objects.create(lga_id=1, lga_name="Zaria")
        rows = []
        for year in range(1991, 2023):
            dates, rain = season_rain(year)
            hot = year == 2022
            for i, d in enumerate(dates):
                tmax = 36.0 + (i % 7) * 0.5 + (4.0 if hot and d.month == 4 else 0.0)
                rows.append(LGADailyClimate(lga=self.lga, admin_code="19022", admin_name="Zaria",
                                            date=d, rainfall_mm=rain[i], tmax_c=tmax))
        LGADailyClimate.objects.bulk_create(rows)
        drought = RemoteSensingLayer.objects.create(key="drought_index", label="SPI")
        RemoteSensingLGAMetric.objects.create(layer=drought, lga=self.lga, admin_level="lga", admin_code="19022",
                                              admin_name="Zaria", year=2022, season="wet_season",
                                              mean_value=Decimal("-2.1"))

    def test_writes_hazard_records_with_classes(self):
        call_command("build_climate_hazards", "--years", "2022", stdout=StringIO())
        heat = RemoteSensingLGAMetric.objects.get(layer__key="hazard_extreme_heat", year=2022, season="hot_season")
        self.assertEqual(heat.metadata["class"], "Extreme")
        self.assertEqual(heat.lga, self.lga)
        drought = RemoteSensingLGAMetric.objects.get(layer__key="hazard_drought", year=2022)
        self.assertEqual(drought.metadata["class"], "Extreme")
        erratic = RemoteSensingLGAMetric.objects.get(layer__key="hazard_erratic_rainfall", year=2022)
        self.assertEqual(erratic.metadata["class"], "Normal")  # same season every year
        self.assertTrue(RemoteSensingLayer.objects.get(key="hazard_flood").is_public)

    def test_dry_run_writes_nothing(self):
        call_command("build_climate_hazards", "--years", "2022", "--dry-run", stdout=StringIO())
        self.assertFalse(RemoteSensingLGAMetric.objects.filter(layer__key__startswith="hazard_").exists())


class ComputeClimateRiskProfilesTests(TestCase):
    def test_profiles_use_hazards_population_and_wealth(self):
        from climate_risk.management.commands.compute_climate_risk_profiles import WEALTH_FILE

        with open(WEALTH_FILE, encoding="utf-8") as fh:
            names = sorted({r["lganame"] for r in csv.DictReader(fh)})
        layers = {key: RemoteSensingLayer.objects.create(key=key, label=key) for key in
                  ("hazard_flood", "hazard_drought", "hazard_extreme_heat", "hazard_erratic_rainfall")}
        seasons = {"hazard_flood": "annual", "hazard_drought": "wet_season",
                   "hazard_extreme_heat": "annual", "hazard_erratic_rainfall": "wet_season"}
        for i, name in enumerate(names, start=1):
            lga = LGARegistry.objects.create(lga_id=i, lga_name=name)
            ActivityData.objects.create(lga=lga, year=2025, activity_key="population.total",
                                        quantity=Decimal(1000 * i), unit="people", method_version="tier1_open_v1",
                                        source_type="remote_sensing", source_name="GHSL", confidence="medium")
            for key, layer in layers.items():
                RemoteSensingLGAMetric.objects.create(
                    layer=layer, lga=lga, admin_level="lga", admin_code=str(i), admin_name=name,
                    year=2024, season=seasons[key], mean_value=Decimal("90" if key == "hazard_flood" else "50"))
        call_command("compute_climate_risk_profiles", "--year", "2025", stdout=StringIO())

        profiles = ClimateRiskProfile.objects.filter(year=2025)
        self.assertEqual(profiles.count(), len(names))
        biggest = profiles.get(lga_id=len(names))
        self.assertEqual(biggest.exposure_score, Decimal("100"))
        self.assertEqual(biggest.flood_risk_score, Decimal("90"))
        self.assertEqual(biggest.dominant_hazard, "flood")
        self.assertIn("chart_risk_v1", biggest.data_source)
