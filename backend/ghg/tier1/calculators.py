"""
IPCC 2006 Tier 1 calculators.

Every calculator returns Lines: an activity quantity and a per-unit emission
factor for CO2, CH4 and N2O (kg per unit).  The engine stores each Line as an
EmissionFactor plus a GHGInventoryEntry, so GHGInventoryEntry.calculate_emissions
does the arithmetic and the review queue, dashboard and portal work unchanged.

Inputs are plain dicts so the calculators can be tested without a database:
    activity[(lgacode, year, activity_key)] -> Decimal
    zones[lgacode] -> {"wet": bool, "temp_c": Decimal}
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Dict, Iterable, List, Tuple

from . import factors as F

ZERO = Decimal("0")


@dataclass
class Line:
    lgacode: str
    year: int
    sector: str
    sub_category: str
    ipcc_code: str
    source_key: str
    quantity: Decimal
    unit: str
    co2: Decimal = ZERO
    ch4: Decimal = ZERO
    n2o: Decimal = ZERO
    biogenic_co2: bool = False
    confidence: str = "low"
    note: str = ""
    activity_keys: Tuple[str, ...] = field(default_factory=tuple)
    provisional: bool = False

    @property
    def co2e_tonnes(self) -> Decimal:
        co2 = ZERO if self.biogenic_co2 else self.co2
        kg = self.quantity * (co2 + self.ch4 * F.GWP_CH4 + self.n2o * F.GWP_N2O)
        return kg / Decimal("1000")


Activity = Dict[Tuple[str, int, str], Decimal]
Zones = Dict[str, dict]


def _get(activity: Activity, code: str, year: int, key: str) -> Decimal:
    return activity.get((code, year, key), ZERO)


def _zone(zones: Zones, code: str) -> str:
    return "wet" if zones[code]["wet"] else "dry"


# ---------------------------------------------------------------------------
# Livestock: 3.A.1, 3.A.2, 3.C.4 / 3.C.5 / 3.C.6 (manure nitrogen)
# ---------------------------------------------------------------------------

LIVESTOCK = ("dairy_cattle", "other_cattle", "sheep", "goats", "swine", "camels", "horses", "asses", "chickens")


def n_excretion_kg_per_head(species: str) -> Decimal:
    """Vol.4 Eq. 10.30: Nrate x TAM / 1000 x 365."""
    return F.N_RATE[species] * F.TAM_KG[species] / Decimal("1000") * Decimal("365")


def livestock(activity: Activity, zones: Zones, codes: Iterable[str], years: Iterable[int]) -> List[Line]:
    lines = []
    for code in codes:
        zone = _zone(zones, code)
        band = "warm" if zones[code]["temp_c"] > F.WARM_TEMP_C else "temperate"
        leach = F.FRAC_LEACH if zone == "wet" else ZERO
        for year in years:
            for sp in LIVESTOCK:
                key = f"livestock.head.{sp}"
                heads = _get(activity, code, year, key)
                if not heads:
                    continue
                common = dict(lgacode=code, year=year, sector="agriculture", quantity=heads,
                              unit="head", activity_keys=(key,), confidence="low")
                if sp in F.ENTERIC_CH4:
                    lines.append(Line(sub_category="enteric_fermentation", ipcc_code="3.A.1",
                                      source_key=sp, ch4=F.ENTERIC_CH4[sp],
                                      note="Vol.4 Tables 10.10-10.11", **common))
                lines.append(Line(sub_category="manure_management", ipcc_code="3.A.2",
                                  source_key=f"{sp}__{band}", ch4=F.MANURE_CH4[sp][band],
                                  note=f"Vol.4 Tables 10.14-10.15 ({band})", **common))

                nex = n_excretion_kg_per_head(sp)
                indirect = nex * (F.FRAC_GASM * F.EF4_VOLATILISATION + leach * F.EF5_LEACHING) * F.N2O_N_TO_N2O
                if sp in F.GRAZING_SPECIES:
                    ef3 = F.EF3_PRP_CPP if sp in F.PRP_CPP_SPECIES else F.EF3_PRP_SO
                    lines.append(Line(sub_category="agricultural_soils", ipcc_code="3.C.4",
                                      source_key=f"{sp}_dung_urine_on_pasture",
                                      n2o=nex * ef3 * F.N2O_N_TO_N2O,
                                      note="Vol.4 Eq. 11.1, EF3PRP Table 11.1", **common))
                    lines.append(Line(sub_category="agricultural_soils", ipcc_code="3.C.5",
                                      source_key=f"{sp}_dung_urine_indirect__{zone}", n2o=indirect,
                                      note="Vol.4 Eqs. 11.9-11.10, Table 11.3", **common))
                else:
                    lines.append(Line(sub_category="manure_management", ipcc_code="3.A.2",
                                      source_key=f"{sp}_manure_n2o_solid_storage",
                                      n2o=nex * F.EF3_SOLID * F.N2O_N_TO_N2O,
                                      note="Vol.4 Eq. 10.25, EF3 solid storage Table 10.21", **common))
                    lines.append(Line(sub_category="agricultural_soils", ipcc_code="3.C.6",
                                      source_key=f"{sp}_manure_indirect__{zone}", n2o=indirect,
                                      note="Vol.4 Eqs. 10.26-10.29", **common))
    return lines


# ---------------------------------------------------------------------------
# Synthetic fertiliser 3.C.4 / 3.C.5, rice 3.C.7
# ---------------------------------------------------------------------------

def soils_and_rice(activity: Activity, zones: Zones, codes: Iterable[str], years: Iterable[int]) -> List[Line]:
    lines = []
    rice_ef = F.RICE_EFC * F.RICE_SFW_RAINFED * F.RICE_SEASON_DAYS
    for code in codes:
        zone = _zone(zones, code)
        leach = F.FRAC_LEACH if zone == "wet" else ZERO
        for year in years:
            n_kg = _get(activity, code, year, "fertiliser.synthetic_n_kg")
            if n_kg:
                common = dict(lgacode=code, year=year, sector="agriculture", quantity=n_kg,
                              unit="kg_n", activity_keys=("fertiliser.synthetic_n_kg",), confidence="low")
                lines.append(Line(sub_category="agricultural_soils", ipcc_code="3.C.4",
                                  source_key="synthetic_n_direct",
                                  n2o=F.EF1_SYNTHETIC * F.N2O_N_TO_N2O,
                                  note="Vol.4 Eq. 11.1, EF1 Table 11.1", **common))
                lines.append(Line(sub_category="agricultural_soils", ipcc_code="3.C.5",
                                  source_key=f"synthetic_n_indirect__{zone}",
                                  n2o=(F.FRAC_GASF * F.EF4_VOLATILISATION + leach * F.EF5_LEACHING) * F.N2O_N_TO_N2O,
                                  note="Vol.4 Eqs. 11.9-11.10, Table 11.3", **common))
            rice_ha = _get(activity, code, year, "crops.rice_area_ha")
            if rice_ha:
                lines.append(Line(lgacode=code, year=year, sector="agriculture",
                                  sub_category="rice_cultivation", ipcc_code="3.C.7",
                                  source_key="rice_rainfed_regular", quantity=rice_ha, unit="ha",
                                  ch4=rice_ef, activity_keys=("crops.rice_area_ha",), confidence="low",
                                  note="Vol.4 Eq. 5.1-5.2, EFc 1.30, SFw 0.28, 120 days"))
    return lines


# ---------------------------------------------------------------------------
# Biomass burning 3.C.1
# ---------------------------------------------------------------------------

def fires(activity: Activity, zones: Zones, codes: Iterable[str], years: Iterable[int]) -> List[Line]:
    lines = []
    for code in codes:
        for year in years:
            for dw_class, fire_type in F.FIRE_CLASS_MAP.items():
                key = f"fire.burned_ha.{dw_class}"
                ha = _get(activity, code, year, key)
                if not ha:
                    continue
                ef = F.FIRE_EF_G_PER_KG[fire_type]
                # t dm/ha x g/kg = kg/ha
                lines.append(Line(lgacode=code, year=year, sector="agriculture",
                                  sub_category="biomass_burning", ipcc_code="3.C.1",
                                  source_key=f"{dw_class}_burned", quantity=ha, unit="ha_burned",
                                  ch4=F.FIRE_FUEL_CONSUMED_T_PER_HA * ef["ch4"],
                                  n2o=F.FIRE_FUEL_CONSUMED_T_PER_HA * ef["n2o"],
                                  activity_keys=(key,), confidence="medium",
                                  note=f"Vol.4 Eq. 2.27, Table 2.5 ({fire_type}); MODIS MCD64A1"))
    return lines


# ---------------------------------------------------------------------------
# Residential biomass cooking 1.A.4.b
# ---------------------------------------------------------------------------

def cooking(activity: Activity, zones: Zones, codes: Iterable[str], years: Iterable[int]) -> List[Line]:
    lines = []
    fuels = (
        ("energy.woodfuel_t", "firewood", F.WOOD_NCV_TJ_PER_T, F.WOOD_EF_KG_PER_TJ),
        ("energy.charcoal_t", "charcoal", F.CHARCOAL_NCV_TJ_PER_T, F.CHARCOAL_EF_KG_PER_TJ),
    )
    for code in codes:
        for year in years:
            for key, fuel, ncv, ef in fuels:
                tonnes = _get(activity, code, year, key)
                if not tonnes:
                    continue
                lines.append(Line(lgacode=code, year=year, sector="energy",
                                  sub_category="residential_fuel_use", ipcc_code="1.A.4.b",
                                  source_key=fuel, quantity=tonnes, unit="metric_tonnes",
                                  co2=ncv * ef["co2"], ch4=ncv * ef["ch4"], n2o=ncv * ef["n2o"],
                                  biogenic_co2=True, activity_keys=(key,), confidence="low",
                                  note="Vol.2 Table 2.5 residential; CO2 is a memo item"))
    return lines


# ---------------------------------------------------------------------------
# Fossil oil products: road transport 1.A.3.b, residential kerosene and LPG
# 1.A.4.b, manufacturing 1.A.2
# ---------------------------------------------------------------------------

FOSSIL_FLOWS = (
    ("energy.road_gasoline_tj", "1.A.3.b", "road_transportation", "motor_gasoline",
     "Vol.2 Tables 3.2.1-3.2.2; IEA transport oil x OSM road length, diesel share by road class"),
    ("energy.road_diesel_tj", "1.A.3.b", "road_transportation", "diesel",
     "Vol.2 Tables 3.2.1-3.2.2; IEA transport oil x OSM road length, diesel share by road class"),
    ("energy.rail_diesel_tj", "1.A.3.c", "railways", "rail_diesel",
     "Vol.2 Table 3.4.1; OSM track km x trains per day x litres per train-km"),
    ("energy.residential_lpg_tj", "1.A.4.b", "residential_fuel_use", "lpg",
     "Vol.2 Table 2.5; IEA residential oil x GHSL population, LPG share by HDI and RWI"),
    ("energy.residential_kerosene_tj", "1.A.4.b", "residential_fuel_use", "kerosene",
     "Vol.2 Table 2.5; IEA residential oil x GHSL population, LPG share by HDI and RWI"),
    ("energy.industry_oil_tj", "1.A.2", "industrial_fuel_combustion", "gas_diesel_oil",
     "Vol.2 Table 2.3; IEA industry oil x population, placed by OSM industrial area"),
)


def fossil_fuels(activity: Activity, zones: Zones, codes: Iterable[str], years: Iterable[int]) -> List[Line]:
    lines = []
    for code in codes:
        for year in years:
            for key, ipcc_code, sub_category, fuel, note in FOSSIL_FLOWS:
                tj = _get(activity, code, year, key)
                if not tj:
                    continue
                ef = F.FUEL_EF_KG_PER_TJ[fuel]
                lines.append(Line(lgacode=code, year=year, sector="energy",
                                  sub_category=sub_category, ipcc_code=ipcc_code,
                                  source_key=fuel, quantity=tj, unit="TJ",
                                  co2=ef["co2"], ch4=ef["ch4"], n2o=ef["n2o"],
                                  activity_keys=(key,), confidence="low", note=note))
    return lines


# ---------------------------------------------------------------------------
# Waste: 4.A (first order decay), 4.C.2, 4.D.1
# ---------------------------------------------------------------------------

def fod_methane_t(deposits_t: Dict[int, Decimal], k: Decimal, years: Iterable[int]) -> Dict[int, Decimal]:
    """
    Vol.5 Eqs. 3.4-3.6 with the default 6-month delay (M = 13): waste
    deposited in year T starts decaying in T+1.  Returns CH4 generated (t)
    for each requested year.
    """
    years = list(years)
    if not deposits_t:
        return {y: ZERO for y in years}
    decay = Decimal(str(math.exp(-float(k))))
    stock = ZERO
    out = {}
    for year in range(min(deposits_t), max(years) + 1):
        decomposed = stock * (Decimal("1") - decay)
        stock = stock * decay + deposits_t.get(year, ZERO) * F.DOC_BULK * F.DOCF * F.SWDS_MCF
        if year in years:
            out[year] = decomposed * F.CH4_FRACTION_F * Decimal("16") / Decimal("12")
    return out


def waste(activity: Activity, zones: Zones, codes: Iterable[str], years: Iterable[int]) -> List[Line]:
    years = list(years)
    lines = []
    for code in codes:
        zone = _zone(zones, code)

        deposits = {}
        for year in range(F.SWDS_FIRST_YEAR, max(years) + 1):
            urban = _get(activity, code, year, "population.urban")
            if urban:
                deposits[year] = urban * F.MSW_T_PER_CAP_YR * F.MSW_FRACTION_TO_SWDS
        ch4_t = fod_methane_t(deposits, F.SWDS_K[zone], years)

        for year in years:
            if ch4_t.get(year):
                lines.append(Line(lgacode=code, year=year, sector="waste",
                                  sub_category="solid_waste_disposal", ipcc_code="4.A",
                                  source_key=f"msw_first_order_decay__{zone}",
                                  quantity=ch4_t[year], unit="t_ch4_generated", ch4=Decimal("1000"),
                                  activity_keys=("population.urban",), confidence="low",
                                  note="Vol.5 Eq. 3.1 FOD, bulk waste, MCF 0.6, OX 0"))

            total = _get(activity, code, year, "population.total")
            urban = _get(activity, code, year, "population.urban")
            if not total:
                continue
            rural = max(total - urban, ZERO)

            burning_pop = rural + urban * (Decimal("1") - F.MSW_FRACTION_TO_SWDS)
            burned_t = burning_pop * F.MSW_T_PER_CAP_YR * F.OPEN_BURN_FRACTION
            lines.append(Line(lgacode=code, year=year, sector="waste",
                              sub_category="open_burning_of_waste", ipcc_code="4.C.2",
                              source_key="msw_open_burning", quantity=burned_t, unit="t_waste_burned",
                              co2=F.OPEN_BURN_CO2_KG_PER_T, ch4=F.OPEN_BURN_CH4_KG_PER_T,
                              n2o=F.OPEN_BURN_N2O_KG_PER_T,
                              activity_keys=("population.total", "population.urban"), confidence="low",
                              note="Vol.5 Eq. 5.7, Bfrac 0.6"))

            n2o_per_person = (F.PROTEIN_KG_PER_CAP_YR * F.F_NPR * F.F_NON_CON
                              * F.EF_EFFLUENT * F.N2O_N_TO_N2O)
            for setting, persons in (("urban", urban), ("rural", rural)):
                if not persons:
                    continue
                mcf = sum(
                    share * F.SANITATION_MCF[system][zone]
                    for system, share in F.SANITATION_SHARES[setting].items()
                )
                lines.append(Line(lgacode=code, year=year, sector="waste",
                                  sub_category="wastewater_treatment", ipcc_code="4.D.1",
                                  source_key=f"domestic_wastewater_{setting}__{zone}",
                                  quantity=persons, unit="persons",
                                  ch4=F.BOD_KG_PER_CAP_YR * F.WASTEWATER_BO * mcf, n2o=n2o_per_person,
                                  activity_keys=(f"population.{'urban' if setting == 'urban' else 'total'}",),
                                  confidence="low",
                                  note="Vol.5 Eqs. 6.1-6.3 and 6.7-6.8"))
    return lines


# ---------------------------------------------------------------------------
# Land-use change 3.B (provisional, never published)
# ---------------------------------------------------------------------------

def class_carbon_t_per_ha(agb: Dict[str, Decimal], dw_class: str) -> Decimal:
    if dw_class not in F.VEGETATED_CLASSES:
        return ZERO
    biomass = agb.get(dw_class, ZERO)
    if dw_class == "trees":
        biomass *= Decimal("1") + F.ROOT_SHOOT_TREES
    return biomass * F.CARBON_FRACTION


def land_use_change(activity: Activity, zones: Zones, codes: Iterable[str], years: Iterable[int],
                    agb_by_class: Dict[str, Decimal]) -> List[Line]:
    """
    Biomass: losses are emitted in the year of conversion; gains accrue over
    20 years.  Soil: conversion to or from cropland changes soil carbon by
    SOCref x (1 - F_LU) spread over 20 years.  Both use the area converted in
    every year from the first inventory year up to the reported year.
    """
    years = sorted(years)
    lines = []
    prefix = "lulc.transition_ha."
    keys = sorted({k for (_, _, k) in activity if k.startswith(prefix)})
    for code in codes:
        zone = _zone(zones, code)
        soc_change = F.SOC_REF_T_C_PER_HA[zone] * (Decimal("1") - F.F_LU_CROPLAND[zone]) / F.TRANSITION_YEARS
        for key in keys:
            pair = key[len(prefix):]
            src, dst = pair.split(">")
            if F.IPCC_LAND.get(src) == F.IPCC_LAND.get(dst):
                continue
            delta_c = class_carbon_t_per_ha(agb_by_class, src) - class_carbon_t_per_ha(agb_by_class, dst)
            soil_sign = Decimal("1") if dst == "crops" else (Decimal("-1") if src == "crops" else ZERO)
            cumulative = ZERO
            for year in years:
                ha = _get(activity, code, year, key)
                cumulative += ha
                common = dict(lgacode=code, year=year, sector="lulucf", sub_category="land_conversion",
                              ipcc_code="3.B", activity_keys=(key,), confidence="low", provisional=True)
                if ha and delta_c > 0:
                    lines.append(Line(source_key=f"{pair}_biomass_loss", quantity=ha, unit="ha_converted",
                                      co2=delta_c * F.C_TO_CO2 * Decimal("1000"),
                                      note="Vol.4 Eq. 2.16, GEDI L4B biomass", **common))
                if cumulative and delta_c < 0:
                    lines.append(Line(source_key=f"{pair}_biomass_gain", quantity=cumulative,
                                      unit="ha_converted_cumulative",
                                      co2=delta_c / F.TRANSITION_YEARS * F.C_TO_CO2 * Decimal("1000"),
                                      note="Vol.4 Eq. 2.15, 20-year accrual", **common))
                if cumulative and soil_sign:
                    lines.append(Line(source_key=f"{pair}_soil__{zone}", quantity=cumulative,
                                      unit="ha_converted_cumulative",
                                      co2=soil_sign * soc_change * F.C_TO_CO2 * Decimal("1000"),
                                      note="Vol.4 Eq. 2.25, Tables 2.3 and 5.5", **common))
    return lines
