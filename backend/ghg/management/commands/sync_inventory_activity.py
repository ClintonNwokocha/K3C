"""
Sync command: Earth Engine activity data for the Tier 1 inventory.

Layers (one Earth Engine request per layer per year, all 23 LGAs at once)
------
climate      CHIRPS + ERA5-Land + SRTM 1991-2020 normals -> LGAClimateProfile
population   GHSL P2023A population and urban share, 1975-2030 epochs,
             interpolated to every year 1975..last year -> population.total,
             population.urban, and population.nigeria_total (statewide row)
burned_area  MODIS MCD64A1 by Dynamic World class -> fire.burned_ha.<class>
lulc         Dynamic World confirmed transitions -> lulc.transition_ha.<from>><to>
biomass      GEDI L4B mean biomass by class (state mean) -> lulc.agb_t_per_ha.<class>

Usage
-----
    python manage.py sync_inventory_activity --dry-run
    python manage.py sync_inventory_activity --layers climate,population
    python manage.py sync_inventory_activity --layers burned_area,lulc --years 2018-2025
"""

import json
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from ghg import inventory_gee
from ghg.models import ActivityData, Confidence, LGAClimateProfile
from ghg.tier1 import METHOD_VERSION
from ghg.tier1 import factors as F
from ghg.tier1.lgas import registry_by_lgacode
from remote_sensing.gee_service import gee_service

ALL_LAYERS = ("climate", "population", "burned_area", "lulc", "biomass")

_GEOJSON_PATH = (
    Path(settings.BASE_DIR).parent
    / "frontend" / "public" / "data" / "kaduna_lga.geojson"
)


def parse_years(value):
    if "-" in value:
        start, end = value.split("-", 1)
        return list(range(int(start), int(end) + 1))
    return [int(v) for v in value.split(",") if v.strip()]


def interpolate_epochs(epochs: dict, year: int) -> float:
    """Linear interpolation between GHSL 5-year epochs."""
    points = sorted((int(e), v) for e, v in epochs.items())
    if year <= points[0][0]:
        return points[0][1]
    for (y0, v0), (y1, v1) in zip(points, points[1:]):
        if y0 <= year <= y1:
            return v0 + (v1 - v0) * (year - y0) / (y1 - y0)
    return points[-1][1]


