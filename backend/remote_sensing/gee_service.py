import os
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class GEEResult:
    available: bool
    data: Optional[Dict[str, Any]] = None
    error: str = ""


class GoogleEarthEngineService:
    def __init__(self):
        self.project = os.getenv("GEE_PROJECT", "")
        self.service_account = os.getenv("GEE_SERVICE_ACCOUNT", "")
        self.private_key_file = os.getenv("GEE_PRIVATE_KEY_FILE", "")
        self._error = ""

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