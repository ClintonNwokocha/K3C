from django.contrib import admin
from .models import UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "role",
        "assigned_sector",
        "assigned_lga",
        "ministry_department",
        "is_active_profile",
    )
    list_filter = ("role", "assigned_sector", "is_active_profile")
    search_fields = ("user__username", "user__email", "ministry_department")