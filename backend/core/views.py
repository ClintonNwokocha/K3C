from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import (
    LGARegistry,
    GWPValue,
    NDCConstant,
    EquivalencyFactor,
)
from .serializers import (
    LGARegistrySerializer,
    GWPValueSerializer,
    NDCConstantSerializer,
    EquivalencyFactorSerializer,
)


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    return Response({
        "status": "ok",
        "message": "KS-CCC backend is running"
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def lga_list(request):
    lgas = LGARegistry.objects.all().order_by("lga_id")
    serializer = LGARegistrySerializer(lgas, many=True)

    return Response({
        "count": lgas.count(),
        "results": serializer.data
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def foundation_bootstrap(request):
    lgas = LGARegistry.objects.all().order_by("lga_id")
    gwp_values = GWPValue.objects.all().order_by("gas")
    ndc_constant = NDCConstant.objects.filter(is_active=True).order_by("-updated_at").first()
    equivalency_factors = EquivalencyFactor.objects.all().order_by("name")

    return Response({
        "status": "ok",
        "message": "KS-CCC foundation data loaded",
        "lgas": LGARegistrySerializer(lgas, many=True).data,
        "gwp_values": GWPValueSerializer(gwp_values, many=True).data,
        "ndc_constant": NDCConstantSerializer(ndc_constant).data if ndc_constant else None,
        "equivalency_factors": EquivalencyFactorSerializer(equivalency_factors, many=True).data,
    })