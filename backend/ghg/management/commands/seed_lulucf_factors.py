from decimal import Decimal

from django.core.management.base import BaseCommand

from core.models import EmissionFactor


class Command(BaseCommand):
    help = "Seed LULUCF sector emission/removal factors for KS-CCC"

    def handle(self, *args, **options):
        factors = [
            {
                "code": "forest_to_cropland",
                "label": "Forest converted to cropland",
                "co2_ef": Decimal("134945.6"),
                "source": "Delta C = (41.8 - 5.0) tC/ha × 3.667 × 1000 kg",
            },
            {
                "code": "forest_to_settlement",
                "label": "Forest converted to settlement",
                "co2_ef": Decimal("153280.6"),
                "source": "Delta C = (41.8 - 0.0) tC/ha × 3.667 × 1000 kg",
            },
            {
                "code": "cropland_to_forest",
                "label": "Cropland converted to forest / afforestation",
                "co2_ef": Decimal("-134945.6"),
                "source": "Delta C = (5.0 - 41.8) tC/ha × 3.667 × 1000 kg",
            },
        ]

        for item in factors:
            sub_category = (
                "afforestation"
                if item["code"] == "cropland_to_forest"
                else "deforestation"
            )

            EmissionFactor.objects.update_or_create(
                sector="lulucf",
                sub_category=sub_category,
                fuel_or_species=item["code"],
                unit="kg_co2_per_hectare",
                tier=EmissionFactor.Tier.TIER_1,
                defaults={
                    "co2_ef": item["co2_ef"],
                    "ch4_ef": 0,
                    "n2o_ef": 0,
                    "ipcc_source": f"KS-CCC LULUCF seed factor: {item['label']}. {item['source']}",
                    "is_active": True,
                },
            )

        self.stdout.write(
            self.style.SUCCESS("LULUCF emission/removal factors seeded successfully.")
        )