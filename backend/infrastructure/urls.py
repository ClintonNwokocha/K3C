from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import HealthFacilityViewSet

router = DefaultRouter()
router.register("health-facilities", HealthFacilityViewSet, basename="health-facility")

urlpatterns = [
    path("", include(router.urls)),
]
