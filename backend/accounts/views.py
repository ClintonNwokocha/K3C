from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import UserProfile
from .permissions import IsAdminRole
from .serializers import (
    CurrentUserSerializer,
    ManagedUserCreateSerializer,
    ManagedUserSerializer,
    ManagedUserUpdateSerializer,
)


class ThrottledTokenObtainPairView(TokenObtainPairView):
    """Same login behaviour as SimpleJWT's TokenObtainPairView, with a
    tighter per-IP rate limit (see REST_FRAMEWORK.DEFAULT_THROTTLE_RATES
    "login" scope) since this is the highest-value brute-force target."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def current_user(request):
    profile, created = UserProfile.objects.get_or_create(user=request.user)

    if request.user.is_superuser and profile.role != UserProfile.Role.ADMIN:
        profile.role = UserProfile.Role.ADMIN
        profile.assigned_sector = UserProfile.Sector.NONE
        profile.save(update_fields=["role", "assigned_sector", "updated_at"])

    serializer = CurrentUserSerializer(request.user)

    return Response({
        "status": "ok",
        "user": serializer.data
    })


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdminRole])
def managed_user_list_create(request):
    if request.method == "GET":
        users = (
            User.objects
            .select_related("profile", "profile__assigned_lga")
            .all()
            .order_by("username")
        )

        serializer = ManagedUserSerializer(users, many=True)

        return Response({
            "count": users.count(),
            "results": serializer.data
        })

    serializer = ManagedUserCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()

    return Response(
        {
            "message": "User created successfully.",
            "user": ManagedUserSerializer(user).data,
        },
        status=status.HTTP_201_CREATED
    )


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsAdminRole])
def managed_user_update(request, user_id):
    user = get_object_or_404(User, id=user_id)

    serializer = ManagedUserUpdateSerializer(
        user,
        data=request.data,
        partial=True
    )
    serializer.is_valid(raise_exception=True)
    updated_user = serializer.save()

    return Response({
        "message": "User updated successfully.",
        "user": ManagedUserSerializer(updated_user).data,
    })