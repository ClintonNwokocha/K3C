"""
Compute ClimateRiskProfile records from open data, replacing development seed
values.

  Hazards (0-100)  mean hazard score over the recent period (default the 10
                   years to --year) from build_climate_hazards: extreme heat
                   (annual), flood (annual), drought (wet season SPI) and
                   erratic rainfall (wet season).  50 = typical of 1991-2020.
  Exposure         GHSL population (ghg ActivityData population.total),
                   percentile rank among Kaduna's LGAs.
  Vulnerability    Meta Relative Wealth Index: 100 - percentile rank, so the
                   poorest LGA scores highest.
  Adaptive capacity  Global high-resolution HDI, percentile rank.

Erosion is not computed and is left at its stored value (0 for new rows); it
is not part of the overall score.  Exposure, vulnerability and adaptive
capacity rank LGAs within Kaduna, not against other states.

Usage:
    python manage.py compute_climate_risk_profiles --year 2025
"""
import csv
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Avg

from climate_risk.models import ClimateRiskProfile
from core.models import LGARegistry
from ghg.models import ActivityData
from remote_sensing.management.commands.sync_daily_climate import normalize
from remote_sensing.models import RemoteSensingLGAMetric

METHOD_VERSION = "chart_risk_v1"
HAZARD_FIELDS = {
    "flood_risk_score": ("hazard_flood", "annual"),
    "drought_risk_score": ("hazard_drought", "wet_season"),
    "heat_risk_score": ("hazard_extreme_heat", "annual"),
    "erratic_rainfall_risk_score": ("hazard_erratic_rainfall", "wet_season"),
}
WEALTH_FILE = Path(settings.BASE_DIR) / "ghg" / "data" / "open_activity_v1" / "wealth_shares.csv"


def percentile_ranks(values):
    """{key: 0-100} where the lowest value is 0 and the highest 100 (ties share the mean rank)."""
    ordered = sorted(values.values())
    n = len(ordered)
    if n < 2:
        return {k: Decimal("50") for k in values}
    out = {}
    for key, value in values.items():
        below = sum(v < value for v in ordered)
        equal = sum(v == value for v in ordered)
        out[key] = Decimal(str(round(100 * (below + (equal - 1) / 2) / (n - 1), 2)))
    return out


class Command(BaseCommand):
    help = "Compute climate risk profiles from hazard scores, population and wealth data."

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, default=2025)
        parser.add_argument("--recent-years", type=int, default=10)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        year = options["year"]
        first = year - options["recent_years"] + 1
        lgas = {normalize(l.lga_name): l for l in LGARegistry.objects.all()}

        hazards = defaultdict(dict)
        for field, (layer, season) in HAZARD_FIELDS.items():
            rows = (RemoteSensingLGAMetric.objects
                    .filter(layer__key=layer, season=season, year__gte=first, year__lte=year,
                            admin_level="lga", mean_value__isnull=False, lga__isnull=False)
                    .values("lga").annotate(avg=Avg("mean_value")))
            for row in rows:
                hazards[row["lga"]][field] = Decimal(str(round(row["avg"], 2)))

        population = {
            a.lga_id: float(a.quantity)
            for a in ActivityData.objects.filter(activity_key="population.total", year=year, lga__isnull=False)
        }
        wealth = defaultdict(dict)
        with open(WEALTH_FILE, encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                lga = lgas.get(normalize(row["lganame"]))
                if lga:
                    wealth[row["layer"]][lga.lga_id] = float(row["share"])
        if not population or not wealth.get("rwi") or not wealth.get("hdi"):
            raise CommandError("Population (sync_inventory_activity) or wealth_shares.csv is missing.")

        exposure = percentile_ranks(population)
        vulnerability = {k: Decimal("100") - v for k, v in percentile_ranks(wealth["rwi"]).items()}
        adaptive = percentile_ranks(wealth["hdi"])

        source = (f"Computed ({METHOD_VERSION}): hazards {first}-{year} vs 1991-2020 (CHIRPS, ERA5-Land); "
                  "exposure GHSL population; vulnerability Relative Wealth Index; adaptive capacity HDI")
        written = 0
        for lga in LGARegistry.objects.order_by("lga_name"):
            scores = hazards.get(lga.lga_id, {})
            if len(scores) < len(HAZARD_FIELDS) or lga.lga_id not in exposure:
                self.stdout.write(self.style.WARNING(f"{lga.lga_name}: incomplete inputs, skipped"))
                continue
            defaults = {**scores,
                        "exposure_score": exposure[lga.lga_id],
                        "vulnerability_score": vulnerability.get(lga.lga_id, Decimal("50")),
                        "adaptive_capacity_score": adaptive.get(lga.lga_id, Decimal("50")),
                        "data_source": source[:255],
                        "notes": "Hazard scores: 50 = typical of 1991-2020; higher = more frequent or severe "
                                 "recent hazard. Exposure, vulnerability and adaptive capacity rank LGAs within Kaduna.",
                        "is_active": True}
            if options["dry_run"]:
                self.stdout.write(f"{lga.lga_name}: {defaults}")
                continue
            profile, _ = ClimateRiskProfile.objects.get_or_create(lga=lga, year=year)
            for key, value in defaults.items():
                setattr(profile, key, value)
            profile.save()
            written += 1
            self.stdout.write(f"{lga.lga_name}: overall {profile.overall_risk_score} ({profile.get_risk_level_display()}), "
                              f"dominant {profile.dominant_hazard}")
        self.stdout.write(self.style.SUCCESS(f"Climate risk profiles written: {written}"))
