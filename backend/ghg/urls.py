from django.urls import path

from .views import (
    energy_entries,
    energy_options,
    energy_review_queue,
    ghg_dashboard_summary,
    review_energy_entry,
    submit_energy_entry,
    update_energy_entry,
)

urlpatterns = [
    path("dashboard-summary/", ghg_dashboard_summary, name="ghg-dashboard-summary"),

    path("energy/options/", energy_options, name="energy-options"),
    path("energy/entries/", energy_entries, name="energy-entries"),
    path("energy/entries/<int:entry_id>/", update_energy_entry, name="update-energy-entry"),
    path("energy/entries/<int:entry_id>/submit/", submit_energy_entry, name="submit-energy-entry"),
    path("energy/review-queue/", energy_review_queue, name="energy-review-queue"),
    path("energy/entries/<int:entry_id>/review/", review_energy_entry, name="review-energy-entry"),
]