from decimal import Decimal, ROUND_HALF_UP

from core.geography import KADUNA_LGAS
from ghg.models import GHGInventoryEntry


PREVIEW_BATCH_ID = "KCCC_GHG_PREVIEW_2026_V1"
PREVIEW_SOURCE_LABEL = "KCCC Preview Inventory Dataset"
PREVIEW_YEARS = list(range(2020, 2026))

PREVIEW_SECTOR_TOTALS = {
    2020: {
        GHGInventoryEntry.Sector.ENERGY: Decimal("36000"),
        GHGInventoryEntry.Sector.AGRICULTURE: Decimal("23000"),
        GHGInventoryEntry.Sector.IPPU: Decimal("11000"),
        GHGInventoryEntry.Sector.WASTE: Decimal("8000"),
        GHGInventoryEntry.Sector.LULUCF: Decimal("10000"),
    },
    2021: {
        GHGInventoryEntry.Sector.ENERGY: Decimal("37500"),
        GHGInventoryEntry.Sector.AGRICULTURE: Decimal("23800"),
        GHGInventoryEntry.Sector.IPPU: Decimal("11500"),
        GHGInventoryEntry.Sector.WASTE: Decimal("8400"),
        GHGInventoryEntry.Sector.LULUCF: Decimal("10300"),
    },
    2022: {
        GHGInventoryEntry.Sector.ENERGY: Decimal("39000"),
        GHGInventoryEntry.Sector.AGRICULTURE: Decimal("24500"),
        GHGInventoryEntry.Sector.IPPU: Decimal("12000"),
        GHGInventoryEntry.Sector.WASTE: Decimal("8800"),
        GHGInventoryEntry.Sector.LULUCF: Decimal("10700"),
    },
    2023: {
        GHGInventoryEntry.Sector.ENERGY: Decimal("40500"),
        GHGInventoryEntry.Sector.AGRICULTURE: Decimal("25100"),
        GHGInventoryEntry.Sector.IPPU: Decimal("12500"),
        GHGInventoryEntry.Sector.WASTE: Decimal("9200"),
        GHGInventoryEntry.Sector.LULUCF: Decimal("11000"),
    },
    2024: {
        GHGInventoryEntry.Sector.ENERGY: Decimal("42000"),
        GHGInventoryEntry.Sector.AGRICULTURE: Decimal("25700"),
        GHGInventoryEntry.Sector.IPPU: Decimal("13000"),
        GHGInventoryEntry.Sector.WASTE: Decimal("9700"),
        GHGInventoryEntry.Sector.LULUCF: Decimal("11400"),
    },
    2025: {
        GHGInventoryEntry.Sector.ENERGY: Decimal("43500"),
        GHGInventoryEntry.Sector.AGRICULTURE: Decimal("26500"),
        GHGInventoryEntry.Sector.IPPU: Decimal("13500"),
        GHGInventoryEntry.Sector.WASTE: Decimal("10100"),
        GHGInventoryEntry.Sector.LULUCF: Decimal("11800"),
    },
}

