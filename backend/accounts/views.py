from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import UserProfile
from .serializers import CurrentUserSerializer


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