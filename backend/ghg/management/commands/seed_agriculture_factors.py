from django.core.management.base import BaseCommand

from core.models import EmissionFactor


class Command(BaseCommand):
    help = "Seed Agriculture sector emission factors for KS-CCC"

    def handle(self, *args, **options):
        enteric_factors = [
            ("dairy_cattle", "Dairy Cattle", 56),
            ("beef_cattle", "Beef / Draft Cattle", 47),
            ("sheep", "Sheep", 5),
            ("goats", "Goats", 5),
            ("market_swine", "Market Swine", 1),
            ("breeding_swine", "Breeding Swine", 1),
            ("camels", "Camels", 46),
            ("horses_donkeys", "Horses / Donkeys", 18),
        ]

        for code, label, ch4_ef in enteric_factors:
            EmissionFactor.objects.update_or_create(
                sector="agriculture",
                sub_category="enteric_fermentation",
                fuel_or_species=code,
                unit="kg_ch4_per_head_per_year",
                tier=EmissionFactor.Tier.TIER_1,
                defaults={
                    "co2_ef": 0,
                    "ch4_ef": ch4_ef,
                    "n2o_ef": 0,
                    "ipcc_source": f"KS-CCC seed value for {label}",
                    "is_active": True,
                },
            )

        rice_ch4_ef = 1.30 * 0.52 * 120

        EmissionFactor.objects.update_or_create(
            sector="agriculture",
            sub_category="rice_cultivation",
            fuel_or_species="rice_area",
            unit="kg_ch4_per_hectare_per_year",
            tier=EmissionFactor.Tier.TIER_1,
            defaults={
                "co2_ef": 0,
                "ch4_ef": rice_ch4_ef,
                "n2o_ef": 0,
                "ipcc_source": "Rice CH4 = area × 1.30 × 0.52 × 120 days",
                "is_active": True,
            },
        )

        fertilizer_crops = [
            ("maize", "Maize"),
            ("sorghum", "Sorghum"),
            ("groundnuts", "Groundnuts"),
            ("soybeans", "Soybeans"),
            ("cotton", "Cotton"),
            ("rice", "Rice"),
            ("wheat", "Wheat"),
        ]

        for code, label in fertilizer_crops:
            EmissionFactor.objects.update_or_create(
                sector="agriculture",
                sub_category="synthetic_fertilizer",
                fuel_or_species=code,
                unit="kg_n2o_per_kg_nitrogen",
                tier=EmissionFactor.Tier.TIER_1,
                defaults={
                    "co2_ef": 0,
                    "ch4_ef": 0,
                    "n2o_ef": 0.01,
                    "ipcc_source": f"Synthetic fertiliser N2O seed value for {label}",
                    "is_active": True,
                },
            )

        self.stdout.write(
            self.style.SUCCESS("Agriculture emission factors seeded successfully.")
        )