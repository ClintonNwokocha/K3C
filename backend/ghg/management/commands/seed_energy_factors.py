from decimal import Decimal as D

from django.core.management.base import BaseCommand

from core.models import EmissionFactor

# IPCC 2006 Vol.2: net calorific value (TJ per tonne, Table 1.2) and CO2
# (kg/TJ, Table 1.4).  Per-tonne factors are NCV x kg/TJ.
FUELS = {
    "diesel": {"label": "Diesel / Gas Oil", "ncv": D("0.0430"), "co2": D("74100")},
    "petrol": {"label": "Petrol / Gasoline", "ncv": D("0.0443"), "co2": D("69300")},
    "kerosene": {"label": "Kerosene", "ncv": D("0.0438"), "co2": D("71900")},
    "lpg": {"label": "LPG / Cooking Gas", "ncv": D("0.0473"), "co2": D("63100")},
    "firewood": {"label": "Firewood / Wood Fuel", "ncv": D("0.0156"), "co2": D("112000"), "biogenic": True},
    "charcoal": {"label": "Charcoal", "ncv": D("0.0295"), "co2": D("112000"), "biogenic": True},
    "natural_gas": {"label": "Natural Gas", "ncv": D("0.0480"), "co2": D("56100")},
}

# CH4 and N2O, kg/TJ.  Stationary: Vol.2 Tables 2.4-2.5 (commercial and
# residential).  Transport: Vol.2 Table 3.2.2 (road, uncontrolled petrol).
NON_CO2 = {
    "stationary_combustion": {
        "diesel": (D("10"), D("0.6")),
        "petrol": (D("10"), D("0.6")),
        "kerosene": (D("10"), D("0.6")),
        "lpg": (D("5"), D("0.1")),
        "firewood": (D("300"), D("4")),
        "charcoal": (D("200"), D("1")),
        "natural_gas": (D("5"), D("0.1")),
    },
    "transport_combustion": {
        "diesel": (D("3.9"), D("3.9")),
        "petrol": (D("33"), D("3.2")),
        "kerosene": (D("10"), D("0.6")),
        "lpg": (D("62"), D("0.2")),
        "firewood": (D("300"), D("4")),
        "charcoal": (D("200"), D("1")),
        "natural_gas": (D("92"), D("3")),
    },
}

IPCC_CODES = {"stationary_combustion": "1.A.4", "transport_combustion": "1.A.3.b"}


class Command(BaseCommand):
    help = "Seed Energy sector emission factors for KS-CCC"

    def handle(self, *args, **options):
        for sub_category, non_co2 in NON_CO2.items():
            for code, fuel in FUELS.items():
                ch4_tj, n2o_tj = non_co2[code]
                biogenic = fuel.get("biogenic", False)
                EmissionFactor.objects.update_or_create(
                    sector="energy",
                    sub_category=sub_category,
                    fuel_or_species=code,
                    unit="kg_per_metric_tonne",
                    tier=EmissionFactor.Tier.TIER_1,
                    defaults={
                        "co2_ef": fuel["ncv"] * fuel["co2"],
                        "ch4_ef": fuel["ncv"] * ch4_tj,
                        "n2o_ef": fuel["ncv"] * n2o_tj,
                        "ipcc_code": IPCC_CODES[sub_category],
                        "is_biogenic_co2": biogenic,
                        "ipcc_source": (
                            "IPCC 2006 Vol.2 Tables 1.2, 1.4, "
                            + ("2.4-2.5" if sub_category == "stationary_combustion" else "3.2.2")
                            + ("; biomass CO2 reported as memo item" if biogenic else "")
                        ),
                        "is_active": True,
                    },
                )

        self.stdout.write(
            self.style.SUCCESS("Energy emission factors seeded successfully.")
        )