PREVIEW_CATEGORIES = [
    {
        "sector": GHGInventoryEntry.Sector.ENERGY,
        "sub_category": "electricity_generation",
        "label": "Electricity Generation",
        "category_share": Decimal("0.30"),
        "gas_split": (Decimal("0.94"), Decimal("0.04"), Decimal("0.02")),
    },
    {
        "sector": GHGInventoryEntry.Sector.ENERGY,
        "sub_category": "road_transportation",
        "label": "Road Transportation",
        "category_share": Decimal("0.27"),
        "gas_split": (Decimal("0.93"), Decimal("0.045"), Decimal("0.025")),
    },
    {
        "sector": GHGInventoryEntry.Sector.ENERGY,
        "sub_category": "residential_fuel_use",
        "label": "Residential Fuel Use",
        "category_share": Decimal("0.18"),
        "gas_split": (Decimal("0.82"), Decimal("0.14"), Decimal("0.04")),
    },
    {
        "sector": GHGInventoryEntry.Sector.ENERGY,
        "sub_category": "commercial_institutional_fuel_use",
        "label": "Commercial and Institutional Fuel Use",
        "category_share": Decimal("0.10"),
        "gas_split": (Decimal("0.90"), Decimal("0.07"), Decimal("0.03")),
    },
    {
        "sector": GHGInventoryEntry.Sector.ENERGY,
        "sub_category": "industrial_fuel_combustion",
        "label": "Industrial Fuel Combustion",
        "category_share": Decimal("0.15"),
        "gas_split": (Decimal("0.92"), Decimal("0.05"), Decimal("0.03")),
    },
    {
        "sector": GHGInventoryEntry.Sector.AGRICULTURE,
        "sub_category": "enteric_fermentation",
        "label": "Enteric Fermentation",
        "category_share": Decimal("0.32"),
        "gas_split": (Decimal("0.03"), Decimal("0.93"), Decimal("0.04")),
    },
    {
        "sector": GHGInventoryEntry.Sector.AGRICULTURE,
        "sub_category": "manure_management",
        "label": "Manure Management",
        "category_share": Decimal("0.17"),
        "gas_split": (Decimal("0.04"), Decimal("0.78"), Decimal("0.18")),
    },
    {
        "sector": GHGInventoryEntry.Sector.AGRICULTURE,
        "sub_category": "agricultural_soils",
        "label": "Agricultural Soils",
        "category_share": Decimal("0.28"),
        "gas_split": (Decimal("0.04"), Decimal("0.08"), Decimal("0.88")),
    },
    {
        "sector": GHGInventoryEntry.Sector.AGRICULTURE,
        "sub_category": "rice_cultivation",
        "label": "Rice Cultivation",
        "category_share": Decimal("0.14"),
        "gas_split": (Decimal("0.03"), Decimal("0.94"), Decimal("0.03")),
    },
    {
        "sector": GHGInventoryEntry.Sector.AGRICULTURE,
        "sub_category": "crop_residue_burning",
        "label": "Crop-Residue Burning",
        "category_share": Decimal("0.09"),
        "gas_split": (Decimal("0.30"), Decimal("0.55"), Decimal("0.15")),
    },
    {
        "sector": GHGInventoryEntry.Sector.IPPU,
        "sub_category": "cement_production",
        "label": "Cement Production",
        "category_share": Decimal("0.45"),
        "gas_split": (Decimal("0.97"), Decimal("0.015"), Decimal("0.015")),
    },
    {
        "sector": GHGInventoryEntry.Sector.IPPU,
        "sub_category": "lime_production",
        "label": "Lime Production",
        "category_share": Decimal("0.20"),
        "gas_split": (Decimal("0.96"), Decimal("0.02"), Decimal("0.02")),
    },
    {
        "sector": GHGInventoryEntry.Sector.IPPU,
        "sub_category": "refrigeration_air_conditioning",
        "label": "Refrigeration and Air Conditioning",
        "category_share": Decimal("0.22"),
        "gas_split": (Decimal("0.16"), Decimal("0.12"), Decimal("0.72")),
    },
    {
        "sector": GHGInventoryEntry.Sector.IPPU,
        "sub_category": "other_industrial_processes",
        "label": "Other Industrial Processes",
        "category_share": Decimal("0.13"),
        "gas_split": (Decimal("0.88"), Decimal("0.06"), Decimal("0.06")),
    },
    {
        "sector": GHGInventoryEntry.Sector.LULUCF,
        "sub_category": "forest_land",
        "label": "Forest Land",
        "category_share": Decimal("0.22"),
        "gas_split": (Decimal("0.90"), Decimal("0.07"), Decimal("0.03")),
    },
    {
        "sector": GHGInventoryEntry.Sector.LULUCF,
        "sub_category": "cropland",
        "label": "Cropland",
        "category_share": Decimal("0.24"),
        "gas_split": (Decimal("0.76"), Decimal("0.13"), Decimal("0.11")),
    },
    {
        "sector": GHGInventoryEntry.Sector.LULUCF,
        "sub_category": "grassland",
        "label": "Grassland",
        "category_share": Decimal("0.15"),
        "gas_split": (Decimal("0.78"), Decimal("0.14"), Decimal("0.08")),
    },
    {
        "sector": GHGInventoryEntry.Sector.LULUCF,
        "sub_category": "settlements",
        "label": "Settlements",
        "category_share": Decimal("0.13"),
        "gas_split": (Decimal("0.82"), Decimal("0.10"), Decimal("0.08")),
    },
    {
        "sector": GHGInventoryEntry.Sector.LULUCF,
        "sub_category": "land_conversion",
        "label": "Land Conversion",
        "category_share": Decimal("0.26"),
        "gas_split": (Decimal("0.87"), Decimal("0.09"), Decimal("0.04")),
    },
    {
        "sector": GHGInventoryEntry.Sector.WASTE,
        "sub_category": "solid_waste_disposal",
        "label": "Solid-Waste Disposal",
        "category_share": Decimal("0.42"),
        "gas_split": (Decimal("0.06"), Decimal("0.90"), Decimal("0.04")),
    },
    {
        "sector": GHGInventoryEntry.Sector.WASTE,
        "sub_category": "wastewater_treatment",
        "label": "Wastewater Treatment",
        "category_share": Decimal("0.28"),
        "gas_split": (Decimal("0.04"), Decimal("0.74"), Decimal("0.22")),
    },
    {
        "sector": GHGInventoryEntry.Sector.WASTE,
        "sub_category": "open_burning_of_waste",
        "label": "Open Burning of Waste",
        "category_share": Decimal("0.18"),
        "gas_split": (Decimal("0.32"), Decimal("0.52"), Decimal("0.16")),
    },
    {
        "sector": GHGInventoryEntry.Sector.WASTE,
        "sub_category": "biological_treatment_of_waste",
        "label": "Biological Treatment of Waste",
        "category_share": Decimal("0.12"),
        "gas_split": (Decimal("0.08"), Decimal("0.76"), Decimal("0.16")),
    },
]


