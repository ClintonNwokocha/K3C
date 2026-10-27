"""
IPCC 2006 Tier 1 defaults used by the open-data inventory (method tier1_open_v1).

Each constant cites its 2006 IPCC Guidelines table.  Values in VERIFY were
written from the guidelines without a live lookup, or are documented
assumptions; check them against the cited table before official reporting.
The calculators publish this list with every run.
"""

from decimal import Decimal as D

GUIDELINE = "IPCC 2006"

# AR5 100-year GWPs (UNFCCC Paris reporting).  Same values as
# GHGInventoryEntry.calculate_emissions.
GWP_CH4 = D("28")
GWP_N2O = D("265")

N2O_N_TO_N2O = D("44") / D("28")
C_TO_CO2 = D("44") / D("12")

# ---------------------------------------------------------------------------
# Climate zone (Vol.4 Ch.3 Annex 3A.5).  All Kaduna LGAs are tropical
# (mean temperature > 18 C); < 1% of land is above 1,000 m, so montane is
# ignored.
# ---------------------------------------------------------------------------
WET_RAIN_MM = D("1000")

# ---------------------------------------------------------------------------
# 3.A.1 Enteric fermentation, kg CH4/head/yr
# Vol.4 Table 10.10 (developing countries) and Table 10.11 (Africa cattle).
# ---------------------------------------------------------------------------
ENTERIC_CH4 = {
    "dairy_cattle": D("40"),
    "other_cattle": D("31"),
    "sheep": D("5"),
    "goats": D("5"),
    "camels": D("46"),
    "horses": D("18"),
    "asses": D("10"),
    "swine": D("1"),
}

# ---------------------------------------------------------------------------
# 3.A.2 Manure management CH4, kg CH4/head/yr, by annual mean temperature
# band (temperate 15-25 C, warm > 25 C).  Vol.4 Table 10.14 (Africa cattle,
# swine) and Table 10.15 (developing countries, other species).
# ---------------------------------------------------------------------------
MANURE_CH4 = {
    "dairy_cattle": {"temperate": D("1"), "warm": D("1")},
    "other_cattle": {"temperate": D("1"), "warm": D("1")},
    "swine": {"temperate": D("1"), "warm": D("2")},
    "sheep": {"temperate": D("0.15"), "warm": D("0.20")},
    "goats": {"temperate": D("0.17"), "warm": D("0.22")},
    "camels": {"temperate": D("1.92"), "warm": D("2.56")},
    "horses": {"temperate": D("1.64"), "warm": D("2.19")},
    "asses": {"temperate": D("0.90"), "warm": D("1.20")},
    "chickens": {"temperate": D("0.02"), "warm": D("0.02")},
}
WARM_TEMP_C = D("25")

# ---------------------------------------------------------------------------
# N excretion: Nrate (kg N/1000 kg animal mass/day), Vol.4 Table 10.19 Africa;
# typical animal mass TAM (kg), Vol.4 Annex 10A.
# Ruminants, camels and equines graze (pasture/range/paddock); swine and
# poultry manure is stored as solid.
# ---------------------------------------------------------------------------
N_RATE = {
    "dairy_cattle": D("0.60"),
    "other_cattle": D("0.63"),
    "sheep": D("1.17"),
    "goats": D("1.37"),
    "camels": D("0.46"),
    "horses": D("0.46"),
    "asses": D("0.46"),
    "swine": D("1.46"),
    "chickens": D("0.82"),
}
TAM_KG = {
    "dairy_cattle": D("275"),
    "other_cattle": D("173"),
    "sheep": D("28"),
    "goats": D("30"),
    "camels": D("217"),
    "horses": D("238"),
    "asses": D("130"),
    "swine": D("28"),
    "chickens": D("0.9"),
}
GRAZING_SPECIES = {"dairy_cattle", "other_cattle", "sheep", "goats", "camels", "horses", "asses"}

