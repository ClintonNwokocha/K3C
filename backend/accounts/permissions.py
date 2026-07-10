from rest_framework.permissions import BasePermission
from .models import UserProfile

# Roles that may access internal authenticated modules.
# Mirrors the frontend canViewInternalModules() roles that exist in the backend model.
_INTERNAL_ROLES = frozenset({
    UserProfile.Role.ADMIN,
    UserProfile.Role.ANALYST,
    UserProfile.Role.SECTOR_FOCAL_POINT,
})


class IsAdminRole(BasePermission):
    message = "Only Admin users can perform this action."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        profile = getattr(request.user, "profile", None)

        return bool(profile and profile.role == UserProfile.Role.ADMIN)


class IsInternalUser(BasePermission):
    """
    Allows access to authenticated internal staff only.

    Grants access when ALL of the following are true:
      - The request carries a valid JWT (user is authenticated).
      - The user has a UserProfile with a role in _INTERNAL_ROLES.
    Superusers bypass the role check.
    Rejects unauthenticated requests (401) and PUBLIC-role users (403).
    """

    message = "You do not have permission to access this internal module."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        profile = getattr(request.user, "profile", None)
        return bool(profile and profile.role in _INTERNAL_ROLES)