"""
Sync daily LGA-mean rainfall and maximum temperature from Google Earth Engine.

  rainfall_mm  CHIRPS v2.0 Daily (UCSB-CHG/CHIRPS/DAILY), 0.05 deg
  tmax_c       ERA5-Land daily aggregates (ECMWF/ERA5_LAND/DAILY_AGGR,
               temperature_2m_max), 0.1 deg, K - 273.15

One Earth Engine request per variable and year: the year's daily images are
stacked into bands and reduced over all LGAs at once.  Rows are upserted into
LGADailyClimate, so re-running a year replaces it.

Usage:
    python manage.py sync_daily_climate --years 1981-2025
    python manage.py sync_daily_climate --years 2025 --variables rainfall
"""
import datetime as dt
import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.models import LGARegistry
from remote_sensing.gee_service import gee_service
from remote_sensing.models import LGADailyClimate

VARIABLES = {
    "rainfall": ("UCSB-CHG/CHIRPS/DAILY", "precipitation", 5566, "rainfall_mm", lambda v: max(v, 0.0)),
    "tmax": ("ECMWF/ERA5_LAND/DAILY_AGGR", "temperature_2m_max", 11132, "tmax_c", lambda v: v - 273.15),
}


def parse_years(text):
    if "-" in text:
        start, end = (int(p) for p in text.split("-", 1))
        return list(range(start, end + 1))
    return [int(p) for p in text.split(",")]


def normalize(name):
    return str(name or "").strip().lower().replace("’", "'").replace("-", " ").replace("_", " ")


class Command(BaseCommand):
    help = "Sync daily LGA-mean CHIRPS rainfall and ERA5-Land maximum temperature."

    def add_arguments(self, parser):
        parser.add_argument("--years", default="1981-2025")
        parser.add_argument("--variables", default="rainfall,tmax")

    def handle(self, *args, **options):
        import ee

        years = parse_years(options["years"])
        variables = [v.strip() for v in options["variables"].split(",") if v.strip()]
        unknown = set(variables) - set(VARIABLES)
        if unknown:
            raise CommandError(f"Unknown variables: {sorted(unknown)}")

        init = gee_service.initialize()
        if not init.available:
            raise CommandError(f"GEE initialization failed: {init.error}")

        path = Path(settings.BASE_DIR).parent / "frontend" / "public" / "data" / "kaduna_lga.geojson"
        features = json.load(open(path, encoding="utf-8"))["features"]
        registry = {normalize(l.lga_name): l for l in LGARegistry.objects.all()}
        names = {f["properties"]["lgacode"]: f["properties"]["lganame"] for f in features}
        fc = ee.FeatureCollection([
            ee.Feature(ee.Geometry(f["geometry"]), {"code": f["properties"]["lgacode"]}) for f in features
        ])

        for variable in variables:
            collection, band, scale, field, convert = VARIABLES[variable]
            for year in years:
                images = (ee.ImageCollection(collection)
                          .filterDate(f"{year}-01-01", f"{year + 1}-01-01").select(band))
                result = images.toBands().reduceRegions(
                    collection=fc, reducer=ee.Reducer.mean(), scale=scale).getInfo()
                rows = []
                for feature in result["features"]:
                    props = feature["properties"]
                    code = props.pop("code")
                    for key, value in props.items():
                        if value is None:
                            continue
                        date = dt.datetime.strptime(key.split("_")[0], "%Y%m%d").date()
                        rows.append(LGADailyClimate(
                            lga=registry.get(normalize(names[code])), admin_code=code,
                            admin_name=names[code], date=date, **{field: round(convert(value), 3)},
                        ))
                LGADailyClimate.objects.bulk_create(
                    rows, batch_size=5000, update_conflicts=True,
                    unique_fields=["admin_code", "date"], update_fields=[field, "lga", "admin_name"],
                )
                self.stdout.write(f"{variable} {year}: {len(rows)} LGA-days")
        self.stdout.write(self.style.SUCCESS("Daily climate sync complete."))
