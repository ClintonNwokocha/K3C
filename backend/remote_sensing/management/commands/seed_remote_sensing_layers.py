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
        "label": "Land Surface Temperature",
        "description": "Land surface temperature layer for heat exposure and urban thermal stress monitoring.",
        "gee_dataset": "MODIS / Landsat LST",
        "gee_band": "LST",
        "visualization": {"min": 20, "max": 45, "palette": ["blue", "yellow", "red"]},
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
        "label": "Rainfall",
        "description": "Rainfall layer for seasonal climate monitoring and flood/drought early warning.",
        "gee_dataset": "CHIRPS rainfall",
        "gee_band": "precipitation",
        "visualization": {"min": 0, "max": 300, "palette": ["white", "blue", "navy"]},
    },
    {
        "key": "rainfall_anomaly",
        "label": "Rainfall Anomaly",
        "description": "Rainfall anomaly layer showing wetter or drier than normal conditions.",
        "gee_dataset": "CHIRPS rainfall anomaly",
        "gee_band": "rainfall_anomaly",
        "visualization": {"min": -100, "max": 100, "palette": ["brown", "white", "blue"]},
    },
    {
        "key": "flood_hazard",
        "label": "Flood Hazard",
        "description": "Flood hazard layer for identifying areas exposed to flood risk.",
        "gee_dataset": "JRC Global Surface Water / Sentinel-1 / terrain-derived flood hazard",
        "gee_band": "flood_hazard",
        "visualization": {"min": 0, "max": 1, "palette": ["white", "cyan", "blue"]},
    },
    {
        "key": "flood_occurrence",
        "label": "Flood Occurrence",
        "description": "Observed or modelled flood occurrence layer for historical flood exposure mapping.",
        "gee_dataset": "JRC Global Surface Water occurrence / Sentinel-1 flood archive",
        "gee_band": "occurrence",
        "visualization": {"min": 0, "max": 100, "palette": ["white", "blue"]},
    },
    {
        "key": "drought_index",
        "label": "Drought Index",
        "description": "Drought condition layer based on rainfall deficit, vegetation condition, or combined drought indicators.",
        "gee_dataset": "CHIRPS / MODIS / Sentinel-derived drought index",
        "gee_band": "drought_index",
        "visualization": {"min": 0, "max": 100, "palette": ["green", "yellow", "red"]},
    },
    {
        "key": "lulc",
        "label": "Land Use / Land Cover",
        "description": "Land use and land cover layer for settlement, vegetation, cropland, bare land, and water mapping.",
        "gee_dataset": "ESA WorldCover / ESRI LULC",
        "gee_band": "classification",
        "visualization": {"min": 10, "max": 100, "palette": []},
    },
    {
        "key": "elevation",
        "label": "Elevation / Terrain",
        "description": "Elevation and terrain layer for slope, drainage, erosion, flood routing, and exposure analysis.",
        "gee_dataset": "SRTM / Copernicus DEM",
        "gee_band": "elevation",
        "visualization": {"min": 0, "max": 1500, "palette": ["green", "yellow", "brown", "white"]},
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
                    "is_public": True,
                    "is_active": True,
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