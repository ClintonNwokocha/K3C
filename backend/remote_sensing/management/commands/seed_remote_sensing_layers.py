from django.core.management.base import BaseCommand

from remote_sensing.models import RemoteSensingLayer


LAYERS = [
    {
        "key": "ndvi",
        "label": "NDVI / Vegetation Condition",
        "description": "Vegetation condition layer for monitoring greenness, vegetation stress, and ecological recovery.",
        "gee_dataset": "Sentinel-2 / Landsat derived NDVI",
        "gee_band": "NDVI",
        "visualization": {"min": 0, "max": 1, "palette": ["brown", "yellow", "green"]},
    },
    {
        "key": "lst",
        "label": "Land Surface Temperature (Daytime)",
        "description": (
            "Daytime land surface temperature from MODIS Terra MOD11A1 daily 1 km product.  "
            "QC mask applied: mandatory (bits 0-1 ≤ 1), data quality (bits 2-3 ≤ 1), "
            "LST error (bits 6-7 ≤ 1).  "
            "Temporal composite: quality-filtered daily mean for the season window.  "
            "Conversion: DN × 0.02 − 273.15 → °C.  "
            "Daytime LST — not air temperature."
        ),
        "gee_dataset": "MODIS/061/MOD11A1",
        "gee_band": "LST_Day_1km",
        "visualization": {"min": 20, "max": 45, "palette": ["blue", "yellow", "red"]},
        "is_public": True,
    },
    {
        "key": "temperature_anomaly",
        "label": "Temperature Anomaly",
        "description": "Temperature anomaly layer showing deviation from a selected baseline period.",
        "gee_dataset": "ERA5 / CHIRTS / MODIS derived anomaly",
        "gee_band": "temperature_anomaly",
        "visualization": {"min": -3, "max": 3, "palette": ["blue", "white", "red"]},
    },
    {
        "key": "rainfall",
        "label": "Rainfall Total",
        "description": (
            "Accumulated rainfall total (mm) for the season window.  "
            "Derived from CHIRPS v2.0 Daily: daily precipitation summed across the "
            "full season period, then spatially averaged over the LGA geometry.  "
            "This is an ACCUMULATED TOTAL — NOT a rainfall anomaly.  "
            "Do not display under the label 'Rainfall Anomaly'."
        ),
        "gee_dataset": "CHIRPS v2.0 Daily (accumulated total)",
        "gee_band": "precipitation",
        "visualization": {"min": 0, "max": 300, "palette": ["white", "blue", "navy"]},
    },
    {
        "key": "rainfall_anomaly",
        "label": "Rainfall Anomaly",
        "description": (
            "Rainfall anomaly (%) relative to the 1991–2020 baseline mean.  "
            "Derived offline from CHIRPS v2.0 Daily accumulated rainfall totals: "
            "each season's observed total is compared against the 30-year baseline mean "
            "for the same LGA and season.  "
            "anomaly_percent = (observed_mm − baseline_mean_mm) / baseline_mean_mm × 100.  "
            "Positive values indicate wetter than normal; negative values indicate drier.  "
            "Minimum 25 valid baseline years required per (LGA, season) group.  "
            "Not a GEE-derived layer — computed by the build_rainfall_anomaly command."
        ),
        "gee_dataset": "Derived from CHIRPS v2.0 Daily rainfall totals (1991–2020 baseline)",
        "gee_band": "rainfall_anomaly_percent",
        "visualization": {"min": -100, "max": 100, "palette": ["brown", "white", "blue"]},
        "is_public": True,
    },
    {
        # Catalog shell only — no data loaded, method not yet defined.
        # Not ready for public Atlas exposure.  Do not set is_public=True or
        # is_active=True without an approved metric definition and loaded data.
        "key": "flood_hazard",
        "label": "Flood Hazard",
        "description": "Flood hazard layer for identifying areas exposed to flood risk.",
        "gee_dataset": "JRC Global Surface Water / Sentinel-1 / terrain-derived flood hazard",
        "gee_band": "flood_hazard",
        "visualization": {"min": 0, "max": 1, "palette": ["white", "cyan", "blue"]},
        "is_public": False,
        "is_active": False,
    },
    {
        # Catalog shell only — no data loaded, method not yet defined.
        # Not ready for public Atlas exposure.  Do not set is_public=True or
        # is_active=True without an approved metric definition and loaded data.
        "key": "flood_occurrence",
        "label": "Flood Occurrence",
        "description": "Observed or modelled flood occurrence layer for historical flood exposure mapping.",
        "gee_dataset": "JRC Global Surface Water occurrence / Sentinel-1 flood archive",
        "gee_band": "occurrence",
        "visualization": {"min": 0, "max": 100, "palette": ["white", "blue"]},
        "is_public": False,
        "is_active": False,
    },
    {
        "key": "drought_index",
        "label": "Meteorological Drought Conditions (SPI)",
        "description": (
            "Fixed-window precipitation-only SPI derived separately for each LGA and "
            "Annual, Wet Season, or Dry Season rainfall window using a 1991-2020 "
            "baseline. It is not an agricultural or hydrological drought indicator. "
            "Method version: spi_gamma_fixed_window_chirps_baseline_1991_2020_v1."
        ),
        "gee_dataset": "Derived from CHIRPS v2.0 Daily rainfall totals",
        "gee_band": "SPI",
        "visualization": {"min": -2.5, "max": 2.5, "palette": ["brown", "orange", "white", "blue", "navy"]},
        "is_public": True,
        "is_active": True,
    },
    {
        "key": "lulc",
        "label": "Land Use / Land Cover",
        "description": (
            "Land cover classification layer (Dynamic World v1, GOOGLE/DYNAMICWORLD/V1).  "
            "Not yet public — pending GEE pilot validation and Phase B migration.  "
            "Dedicated storage: LandCoverDataset / LandCoverSnapshot / LandCoverDerivedMetric.  "
            "Do not expose until all Phase G publication gate conditions are confirmed."
        ),
        "gee_dataset": "Dynamic World v1 (GOOGLE/DYNAMICWORLD/V1)",
        "gee_band": "label",
        "visualization": {"min": 0, "max": 8, "palette": []},
        "is_public": False,
        "is_active": False,
    },
    {
        "key": "elevation",
        "label": "Elevation / Terrain",
        "description": "Elevation and terrain layer for slope, drainage, erosion, flood routing, and exposure analysis.",
        "gee_dataset": "SRTM / Copernicus DEM",
        "gee_band": "elevation",
        "visualization": {"min": 0, "max": 1500, "palette": ["green", "yellow", "brown", "white"]},
        # Safety: keep hidden until synced and QA-reviewed.
        "is_public": False,
        "is_active": False,
    },
    {
        "key": "tree_cover",
        "label": "Tree Cover",
        "description": "Tree cover layer for LULUCF, afforestation, reforestation, and carbon monitoring.",
        "gee_dataset": "Hansen Global Forest Change / Sentinel-derived tree cover",
        "gee_band": "treecover",
        "visualization": {"min": 0, "max": 100, "palette": ["white", "green"]},
    },
    {
        "key": "forest_change",
        "label": "Forest Change",
        "description": "Forest gain/loss layer for long-term LULUCF and forest monitoring.",
        "gee_dataset": "Hansen Global Forest Change",
        "gee_band": "lossyear",
        "visualization": {"min": 0, "max": 24, "palette": ["white", "yellow", "red"]},
    },
    {
        "key": "ndvi_landsat",
        "label": "Historical NDVI (Landsat Collection 2)",
        "description": (
            "Historical Landsat-derived NDVI from quality-screened Collection 2 Level-2 "
            "surface reflectance. One sensor per seasonal window; archive-availability "
            "fallback selects the best available sensor when the primary has no scenes. "
            "Values are not directly comparable with Sentinel-2 NDVI without cross-sensor calibration."
        ),
        "gee_dataset": "Landsat Collection 2 Level-2 Surface Reflectance (LT05 / LE07 / LC08)",
        "gee_band": "Sensor-specific Red and NIR bands; NDVI",
        "visualization": {"min": -0.1, "max": 0.8, "palette": ["brown", "yellow", "green"]},
        "is_public": True,
    },
]


class Command(BaseCommand):
    help = "Seed remote sensing layer definitions without fake LGA climate values."

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0

        for item in LAYERS:
            layer, created = RemoteSensingLayer.objects.update_or_create(
                key=item["key"],
                defaults={
                    "label": item["label"],
                    "description": item["description"],
                    "gee_dataset": item["gee_dataset"],
                    "gee_band": item["gee_band"],
                    "visualization": item["visualization"],
                    "is_public": item.get("is_public", True),
                    "is_active": item.get("is_active", True),
                },
            )

            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Remote sensing layers seeded. Created: {created_count}. Updated: {updated_count}."
            )
        )
