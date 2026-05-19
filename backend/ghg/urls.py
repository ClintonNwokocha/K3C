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

from .waste_views import (
    review_waste_entry,
    submit_waste_entry,
    update_waste_entry,
    waste_entries,
    waste_options,
    waste_review_queue,
)

from .ippu_views import (
    ippu_entries,
    ippu_options,
    ippu_review_queue,
    review_ippu_entry,
    submit_ippu_entry,
    update_ippu_entry,
)

from .lulucf_views import (
    lulucf_entries,
    lulucf_options,
    lulucf_review_queue,
    review_lulucf_entry,
    submit_lulucf_entry,
    update_lulucf_entry,
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

    path("waste/options/", waste_options, name="waste-options"),
    path("waste/entries/", waste_entries, name="waste-entries"),
    path("waste/entries/<int:entry_id>/", update_waste_entry, name="update-waste-entry"),
    path("waste/entries/<int:entry_id>/submit/", submit_waste_entry, name="submit-waste-entry"),
    path("waste/review-queue/", waste_review_queue, name="waste-review-queue"),
    path("waste/entries/<int:entry_id>/review/", review_waste_entry, name="review-waste-entry"),

    path("ippu/options/", ippu_options, name="ippu-options"),
    path("ippu/entries/", ippu_entries, name="ippu-entries"),
    path("ippu/entries/<int:entry_id>/", update_ippu_entry, name="update-ippu-entry"),
    path("ippu/entries/<int:entry_id>/submit/", submit_ippu_entry, name="submit-ippu-entry"),
    path("ippu/review-queue/", ippu_review_queue, name="ippu-review-queue"),
    path("ippu/entries/<int:entry_id>/review/", review_ippu_entry, name="review-ippu-entry"),

    path("lulucf/options/", lulucf_options, name="lulucf-options"),
    path("lulucf/entries/", lulucf_entries, name="lulucf-entries"),
    path("lulucf/entries/<int:entry_id>/", update_lulucf_entry, name="update-lulucf-entry"),
    path("lulucf/entries/<int:entry_id>/submit/", submit_lulucf_entry, name="submit-lulucf-entry"),
    path("lulucf/review-queue/", lulucf_review_queue, name="lulucf-review-queue"),
    path("lulucf/entries/<int:entry_id>/review/", review_lulucf_entry, name="review-lulucf-entry"),
]