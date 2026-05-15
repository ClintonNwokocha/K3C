from rest_framework import serializers
from django.contrib.auth.models import User
from .models import UserProfile


class UserProfileSerializer(serializers.ModelSerializer):
    assigned_lga_name = serializers.CharField(
        source="assigned_lga.lga_name",
        read_only=True
    )

    class Meta:
        model = UserProfile
        fields = [
            "role",
            "assigned_sector",
            "assigned_lga",
            "assigned_lga_name",
            "ministry_department",
            "phone_number",
            "is_active_profile",
        ]


class CurrentUserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_staff",
            "is_superuser",
            "profile",
        ]