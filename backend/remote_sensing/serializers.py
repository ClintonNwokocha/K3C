from rest_framework import serializers

from .models import RemoteSensingLayer, RemoteSensingLGAMetric


class RemoteSensingLayerSerializer(serializers.ModelSerializer):
    source = serializers.CharField(source="gee_dataset", read_only=True)
    band = serializers.CharField(source="gee_band", read_only=True)
    unit = serializers.SerializerMethodField()

    UNIT_BY_LAYER_KEY = {
        "rainfall": "mm",
        "rainfall_anomaly": "%",
        "drought_index": "SPI",
        "ndvi": "NDVI",
        "ndvi_landsat": "NDVI",
        "lst": "deg C",
        "flood_occurrence": "%",
        "elevation": "m",
    }

    def get_unit(self, obj):
        return self.UNIT_BY_LAYER_KEY.get(obj.key, "")

    class Meta:
        model = RemoteSensingLayer
        fields = [
            "key",
            "label",
            "unit",
            "description",
            "source",
            "band",
            "gee_dataset",
            "gee_band",
            "visualization",
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
            "admin_level",
            "admin_code",
            "admin_name",
            "year",
            "season",
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
