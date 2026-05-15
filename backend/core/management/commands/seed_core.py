from django.core.management.base import BaseCommand
from core.models import LGARegistry, GWPValue, NDCConstant, EquivalencyFactor


class Command(BaseCommand):
    help = "Seed KS-CCC foundation reference data"

    def handle(self, *args, **options):
        lgas = [
            (1, "Birnin Gwari"),
            (2, "Chikun"),
            (3, "Giwa"),
            (4, "Igabi"),
            (5, "Ikara"),
            (6, "Jaba"),
            (7, "Jema'a"),
            (8, "Kachia"),
            (9, "Kaduna North"),
            (10, "Kaduna South"),
            (11, "Kagarko"),
            (12, "Kajuru"),
            (13, "Kaura"),
            (14, "Kauru"),
            (15, "Kubau"),
            (16, "Kudan"),
            (17, "Lere"),
            (18, "Makarfi"),
            (19, "Sabon Gari"),
            (20, "Sanga"),
            (21, "Soba"),
            (22, "Zangon Kataf"),
            (23, "Zaria"),
        ]

        for lga_id, lga_name in lgas:
            LGARegistry.objects.update_or_create(
                lga_id=lga_id,
                defaults={
                    "lga_name": lga_name,
                    "state": "Kaduna",
                },
            )

        gwp_values = [
            ("CO2", 1),
            ("CH4", 28),
            ("N2O", 265),
        ]

        for gas, value in gwp_values:
            GWPValue.objects.update_or_create(
                gas=gas,
                defaults={
                    "gwp100_ar5": value,
                    "source": "IPCC AR5",
                },
            )

        NDCConstant.objects.update_or_create(
            id=1,
            defaults={
                "nigeria_baseline_mt": 317,
                "kaduna_share_pct": 4.2,
                "kaduna_baseline_mt": 13.3,
                "target_year": 2030,
                "unconditional_pct": 47,
                "conditional_pct": 50,
                "is_active": True,
            },
        )

        equivalencies = [
            ("cars_removed", 4.6, "cars removed for one year"),
            ("homes_powered", 0.0117, "homes powered for one year"),
        ]

        for name, divisor, label in equivalencies:
            EquivalencyFactor.objects.update_or_create(
                name=name,
                defaults={
                    "divisor": divisor,
                    "label": label,
                },
            )

        self.stdout.write(self.style.SUCCESS("KS-CCC foundation data seeded successfully."))