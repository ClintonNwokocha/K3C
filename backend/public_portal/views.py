import logging
from decimal import Decimal

from django.conf import settings
from django.db.models import Avg, Count, Max, Sum
from django.http import HttpResponse

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

logger = logging.getLogger(__name__)


def safe_int(value):
    """Coerce a query-param value to int, returning None for anything
    malformed instead of letting ValueError propagate as an unhandled 500
    on these unauthenticated public endpoints."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None

from climate_risk.models import ClimateInfrastructureAsset, ClimateRiskProfile
from core.geography import (
    KADUNA_LGAS,
    get_kaduna_geography_options,
    normalize_kaduna_geography_name,
)
from core.models import NDCConstant as CoreNDCConstant
from ghg.models import GHGInventoryEntry
from ghg.preview_dataset import (
    PREVIEW_BATCH_ID,
    PREVIEW_CATEGORIES,
    PREVIEW_SOURCE_LABEL,
)
from public_portal.exposure_analytics import ExposureAnalyticsService
from projects.models import ClimateProject
from reports.models import ReportDocument

try:
    from foundation.models import NDCConstant
except Exception:
    NDCConstant = None


def decimal_to_float(value):
    if value is None:
        return 0

    if isinstance(value, Decimal):
        return float(value)

    return float(value or 0)


def get_lga_name(profile):
    if not profile or not profile.lga:
        return ""

    return getattr(profile.lga, "lga_name", "") or str(profile.lga)


def get_public_file_url(request, report):
    if not report.file:
        return ""

    return request.build_absolute_uri(report.file.url)

def decimal_to_float_or_none(value):
    if value is None or value == "":
        return None

    return decimal_to_float(value)


def get_project_image_url(request, project):
    if not getattr(project, "project_image", None):
        return ""

    return request.build_absolute_uri(project.project_image.url)


def build_public_climate_summary():
    latest_year = ClimateRiskProfile.objects.aggregate(
        value=Max("year")
    ).get("value")

    profiles = ClimateRiskProfile.objects.all()

    if latest_year:
        profiles = profiles.filter(year=latest_year)

    total_lgas = profiles.count()

    high_or_very_high_lgas = profiles.filter(
        risk_level__in=["high", "very_high"]
    ).count()

    average_risk = profiles.aggregate(
        value=Avg("overall_risk_score")
    ).get("value") or 0

    highest_risk = profiles.aggregate(
        value=Max("overall_risk_score")
    ).get("value") or 0

    top_lgas = []

    for profile in profiles.order_by("-overall_risk_score")[:5]:
      top_lgas.append({
          "id": profile.id,
          "lga": profile.lga_id,
          "lga_name": get_lga_name(profile),
          "year": profile.year,
          "overall_risk_score": decimal_to_float(profile.overall_risk_score),
          "risk_level": profile.risk_level,
          "risk_level_display": profile.get_risk_level_display(),
          "flood_risk_score": decimal_to_float(profile.flood_risk_score),
          "drought_risk_score": decimal_to_float(profile.drought_risk_score),
          "heat_risk_score": decimal_to_float(profile.heat_risk_score),
          "erosion_risk_score": decimal_to_float(profile.erosion_risk_score),
          "vulnerability_score": decimal_to_float(profile.vulnerability_score),
          "adaptive_capacity_score": decimal_to_float(
              profile.adaptive_capacity_score
          ),
      })

    return {
        "latest_year": latest_year,
        "total_lgas": total_lgas,
        "high_or_very_high_lgas": high_or_very_high_lgas,
        "average_risk": decimal_to_float(average_risk),
        "highest_risk": decimal_to_float(highest_risk),
        "top_lgas": top_lgas,
    }


def build_public_project_summary(request):
    projects = ClimateProject.objects.filter(is_active=True)

    total_projects = projects.count()

    total_ghg_reduction = projects.aggregate(
        value=Sum("expected_ghg_reduction_tco2e")
    ).get("value") or Decimal("0.000")

    total_beneficiaries = projects.aggregate(
        value=Sum("expected_beneficiaries")
    ).get("value") or 0

    by_status = {
        key: 0 for key, _label in ClimateProject.Status.choices
    }

    for row in projects.values("status").annotate(count=Count("id")):
        by_status[row["status"]] = row["count"]

    by_type = {
        key: 0 for key, _label in ClimateProject.ProjectType.choices
    }

    for row in projects.values("project_type").annotate(count=Count("id")):
        by_type[row["project_type"]] = row["count"]

    priority_rank = {
        "very_high": 4,
        "high": 3,
        "medium": 2,
        "low": 1,
    }

    sorted_projects = sorted(
        projects.select_related("lga")[:100],
        key=lambda project: (
            priority_rank.get(project.priority, 0),
            project.expected_ghg_reduction_tco2e,
        ),
        reverse=True,
    )

    def serialize_public_project(project):
        return {
            "id": project.id,
            "title": project.title,
            "project_code": project.project_code,
            "project_type": project.project_type,
            "project_type_display": project.get_project_type_display(),
            "sector": project.sector,
            "sector_display": project.get_sector_display(),
            "status": project.status,
            "status_display": project.get_status_display(),
            "priority": project.priority,
            "priority_display": project.get_priority_display(),
            "lga": project.lga_id,
            "lga_name": getattr(project.lga, "lga_name", "") if project.lga else "",
            "latitude": decimal_to_float_or_none(project.latitude),
            "longitude": decimal_to_float_or_none(project.longitude),
            "project_image_url": get_project_image_url(request, project),
            "public_summary": project.public_summary or "",
            "public_description": project.public_description or "",
            "funding_source": project.funding_source or "Not specified",
            "implementing_agency": project.implementing_agency or "",
            "expected_ghg_reduction_tco2e": decimal_to_float(
                project.expected_ghg_reduction_tco2e
            ),
            "expected_beneficiaries": project.expected_beneficiaries,
            "start_date": project.start_date.isoformat() if project.start_date else None,
            "end_date": project.end_date.isoformat() if project.end_date else None,
            "external_link": project.external_link or None,
        }

    public_projects = [
        serialize_public_project(project) for project in sorted_projects
    ]

    return {
        "total_projects": total_projects,
        "total_expected_ghg_reduction_tco2e": decimal_to_float(
            total_ghg_reduction
        ),
        "total_expected_beneficiaries": total_beneficiaries,
        "by_status": by_status,
        "by_type": by_type,
        "top_projects": public_projects[:5],
        "public_projects": public_projects,
    }


def build_public_ghg_summary():
    constants = None

    if NDCConstant is not None:
        try:
            constants = NDCConstant.objects.order_by("-id").first()
        except Exception:
            constants = None

    kaduna_baseline_mt = (
        getattr(constants, "kaduna_baseline_mt", None)
        or Decimal("13.3")
    )

    nigeria_baseline_mt = (
        getattr(constants, "nigeria_baseline_mt", None)
        or Decimal("317")
    )

    kaduna_share_pct = (
        getattr(constants, "kaduna_share_pct", None)
        or Decimal("4.2")
    )

    target_year = getattr(constants, "target_year", None) or 2030

    unconditional_pct = (
        getattr(constants, "unconditional_pct", None)
        or Decimal("47")
    )

    conditional_pct = (
        getattr(constants, "conditional_pct", None)
        or Decimal("50")
    )

    return {
        "baseline_label": "Kaduna State GHG baseline",
        "baseline_reference": "NDC reference baseline",
        "baseline_emissions_mtco2e": decimal_to_float(kaduna_baseline_mt),
        "baseline_emissions_tco2e": decimal_to_float(kaduna_baseline_mt) * 1000000,
        "nigeria_baseline_mtco2e": decimal_to_float(nigeria_baseline_mt),
        "kaduna_share_pct": decimal_to_float(kaduna_share_pct),
        "target_year": target_year,
        "unconditional_reduction_target_pct": decimal_to_float(unconditional_pct),
        "conditional_reduction_target_pct": decimal_to_float(conditional_pct),
    }


GHG_CANONICAL_SECTORS = [
    (GHGInventoryEntry.Sector.AGRICULTURE, "Agriculture"),
    (GHGInventoryEntry.Sector.ENERGY, "Energy"),
    (
        GHGInventoryEntry.Sector.IPPU,
        "Industrial Processes and Product Use",
    ),
    (
        GHGInventoryEntry.Sector.LULUCF,
        "Land Use, Land-Use Change and Forestry",
    ),
    (GHGInventoryEntry.Sector.WASTE, "Waste"),
]

GHG_SECTOR_LABELS = dict(GHG_CANONICAL_SECTORS)
GHG_STACK_SECTOR_ORDER = {
    GHGInventoryEntry.Sector.ENERGY: 0,
    GHGInventoryEntry.Sector.IPPU: 1,
    GHGInventoryEntry.Sector.AGRICULTURE: 2,
    GHGInventoryEntry.Sector.WASTE: 3,
    GHGInventoryEntry.Sector.LULUCF: 4,
}

GHG_CANONICAL_GASES = [
    ("CO2e", "All gases"),
    ("CO2", "Carbon dioxide"),
    ("CH4", "Methane"),
    ("N2O", "Nitrous oxide"),
]

GHG_BREAKOUT_OPTIONS = [
    {"value": "sector", "label": "Sector"},
    {"value": "gas", "label": "Gas"},
    {"value": "category", "label": "Category"},
]

GHG_SUBCATEGORY_LABELS = {
    "stationary_combustion": "Stationary Combustion",
    "transport_combustion": "Transport Combustion",
    "electricity_generation": "Electricity Generation",
    "road_transportation": "Road Transportation",
    "residential_fuel_use": "Residential Fuel Use",
    "commercial_institutional_fuel_use": "Commercial and Institutional Fuel Use",
    "industrial_fuel_combustion": "Industrial Fuel Combustion",
    "enteric_fermentation": "Enteric Fermentation",
    "manure_management": "Manure Management",
    "agricultural_soils": "Agricultural Soils",
    "rice_cultivation": "Rice Cultivation",
    "synthetic_fertilizer": "Synthetic Fertiliser N2O",
    "crop_residue_burning": "Crop-Residue Burning",
    "solid_waste": "Solid Waste",
    "solid_waste_disposal": "Solid-Waste Disposal",
    "wastewater": "Wastewater",
    "wastewater_treatment": "Wastewater Treatment",
    "open_burning_of_waste": "Open Burning of Waste",
    "biological_treatment_of_waste": "Biological Treatment of Waste",
    "mineral_products": "Mineral Products",
    "cement_production": "Cement Production",
    "lime_production": "Lime Production",
    "refrigerants": "Refrigerant Gases",
    "refrigeration_air_conditioning": "Refrigeration and Air Conditioning",
    "other_industrial_processes": "Other Industrial Processes",
    "deforestation": "Deforestation / Forest Loss",
    "afforestation": "Afforestation / Forest Gain",
    "forest_land": "Forest Land",
    "cropland": "Cropland",
    "grassland": "Grassland",
    "settlements": "Settlements",
    "land_conversion": "Land Conversion",
}

GHG_CATEGORY_ORDER = {
    category["sub_category"]: index
    for index, category in enumerate(PREVIEW_CATEGORIES)
}
GHG_GAS_ORDER = {"CO2": 0, "CH4": 1, "N2O": 2}


def readable_ghg_label(value):
    return (value or "").replace("_", " ").strip().title()


def serialize_ghg_entry(entry):
    co2_tco2e = (entry.co2_kg or Decimal("0")) / Decimal("1000")
    ch4_tco2e = ((entry.ch4_kg or Decimal("0")) * Decimal("28")) / Decimal("1000")
    n2o_tco2e = ((entry.n2o_kg or Decimal("0")) * Decimal("265")) / Decimal("1000")

    gases = []
    if co2_tco2e:
        gases.append("CO2")
    if ch4_tco2e:
        gases.append("CH4")
    if n2o_tco2e:
        gases.append("N2O")

    source_label = readable_ghg_label(entry.fuel_or_activity)
    category_label = GHG_SUBCATEGORY_LABELS.get(
        entry.sub_category,
        readable_ghg_label(entry.sub_category),
    )
    is_preview = entry.notes == PREVIEW_BATCH_ID

    return {
        "id": entry.id,
        "reporting_year": entry.year,
        "sector": entry.sector,
        "sector_label": GHG_SECTOR_LABELS.get(entry.sector, entry.sector),
        "category": entry.sub_category,
        "category_label": category_label,
        "source": entry.fuel_or_activity,
        "source_label": source_label,
        "gas_values_tco2e": {
            "CO2": decimal_to_float(co2_tco2e),
            "CH4": decimal_to_float(ch4_tco2e),
            "N2O": decimal_to_float(n2o_tco2e),
            "CO2e": decimal_to_float(entry.co2e_tonnes),
        },
        "gases": gases,
        "emissions_tco2e": decimal_to_float(entry.co2e_tonnes),
        "data_status": "Official inventory value",
        "publication_status": entry.get_status_display(),
        "source_note": (
            PREVIEW_SOURCE_LABEL
            if is_preview
            else "KCCC approved GHG inventory entry"
        ),
        "preview_batch_id": PREVIEW_BATCH_ID if is_preview else "",
        "lga": entry.lga_id,
        "lga_name": getattr(entry.lga, "lga_name", "") if entry.lga else "",
        "approved_at": entry.approved_at,
        "updated_at": entry.updated_at,
    }


def get_public_ghg_metadata(approved_entries, records):
    years = sorted(
        approved_entries.values_list("year", flat=True).distinct()
    )
    categories = sorted(
        {
            (
                row["sub_category"],
                GHG_SUBCATEGORY_LABELS.get(
                    row["sub_category"],
                    readable_ghg_label(row["sub_category"]),
                ),
                row["sector"],
            )
            for row in approved_entries.values("sector", "sub_category").distinct()
        },
        key=lambda row: (row[2], row[1]),
    )
    return {
        "years": years,
        "sectors": [
            {"value": sector, "label": label}
            for sector, label in GHG_CANONICAL_SECTORS
        ],
        "categories": [
            {"value": category, "label": label, "sector": sector}
            for category, label, sector in categories
        ],
        "gases": [
            {"value": gas, "label": label}
            for gas, label in GHG_CANONICAL_GASES
        ],
        "breakout_options": GHG_BREAKOUT_OPTIONS,
        "geographies": get_kaduna_geography_options(),
    }


def filter_public_ghg_records(records, params, preview_batch_active=False):
    if not params:
        if preview_batch_active:
            return [record for record in records if not record["lga"]]
        return records

    year = params.get("year")
    year_from = params.get("year_from")
    year_to = params.get("year_to")
    sector = params.get("sector")
    category = params.get("category")
    gas = params.get("gas")
    geography = params.get("geography")

    filtered = records

    if year and year != "all":
        filtered = [
            record for record in filtered
            if str(record["reporting_year"]) == str(year)
        ]

    year_from_int = safe_int(year_from) if year_from and year_from != "all" else None
    if year_from_int is not None:
        filtered = [
            record for record in filtered
            if int(record["reporting_year"]) >= year_from_int
        ]

    year_to_int = safe_int(year_to) if year_to and year_to != "all" else None
    if year_to_int is not None:
        filtered = [
            record for record in filtered
            if int(record["reporting_year"]) <= year_to_int
        ]

    if sector and sector != "all":
        filtered = [
            record for record in filtered
            if record["sector"] == sector
        ]

    if category and category != "all":
        filtered = [
            record for record in filtered
            if record["category"] == category
        ]

    if gas and gas not in ["all", "CO2e"]:
        filtered = [
            record for record in filtered
            if decimal_to_float(record["gas_values_tco2e"].get(gas)) > 0
        ]

    if preview_batch_active and (not geography or geography == "all"):
        filtered = [
            record for record in filtered
            if not record["lga"]
        ]
    elif geography and geography != "all":
        if geography == "statewide":
            filtered = [
                record for record in filtered
                if not record["lga"]
            ]
        elif geography.startswith("lga:"):
            lga_name = geography.replace("lga:", "", 1)
            filtered = [
                record for record in filtered
                if record["lga_name"] == lga_name
            ]

    return filtered


def get_public_ghg_record_value(record, gas=None):
    if gas and gas not in ["all", "CO2e"]:
        return decimal_to_float(record["gas_values_tco2e"].get(gas))

    return decimal_to_float(record["emissions_tco2e"])


def summarize_public_ghg_records(records, inventory_status, selected_year=None, gas=None):
    total = (
        sum(get_public_ghg_record_value(record, gas) for record in records)
        if records
        else None
    )
    sector_rows = []
    for sector, sector_label in GHG_CANONICAL_SECTORS:
        sector_records = [record for record in records if record["sector"] == sector]
        if not sector_records:
            continue
        sector_total = sum(
            get_public_ghg_record_value(record, gas)
            for record in sector_records
        )
        sector_rows.append({
            "sector": sector,
            "sector_label": sector_label,
            "emissions_tco2e": sector_total,
            "share_pct": (sector_total / total * 100) if total else 0,
        })

    largest_sector = (
        max(sector_rows, key=lambda row: row["emissions_tco2e"])
        if sector_rows
        else None
    )

    return {
        "latest_reporting_year": selected_year,
        "published_total_emissions_tco2e": total,
        "sectors_represented": len({record["sector"] for record in records}),
        "largest_contributing_sector": largest_sector,
        "inventory_status": inventory_status,
        "matching_record_count": len(records),
    }


def get_public_ghg_selected_years(all_years, params):
    if not all_years:
        return []

    year = params.get("year")
    if year and year != "all":
        year_int = safe_int(year)
        return [year_int] if year_int is not None and year_int in all_years else []

    year_from = params.get("year_from")
    year_to = params.get("year_to")
    year_from_int = safe_int(year_from) if year_from and year_from != "all" else None
    year_to_int = safe_int(year_to) if year_to and year_to != "all" else None
    lower = year_from_int if year_from_int is not None else min(all_years)
    upper = year_to_int if year_to_int is not None else max(all_years)

    if lower > upper:
        lower, upper = upper, lower

    return [year for year in all_years if lower <= year <= upper]


def describe_public_ghg_change(start_year, start_value, end_year, end_value):
    if (
        start_year is None
        or end_year is None
        or start_value in [None, 0]
        or end_value is None
        or start_year == end_year
    ):
        return {
            "start_year": start_year,
            "end_year": end_year,
            "change_pct": None,
            "description": "Not available",
        }

    change_pct = ((end_value - start_value) / start_value) * 100
    if abs(change_pct) < 0.05:
        description = "No material change"
    elif change_pct > 0:
        description = f"Increased by {change_pct:.1f}%"
    else:
        description = f"Decreased by {abs(change_pct):.1f}%"

    return {
        "start_year": start_year,
        "end_year": end_year,
        "change_pct": change_pct,
        "description": description,
    }


def build_public_ghg_chart(records, years, breakout="sector", gas="CO2e"):
    breakout = breakout if breakout in {"sector", "category", "gas"} else "sector"
    gas = gas or "CO2e"
    years = sorted(int(year) for year in years)
    records_by_year = {
        year: [record for record in records if int(record["reporting_year"]) == year]
        for year in years
    }
    series_lookup = {}

    def add_value(key, label, year, value):
        if value is None:
            return

        series = series_lookup.setdefault(
            key,
            {
                "key": key,
                "label": label,
                "values_by_year": {selected_year: None for selected_year in years},
            },
        )
        current = series["values_by_year"].get(year)
        series["values_by_year"][year] = (current or 0) + value

    for year in years:
        for record in records_by_year.get(year, []):
            if breakout == "gas":
                gas_keys = ["CO2", "CH4", "N2O"] if gas in ["all", "CO2e"] else [gas]
                for gas_key in gas_keys:
                    value = get_public_ghg_record_value(record, gas_key)
                    if value:
                        add_value(gas_key, dict(GHG_CANONICAL_GASES).get(gas_key, gas_key), year, value)
            elif breakout == "category":
                value = get_public_ghg_record_value(record, gas)
                if value or value == 0:
                    add_value(record["category"], record["category_label"], year, value)
            else:
                value = get_public_ghg_record_value(record, gas)
                if value or value == 0:
                    add_value(record["sector"], record["sector_label"], year, value)

    totals_by_year = []
    for year in years:
        year_values = [
            series["values_by_year"].get(year)
            for series in series_lookup.values()
        ]
        present_values = [value for value in year_values if value is not None]
        totals_by_year.append({
            "year": year,
            "value": sum(present_values) if present_values else None,
            "entry_count": len(records_by_year.get(year, [])),
        })

    series_rows = []
    for series in series_lookup.values():
        values = [
            {
                "year": year,
                "value": series["values_by_year"].get(year),
            }
            for year in years
        ]
        first = values[0] if values else {"year": None, "value": None}
        last = values[-1] if values else {"year": None, "value": None}
        series_rows.append({
            "key": series["key"],
            "label": series["label"],
            "values": values,
            "change": describe_public_ghg_change(
                first["year"],
                first["value"],
                last["year"],
                last["value"],
            ),
        })

    series_rows.sort(key=lambda row: get_public_ghg_stack_order(row, breakout))

    first_total = totals_by_year[0] if totals_by_year else {"year": None, "value": None}
    last_total = totals_by_year[-1] if totals_by_year else {"year": None, "value": None}
    total_change = describe_public_ghg_change(
        first_total["year"],
        first_total["value"],
        last_total["year"],
        last_total["value"],
    )

    return {
        "years": years,
        "breakout": breakout,
        "unit": "tCO2e",
        "series": series_rows,
        "totals_by_year": totals_by_year,
        "change": {
            "gross_total": total_change,
            "series": [
                {
                    "key": row["key"],
                    "label": row["label"],
                    **row["change"],
                }
                for row in series_rows
            ],
        },
        "table": {
            "years": years,
            "rows": [
                {
                    "key": "gross_total",
                    "label": "Gross total",
                    "is_total": True,
                    "values": [
                        {"year": row["year"], "value": row["value"]}
                        for row in totals_by_year
                    ],
                },
                *[
                    {
                        "key": row["key"],
                        "label": row["label"],
                        "is_total": False,
                        "values": row["values"],
                    }
                    for row in series_rows
                ],
            ] if series_rows else [],
        },
        "csv_rows": build_public_ghg_csv_rows(records, series_rows, breakout, gas),
    }


def get_public_ghg_stack_order(series_row, breakout):
    if breakout == "sector":
        return GHG_STACK_SECTOR_ORDER.get(series_row["key"], 99)
    if breakout == "gas":
        return GHG_GAS_ORDER.get(series_row["key"], 99)

    return GHG_CATEGORY_ORDER.get(series_row["key"], 99)


def build_public_ghg_csv_rows(records, series_rows, breakout, gas):
    rows = []
    geography_names = sorted(
        {record["lga_name"] or "Kaduna State" for record in records}
    )
    geography = geography_names[0] if len(geography_names) == 1 else "Selected geographies"
    source = PREVIEW_SOURCE_LABEL if any(record["preview_batch_id"] for record in records) else "KCCC approved GHG inventory entries"
    preview_batch_id = PREVIEW_BATCH_ID if any(record["preview_batch_id"] for record in records) else ""
    gas_label = dict(GHG_CANONICAL_GASES).get(gas, gas)

    for series in series_rows:
        for value in series["values"]:
            if value["value"] is None:
                continue
            rows.append({
                "year": value["year"],
                "breakout_dimension": breakout,
                "breakout_value": series["label"],
                "geography": geography,
                "sector": series["label"] if breakout == "sector" else "Selected sectors",
                "category": series["label"] if breakout == "category" else "Selected categories",
                "gas": series["label"] if breakout == "gas" else gas_label,
                "emissions_tco2e": value["value"],
                "source": source,
                "preview_batch_id": preview_batch_id,
                "publication_status": "Approved public inventory aggregate",
            })

    return rows


def filter_public_ghg_map_records(records, params, map_year):
    sector = params.get("sector")
    category = params.get("category")
    gas = params.get("gas")

    filtered = [
        record for record in records
        if int(record["reporting_year"]) == int(map_year) and record["lga_name"]
    ]

    if sector and sector != "all":
        filtered = [
            record for record in filtered
            if record["sector"] == sector
        ]

    if category and category != "all":
        filtered = [
            record for record in filtered
            if record["category"] == category
        ]

    if gas and gas not in ["all", "CO2e"]:
        filtered = [
            record for record in filtered
            if decimal_to_float(record["gas_values_tco2e"].get(gas)) > 0
        ]

    return filtered


def get_public_ghg_selected_lga(params):
    geography = params.get("geography")
    if not geography or not geography.startswith("lga:"):
        return ""

    return geography.replace("lga:", "", 1)


def build_public_ghg_map(records, selected_years, params, preview_batch_active=False):
    expected_count = len(KADUNA_LGAS)
    map_year = selected_years[-1] if selected_years else None
    base_payload = {
        "eligible": False,
        "map_eligible": False,
        "map_eligibility_reason": "No selected reporting year is available.",
        "year": map_year,
        "map_year": map_year,
        "coverage_count": 0,
        "lga_coverage_count": 0,
        "expected_count": expected_count,
        "expected_lga_count": expected_count,
        "unit": "tCO2e",
        "selected_lga": get_public_ghg_selected_lga(params),
        "records": [],
        "total": None,
    }

    if map_year is None:
        return base_payload

    map_records = filter_public_ghg_map_records(records, params, map_year)
    gas = params.get("gas")
    totals_by_lga = {
        normalize_kaduna_geography_name(lga_name): {
            "lga_name": lga_name,
            "value": None,
            "entry_count": 0,
        }
        for lga_name in KADUNA_LGAS
    }

    for record in map_records:
        lga_key = normalize_kaduna_geography_name(record["lga_name"])
        if lga_key not in totals_by_lga:
            continue

        value = get_public_ghg_record_value(record, gas)
        if value is None:
            continue

        current = totals_by_lga[lga_key]["value"]
        totals_by_lga[lga_key]["value"] = (current or 0) + value
        totals_by_lga[lga_key]["entry_count"] += 1

    map_rows = [
        {
            "lga_name": lga_name,
            "value": totals_by_lga[normalize_kaduna_geography_name(lga_name)]["value"],
            "sector": params.get("sector") or "all",
            "category": params.get("category") or "all",
            "gas": params.get("gas") or "CO2e",
            "year": map_year,
            "unit": "tCO2e",
            "entry_count": totals_by_lga[
                normalize_kaduna_geography_name(lga_name)
            ]["entry_count"],
        }
        for lga_name in KADUNA_LGAS
    ]
    coverage_count = sum(1 for row in map_rows if row["value"] is not None)
    total = (
        sum(row["value"] for row in map_rows if row["value"] is not None)
        if coverage_count
        else None
    )
    eligible = coverage_count == expected_count
    reason = (
        "Complete LGA-level inventory coverage is available for the selected year and filters."
        if eligible
        else "Map View is unavailable because complete LGA-level inventory coverage is not available for the selected year and filters."
    )

    return {
        **base_payload,
        "eligible": eligible,
        "map_eligible": eligible,
        "map_eligibility_reason": reason,
        "coverage_count": coverage_count,
        "lga_coverage_count": coverage_count,
        "records": map_rows,
        "total": total,
        "dataset_strategy": (
            "preview_lga_records_only"
            if preview_batch_active
            else "approved_lga_records_only"
        ),
    }


def build_public_ghg_inventory_explorer(params=None):
    all_approved_entries = (
        GHGInventoryEntry.objects
        .select_related("lga", "emission_factor")
        .filter(status=GHGInventoryEntry.Status.APPROVED)
        .order_by("-year", "sector", "sub_category", "fuel_or_activity")
    )
    preview_entries = all_approved_entries.filter(notes=PREVIEW_BATCH_ID)
    preview_record_count = preview_entries.count()
    genuine_record_count = all_approved_entries.exclude(notes=PREVIEW_BATCH_ID).count()
    preview_batch_active = preview_record_count > 0
    approved_entries = preview_entries if preview_batch_active else all_approved_entries

    approved_count = approved_entries.count()
    non_public_count = GHGInventoryEntry.objects.exclude(
        status=GHGInventoryEntry.Status.APPROVED
    ).count()
    active_project_total = ClimateProject.objects.filter(is_active=True).aggregate(
        value=Sum("expected_ghg_reduction_tco2e")
    ).get("value") or Decimal("0")
    ndc_constant = CoreNDCConstant.objects.filter(is_active=True).order_by("-updated_at").first()

    records = [serialize_ghg_entry(entry) for entry in approved_entries]
    metadata = get_public_ghg_metadata(approved_entries, records)
    years = sorted({record["reporting_year"] for record in records})
    sectors = GHG_CANONICAL_SECTORS
    categories = sorted(
        {
            (record["category"], record["category_label"], record["sector"])
            for record in records
        },
        key=lambda row: (row[2], row[1]),
    )
    sources = sorted(
        {
            (
                record["source"],
                record["source_label"],
                record["sector"],
                record["category"],
            )
            for record in records
        },
        key=lambda row: (row[2], row[3], row[1]),
    )
    totals_by_year = []
    for year in years:
        year_records = [record for record in records if record["reporting_year"] == year]
        totals_by_year.append({
            "reporting_year": year,
            "emissions_tco2e": sum(record["emissions_tco2e"] for record in year_records),
            "entry_count": len(year_records),
        })

    totals_by_sector_year = []
    for year in years:
        for sector, sector_label in sectors:
            sector_records = [
                record for record in records
                if record["reporting_year"] == year and record["sector"] == sector
            ]
            if not sector_records:
                continue
            totals_by_sector_year.append({
                "reporting_year": year,
                "sector": sector,
                "sector_label": sector_label,
                "emissions_tco2e": sum(record["emissions_tco2e"] for record in sector_records),
                "entry_count": len(sector_records),
            })

    latest_year = max(years) if years else None
    latest_records = [
        record for record in records if record["reporting_year"] == latest_year
    ] if latest_year else []
    latest_total = (
        sum(record["emissions_tco2e"] for record in latest_records)
        if latest_records
        else None
    )
    latest_sector_totals = []
    for sector, sector_label in sectors:
        sector_records = [record for record in latest_records if record["sector"] == sector]
        if not sector_records:
            continue
        sector_total = sum(record["emissions_tco2e"] for record in sector_records)
        latest_sector_totals.append({
            "sector": sector,
            "sector_label": sector_label,
            "emissions_tco2e": sector_total,
            "share_pct": (sector_total / latest_total * 100) if latest_total else 0,
        })

    largest_sector = (
        max(latest_sector_totals, key=lambda row: row["emissions_tco2e"])
        if latest_sector_totals
        else None
    )

    lga_names = sorted({
        record["lga_name"] for record in records if record["lga_name"]
    })
    latest_update = max(
        [
            value
            for record in records
            for value in [record["approved_at"], record["updated_at"]]
            if value
        ],
        default=None,
    )

    if preview_batch_active:
        inventory_status = "Preview dataset — not the official inventory"
        inventory_status_code = "preview_dataset_not_official"
    elif approved_count:
        inventory_status = "Official inventory published"
        inventory_status_code = "official_inventory_published"
    elif GHGInventoryEntry.objects.exists():
        inventory_status = "Official inventory not yet published"
        inventory_status_code = "official_inventory_not_yet_published"
    elif ndc_constant or active_project_total:
        inventory_status = "Modelled estimates available"
        inventory_status_code = "modelled_estimates_available"
    else:
        inventory_status = "No public inventory data available"
        inventory_status_code = "no_public_inventory_data_available"

    request_params = params or {}
    selected_years = get_public_ghg_selected_years(years, request_params)
    filtered_records = filter_public_ghg_records(
        records,
        request_params,
        preview_batch_active,
    )
    selected_year = request_params.get("year") or latest_year
    if selected_year == "all":
        selected_year = None
    summary = summarize_public_ghg_records(
        filtered_records,
        inventory_status,
        selected_year,
        request_params.get("gas"),
    )
    chart = build_public_ghg_chart(
        filtered_records,
        selected_years,
        request_params.get("breakout", "sector"),
        request_params.get("gas", "CO2e"),
    )
    ghg_map = build_public_ghg_map(
        records,
        selected_years,
        request_params,
        preview_batch_active,
    )

    return {
        "status": "ok",
        "message": "Public GHG inventory explorer loaded.",
        "inventory_status": {
            "code": inventory_status_code,
            "label": inventory_status,
            "approved_entry_count": approved_count,
            "non_public_entry_count": non_public_count,
            "modelled_estimates_available": bool(ndc_constant or active_project_total),
            "project_reductions_are_inventory": False,
            "latest_update": latest_update,
        },
        "summary": summary,
        "metadata": metadata,
        "preview": {
            "preview_batch_active": preview_batch_active,
            "preview_batch_id": PREVIEW_BATCH_ID if preview_batch_active else "",
            "preview_record_count": preview_record_count,
            "genuine_record_count": genuine_record_count,
            "all_geographies_strategy": (
                "statewide_aggregate_only"
                if preview_batch_active
                else "approved_records"
            ),
        },
        "chart": chart,
        "map": ghg_map,
        "dimensions": {
            **metadata,
            "sources": [
                {
                    "value": source,
                    "label": label,
                    "sector": sector,
                    "category": category,
                }
                for source, label, sector, category in sources
            ],
        },
        "geography": {
            "has_lga_level_records": bool(lga_names),
            "approved_lga_record_count": approved_entries.exclude(lga__isnull=True).count(),
            "lga_names": lga_names,
            "map_view_eligible": ghg_map["eligible"],
            "map_view_reason": ghg_map["map_eligibility_reason"],
        },
        "totals": {
            "by_year": totals_by_year,
            "by_sector_year": totals_by_sector_year,
        },
        "records": filtered_records,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def public_ghg_inventory(request):
    return Response(build_public_ghg_inventory_explorer(request.query_params))

def build_public_reports_summary(request):
    reports = ReportDocument.objects.filter(
        is_active=True,
        is_public=True,
        status=ReportDocument.Status.PUBLISHED,
    )

    by_type = {
        key: 0 for key, _label in ReportDocument.ReportType.choices
    }

    for row in reports.values("report_type").annotate(count=Count("id")):
        by_type[row["report_type"]] = row["count"]

    recent_reports = []

    report_type_labels = dict(ReportDocument.ReportType.choices)

    for report in reports.order_by("-created_at")[:5]:
        recent_reports.append({
            "id": report.id,
            "title": report.title,
            "report_type": report.report_type,
            "report_type_display": report_type_labels.get(
                report.report_type,
                report.report_type,
            ),
            "reporting_year": report.reporting_year,
            "description": report.description,
            "source_module": report.source_module,
            "file_url": get_public_file_url(request, report),
            "created_at": report.created_at,
        })

    return {
        "total_public_reports": reports.count(),
        "by_type": by_type,
        "recent_reports": recent_reports,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def public_portal_summary(request):
    return Response({
        "status": "ok",
        "message": "Public portal summary loaded.",
        "summary": {
            "climate_risk": build_public_climate_summary(),
            "ghg_inventory": build_public_ghg_summary(),
            "projects": build_public_project_summary(request),
            "reports": build_public_reports_summary(request),
        },
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def public_climate_risk_profiles(request):
    year = safe_int(request.query_params.get("year"))

    latest_year = ClimateRiskProfile.objects.aggregate(
        value=Max("year")
    ).get("value")

    profiles = ClimateRiskProfile.objects.select_related("lga").all()

    if year:
        profiles = profiles.filter(year=year)
    elif latest_year:
        profiles = profiles.filter(year=latest_year)

    profiles = profiles.order_by("lga__lga_name")

    results = []

    for profile in profiles:
        results.append({
            "id": profile.id,
            "lga": profile.lga_id,
            "lga_name": get_lga_name(profile),
            "year": profile.year,
            "overall_risk_score": decimal_to_float(profile.overall_risk_score),
            "risk_level": profile.risk_level,
            "risk_level_display": profile.get_risk_level_display(),
            "flood_risk_score": decimal_to_float(profile.flood_risk_score),
            "drought_risk_score": decimal_to_float(profile.drought_risk_score),
            "heat_risk_score": decimal_to_float(profile.heat_risk_score),
            "erosion_risk_score": decimal_to_float(profile.erosion_risk_score),
            "exposure_score": decimal_to_float(profile.exposure_score),
            "vulnerability_score": decimal_to_float(profile.vulnerability_score),
            "adaptive_capacity_score": decimal_to_float(
                profile.adaptive_capacity_score
            ),
        })

    risk_counts = {
        "low": profiles.filter(risk_level="low").count(),
        "moderate": profiles.filter(risk_level="moderate").count(),
        "high": profiles.filter(risk_level="high").count(),
        "very_high": profiles.filter(risk_level="very_high").count(),
    }

    high_risk_lgas = profiles.filter(
        risk_level__in=["high", "very_high"]
    ).values_list("lga_id", flat=True)

    people_in_high_risk_lgas = (
        profiles
        .filter(risk_level__in=["high", "very_high"])
        .aggregate(value=Sum("lga__population"))
        .get("value")
    )

    critical_assets_at_high_risk = ClimateInfrastructureAsset.objects.filter(
        is_active=True,
        lga_id__in=high_risk_lgas,
    ).count()
    exposure_summary = ExposureAnalyticsService().get_public_summary()

    return Response({
        "status": "ok",
        "message": "Public climate risk profiles loaded.",
        "summary": {
            "year": int(year) if year else latest_year,
            "total_lgas": profiles.count(),
            "risk_counts": risk_counts,
            "people_in_high_risk_lgas": people_in_high_risk_lgas,
            "critical_assets_at_high_risk": critical_assets_at_high_risk,
            **exposure_summary,
        },
        "results": results,
    })

@api_view(["GET"])
@permission_classes([AllowAny])
def public_report_documents(request):
    report_type = request.query_params.get("report_type")
    reporting_year = request.query_params.get("reporting_year")
    search = request.query_params.get("search")

    reports = (
        ReportDocument.objects
        .filter(
            is_active=True,
            is_public=True,
            status=ReportDocument.Status.PUBLISHED,
        )
        .order_by("-created_at", "title")
    )

    if report_type and report_type != "all":
        reports = reports.filter(report_type=report_type)

    if reporting_year:
        reports = reports.filter(reporting_year=reporting_year)

    if search:
        reports = reports.filter(title__icontains=search)

    report_type_labels = dict(ReportDocument.ReportType.choices)

    by_type = {
        key: 0 for key, _label in ReportDocument.ReportType.choices
    }

    for row in reports.values("report_type").annotate(count=Count("id")):
        by_type[row["report_type"]] = row["count"]

    results = []

    for report in reports:
        results.append({
            "id": report.id,
            "title": report.title,
            "report_type": report.report_type,
            "report_type_display": report_type_labels.get(
                report.report_type,
                report.report_type,
            ),
            "reporting_year": report.reporting_year,
            "description": report.description,
            "source_module": report.source_module,
            "file_url": get_public_file_url(request, report),
            "created_at": report.created_at,
            "updated_at": report.updated_at,
        })

    return Response({
        "status": "ok",
        "message": "Public reports loaded.",
        "summary": {
            "total_public_reports": reports.count(),
            "by_type": by_type,
        },
        "results": results,
    })
@api_view(["GET"])
@permission_classes([AllowAny])
def public_climate_projects(request):
    project_type = request.query_params.get("project_type")
    sector = request.query_params.get("sector")
    status_filter = request.query_params.get("status")
    funding_source = request.query_params.get("funding_source")
    search = request.query_params.get("search")

    projects = (
        ClimateProject.objects
        .select_related("lga")
        .filter(is_active=True)
        .order_by("-created_at", "title")
    )

    if project_type and project_type != "all":
        projects = projects.filter(project_type=project_type)

    if sector and sector != "all":
        projects = projects.filter(sector=sector)

    if status_filter and status_filter != "all":
        projects = projects.filter(status=status_filter)

    if funding_source and funding_source != "all":
        projects = projects.filter(funding_source=funding_source)

    if search:
        projects = projects.filter(title__icontains=search)

    total_ghg_reduction = projects.aggregate(
        value=Sum("expected_ghg_reduction_tco2e")
    ).get("value") or Decimal("0.000")

    total_beneficiaries = projects.aggregate(
        value=Sum("expected_beneficiaries")
    ).get("value") or 0

    by_status = {
        key: 0 for key, _label in ClimateProject.Status.choices
    }

    for row in projects.values("status").annotate(count=Count("id")):
        by_status[row["status"]] = row["count"]

    by_type = {
        key: 0 for key, _label in ClimateProject.ProjectType.choices
    }

    for row in projects.values("project_type").annotate(count=Count("id")):
        by_type[row["project_type"]] = row["count"]

    results = []

    for project in projects:
        results.append({
            "id": project.id,
            "title": project.title,
            "project_code": project.project_code,
            "project_type": project.project_type,
            "project_type_display": project.get_project_type_display(),
            "sector": project.sector,
            "sector_display": project.get_sector_display(),
            "status": project.status,
            "status_display": project.get_status_display(),
            "priority": project.priority,
            "priority_display": project.get_priority_display(),
            "lga": project.lga_id,
            "lga_name": getattr(project.lga, "lga_name", "") if project.lga else "",
            "latitude": decimal_to_float_or_none(project.latitude),
            "longitude": decimal_to_float_or_none(project.longitude),
            "project_image_url": get_project_image_url(request, project),
            "public_summary": project.public_summary or "",
            "public_description": project.public_description or "",
            "funding_source": project.funding_source or "Not specified",
            "implementing_agency": project.implementing_agency or "",
            "expected_ghg_reduction_tco2e": decimal_to_float(
                project.expected_ghg_reduction_tco2e
            ),
            "expected_beneficiaries": project.expected_beneficiaries,
            "start_date": project.start_date.isoformat() if project.start_date else None,
            "end_date": project.end_date.isoformat() if project.end_date else None,
            "external_link": project.external_link or None,
            "climate_risk_relevance": project.climate_risk_relevance,
        })

    return Response({
        "status": "ok",
        "message": "Public climate projects loaded.",
        "summary": {
            "total_projects": projects.count(),
            "total_expected_ghg_reduction_tco2e": decimal_to_float(
                total_ghg_reduction
            ),
            "total_expected_beneficiaries": total_beneficiaries,
            "by_status": by_status,
            "by_type": by_type,
        },
        "results": results,
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def atlas_export(request):
    from playwright.sync_api import sync_playwright

    variable = request.query_params.get("variable", "overall")
    year     = request.query_params.get("year", "2025")
    basemap  = request.query_params.get("basemap", "satellite")

    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    url = (
        f"{frontend_url}/public/climate-atlas"
        f"?export=1&variable={variable}&year={year}&basemap={basemap}"
    )

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
            )
            page = context.new_page()
            # domcontentloaded avoids stalling on continuous tile requests
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            # Wait for Leaflet map container to mount
            page.wait_for_selector(".leaflet-container", timeout=20000)
            # Wait for React to signal GeoJSON is loaded and map is ready
            page.wait_for_function(
                "document.body.dataset.atlasExportReady === '1'",
                timeout=25000,
            )
            # Wait until several tile images have fully decoded (naturalWidth > 0)
            page.wait_for_function(
                """() => {
                    const imgs = document.querySelectorAll('.leaflet-tile-pane img');
                    if (imgs.length === 0) return false;
                    const loaded = Array.from(imgs).filter(
                        i => i.complete && i.naturalWidth > 0
                    );
                    return loaded.length >= Math.min(4, imgs.length);
                }""",
                timeout=20000,
            )
            # Final settle for sub-pixel tile paint
            page.wait_for_timeout(2000)
            png_bytes = page.screenshot(type="png")
            context.close()
            browser.close()

        response = HttpResponse(png_bytes, content_type="image/png")
        response["Content-Disposition"] = (
            f'attachment; filename="kccc-atlas-{variable}-{year}.png"'
        )
        return response

    except Exception as err:
        logger.exception("atlas_export failed for url=%s", url)
        detail = str(err) if settings.DEBUG else "Export failed. Please try again."
        return Response({"error": detail}, status=500)
