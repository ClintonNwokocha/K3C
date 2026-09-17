import json
import logging
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ExposureMask:
    """Future-ready exposure mask descriptor.

    Current production implementation uses administrative High / Very High
    ClimateRiskProfile LGAs. Hazard-specific masks can later carry raster,
    vector, or catalog identifiers without changing the public endpoint.
    """

    kind: str
    label: str = ""
    metadata: dict | None = None


class ExposureAnalyticsService:
    CACHE_FILENAME = "high_risk_exposure_summary.json"
    CURRENT_MASK_KIND = "high_risk_lga_context"
    FLOOD_MASK_KIND = "flood_occurrence_footprint"
    CACHE_TTL_DAYS = 90

    def __init__(self, cache_path=None):
        self.cache_path = cache_path or (
            Path(settings.BASE_DIR)
            / "public_portal"
            / "data"
            / self.CACHE_FILENAME
        )

    @classmethod
    def high_risk_lga_mask(cls):
        return ExposureMask(
            kind=cls.CURRENT_MASK_KIND,
            label="High and Very High ClimateRiskProfile LGAs",
        )

    @classmethod
    def flood_occurrence_mask(cls):
        return ExposureMask(
            kind=cls.FLOOD_MASK_KIND,
            label="JRC Global Surface Water occurrence > 10%",
        )

    def get_public_summary(self):
        cache = self.load_cached_summary()
        population = self.compute_population_exposure(self.high_risk_lga_mask())
        buildings = self.compute_building_exposure(self.high_risk_lga_mask())
        built_area = self.compute_building_area(self.high_risk_lga_mask())
        flood_population = self.compute_population_exposure(self.flood_occurrence_mask())
        flood_buildings = self.compute_building_exposure(self.flood_occurrence_mask())
        flood_built_area = self.compute_building_area(self.flood_occurrence_mask())
        metadata = self.get_dataset_metadata()

        return {
            "estimated_people_in_high_risk_lgas": population.get("total"),
            "estimated_people_source_year": population.get("source_year"),
            "mapped_buildings_in_high_risk_lgas": buildings.get("total"),
            "mapped_buildings_confidence_threshold": buildings.get(
                "confidence_threshold"
            ),
            "mapped_building_footprint_area_m2": built_area.get(
                "total_footprint_area_m2"
            ),
            "high_risk_lga_population_breakdown": population.get("breakdown", []),
            "high_risk_lga_building_breakdown": buildings.get("breakdown", []),
            "high_risk_exposure_method": metadata,
            "high_risk_exposure_cache": {
                "generated_at": cache.get("generated_at"),
                "computation_date": cache.get("computation_date"),
                "risk_year": cache.get("risk_year")
                or cache.get("risk_profile_year"),
                "cache_ttl_days": cache.get("cache_ttl_days", self.CACHE_TTL_DAYS),
                "is_cache_valid": self.is_cache_valid(cache),
            },
            "flood_population_exposed": flood_population.get("population_exposed"),
            "flood_structures_exposed": flood_buildings.get(
                "mapped_structures_exposed"
            ),
            "flood_building_area_exposed": flood_built_area.get(
                "building_area_exposed_m2"
            ),
            "flood_dataset": flood_population.get("dataset_id")
            or flood_population.get("source"),
            "flood_generated_at": flood_population.get("generated_at"),
            "flood_exposure": {
                "source": flood_population.get("source"),
                "dataset_id": flood_population.get("dataset_id"),
                "dataset_version": flood_population.get("dataset_version"),
                "band": flood_population.get("band"),
                "observation_period": flood_population.get("observation_period"),
                "risk_year": flood_population.get("risk_year"),
                "status": flood_population.get("status"),
                "mask_definition": flood_population.get("mask_definition"),
                "flood_occurrence_threshold_pct": flood_population.get(
                    "flood_occurrence_threshold_pct"
                ),
                "population_dataset_id": flood_population.get(
                    "population_dataset_id"
                ),
                "population_source_year": flood_population.get(
                    "population_source_year"
                ),
                "population_scale_m": flood_population.get("population_scale_m"),
                "population_reducer": flood_population.get("population_reducer"),
                "building_dataset_id": flood_buildings.get("building_dataset_id"),
                "building_confidence_threshold": flood_buildings.get(
                    "building_confidence_threshold"
                ),
                "building_method": flood_buildings.get("building_method"),
                "note": flood_population.get("note"),
            },
        }

    def compute_population_exposure(self, mask):
        self._require_supported_mask(mask)

        if mask.kind == self.FLOOD_MASK_KIND:
            flood = deepcopy(self.load_cached_summary().get("flood", {}))
            if not self._flood_building_metrics_are_public(flood):
                flood["mapped_structures_exposed"] = None
            return flood

        return deepcopy(self.load_cached_summary().get("population", {}))

    def compute_building_exposure(self, mask):
        self._require_supported_mask(mask)

        if mask.kind == self.FLOOD_MASK_KIND:
            flood = deepcopy(self.load_cached_summary().get("flood", {}))
            if not self._flood_building_metrics_are_public(flood):
                flood["mapped_structures_exposed"] = None
                flood["building_area_exposed_m2"] = None
            return flood

        return deepcopy(self.load_cached_summary().get("buildings", {}))

    def compute_building_area(self, mask):
        self._require_supported_mask(mask)

        if mask.kind == self.FLOOD_MASK_KIND:
            flood = self.load_cached_summary().get("flood", {})
            if not self._flood_building_metrics_are_public(flood):
                return {
                    "building_area_exposed_m2": None,
                    "area_field": flood.get("building_area_field"),
                }
            return {
                "building_area_exposed_m2": flood.get("building_area_exposed_m2"),
                "area_field": flood.get("building_area_field"),
            }

        buildings = self.load_cached_summary().get("buildings", {})
        return {
            "total_footprint_area_m2": buildings.get("total_footprint_area_m2"),
            "area_field": buildings.get("area_field"),
            "breakdown": deepcopy(buildings.get("breakdown", [])),
        }

    def get_dataset_metadata(self):
        cache = self.load_cached_summary()
        population = cache.get("population", {})
        buildings = cache.get("buildings", {})
        metadata = cache.get("metadata", {})

        return {
            "method_version": cache.get("method_version")
            or cache.get("methodology_version")
            or metadata.get("methodology_version"),
            "methodology_version": cache.get("methodology_version")
            or metadata.get("methodology_version"),
            "generated_at": cache.get("generated_at"),
            "computation_date": cache.get("computation_date"),
            "risk_year": cache.get("risk_year")
            or cache.get("risk_profile_year"),
            "boundary_source": cache.get("boundary_source")
            or metadata.get("boundary_source"),
            "population_dataset_id": population.get("dataset_id"),
            "population_dataset_version": population.get("dataset_version"),
            "population_source_year": population.get("source_year"),
            "population_scale_m": population.get("scale_m"),
            "population_reducer": population.get("reducer"),
            "population_tile_scale": population.get("tile_scale"),
            "buildings_dataset_id": buildings.get("dataset_id"),
            "buildings_dataset_version": buildings.get("dataset_version"),
            "buildings_confidence_threshold": buildings.get(
                "confidence_threshold"
            ),
            "buildings_filter": buildings.get("filter"),
            "buildings_area_field": buildings.get("area_field"),
        }

    def load_cached_summary(self):
        return deepcopy(_load_cached_summary(str(self.cache_path)))

    def is_cache_valid(self, cache=None):
        cache = cache or self.load_cached_summary()
        if not (cache.get("generated_at") and cache.get("population") and cache.get("buildings")):
            return False

        generated_at = self._parse_cache_date(cache.get("generated_at"))
        if not generated_at:
            return False

        ttl_days = cache.get("cache_ttl_days", self.CACHE_TTL_DAYS)
        return timezone.now() - generated_at <= timedelta(days=ttl_days)

    @staticmethod
    def clear_cache():
        _load_cached_summary.cache_clear()

    def _require_supported_mask(self, mask):
        if mask.kind not in {self.CURRENT_MASK_KIND, self.FLOOD_MASK_KIND}:
            raise NotImplementedError(
                f"Exposure mask '{mask.kind}' is not implemented yet."
            )

    @staticmethod
    def _flood_building_metrics_are_public(flood):
        if not isinstance(flood, dict):
            return False
        return (
            flood.get("status") == "validated"
            and flood.get("validated_for_publication") is True
            and flood.get("mapped_structures_exposed") is not None
            and flood.get("building_area_exposed_m2") is not None
        )

    @staticmethod
    def _parse_cache_date(raw_value):
        if not raw_value:
            return None

        raw_text = str(raw_value).strip()

        try:
            parsed = datetime.fromisoformat(raw_text.replace("Z", "+00:00"))
        except ValueError:
            return None

        if timezone.is_naive(parsed):
            return timezone.make_aware(parsed)

        return parsed


@lru_cache(maxsize=4)
def _load_cached_summary(cache_path):
    path = Path(cache_path)

    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        logger.warning("Exposure summary cache file not found: %s", path)
    except json.JSONDecodeError as exc:
        logger.warning("Exposure summary cache file is invalid: %s", exc)

    return {}
