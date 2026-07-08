from django.contrib import admin

from .models import HealthFacility


@admin.register(HealthFacility)
class HealthFacilityAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "facility_type",
        "ownership",
        "lga_name",
        "ward",
        "functional_status",
        "bed_capacity",
    ]
    list_filter = [
        "facility_type",
        "ownership",
        "functional_status",
        "state",
    ]
    search_fields = ["name", "lga_name", "ward"]
    ordering = ["lga_name", "name"]
    readonly_fields = ["created_at", "updated_at"]
    fieldsets = [
        (
            "Identity",
            {
                "fields": ["name", "facility_type", "ownership", "functional_status"],
            },
        ),
        (
            "Location",
            {
                "fields": ["state", "lga", "lga_name", "ward", "latitude", "longitude"],
            },
        ),
        (
            "Capacity",
            {
                "fields": ["bed_capacity", "population_served"],
            },
        ),
        (
            "Timestamps",
            {
                "fields": ["created_at", "updated_at"],
                "classes": ["collapse"],
            },
        ),
    ]
