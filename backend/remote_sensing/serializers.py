from rest_framework import serializers

from .models import RemoteSensingLayer, RemoteSensingLGAMetric


class RemoteSensingLayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = RemoteSensingLayer
        fields = [
            "id",
            "key",
            "label",
            "description",
            "visualization",
            "is_public",
            "is_active",
            "last_synced_at",
        ]


class RemoteSensingLGAMetricSerializer(serializers.ModelSerializer):
    lga_name = serializers.CharField(source="lga.lga_name", read_only=True)
    layer_key = serializers.CharField(source="layer.key", read_only=True)
    layer_label = serializers.CharField(source="layer.label", read_only=True)

    class Meta:
        model = RemoteSensingLGAMetric
        fields = [
            "id",
            "layer",
            "layer_key",
            "layer_label",
            "lga",
            "lga_name",
            "year",
            "month",
            "mean_value",
            "min_value",
            "max_value",
            "anomaly_value",
            "unit",
            "data_source",
            "metadata",
            "updated_at",
        ]