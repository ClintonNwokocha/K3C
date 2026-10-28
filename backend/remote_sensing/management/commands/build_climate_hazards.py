"""
Build the four climate hazards (extreme heat, flood, drought, erratic rainfall)
per LGA, year and season, and store them as RemoteSensingLGAMetric records on
the hazard_* layers:

  mean_value     hazard score, 0-100 (percentile of the hazard z)
  anomaly_value  hazard z against the LGA's own 1991-2020 baseline
  metadata       class, driver indicator and every indicator with its
                 value, baseline mean and z (see remote_sensing/hazards.py)

Inputs: LGADailyClimate (sync_daily_climate) and the drought_index SPI
records.  Never calls Earth Engine.  Re-running replaces the records.

Usage:
    python manage.py build_climate_hazards --years 1981-2025
    python manage.py build_climate_hazards --years 2024-2025 --dry-run
"""
import datetime as dt
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import LGARegistry
from remote_sensing import hazards as H
from remote_sensing.management.commands.sync_daily_climate import normalize, parse_years
from remote_sensing.models import LGADailyClimate, RemoteSensingLayer, RemoteSensingLGAMetric

COMPLETE_SHARE = 0.95  # minimum share of days present in a season window

LAYER_DEFINITIONS = {
    "extreme_heat": (
        "ERA5-Land daily maximum air temperature, via Google Earth Engine",
        "Hot days, heatwave days, days at or above 40 °C and the hottest day, against the LGA's 1991-2020 normal.",
    ),
    "flood": (
        "CHIRPS v2.0 daily rainfall, via Google Earth Engine",
        "Heavy-rainfall flood triggers (wettest day, wettest 5 days, very wet days) against the LGA's 1991-2020 normal. "
        "LGA-average rainfall understates local cloudbursts; not a flood forecast or a mapped flood extent.",
    ),
    "drought": (
        "CHIRPS v2.0 rainfall, Standardized Precipitation Index (drought_index layer)",
        "Meteorological drought from SPI against a 1991-2020 baseline. Rainfall only: not soil moisture or crop stress.",
    ),
    "erratic_rainfall": (
        "CHIRPS v2.0 daily rainfall, via Google Earth Engine",
        "Rainy-season onset, end, length and dry spells against the LGA's 1991-2020 normal.",
    ),
}


def window_values(series, year, season, field):
    """Daily values of field in the season window, or None when too many days are missing."""
    start, end = H.season_window(year, season)
    expected = (end - start).days + 1
    rows = (series.get(start + dt.timedelta(i)) for i in range(expected))
    values = [row[field] for row in rows if row and row[field] is not None]
    return values if len(values) >= COMPLETE_SHARE * expected else None


