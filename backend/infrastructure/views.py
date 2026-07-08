from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import HealthFacility
from .serializers import HealthFacilitySerializer, HealthFacilitySummarySerializer


class HealthFacilityPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 500


class HealthFacilityViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only API for health facilities in Kaduna State.

    List and detail endpoints only — no write operations.

    Query parameters (list endpoint):
        lga           – filter by LGA primary key (integer)
        lga_name      – filter by LGA name (case-insensitive contains)
        facility_type – filter by facility type code (phc, secondary, tertiary, …)
        functional_status – filter by status code (functional, partial, non_functional, unknown)
        ward          – filter by ward name (case-insensitive contains)
    """

    permission_classes = [IsAuthenticated]
    pagination_class = HealthFacilityPagination

    def get_serializer_class(self):
        if self.action == "list":
            return HealthFacilitySummarySerializer
        return HealthFacilitySerializer

    def get_queryset(self):
        qs = HealthFacility.objects.select_related("lga").order_by("lga_name", "name")

        lga = self.request.query_params.get("lga")
        if lga:
            qs = qs.filter(lga_id=lga)

        lga_name = self.request.query_params.get("lga_name")
        if lga_name:
            qs = qs.filter(lga_name__icontains=lga_name)

        facility_type = self.request.query_params.get("facility_type")
        if facility_type:
            qs = qs.filter(facility_type=facility_type)

        functional_status = self.request.query_params.get("functional_status")
        if functional_status:
            qs = qs.filter(functional_status=functional_status)

        ward = self.request.query_params.get("ward")
        if ward:
            qs = qs.filter(ward__icontains=ward)

        return qs

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        """
        Aggregate counts by facility_type and functional_status.

        Returns totals — useful for dashboard cards before map data is needed.
        """
        from django.db.models import Count

        qs = self.get_queryset()
        total = qs.count()

        by_type = list(
            qs.values("facility_type")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        by_status = list(
            qs.values("functional_status")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        by_lga = list(
            qs.values("lga_name")
            .annotate(count=Count("id"))
            .order_by("lga_name")
        )

        return Response(
            {
                "total": total,
                "by_facility_type": by_type,
                "by_functional_status": by_status,
                "by_lga": by_lga,
            }
        )
