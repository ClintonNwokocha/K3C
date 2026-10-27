"""
Runs the Tier 1 calculators over stored ActivityData and writes the results as
EmissionFactor + GHGInventoryEntry rows (method_version = METHOD_VERSION).

Re-running replaces this method's entries for the requested years.  LULUCF
(3.B) rows are always saved as drafts, so they never reach public totals.
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Iterable, List

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from core.models import EmissionFactor, LGARegistry
from ghg.models import (
    ActivityData,
    CategoryStatus,
    GHGInventoryEntry,
    GHGStateTotal,
    LGAClimateProfile,
)

from . import METHOD_VERSION, calculators as calc, factors as F

EF_PLACES = Decimal("0.000001")

# (ipcc_code, name, sector, status, confidence, reason)
CATEGORY_REGISTER = [
    ("1.A.1", "Energy industries (power station, refinery)", "energy", "NE", "", "No open data on plant fuel use; enter manually when available."),
    ("1.A.2", "Manufacturing and construction fuel use", "energy", "estimated", "low", "IEA Nigeria industry oil x Kaduna population share, placed in LGAs by OpenStreetMap industrial land (2019). Gas and coal not estimated: no pipeline gas reached Kaduna in 2018-2025 and no coal-using plant was identified."),
    ("1.A.3.a", "Domestic aviation", "energy", "IE", "", "Included in 1.A.3.b: the IEA transport total is not split by mode."),
    ("1.A.3.b", "Road transport", "energy", "estimated", "low", "IEA Nigeria transport oil x OpenStreetMap traffic-weighted road length (2019). Assumed 85% gasoline, 15% diesel."),
    ("1.A.3.c", "Railways", "energy", "NE", "", "No open diesel data for the Abuja-Kaduna-Kano line."),
    ("1.A.4.a", "Commercial and institutional, including generators", "energy", "NE", "", "Generator fuel cannot be separated from transport fuel with open data."),
    ("1.A.4.b", "Residential fuel use (firewood, charcoal, kerosene, LPG)", "energy", "estimated", "low", "FAOSTAT wood fuel and charcoal and IEA residential oil, allocated by GHSL population. Assumed 60% LPG, 40% kerosene. Biomass CO2 is a memo item."),
    ("1.B.1", "Coal mining", "energy", "NO", "", "No coal mining in Kaduna."),
    ("1.B.2", "Oil and gas fugitive emissions", "energy", "NE", "", "No upstream production in Kaduna; refinery fugitives need throughput data."),
    ("2.A.1", "Cement production", "ippu", "NO", "", "No clinker plant identified in Kaduna (OpenStreetMap, Global Energy Monitor)."),
    ("2.A.2", "Lime production", "ippu", "NO", "", "No lime plant identified in Kaduna."),
    ("2.D", "Non-energy products (lubricants, wax)", "ippu", "NE", "", "No open sales data."),
    ("2.F.1", "Refrigeration and air conditioning", "ippu", "NE", "", "Refrigerant mix and equipment stock not available as open data."),
    ("2.G", "SF6 in electrical equipment", "ippu", "NE", "", "Switchgear inventory not available."),
    ("3.A.1", "Enteric fermentation", "agriculture", "estimated", "low", "FAOSTAT national herd allocated by FAO GLW3 livestock maps."),
    ("3.A.2", "Manure management", "agriculture", "estimated", "low", "FAOSTAT herd x GLW3; temperature band from ERA5-Land."),
    ("3.B", "Land use, land-use change and forestry", "lulucf", "provisional", "low", "Dynamic World transitions and GEDI biomass. Not in totals until map accuracy is assessed."),
    ("3.C.1", "Biomass burning", "agriculture", "estimated", "medium", "MODIS MCD64A1 burned area by Dynamic World land class."),
    ("3.C.3", "Urea application", "agriculture", "NE", "", "Fertiliser product mix not available; urea N is included in 3.C.4."),
    ("3.C.4", "Direct N2O from managed soils", "agriculture", "estimated", "low", "Synthetic N (FAOSTAT x GAEZ+ cropland) and grazing dung and urine. Crop residues not estimated."),
    ("3.C.5", "Indirect N2O from managed soils", "agriculture", "estimated", "low", "Leaching applied only in LGAs with at least 1,000 mm rain (CHIRPS 1991-2020)."),
    ("3.C.6", "Indirect N2O from manure management", "agriculture", "estimated", "low", "Swine and poultry manure in solid storage."),
    ("3.C.7", "Rice cultivation", "agriculture", "estimated", "low", "FAOSTAT rice area allocated by GAEZ+ rice map; rainfed regular water regime."),
    ("4.A", "Solid waste disposal", "waste", "estimated", "low", "First order decay from 1975 using GHSL urban population and IPCC Africa defaults."),
    ("4.B", "Composting", "waste", "NE", "", "No data."),
    ("4.C.2", "Open burning of waste", "waste", "estimated", "low", "GHSL population without collection x IPCC defaults."),
    ("4.D.1", "Domestic wastewater", "waste", "estimated", "low", "GHSL population x assumed sanitation shares (replace with DHS 2018 Kaduna)."),
    ("4.D.2", "Industrial wastewater", "waste", "NE", "", "No production data for breweries, abattoirs or the refinery."),
]


def _load_activity(years: Iterable[int]):
    history_from = min(F.SWDS_FIRST_YEAR, min(years))
    rows = ActivityData.objects.filter(
        method_version=METHOD_VERSION,
        year__gte=history_from,
        year__lte=max(years) + 1,
    ).select_related("lga")
    values: Dict[tuple, Decimal] = {}
    ids: Dict[tuple, int] = {}
    agb: Dict[str, Decimal] = {}
    for row in rows:
        if row.lga_id is None:
            if row.activity_key.startswith("lulc.agb_t_per_ha."):
                agb[row.activity_key.rsplit(".", 1)[1]] = row.quantity
            continue
        key = (str(row.lga_id), row.year, row.activity_key)
        values[key] = row.quantity
        ids[key] = row.id
    return values, ids, agb


def _load_zones():
    return {
        str(p.lga_id): {"wet": p.is_wet, "temp_c": p.mean_annual_temp_c}
        for p in LGAClimateProfile.objects.all()
    }


def build_lines(years: List[int]):
    activity, ids, agb = _load_activity(years)
    zones = _load_zones()
    codes = sorted(zones)
    if not codes:
        raise ValueError("No LGAClimateProfile rows. Run sync_inventory_activity --layers climate first.")

    lines: List[calc.Line] = []
    lines += calc.livestock(activity, zones, codes, years)
    lines += calc.soils_and_rice(activity, zones, codes, years)
    lines += calc.fires(activity, zones, codes, years)
    lines += calc.cooking(activity, zones, codes, years)
    lines += calc.fossil_fuels(activity, zones, codes, years)
    lines += calc.waste(activity, zones, codes, years)
    if agb:
        lines += calc.land_use_change(activity, zones, codes, years, agb)
    return lines, ids


def _q(value: Decimal) -> Decimal:
    return Decimal(value).quantize(EF_PLACES, rounding=ROUND_HALF_UP)


def _factor_for(line: calc.Line, cache: dict) -> EmissionFactor:
    key = (line.sector, line.sub_category, line.source_key, line.unit)
    values = (_q(line.co2), _q(line.ch4), _q(line.n2o))
    if key in cache:
        factor, cached_values = cache[key]
        if cached_values != values:
            raise ValueError(f"Factor {key} has different values for different LGAs: {cached_values} vs {values}")
        return factor
    factor, _ = EmissionFactor.objects.update_or_create(
        sector=line.sector,
        sub_category=line.sub_category,
        fuel_or_species=line.source_key,
        unit=line.unit,
        tier=EmissionFactor.Tier.TIER_1,
        defaults={
            "co2_ef": values[0],
            "ch4_ef": values[1],
            "n2o_ef": values[2],
            "ipcc_code": line.ipcc_code,
            "is_biogenic_co2": line.biogenic_co2,
            "ipcc_source": f"{F.GUIDELINE} {line.note} [{METHOD_VERSION}]"[:255],
            # Derived per-unit factors; hidden from the manual entry forms.
            "is_active": False,
        },
    )
    cache[key] = (factor, values)
    return factor


def recompute_state_totals(sectors: Iterable[str], years: Iterable[int]):
    for sector in sectors:
        for year in years:
            total = (
                GHGInventoryEntry.objects
                .filter(sector=sector, year=year, status=GHGInventoryEntry.Status.APPROVED)
                .aggregate(total=Sum("co2e_tonnes"))
                .get("total")
            ) or 0
            GHGStateTotal.objects.update_or_create(
                sector=sector,
                year=year,
                defaults={"total_co2e": total, "status": "approved_only"},
            )


def write_category_status(years: Iterable[int]):
    for year in years:
        for code, name, sector, status, confidence, reason in CATEGORY_REGISTER:
            CategoryStatus.objects.update_or_create(
                ipcc_code=code,
                year=year,
                method_version=METHOD_VERSION,
                defaults={
                    "name": name,
                    "sector": sector,
                    "status": status,
                    "confidence": confidence,
                    "reason": reason,
                },
            )


@transaction.atomic
def run(years: List[int], status: str = GHGInventoryEntry.Status.PENDING_REVIEW, dry_run: bool = False):
    lines, activity_ids = build_lines(years)

    summary = defaultdict(lambda: Decimal("0"))
    for line in lines:
        if not line.provisional:
            summary[(line.year, line.sector)] += line.co2e_tonnes
    lulucf = sum((l.co2e_tonnes for l in lines if l.provisional), Decimal("0"))

    if dry_run:
        transaction.set_rollback(True)
        return {"lines": len(lines), "by_year_sector": dict(summary), "lulucf_provisional_tco2e": lulucf}

    GHGInventoryEntry.objects.filter(method_version=METHOD_VERSION, year__in=years).delete()

    lgas = {str(l.lga_id): l for l in LGARegistry.objects.all()}
    now = timezone.now()
    cache: dict = {}
    entries = []
    for line in lines:
        entry_status = GHGInventoryEntry.Status.DRAFT if line.provisional else status
        entry = GHGInventoryEntry(
            sector=line.sector,
            sub_category=line.sub_category,
            fuel_or_activity=line.source_key,
            lga=lgas.get(line.lgacode),
            year=line.year,
            quantity=Decimal(line.quantity).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP),
            unit=line.unit,
            emission_factor=_factor_for(line, cache),
            status=entry_status,
            ipcc_code=line.ipcc_code,
            method_version=METHOD_VERSION,
            confidence=line.confidence,
            activity_id=activity_ids.get((line.lgacode, line.year, line.activity_keys[0])) if line.activity_keys else None,
            notes=("Provisional: excluded from totals. " if line.provisional else "") + line.note,
            submitted_at=now if entry_status != GHGInventoryEntry.Status.DRAFT else None,
            approved_at=now if entry_status == GHGInventoryEntry.Status.APPROVED else None,
        )
        entry.calculate_emissions()
        entries.append(entry)
    GHGInventoryEntry.objects.bulk_create(entries, batch_size=2000)

    write_category_status(years)
    recompute_state_totals({line.sector for line in lines}, years)

    return {"lines": len(lines), "by_year_sector": dict(summary), "lulucf_provisional_tco2e": lulucf}
