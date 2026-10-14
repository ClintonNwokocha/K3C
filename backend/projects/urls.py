from django.urls import path

from .views import (
    climate_project_detail,
    climate_projects,
    import_climate_projects,
    project_ghg_sector_summary,
    project_progress_updates,
)

urlpatterns = [
    path("projects/", climate_projects, name="climate-projects"),
    path("projects/import/", import_climate_projects, name="import-climate-projects"),
    path(
        "projects/ghg-summary/",
        project_ghg_sector_summary,
        name="project-ghg-sector-summary",
    ),
    path(
        "projects/<int:project_id>/",
        climate_project_detail,
        name="climate-project-detail",
    ),
    path(
        "projects/<int:project_id>/progress/",
        project_progress_updates,
        name="project-progress-updates",
    ),
]