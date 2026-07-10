from django.urls import path

from .views import (
    ai_hotspots,
    climate_action_screening,
    climate_intelligence,
    climate_intelligence_profile,
    dashboard_kpis,
    elevation_preview,
    elevation_sample,
    elevation_sample_public,
    elevation_tile_proxy,
    elevation_tile_url,
    elevation_tile_url_public,
    flood_occurrence_preview,
    gee_status,
    lga_profile,
    lga_stats,
    lulc_preview,
    lulc_tile_proxy,
    lulc_tile_url,
    public_elevation_summary,
    public_historical_surface_water,
    remote_sensing_layers,
    tile_url,
)

urlpatterns = [
    path("gee/status/", gee_status, name="remote-sensing-gee-status"),
    path("layers/", remote_sensing_layers, name="remote-sensing-layers"),

    path("tiles/url/<str:layer>/", tile_url, name="remote-sensing-tile-url"),
    path("climate/lga-stats/", lga_stats, name="remote-sensing-lga-stats"),
    path("climate/lga-profile/<int:lga>/", lga_profile, name="remote-sensing-lga-profile"),

    path("dashboard/kpis/", dashboard_kpis, name="remote-sensing-dashboard-kpis"),
    path("ai/hotspots/", ai_hotspots, name="remote-sensing-ai-hotspots"),

    # Climate Intelligence Engine E1 — read-only aggregation, no GEE, no writes.
    path("remote-sensing/climate-intelligence/", climate_intelligence, name="remote-sensing-climate-intelligence"),
    # Climate Intelligence Engine E5 — single-LGA focused profile.
    path("remote-sensing/climate-intelligence/profile/", climate_intelligence_profile, name="remote-sensing-climate-intelligence-profile"),

    # Internal authenticated endpoint — Climate Action Screening Matrix and Map Lens.
    # Requires JWT + internal staff role (ADMIN, ANALYST, SECTOR_FOCAL_POINT).
    # The public climate-intelligence endpoint above is intentionally left unchanged.
    path("remote-sensing/internal/climate-action-screening/", climate_action_screening, name="remote-sensing-climate-action-screening"),

    # Phase P1 — public release candidates (DB-backed, no GEE, gate: is_public=True & is_active=True).
    path("remote-sensing/public/elevation/", public_elevation_summary, name="remote-sensing-public-elevation"),
    path("remote-sensing/public/historical-surface-water/", public_historical_surface_water, name="remote-sensing-public-hsw"),

    # Internal preview only — not public.
    path("remote-sensing/lulc/", lulc_preview, name="remote-sensing-lulc-preview"),
    path("remote-sensing/lulc-tile/", lulc_tile_url, name="remote-sensing-lulc-tile"),
    path("remote-sensing/lulc-tile/<int:z>/<int:x>/<int:y>/", lulc_tile_proxy, name="remote-sensing-lulc-tile-proxy"),
    path("remote-sensing/flood-occurrence/", flood_occurrence_preview, name="remote-sensing-flood-occurrence-preview"),
    path("remote-sensing/elevation/", elevation_preview, name="remote-sensing-elevation-preview"),
    path("remote-sensing/elevation/tile/", elevation_tile_url, name="remote-sensing-elevation-tile"),
    path("remote-sensing/elevation/sample/", elevation_sample, name="remote-sensing-elevation-sample"),

    # Public terrain tile proxy and point sampling — no DEBUG/localhost gate.
    path("remote-sensing/elevation/public-tile/", elevation_tile_url_public, name="remote-sensing-elevation-public-tile"),
    path("remote-sensing/elevation-tile/<int:z>/<int:x>/<int:y>/", elevation_tile_proxy, name="remote-sensing-elevation-tile-proxy"),
    path("remote-sensing/elevation/public-sample/", elevation_sample_public, name="remote-sensing-elevation-sample-public"),
]