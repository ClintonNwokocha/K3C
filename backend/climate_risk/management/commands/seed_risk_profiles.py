from django.core.management.base import BaseCommand

from core.models import LGARegistry
from climate_risk.models import ClimateRiskProfile


class Command(BaseCommand):
    help = "Seed development climate risk profiles for Kaduna LGAs"

    def handle(self, *args, **options):
        risk_rows = [
            ("Birnin Gwari", 82, 70, 76, 74, 80, 38),
            ("Chikun", 68, 62, 72, 58, 70, 50),
            ("Giwa", 56, 71, 69, 48, 62, 45),
            ("Igabi", 60, 66, 70, 52, 65, 48),
            ("Ikara", 52, 76, 67, 45, 58, 44),
            ("Jaba", 45, 54, 58, 62, 55, 57),
            ("Jema'a", 58, 50, 60, 68, 61, 52),
            ("Kachia", 62, 63, 66, 70, 67, 46),
            ("Kaduna North", 64, 47, 78, 40, 75, 60),
            ("Kaduna South", 70, 50, 80, 45, 78, 58),
            ("Kagarko", 55, 60, 62, 66, 59, 49),
            ("Kajuru", 57, 58, 64, 72, 63, 47),
            ("Kaura", 50, 52, 57, 69, 54, 55),
            ("Kauru", 54, 67, 61, 64, 60, 46),
            ("Kubau", 49, 72, 68, 42, 57, 43),
            ("Kudan", 46, 74, 69, 39, 56, 45),
            ("Lere", 52, 70, 66, 55, 59, 47),
            ("Makarfi", 48, 78, 72, 38, 58, 44),
            ("Sabon Gari", 55, 60, 73, 44, 66, 54),
            ("Sanga", 51, 55, 60, 71, 57, 50),
            ("Soba", 50, 73, 70, 43, 60, 45),
            ("Zangon Kataf", 57, 53, 61, 75, 62, 49),
            ("Zaria", 58, 62, 76, 42, 70, 56),
        ]

        created_count = 0
        updated_count = 0

        for (
            lga_name,
            flood,
            drought,
            heat,
            erosion,
            vulnerability,
            adaptive_capacity,
        ) in risk_rows:
            try:
                lga = LGARegistry.objects.get(lga_name=lga_name)
            except LGARegistry.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(f"LGA not found, skipped: {lga_name}")
                )
                continue

            _, created = ClimateRiskProfile.objects.update_or_create(
                lga=lga,
                year=2025,
                defaults={
                    "flood_risk_score": flood,
                    "drought_risk_score": drought,
                    "heat_risk_score": heat,
                    "erosion_risk_score": erosion,
                    "vulnerability_score": vulnerability,
                    "adaptive_capacity_score": adaptive_capacity,
                    "notes": "Development seed score. Replace with validated hazard, exposure and vulnerability datasets before production.",
                    "data_source": "KS-CCC development seed data",
                    "is_active": True,
                },
            )

            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Risk profiles seeded. Created: {created_count}, Updated: {updated_count}"
            )
        )