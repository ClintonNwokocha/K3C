from django.urls import path

from .views import (
    climate_risk_dataset_uploads,
    climate_risk_parameter_records,
    climate_risk_profiles,
    update_climate_risk_parameter_record,
    update_climate_risk_profile,
)

urlpatterns = [
    path("profiles/", climate_risk_profiles, name="climate-risk-profiles"),
    path(
        "profiles/<int:profile_id>/",
        update_climate_risk_profile,
        name="update-climate-risk-profile",
    ),
    path(
        "parameters/",
        climate_risk_parameter_records,
        name="climate-risk-parameter-records",
    ),
    path(
        "parameters/<int:record_id>/",
        update_climate_risk_parameter_record,
        name="update-climate-risk-parameter-record",
    ),
    path(
        "uploads/",
        climate_risk_dataset_uploads,
        name="climate-risk-dataset-uploads",
    ),
]