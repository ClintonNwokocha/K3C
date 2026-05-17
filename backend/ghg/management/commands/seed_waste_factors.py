from decimal import Decimal

from django.core.management.base import BaseCommand

from core.models import EmissionFactor


class Command(BaseCommand):
    help = "Seed Waste sector emission factors for KS-CCC"

    def handle(self, *args, **options):
        # Solid waste formula:
        # CH4 = waste tonnes × DOC × DOCf × F × MCF × 16/12
        # DOC = 0.15, DOCf = 0.50, F = 0.50
        # Open dump MCF = 0.80 → 40 kg CH4 per tonne waste
        # Managed landfill MCF = 1.00 → 50 kg CH4 per tonne waste

        solid_waste_factors = [
            ("open_dump", "Open Dump", Decimal("40.0")),
            ("managed_landfill", "Managed Landfill", Decimal("50.0")),
        ]

        for code, label, ch4_ef in solid_waste_factors:
            EmissionFactor.objects.update_or_create(
                sector="waste",
                sub_category="solid_waste",
                fuel_or_species=code,
                unit="kg_ch4_per_tonne_waste",
                tier=EmissionFactor.Tier.TIER_1,
                defaults={
                    "co2_ef": 0,
                    "ch4_ef": ch4_ef,
                    "n2o_ef": 0,
                    "ipcc_source": f"KS-CCC solid waste seed factor for {label}",
                    "is_active": True,
                },
            )

        # Wastewater formula simplified into per-person factors:
        # TOW = population × 45g BOD/day × 365 days = 16.425 kg/person/year
        # CH4 = TOW × 0.6 × 0.10 = 0.9855 kg CH4/person/year
        # N2O = population × 3.65 kg N/person/year × 0.005 × 44/28
        #     = 0.028678571 kg N2O/person/year

        EmissionFactor.objects.update_or_create(
            sector="waste",
            sub_category="wastewater",
            fuel_or_species="population",
            unit="kg_gas_per_person_per_year",
            tier=EmissionFactor.Tier.TIER_1,
            defaults={
                "co2_ef": 0,
                "ch4_ef": Decimal("0.9855"),
                "n2o_ef": Decimal("0.028678571"),
                "ipcc_source": "KS-CCC wastewater seed factors from population-based calculation",
                "is_active": True,
            },
        )

        self.stdout.write(
            self.style.SUCCESS("Waste emission factors seeded successfully.")
        )