# Vol.4 Table 11.1 and Table 10.21
EF3_PRP_CPP = D("0.02")      # cattle, poultry, pigs on pasture, kg N2O-N/kg N
EF3_PRP_SO = D("0.01")       # sheep and other animals on pasture
EF3_SOLID = D("0.005")       # solid storage
PRP_CPP_SPECIES = {"dairy_cattle", "other_cattle"}

# Vol.4 Table 11.1 and Table 11.3
EF1_SYNTHETIC = D("0.01")
FRAC_GASF = D("0.10")
FRAC_GASM = D("0.20")
FRAC_LEACH = D("0.30")       # applied only where the LGA is in the wet zone
EF4_VOLATILISATION = D("0.01")
EF5_LEACHING = D("0.0075")

# ---------------------------------------------------------------------------
# 3.C.7 Rice, Vol.4 Ch.5.5: EFc 1.30 kg CH4/ha/day (Table 5.11), rainfed
# regular water regime SFw 0.28 (Table 5.12), no pre-season flooding, no
# organic amendment, 120-day season.
# ---------------------------------------------------------------------------
RICE_EFC = D("1.30")
RICE_SFW_RAINFED = D("0.28")
RICE_SEASON_DAYS = D("120")

# ---------------------------------------------------------------------------
# 3.C.1 Biomass burning, Vol.4 Ch.2: g/kg dry matter burned (Table 2.5) and
# dry matter consumed per hectare burned.  CO2 is not reported for savanna,
# grassland and cropland fires (regrowth).
# ---------------------------------------------------------------------------
FIRE_EF_G_PER_KG = {
    "savanna": {"ch4": D("2.3"), "n2o": D("0.21")},
    "crop_residue": {"ch4": D("2.7"), "n2o": D("0.07")},
}
FIRE_FUEL_CONSUMED_T_PER_HA = D("4.0")
FIRE_CLASS_MAP = {
    "trees": "savanna",          # Kaduna woodland is savanna woodland
    "shrub_scrub": "savanna",
    "grass": "savanna",
    "crops": "crop_residue",
}

# ---------------------------------------------------------------------------
# 1.A.4.b Residential biomass cooking, Vol.2 Table 1.2 (NCV) and Table 2.5
# (residential EFs, kg/TJ).  CO2 from biomass is a memo item.
# FAOSTAT "Wood fuel" includes wood carbonised into charcoal, so that
# feedstock is removed before burning wood directly.
# ---------------------------------------------------------------------------
WOOD_DENSITY_T_PER_M3 = D("0.65")
CHARCOAL_WOOD_M3_PER_T = D("6.0")
WOOD_NCV_TJ_PER_T = D("0.0156")
CHARCOAL_NCV_TJ_PER_T = D("0.0295")
WOOD_EF_KG_PER_TJ = {"co2": D("112000"), "ch4": D("300"), "n2o": D("4")}
CHARCOAL_EF_KG_PER_TJ = {"co2": D("112000"), "ch4": D("200"), "n2o": D("1")}

# ---------------------------------------------------------------------------
# 4.A Solid waste disposal, Vol.5 Ch.2-3 (first order decay, bulk waste).
# Only urban (GHSL dense-urban) residents' waste is assumed to reach
# disposal sites; rural waste is burned or dispersed.
# ---------------------------------------------------------------------------
MSW_T_PER_CAP_YR = D("0.29")     # Table 2.1, Africa
MSW_FRACTION_TO_SWDS = D("0.69") # Table 2.1, Africa
DOC_BULK = D("0.12")             # Table 2.3 West Africa composition x Table 2.4 DOC
DOCF = D("0.5")
SWDS_MCF = D("0.6")              # Table 3.1, uncategorised sites
CH4_FRACTION_F = D("0.5")
SWDS_K = {"wet": D("0.17"), "dry": D("0.065")}  # Table 3.3, tropical bulk waste
SWDS_FIRST_YEAR = 1975

