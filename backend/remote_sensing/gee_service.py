import os
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class GEEResult:
    available: bool
    data: Optional[Dict[str, Any]] = None
    error: str = ""


class GoogleEarthEngineService:
    _DEFAULT_PROJECT = "kccc-499913"

    def __init__(self):
        self.project = os.getenv("GEE_PROJECT", self._DEFAULT_PROJECT)
        self.service_account = os.getenv("GEE_SERVICE_ACCOUNT", "")
        self.private_key_file = os.getenv("GEE_PRIVATE_KEY_FILE", "")

    def initialize(self) -> GEEResult:
        try:
            import ee
        except ImportError:
            return GEEResult(available=False, error="earthengine-api is not installed.")

        try:
            if self.service_account and self.private_key_file:
                credentials = ee.ServiceAccountCredentials(
                    self.service_account, self.private_key_file
                )
                ee.Initialize(credentials, project=self.project)
                auth_mode = "service_account"
            else:
                ee.Initialize(project=self.project)
                auth_mode = "application_default"

            return GEEResult(
                available=True,
                data={"initialized": True, "project": self.project, "auth_mode": auth_mode},
            )
        except Exception as exc:
            return GEEResult(available=False, error=str(exc))

    def compute_ndvi_for_geometry(
        self,
        geometry_dict: dict,
        start_date: str,
        end_date: str,
        scale: int = 60,
    ) -> GEEResult:
        """
        Compute median Sentinel-2 NDVI statistics for a single GeoJSON geometry.

        start_date / end_date: 'YYYY-MM-DD' strings.
        end_date is exclusive (GEE filterDate convention) — the caller adds one day
        to the intended inclusive end before passing it here.

        Returns GEEResult with data = {"mean": float|None, "min": float|None, "max": float|None}.

        scale=60 is the production default (Sentinel-2 60 m bands / fast server-side
        aggregation). Use scale=10 only for high-resolution exports; scale=100 for
        quick smoke tests.
        """
        try:
            import ee
        except ImportError:
            return GEEResult(available=False, error="earthengine-api is not installed.")

        try:
            geometry = ee.Geometry(geometry_dict)

            def mask_s2_clouds(image):
                scl = image.select("SCL")
                # Mask: cloud shadow (3), cloud med prob (8),
                #       cloud high prob (9), thin cirrus (10).
                return image.updateMask(
                    scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10))
                )

            def add_ndvi(image):
                return image.addBands(
                    image.normalizedDifference(["B8", "B4"]).rename("NDVI")
                )

            composite = (
                ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                .filterDate(start_date, end_date)
                .filterBounds(geometry)
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30))
                .map(mask_s2_clouds)
                .map(add_ndvi)
                .select("NDVI")
                .median()
            )

            # Combined reducer yields NDVI_mean, NDVI_min, NDVI_max.
            reducer = ee.Reducer.mean().combine(
                reducer2=ee.Reducer.minMax(),
                sharedInputs=True,
            )
            result = composite.reduceRegion(
                reducer=reducer,
                geometry=geometry,
                scale=scale,
                maxPixels=1e9,
            )

            props = result.getInfo()
            return GEEResult(
                available=True,
                data={
                    "mean": props.get("NDVI_mean"),
                    "min":  props.get("NDVI_min"),
                    "max":  props.get("NDVI_max"),
                },
            )

        except Exception as exc:
            return GEEResult(available=False, error=str(exc))

    def status(self) -> GEEResult:
        return GEEResult(
            available=False,
            data={
                "initialized": False,
                "project": self.project,
                "auth_mode": "not_configured",
            },
            error="Google Earth Engine is not configured yet.",
        )

    def get_tile_url(self, layer_key: str, visualization=None) -> GEEResult:
        return GEEResult(
            available=False,
            data={
                "layer": layer_key,
                "tile_url": "",
                "attribution": "Google Earth Engine",
                "visualization": visualization or {},
            },
            error="Tile URL is not available yet. Configure Google Earth Engine later.",
        )


gee_service = GoogleEarthEngineService()
