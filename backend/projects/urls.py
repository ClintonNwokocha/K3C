from django.urls import path

from .views import climate_project_detail, climate_projects

urlpatterns = [
    path("projects/", climate_projects, name="climate-projects"),
    path(
        "projects/<int:project_id>/",
        climate_project_detail,
        name="climate-project-detail",
    ),
]