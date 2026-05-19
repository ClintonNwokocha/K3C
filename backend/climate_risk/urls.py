from django.urls import path

from .views import climate_risk_profiles, update_climate_risk_profile

urlpatterns = [
    path("profiles/", climate_risk_profiles, name="climate-risk-profiles"),
    path(
        "profiles/<int:profile_id>/",
        update_climate_risk_profile,
        name="update-climate-risk-profile",
    ),
]