from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    current_user,
    managed_user_list_create,
    managed_user_update,
)

urlpatterns = [
    path("token/", TokenObtainPairView.as_view(), name="token-obtain-pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", current_user, name="current-user"),

    path("users/", managed_user_list_create, name="managed-user-list-create"),
    path("users/<int:user_id>/", managed_user_update, name="managed-user-update"),
]