def quantize_decimal(value, places="0.001"):
    return Decimal(value).quantize(Decimal(places), rounding=ROUND_HALF_UP)


def categories_for_sector(sector):
    return [
        category
        for category in PREVIEW_CATEGORIES
        if category["sector"] == sector
    ]


def distribute_amount(total, weights):
    allocated = []
    remaining = total
    total_weight = sum(weights)

    for weight in weights[:-1]:
        value = quantize_decimal(total * weight / total_weight)
        allocated.append(value)
        remaining -= value

    allocated.append(quantize_decimal(remaining))
    return allocated


def preview_sector_total(sector, year):
    return PREVIEW_SECTOR_TOTALS[year][sector]


def preview_category_total(category, year):
    sector_categories = categories_for_sector(category["sector"])
    weights = [item["category_share"] for item in sector_categories]
    totals = distribute_amount(preview_sector_total(category["sector"], year), weights)
    category_index = sector_categories.index(category)
    return totals[category_index]


def lga_weight(lga_index, year):
    year_index = PREVIEW_YEARS.index(year)
    base = Decimal("1") + (Decimal(lga_index % 6) - Decimal("2.5")) * Decimal("0.018")
    tier = Decimal(lga_index // 6) * Decimal("0.015")
    annual_shift = Decimal(((year_index + lga_index) % 5) - 2) * Decimal("0.006")
    return base + tier + annual_shift


def preview_lga_category_totals(category, year):
    weights = [
        lga_weight(lga_index, year)
        for lga_index, _lga_name in enumerate(KADUNA_LGAS)
    ]
    return distribute_amount(preview_category_total(category, year), weights)


def preview_total_for_lga(category, year, lga_index):
    return preview_lga_category_totals(category, year)[lga_index]


def preview_factor_values(category):
    co2_share, ch4_share, n2o_share = category["gas_split"]

    return {
        "co2_ef": quantize_decimal(co2_share * Decimal("1000"), "0.000001"),
        "ch4_ef": quantize_decimal((ch4_share * Decimal("1000")) / Decimal("28"), "0.000001"),
        "n2o_ef": quantize_decimal((n2o_share * Decimal("1000")) / Decimal("265"), "0.000001"),
    }


def iter_lga_preview_specs():
    for year in PREVIEW_YEARS:
        for lga_index, lga_name in enumerate(KADUNA_LGAS):
            for category in PREVIEW_CATEGORIES:
                yield {
                    "year": year,
                    "lga_name": lga_name,
                    "sector": category["sector"],
                    "sub_category": category["sub_category"],
                    "category_label": category["label"],
                    "quantity": preview_total_for_lga(category, year, lga_index),
                    "is_statewide": False,
                }


def iter_statewide_preview_specs():
    for year in PREVIEW_YEARS:
        for category in PREVIEW_CATEGORIES:
            quantity = sum(
                preview_total_for_lga(category, year, lga_index)
                for lga_index, _lga_name in enumerate(KADUNA_LGAS)
            )
            yield {
                "year": year,
                "lga_name": "",
                "sector": category["sector"],
                "sub_category": category["sub_category"],
                "category_label": category["label"],
                "quantity": quantize_decimal(quantity),
                "is_statewide": True,
            }


def iter_preview_specs():
    yield from iter_lga_preview_specs()
    yield from iter_statewide_preview_specs()


def preview_record_count():
    return len(PREVIEW_YEARS) * len(PREVIEW_CATEGORIES) * (len(KADUNA_LGAS) + 1)
