from django.urls import path

from .views import climate_risk_profiles

urlpatterns = [
    path("profiles/", climate_risk_profiles, name="climate-risk-profiles"),
]