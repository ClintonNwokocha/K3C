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

from .agriculture_views import (
    agriculture_entries,
    agriculture_options,
    agriculture_review_queue,
    review_agriculture_entry,
    submit_agriculture_entry,
    update_agriculture_entry,
)

urlpatterns = [
    path("dashboard-summary/", ghg_dashboard_summary, name="ghg-dashboard-summary"),

    path("energy/options/", energy_options, name="energy-options"),
    path("energy/entries/", energy_entries, name="energy-entries"),
    path("energy/entries/<int:entry_id>/", update_energy_entry, name="update-energy-entry"),
    path("energy/entries/<int:entry_id>/submit/", submit_energy_entry, name="submit-energy-entry"),
    path("energy/review-queue/", energy_review_queue, name="energy-review-queue"),
    path("energy/entries/<int:entry_id>/review/", review_energy_entry, name="review-energy-entry"),

    path("agriculture/options/", agriculture_options, name="agriculture-options"),
    path("agriculture/entries/", agriculture_entries, name="agriculture-entries"),
    path("agriculture/entries/<int:entry_id>/", update_agriculture_entry, name="update-agriculture-entry"),
    path("agriculture/entries/<int:entry_id>/submit/", submit_agriculture_entry, name="submit-agriculture-entry"),
    path("agriculture/review-queue/", agriculture_review_queue, name="agriculture-review-queue"),
    path("agriculture/entries/<int:entry_id>/review/", review_agriculture_entry, name="review-agriculture-entry"),
]