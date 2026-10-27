from django.core.management.base import BaseCommand

from core.models import EmissionFactor


class Command(BaseCommand):
    help = "Seed Agriculture sector emission factors for KS-CCC"

    def handle(self, *args, **options):
        # IPCC 2006 Vol.4 Table 10.11 (Africa cattle) and Table 10.10.
        # Horses / donkeys keeps the horse value (18); donkeys alone are 10.
        enteric_factors = [
            ("dairy_cattle", "Dairy Cattle", 40),
            ("beef_cattle", "Beef / Draft Cattle", 31),
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
                    "ipcc_source": f"IPCC 2006 Vol.4 Tables 10.10-10.11 (Africa): {label}",
                    "ipcc_code": "3.A.1",
                    "is_active": True,
                },
            )

        # Rainfed regular water regime (SFw 0.28, Vol.4 Table 5.12): most
        # Kaduna rice is rainfed lowland (fadama).
        rice_ch4_ef = 1.30 * 0.28 * 120

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
                "ipcc_source": "IPCC 2006 Vol.4 Eq. 5.1: area × 1.30 × 0.28 (rainfed) × 120 days",
                "ipcc_code": "3.C.7",
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
                    # EF1 0.01 kg N2O-N per kg N x 44/28 (Vol.4 Table 11.1)
                    "n2o_ef": round(0.01 * 44 / 28, 6),
                    "ipcc_source": f"IPCC 2006 Vol.4 Eq. 11.1, EF1 0.01 × 44/28: {label}",
                    "ipcc_code": "3.C.4",
                    "is_active": True,
                },
            )

        self.stdout.write(
            self.style.SUCCESS("Agriculture emission factors seeded successfully.")
        )