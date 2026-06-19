from django.urls import path

from .views import (
    ai_hotspots,
    dashboard_kpis,
    gee_status,
    lga_profile,
    lga_stats,
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
]