class Command(BaseCommand):
    help = "Pull Tier 1 inventory activity data from Earth Engine (one request per layer-year for all LGAs)."

    def add_arguments(self, parser):
        parser.add_argument("--layers", default=",".join(ALL_LAYERS),
                            help=f"Comma-separated subset of: {', '.join(ALL_LAYERS)}")
        parser.add_argument("--years", default="2018-2025",
                            help="Inventory years for burned_area and lulc, e.g. 2018-2025 or 2022,2023")
        parser.add_argument("--dry-run", action="store_true", default=False,
                            help="List the Earth Engine requests without calling Earth Engine or writing.")

    def handle(self, *args, **options):
        layers = [l.strip() for l in options["layers"].split(",") if l.strip()]
        unknown = set(layers) - set(ALL_LAYERS)
        if unknown:
            raise CommandError(f"Unknown layers: {', '.join(sorted(unknown))}")
        years = parse_years(options["years"])

        plan = []
        for layer in layers:
            plan += [(layer, y) for y in years] if layer in ("burned_area", "lulc") else [(layer, None)]

        self.stdout.write(f"Tier 1 activity sync ({METHOD_VERSION})")
        self.stdout.write(f"  Layers : {', '.join(layers)}")
        self.stdout.write(f"  Years  : {years[0]}-{years[-1]}")
        self.stdout.write(f"  Pending GEE calls : {len(plan)}")
        if options["dry_run"]:
            for layer, year in plan:
                self.stdout.write(f"  PLAN  {layer} {year or ''}")
            return

        init = gee_service.initialize()
        if not init.available:
            raise CommandError(f"GEE initialization failed: {init.error}")

        features = json.loads(_GEOJSON_PATH.read_text(encoding="utf-8"))["features"]
        try:
            self.lgas = registry_by_lgacode({
                str(f["properties"]["lgacode"]): f["properties"]["lganame"] for f in features
            })
        except ValueError as exc:
            raise CommandError(str(exc))

        done = failed = 0
        for layer, year in plan:
            label = f"{layer} {year or ''}".strip()
            try:
                count = getattr(self, f"_sync_{layer}")(features, year, max(years))
                self.stdout.write(f"  OK    {label}: {count} records")
                done += 1
            except Exception as exc:  # report and continue with the next layer-year
                self.stdout.write(self.style.ERROR(f"  ERROR {label}: {exc}"))
                failed += 1
        self.stdout.write(f"Sync complete. GEE calls done: {done}  failed: {failed}")
        if failed:
            raise CommandError(f"{failed} Earth Engine request(s) failed")

    # ------------------------------------------------------------------

    def _save(self, code, year, key, quantity, unit, source_type, source_name, confidence, metadata=None):
        ActivityData.objects.update_or_create(
            lga=self.lgas.get(code) if code else None,
            year=year,
            activity_key=key,
            method_version=METHOD_VERSION,
            defaults={
                "quantity": Decimal(str(round(quantity, 4))),
                "unit": unit,
                "source_type": source_type,
                "source_name": source_name,
                "confidence": confidence,
                "metadata": metadata or {},
            },
        )

    def _sync_climate(self, features, year, last_year):
        stats = inventory_gee.compute_climate_profile(features)
        for code, s in stats.items():
            rain = Decimal(str(round(s["rain_mm"], 1)))
            LGAClimateProfile.objects.update_or_create(
                lga=self.lgas[code],
                defaults={
                    "mean_annual_rainfall_mm": rain,
                    "mean_annual_temp_c": Decimal(str(round(s["temp_c"], 2))),
                    "montane_area_pct": Decimal(str(round(s["montane_pct"] or 0, 2))),
                    "climate_zone": (
                        LGAClimateProfile.Zone.TROPICAL_MOIST
                        if rain >= F.WET_RAIN_MM else LGAClimateProfile.Zone.TROPICAL_DRY
                    ),
                    "source": "CHIRPS pentad, ERA5-Land monthly, SRTM; 1991-2020 means",
                    "method_version": METHOD_VERSION,
                },
            )
        return len(stats)

    def _sync_population(self, features, year, last_year):
        stats = inventory_gee.compute_population(features)
        nigeria = stats.pop("NGA")
        count = 0
        source = "GHSL P2023A GHS_POP / GHS_SMOD (epochs interpolated)"
        for y in range(F.SWDS_FIRST_YEAR, last_year + 2):
            for code, epochs in stats.items():
                total = interpolate_epochs({e: v["total"] for e, v in epochs.items()}, y)
                urban = interpolate_epochs({e: v["urban"] for e, v in epochs.items()}, y)
                self._save(code, y, "population.total", total, "persons",
                           ActivityData.SourceType.REMOTE_SENSING, source, Confidence.MEDIUM)
                self._save(code, y, "population.urban", urban, "persons",
                           ActivityData.SourceType.REMOTE_SENSING, source, Confidence.MEDIUM,
                           {"urban_definition": f"GHSL SMOD >= {inventory_gee.GHSL_URBAN_MIN_SMOD}"})
                count += 2
            self._save(None, y, "population.nigeria_total",
                       interpolate_epochs({e: v["total"] for e, v in nigeria.items()}, y), "persons",
                       ActivityData.SourceType.REMOTE_SENSING, source, Confidence.MEDIUM)
            count += 1
        return count

    def _sync_burned_area(self, features, year, last_year):
        stats = inventory_gee.compute_burned_area(features, year)
        count = 0
        for code, classes in stats.items():
            for dw_class, ha in classes.items():
                self._save(code, year, f"fire.burned_ha.{dw_class}", ha, "ha",
                           ActivityData.SourceType.REMOTE_SENSING,
                           f"MODIS MCD64A1 x Dynamic World {year - 1} late wet season",
                           Confidence.MEDIUM)
                count += 1
        return count

    def _sync_lulc(self, features, year, last_year):
        stats = inventory_gee.compute_lulc_transitions(features, year)
        count = 0
        for code, pairs in stats.items():
            for pair, ha in pairs.items():
                if ha <= 0:
                    continue
                self._save(code, year, f"lulc.transition_ha.{pair}", ha, "ha",
                           ActivityData.SourceType.REMOTE_SENSING,
                           f"Dynamic World {year - 1}->{year}, confirmed in {year + 1}",
                           Confidence.LOW)
                count += 1
        return count

    def _sync_biomass(self, features, year, last_year):
        stats = inventory_gee.compute_biomass_by_class(features)
        by_class = {}
        for classes in stats.values():
            for dw_class, agb in classes.items():
                by_class.setdefault(dw_class, []).append(agb)
        for dw_class, values in by_class.items():
            self._save(None, 2020, f"lulc.agb_t_per_ha.{dw_class}", sum(values) / len(values), "t_dm_per_ha",
                       ActivityData.SourceType.REMOTE_SENSING,
                       "GEDI L4B (2019-2023 mean) by Dynamic World 2020 class, mean of LGA means",
                       Confidence.LOW)
        return len(by_class)
