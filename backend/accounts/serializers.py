from django.contrib.auth.models import User
from rest_framework import serializers

from core.models import LGARegistry
from .models import UserProfile


class UserProfileSerializer(serializers.ModelSerializer):
    assigned_lga_name = serializers.CharField(
        source="assigned_lga.lga_name",
        read_only=True
    )

    role_display = serializers.CharField(
        source="get_role_display",
        read_only=True
    )

    assigned_sector_display = serializers.CharField(
        source="get_assigned_sector_display",
        read_only=True
    )

    class Meta:
        model = UserProfile
        fields = [
            "role",
            "role_display",
            "assigned_sector",
            "assigned_sector_display",
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


class ManagedUserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "last_login",
            "profile",
        ]

    def get_full_name(self, obj):
        return obj.get_full_name()


class ManagedUserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8)

    role = serializers.ChoiceField(choices=UserProfile.Role.choices)
    assigned_sector = serializers.ChoiceField(
        choices=UserProfile.Sector.choices,
        required=False,
        default=UserProfile.Sector.NONE
    )
    assigned_lga = serializers.PrimaryKeyRelatedField(
        queryset=LGARegistry.objects.all(),
        required=False,
        allow_null=True
    )
    ministry_department = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True
    )
    phone_number = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True
    )
    is_active_profile = serializers.BooleanField(required=False, default=True)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    def create(self, validated_data):
        profile_data = {
            "role": validated_data.pop("role"),
            "assigned_sector": validated_data.pop("assigned_sector", UserProfile.Sector.NONE),
            "assigned_lga": validated_data.pop("assigned_lga", None),
            "ministry_department": validated_data.pop("ministry_department", ""),
            "phone_number": validated_data.pop("phone_number", ""),
            "is_active_profile": validated_data.pop("is_active_profile", True),
        }

        password = validated_data.pop("password")

        user = User.objects.create_user(
            password=password,
            **validated_data
        )

        UserProfile.objects.create(
            user=user,
            **profile_data
        )

        return user

    def to_representation(self, instance):
        return ManagedUserSerializer(instance).data


class ManagedUserUpdateSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    password = serializers.CharField(
        write_only=True,
        min_length=8,
        required=False,
        allow_blank=True
    )
    is_active = serializers.BooleanField(required=False)

    role = serializers.ChoiceField(
        choices=UserProfile.Role.choices,
        required=False
    )
    assigned_sector = serializers.ChoiceField(
        choices=UserProfile.Sector.choices,
        required=False
    )
    assigned_lga = serializers.PrimaryKeyRelatedField(
        queryset=LGARegistry.objects.all(),
        required=False,
        allow_null=True
    )
    ministry_department = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True
    )
    phone_number = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True
    )
    is_active_profile = serializers.BooleanField(required=False)

    def update(self, instance, validated_data):
        profile, _ = UserProfile.objects.get_or_create(user=instance)

        user_fields = [
            "email",
            "first_name",
            "last_name",
            "is_active",
        ]

        for field in user_fields:
            if field in validated_data:
                setattr(instance, field, validated_data[field])

        password = validated_data.get("password")
        if password:
            instance.set_password(password)

        instance.save()

        profile_fields = [
            "role",
            "assigned_sector",
            "assigned_lga",
            "ministry_department",
            "phone_number",
            "is_active_profile",
        ]

        for field in profile_fields:
            if field in validated_data:
                setattr(profile, field, validated_data[field])

        profile.save()

        return instance

    def to_representation(self, instance):
        return ManagedUserSerializer(instance).data