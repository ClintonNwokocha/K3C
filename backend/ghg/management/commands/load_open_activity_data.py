"""
Load open statistics into ActivityData for the Tier 1 inventory.

National FAOSTAT and IEA series (ghg/data/open_activity_v1/nigeria_national.csv)
are allocated to LGAs with:
  - livestock and crop map shares (lga_shares.csv: FAO GLW3, GAEZ+ 2015)
  - OpenStreetMap shares (osm_shares.csv): traffic-weighted road length for
    transport oil, and the road class mix for its diesel share; industrial
    land to place industry oil within Kaduna
  - the GHSL population share (wood fuel, charcoal, residential oil, and
    Kaduna's share of industry oil), which needs
    `sync_inventory_activity --layers population` to have run first
  - HDI and Relative Wealth Index (wealth_shares.csv) for the LPG share of
    residential oil.

Years with no national value reuse the latest earlier year and are flagged
carried_forward.  See ghg/data/open_activity_v1/README.md for sources.

Usage
-----
    python manage.py load_open_activity_data --years 2018-2025 --dry-run
    python manage.py load_open_activity_data --years 2018-2025
"""

import csv
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from ghg.management.commands.sync_inventory_activity import parse_years
from ghg.models import ActivityData, Confidence
from ghg.tier1 import METHOD_VERSION
from ghg.tier1 import factors as F
from ghg.tier1.lgas import registry_by_lgacode

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "open_activity_v1"

# activity_key -> (national key, share layer, unit)
LIVESTOCK = {
    "dairy_cattle": "cattle",
    "other_cattle": "cattle",
    "sheep": "sheep",
    "goats": "goats",
    "swine": "swine",
    "camels": "cattle",
    "horses": "horses",
    "asses": "cattle",
    "chickens": "chickens",
}

# Keys written by earlier versions of this loader.
OBSOLETE_KEYS = ["energy.road_oil_tj", "energy.residential_oil_tj"]


