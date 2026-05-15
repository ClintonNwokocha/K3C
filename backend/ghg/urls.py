from django.urls import path

from .views import energy_entries, energy_options, submit_energy_entry

urlpatterns = [
    path("energy/options/", energy_options, name="energy-options"),
    path("energy/entries/", energy_entries, name="energy-entries"),
    path("energy/entries/<int:entry_id>/submit/", submit_energy_entry, name="submit-energy-entry"),
]