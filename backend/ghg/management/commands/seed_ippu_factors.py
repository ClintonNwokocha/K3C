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

        # AR5 GWP100 (UNFCCC reporting).  R-22 is an HCFC controlled under the
        # Montreal Protocol and excluded from UNFCCC totals, so it is inactive.
        refrigerants = [
            ("r134a", "R-134a", 1300, True),
            ("r410a", "R-410A", 1924, True),
            ("r22", "R-22", 1760, False),
        ]

        for code, label, gwp, active in refrigerants:
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
                    "ipcc_source": f"IPCC AR5 GWP100 for {label}",
                    "ipcc_code": "2.F.1",
                    "is_active": active,
                },
            )

        self.stdout.write(
            self.style.SUCCESS("IPPU emission factors seeded successfully.")
        )