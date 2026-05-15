from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        ANALYST = "analyst", "Analyst"
        SECTOR_FOCAL_POINT = "sector_focal_point", "Sector Focal Point"
        PUBLIC = "public", "Public"

    class Sector(models.TextChoices):
        ENERGY = "energy", "Energy"
        AGRICULTURE = "agriculture", "Agriculture"
        LULUCF = "lulucf", "Land Use, Land-Use Change and Forestry"
        WASTE = "waste", "Waste"
        IPPU = "ippu", "Industrial Processes and Product Use"
        PROJECTS = "projects", "Projects"
        NONE = "none", "None"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile"
    )
    role = models.CharField(
        max_length=50,
        choices=Role.choices,
        default=Role.SECTOR_FOCAL_POINT
    )
    assigned_sector = models.CharField(
        max_length=50,
        choices=Sector.choices,
        default=Sector.NONE,
        blank=True
    )
    assigned_lga = models.ForeignKey(
        "core.LGARegistry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_users"
    )
    ministry_department = models.CharField(max_length=255, blank=True)
    phone_number = models.CharField(max_length=50, blank=True)
    is_active_profile = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} - {self.get_role_display()}"