def load_national():
    series = defaultdict(dict)
    with open(DATA_DIR / "nigeria_national.csv", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            series[row["key"]][int(row["year"])] = Decimal(row["value"])
    return series


def load_shares():
    shares = defaultdict(dict)
    nigeria = {}
    names = {}
    for name in ("lga_shares.csv", "osm_shares.csv", "wealth_shares.csv"):
        with open(DATA_DIR / name, encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                shares[row["layer"]][row["lgacode"]] = Decimal(row["share"])
                nigeria[row["layer"]] = Decimal(row["nigeria_value"])
                names[row["lgacode"]] = row["lganame"]
    return shares, nigeria, names


def road_diesel_shares(shares, nigeria, codes):
    """
    Diesel share of road fuel per LGA from its traffic-weighted road class mix,
    scaled so Nigeria's own mix gives ROAD_DIESEL_SHARE_NATIONAL.
    """
    def mix(vkm):
        total = sum(vkm.values())
        return sum(vkm[g] * F.ROAD_DIESEL_BY_CLASS[g] for g in vkm) / total if total else Decimal("0")

    groups = F.ROAD_DIESEL_BY_CLASS
    scale = F.ROAD_DIESEL_SHARE_NATIONAL / mix({g: nigeria[f"road_vkm.{g}"] for g in groups})
    return {
        code: mix({g: shares[f"road_vkm.{g}"][code] * nigeria[f"road_vkm.{g}"] for g in groups}) * scale
        for code in codes
    }


def lpg_shares(shares, codes):
    """LPG share of residential oil: national share x mean of relative HDI and RWI."""
    low, high = F.LPG_SHARE_BOUNDS
    return {
        code: min(max(F.RESIDENTIAL_LPG_SHARE_NATIONAL * (shares["hdi"][code] + shares["rwi"][code]) / 2, low), high)
        for code in codes
    }


def value_for(series, year):
    """National value for year, or the latest earlier year (carried forward)."""
    if year in series:
        return series[year], False
    earlier = [y for y in series if y < year]
    if not earlier:
        raise CommandError(f"No national value on or before {year}")
    return series[max(earlier)], True


class Command(BaseCommand):
    help = "Allocate open national statistics (FAOSTAT, IEA) to LGAs as Tier 1 activity data."

    def add_arguments(self, parser):
        parser.add_argument("--years", default="2018-2025")
        parser.add_argument("--dry-run", action="store_true", default=False)

    def handle(self, *args, **options):
        years = parse_years(options["years"])
        national = load_national()
        shares, nigeria, names = load_shares()
        try:
            lgas = registry_by_lgacode(names)
        except ValueError as exc:
            raise CommandError(str(exc))
        codes = sorted(shares["cattle"])
        industrial_total = sum(shares["industrial_area"].values())
        diesel_share = road_diesel_shares(shares, nigeria, codes)
        lpg_share = lpg_shares(shares, codes)
        code_by_registry_id = {lga.lga_id: code for code, lga in lgas.items()}

        population = {
            (code_by_registry_id.get(a.lga_id), a.year): a.quantity
            for a in ActivityData.objects.filter(
                method_version=METHOD_VERSION,
                activity_key__in=["population.total", "population.nigeria_total"],
                year__in=years,
            )
        }

        records = []
        for year in years:
            nga_pop = population.get((None, year))
            kaduna_pop = sum(population.get((code, year), Decimal("0")) for code in codes)
            cattle, cf_cattle = value_for(national["cattle"], year)
            dairy, cf_dairy = value_for(national["dairy_cattle"], year)
            for code in codes:
                for species, layer in LIVESTOCK.items():
                    if species == "dairy_cattle":
                        nat, carried = dairy, cf_dairy
                    elif species == "other_cattle":
                        nat, carried = cattle - dairy, cf_cattle or cf_dairy
                    else:
                        nat, carried = value_for(national[species], year)
                    records.append((code, year, f"livestock.head.{species}", nat * shares[layer][code], "head",
                                    f"FAOSTAT Nigeria {species} x FAO GLW3 2010 {layer} share", carried))

                rice, carried = value_for(national["rice_area_ha"], year)
                records.append((code, year, "crops.rice_area_ha", rice * shares["rice"][code], "ha",
                                "FAOSTAT Nigeria rice area x GAEZ+ 2015 rice share", carried))

                n_t, carried = value_for(national["synthetic_n_t"], year)
                records.append((code, year, "fertiliser.synthetic_n_kg",
                                n_t * Decimal("1000") * shares["all_crops"][code], "kg_n",
                                "FAOSTAT Nigeria N agricultural use x GAEZ+ 2015 harvested-area share", carried))

                road_tj, carried = value_for(national["transport_oil_tj"], year)
                road_tj *= shares["roads_weighted"][code]
                source = "IEA Nigeria transport oil x OSM 2019 traffic-weighted road length share"
                records.append((code, year, "energy.road_gasoline_tj", road_tj * (1 - diesel_share[code]), "TJ",
                                f"{source}; gasoline = 1 - diesel share by road class", carried))
                records.append((code, year, "energy.road_diesel_tj", road_tj * diesel_share[code], "TJ",
                                f"{source}; diesel share {diesel_share[code]:.3f} by road class", carried))

                lga_pop = population.get((code, year))
                if not lga_pop or not nga_pop:
                    continue
                pop_share = lga_pop / nga_pop
                wood_m3, cf_wood = value_for(national["woodfuel_m3"], year)
                charcoal_t, cf_char = value_for(national["charcoal_t"], year)
                # FAOSTAT wood fuel includes wood carbonised into charcoal.
                direct_wood_t = (wood_m3 - charcoal_t * F.CHARCOAL_WOOD_M3_PER_T) * F.WOOD_DENSITY_T_PER_M3
                records.append((code, year, "energy.woodfuel_t", direct_wood_t * pop_share, "t",
                                "FAOSTAT Nigeria wood fuel less charcoal feedstock x GHSL population share",
                                cf_wood or cf_char))
                records.append((code, year, "energy.charcoal_t", charcoal_t * pop_share, "t",
                                "FAOSTAT Nigeria charcoal x GHSL population share", cf_char))
                res_tj, carried = value_for(national["residential_oil_tj"], year)
                res_tj *= pop_share
                source = "IEA Nigeria residential oil x GHSL population share"
                records.append((code, year, "energy.residential_lpg_tj", res_tj * lpg_share[code], "TJ",
                                f"{source}; LPG share {lpg_share[code]:.3f} from HDI and RWI", carried))
                records.append((code, year, "energy.residential_kerosene_tj", res_tj * (1 - lpg_share[code]), "TJ",
                                f"{source}; kerosene = 1 - LPG share", carried))
                # OSM industrial land is too patchily mapped nationally to set
                # Kaduna's share, so population sets it and OSM places it.
                ind_tj, carried = value_for(national["industry_oil_tj"], year)
                industrial_share = shares["industrial_area"][code] / industrial_total
                records.append((code, year, "energy.industry_oil_tj",
                                ind_tj * kaduna_pop / nga_pop * industrial_share, "TJ",
                                "IEA Nigeria industry oil x Kaduna GHSL population share x OSM 2019 industrial land",
                                carried))

        if not any(r[2] == "energy.woodfuel_t" for r in records):
            self.stdout.write(self.style.WARNING(
                "No GHSL population found: wood fuel, charcoal, residential and industry oil skipped. "
                "Run sync_inventory_activity --layers population first."
            ))

        self.stdout.write(f"Open activity records: {len(records)} for {years[0]}-{years[-1]}")
        if options["dry_run"]:
            return

        ActivityData.objects.filter(method_version=METHOD_VERSION, activity_key__in=OBSOLETE_KEYS).delete()
        for code, year, key, quantity, unit, source, carried in records:
            ActivityData.objects.update_or_create(
                lga=lgas[code],
                year=year,
                activity_key=key,
                method_version=METHOD_VERSION,
                defaults={
                    "quantity": quantity.quantize(Decimal("0.0001")),
                    "unit": unit,
                    "source_type": ActivityData.SourceType.ALLOCATION,
                    "source_name": source,
                    "confidence": Confidence.LOW,
                    "metadata": {"carried_forward": carried},
                },
            )
        self.stdout.write(self.style.SUCCESS("Open activity data loaded."))
