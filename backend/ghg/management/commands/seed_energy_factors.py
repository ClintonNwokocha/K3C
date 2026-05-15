from django.core.management.base import BaseCommand

from core.models import EmissionFactor


class Command(BaseCommand):
    help = "Seed Energy sector emission factors for KS-CCC"

    def handle(self, *args, **options):
        factors = [
            {
                "fuel_or_species": "diesel",
                "label": "Diesel / Gas Oil",
                "co2_ef": 3179,
            },
            {
                "fuel_or_species": "petrol",
                "label": "Petrol / Gasoline",
                "co2_ef": 3069,
            },
            {
                "fuel_or_species": "kerosene",
                "label": "Kerosene",
                "co2_ef": 3149,
            },
            {
                "fuel_or_species": "lpg",
                "label": "LPG / Cooking Gas",
                "co2_ef": 2983,
            },
            {
                "fuel_or_species": "firewood",
                "label": "Firewood / Wood Fuel",
                "co2_ef": 1747,
            },
            {
                "fuel_or_species": "charcoal",
                "label": "Charcoal",
                "co2_ef": 3304,
            },
            {
                "fuel_or_species": "natural_gas",
                "label": "Natural Gas",
                "co2_ef": 2750,
            },
        ]

        sub_categories = [
            "stationary_combustion",
            "transport_combustion",
        ]

        for factor in factors:
            for sub_category in sub_categories:
                EmissionFactor.objects.update_or_create(
                    sector="energy",
                    sub_category=sub_category,
                    fuel_or_species=factor["fuel_or_species"],
                    unit="kg_per_metric_tonne",
                    tier=EmissionFactor.Tier.TIER_1,
                    defaults={
                        "co2_ef": factor["co2_ef"],
                        "ch4_ef": 0,
                        "n2o_ef": 0,
                        "ipcc_source": "KS-CCC seed value based on developer specification",
                        "is_active": True,
                    },
                )

        self.stdout.write(
            self.style.SUCCESS("Energy emission factors seeded successfully.")
        )