# ---------------------------------------------------------------------------
# 4.C.2 Open burning of waste, Vol.5 Ch.5: fraction burned 0.6; CH4 6,500 g/t
# wet waste; N2O 150 g/t dry waste (dry matter 0.6); fossil CO2 from the
# plastic and textile share (OF 0.58).
# ---------------------------------------------------------------------------
OPEN_BURN_FRACTION = D("0.6")
OPEN_BURN_CH4_KG_PER_T = D("6.5")
OPEN_BURN_N2O_KG_PER_T = D("0.09")
OPEN_BURN_CO2_KG_PER_T = D("49")

# ---------------------------------------------------------------------------
# 4.D.1 Domestic wastewater, Vol.5 Ch.6: BOD 37 g/person/day (Table 6.4,
# Africa), Bo 0.6, uncollected (I = 1.0).  Sanitation shares are an
# assumption until DHS 2018 Kaduna tables are loaded.
# ---------------------------------------------------------------------------
BOD_KG_PER_CAP_YR = D("37") * D("365") / D("1000")
WASTEWATER_BO = D("0.6")
SANITATION_SHARES = {
    "urban": {"septic": D("0.35"), "latrine": D("0.55"), "none": D("0.10")},
    "rural": {"septic": D("0.05"), "latrine": D("0.70"), "none": D("0.25")},
}
SANITATION_MCF = {
    "septic": {"wet": D("0.5"), "dry": D("0.5")},
    "latrine": {"wet": D("0.5"), "dry": D("0.1")},
    "none": {"wet": D("0"), "dry": D("0")},
}
PROTEIN_KG_PER_CAP_YR = D("21")
F_NPR = D("0.16")
F_NON_CON = D("1.1")
EF_EFFLUENT = D("0.005")

# ---------------------------------------------------------------------------
# 3.B Land-use change (provisional; never published), Vol.4 Ch.2-5.
# Biomass from GEDI L4B by land class; carbon fraction 0.47 (Table 4.3);
# tree root:shoot 0.56 below 20 t/ha AGB (Table 4.4); soil reference stock
# for low-activity-clay soils (Table 2.3) and the long-term cultivation
# factor (Table 5.5) over a 20-year transition.
# ---------------------------------------------------------------------------
CARBON_FRACTION = D("0.47")
ROOT_SHOOT_TREES = D("0.56")
SOC_REF_T_C_PER_HA = {"wet": D("47"), "dry": D("35")}
F_LU_CROPLAND = {"wet": D("0.48"), "dry": D("0.58")}
TRANSITION_YEARS = D("20")
IPCC_LAND = {
    "trees": "forest",
    "grass": "grassland",
    "shrub_scrub": "grassland",
    "crops": "cropland",
    "built": "settlements",
    "water": "wetlands",
    "flooded_vegetation": "wetlands",
    "bare": "other",
    "snow_ice": "other",
}
VEGETATED_CLASSES = {"trees", "grass", "shrub_scrub", "crops", "flooded_vegetation"}

VERIFY = [
    "MANURE_CH4 swine and sheep values (Vol.4 Tables 10.14-10.15)",
    "N_RATE and TAM_KG (Vol.4 Table 10.19, Annex 10A)",
    "FIRE_FUEL_CONSUMED_T_PER_HA = 4.0 (methodology parameter; Vol.4 Table 2.4 gives class values)",
    "WOOD_DENSITY_T_PER_M3 and CHARCOAL_WOOD_M3_PER_T (FAO conversion factors)",
    "DOC_BULK from West Africa composition (Vol.5 Tables 2.3-2.4)",
    "OPEN_BURN_N2O_KG_PER_T and OPEN_BURN_CO2_KG_PER_T (derived, Vol.5 Ch.5)",
    "SANITATION_SHARES (assumption until DHS 2018 Kaduna tables are loaded)",
    "PROTEIN_KG_PER_CAP_YR (FAOSTAT food balance, Nigeria)",
]
