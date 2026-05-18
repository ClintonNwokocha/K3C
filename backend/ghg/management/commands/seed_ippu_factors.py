from django.core.management.base import BaseCommand

from core.models import EmissionFactor


class Command(BaseCommand):
    help = "Seed IPPU sector emission factors for KS-CCC"

    def handle(self, *args, **options):
        mineral_products = [
            ("cement", "Cement Used in Construction", 500),
            ("lime", "Lime Used", 440),
            ("bricks", "Bricks from Coal-fired Kilns", 220),
        ]

        for code, label, co2_ef in mineral_products:
            EmissionFactor.objects.update_or_create(
                sector="ippu",
                sub_category="mineral_products",
                fuel_or_species=code,
                unit="kg_co2_per_tonne_product",
                tier=EmissionFactor.Tier.TIER_1,
                defaults={
                    "co2_ef": co2_ef,
                    "ch4_ef": 0,
                    "n2o_ef": 0,
                    "ipcc_source": f"KS-CCC mineral product seed factor for {label}",
                    "is_active": True,
                },
            )

        refrigerants = [
            ("r134a", "R-134a", 1430),
            ("r410a", "R-410A", 2088),
            ("r22", "R-22", 1810),
        ]

        for code, label, gwp in refrigerants:
            EmissionFactor.objects.update_or_create(
                sector="ippu",
                sub_category="refrigerants",
                fuel_or_species=code,
                unit="kg_co2e_per_kg_refrigerant",
                tier=EmissionFactor.Tier.TIER_1,
                defaults={
                    "co2_ef": gwp,
                    "ch4_ef": 0,
                    "n2o_ef": 0,
                    "ipcc_source": f"KS-CCC refrigerant GWP seed factor for {label}",
                    "is_active": True,
                },
            )

        self.stdout.write(
            self.style.SUCCESS("IPPU emission factors seeded successfully.")
        )