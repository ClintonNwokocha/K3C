from rest_framework.permissions import BasePermission
from .models import UserProfile


class IsAdminRole(BasePermission):
    message = "Only Admin users can perform this action."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        profile = getattr(request.user, "profile", None)

        return bool(profile and profile.role == UserProfile.Role.ADMIN)