from django.urls import path
from .views import health_check, lga_list, foundation_bootstrap

urlpatterns = [
    path("health/", health_check, name="health-check"),
    path("lgas/", lga_list, name="lga-list"),
    path("foundation/", foundation_bootstrap, name="foundation-bootstrap"),
]