class Command(BaseCommand):
    help = "Build climate hazard scores per LGA from daily climate data and SPI."

    def add_arguments(self, parser):
        parser.add_argument("--years", default="1981-2025")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        years = parse_years(options["years"])
        base_years = list(range(H.BASELINE[0], H.BASELINE[1] + 1))
        registry = {normalize(l.lga_name): l for l in LGARegistry.objects.all()}

        daily = defaultdict(dict)
        names = {}
        for row in LGADailyClimate.objects.values("admin_code", "admin_name", "date", "rainfall_mm", "tmax_c").iterator():
            daily[row["admin_code"]][row["date"]] = row
            names[row["admin_code"]] = row["admin_name"]

        spi = {
            (m.admin_code, m.year, m.season): float(m.mean_value)
            for m in RemoteSensingLGAMetric.objects.filter(
                layer__key="drought_index", admin_level="lga", mean_value__isnull=False)
        }
        for code, _, _ in spi:
            names.setdefault(code, None)
        surface_water = {
            m.admin_code: float(m.mean_value)
            for m in RemoteSensingLGAMetric.objects.filter(layer__key="flood_occurrence", mean_value__isnull=False)
        }

        results = []  # (hazard, code, year, season, assessment)
        for code in sorted(daily):
            series = daily[code]
            results += self.heat(code, series, years, base_years)
            results += self.flood(code, series, years, base_years, surface_water.get(code))
            results += self.erratic(code, series, years, base_years)
        for (code, year, season), value in spi.items():
            if year in years and season in H.HAZARD_SEASONS["drought"]:
                assessment = H.assess("drought", {"spi": value}, {"spi": (0.0, 1.0, 30)})
                results.append(("drought", code, year, season, assessment))

        counts = defaultdict(lambda: defaultdict(int))
        for hazard, _, _, _, a in results:
            counts[hazard][a["class"]] += 1
        for hazard, by_class in counts.items():
            self.stdout.write(f"{hazard}: " + ", ".join(f"{k} {v}" for k, v in sorted(by_class.items())))
        if options["dry_run"]:
            self.stdout.write(f"Dry run: {len(results)} hazard records not written.")
            return

        layers = {}
        for hazard, (source, description) in LAYER_DEFINITIONS.items():
            layers[hazard], _ = RemoteSensingLayer.objects.update_or_create(
                key=H.HAZARD_LAYER_KEYS[hazard],
                defaults={"label": H.HAZARD_LABELS[hazard], "description": description,
                          "gee_dataset": source, "is_public": True, "is_active": True},
            )
        with transaction.atomic():
            for hazard, code, year, season, a in results:
                name = names.get(code) or code
                RemoteSensingLGAMetric.objects.update_or_create(
                    layer=layers[hazard], admin_level="lga", admin_code=code, year=year, season=season,
                    defaults={
                        "lga": registry.get(normalize(name)),
                        "admin_name": name,
                        "mean_value": None if a["score"] is None else Decimal(str(a["score"])),
                        "anomaly_value": None if a["z"] is None else Decimal(str(a["z"])),
                        "unit": "score (0-100)",
                        "data_source": LAYER_DEFINITIONS[hazard][0],
                        "metadata": {**a, "method_version": H.METHOD_VERSION,
                                     "baseline": f"{H.BASELINE[0]}-{H.BASELINE[1]}"},
                    },
                )
        self.stdout.write(self.style.SUCCESS(f"Wrote {len(results)} hazard records."))

    # -- per-hazard builders -------------------------------------------------

    def _baselines(self, per_year, base_years, keys):
        out = {}
        for key in keys:
            unit = H.INDICATORS[key][1]
            out[key] = H.baseline_stats([per_year[y].get(key) for y in base_years if y in per_year], unit)
        return out

    def heat(self, code, series, years, base_years):
        out = []
        for season in H.HAZARD_SEASONS["extreme_heat"]:
            base_days = [t for y in base_years for t in (window_values(series, y, season, "tmax_c") or [])]
            if not base_days:
                continue
            threshold = H.percentile(base_days, H.HOT_DAY_PERCENTILE)
            per_year = {}
            for y in sorted(set(years) | set(base_years)):
                values = window_values(series, y, season, "tmax_c")
                if values:
                    per_year[y] = H.heat_indicators(values, threshold)
            baselines = self._baselines(per_year, base_years, H.HAZARD_INDICATORS["extreme_heat"])
            assessed = {y: H.assess("extreme_heat", v, baselines) for y, v in per_year.items()}
            H.finalize(assessed, base_years)
            for y in years:
                if y in assessed:
                    assessed[y]["thresholds"] = {"hot_day_c": round(threshold, 2)}
                    out.append(("extreme_heat", code, y, season, assessed[y]))
        return out

    def flood(self, code, series, years, base_years, surface_water_pct):
        out = []
        for season in H.HAZARD_SEASONS["flood"]:
            wet = [r for y in base_years for r in (window_values(series, y, season, "rainfall_mm") or [])
                   if r >= H.WET_DAY_MM]
            if not wet:
                continue
            threshold = H.percentile(wet, H.VERY_WET_PERCENTILE)
            per_year = {}
            for y in sorted(set(years) | set(base_years)):
                values = window_values(series, y, season, "rainfall_mm")
                if values:
                    per_year[y] = H.flood_indicators(values, threshold)
            baselines = self._baselines(per_year, base_years, H.HAZARD_INDICATORS["flood"])
            assessed = {y: H.assess("flood", v, baselines) for y, v in per_year.items()}
            H.finalize(assessed, base_years)
            for y in years:
                if y in assessed:
                    assessed[y]["thresholds"] = {"very_wet_day_mm": round(threshold, 2)}
                    assessed[y]["context"] = {"historical_surface_water_pct": surface_water_pct}
                    out.append(("flood", code, y, season, assessed[y]))
        return out

    def erratic(self, code, series, years, base_years):
        per_year = {}
        for y in sorted(set(years) | set(base_years)):
            if window_values(series, y, "annual", "rainfall_mm") is None:
                continue
            dates = sorted(d for d in series if d.year == y)
            rain = [series[d]["rainfall_mm"] or 0.0 for d in dates]
            per_year[y] = H.rainy_season(dates, rain, y)
        baselines = self._baselines(
            {y: v for y, v in per_year.items() if not v["failed_season"]},
            base_years, H.HAZARD_INDICATORS["erratic_rainfall"])
        assessed = {y: H.assess("erratic_rainfall", v, baselines, failed_season=v["failed_season"])
                    for y, v in per_year.items()}
        H.finalize(assessed, base_years)
        return [("erratic_rainfall", code, y, "wet_season", assessed[y]) for y in years if y in assessed]
