from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from core.views import health_check


def home(request):
    return JsonResponse({
        "message": "KS-CCC backend is running",
        "health_check": "/api/core/health/",
        "admin": "/admin/",
    })


urlpatterns = [
    path("", home, name="home"),
    path("admin/", admin.site.urls),

    # Platform-standard health path alongside the existing /api/core/health/
    # (kept, unrenamed, for backward compatibility) — same view, same
    # SELECT-1 DB check, same 200/503 contract. Suitable for Docker
    # healthchecks, the shared infra's deploy.sh, Uptime Kuma, and CI smoke
    # tests.
    path("api/health", health_check, name="platform-health-check"),

    path("api/core/", include("core.urls")),
    path("api/accounts/", include("accounts.urls")),
    path("api/ghg/", include("ghg.urls")),
    path("api/risk/", include("climate_risk.urls")),
    path("api/reports/", include("reports.urls")),
    path("api/audit/", include("audit.urls")),
    path("api/portfolio/", include("projects.urls")),
    path("api/public/", include("public_portal.urls")),

    path("api/", include("remote_sensing.urls")),
    path("api/infrastructure/", include("infrastructure.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)