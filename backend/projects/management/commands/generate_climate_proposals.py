"""Create "Proposed" projects from the Climate Risk profiles and the GHG inventory.

Risk-based proposals: one per high-risk LGA, for that LGA's strongest hazard
(flood, drought, heat or erosion). The matching climate-action opportunity
(category, example interventions, GHG relationship) comes from the same
catalog the Climate Intelligence page uses.

GHG-based proposals: one statewide mitigation proposal for each of the largest
inventory sectors in the latest approved year.

Safe to re-run (it is scheduled daily): a proposal is identified by its project_code.
While it is untouched by staff it is refreshed from the latest data; once staff edit it
(or change its status) it is left alone. Budget and GHG impact are never filled in. Exposure is not used because every stored exposure_score is 0.
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum

from climate_risk.models import ClimateRiskProfile
from ghg.models import GHGInventoryEntry
from ghg.preview_dataset import PREVIEW_BATCH_ID
from projects.models import ClimateProject

P = ClimateProject

# hazard -> (opportunity pathway, project sector, title, interventions, GHG relationship)
HAZARDS = {
    "flood": {
        "category": "Flood / Water",
        "sector": P.Sector.WATER,
        "title": "Flood resilience and drainage",
        "interventions": ["Drainage and culvert infrastructure review", "Infrastructure-maintenance field assessment"],
        "ghg_sector": None,
    },
    "drought": {
        "category": "Agriculture / Land",
        "sector": P.Sector.AGRICULTURE,
        "title": "Drought-resilient agriculture",
        "interventions": ["Climate-smart agriculture programmes", "Water-conservation and management", "Agroforestry"],
        "ghg_sector": P.GHGSector.AGRICULTURE,
    },
    "heat": {
        "category": "Urban Resilience",
        "sector": P.Sector.INFRASTRUCTURE,
        "title": "Urban heat resilience",
        "interventions": ["Urban shade and tree-canopy planning", "Cooling infrastructure review"],
        "ghg_sector": P.GHGSector.ENERGY,
    },
    "erosion": {
        "category": "Nature-Based Solutions",
        "sector": P.Sector.LULUCF,
        "title": "Erosion control and ecosystem restoration",
        "interventions": ["Restoration and afforestation suitability screening", "Revegetation"],
        "ghg_sector": P.GHGSector.LULUCF,
    },
}

GHG_SECTORS = {
    "energy": ("Energy", P.Sector.ENERGY, P.GHGSector.ENERGY, "Renewable energy, energy efficiency and clean cooking options"),
    "agriculture": ("Agriculture", P.Sector.AGRICULTURE, P.GHGSector.AGRICULTURE, "Climate-smart agriculture and livestock/manure management options"),
    "ippu": ("Industrial processes (IPPU)", P.Sector.IPPU, P.GHGSector.IPPU, "Industrial process and product-use emission reduction options"),
    "lulucf": ("Land use and forestry (LULUCF)", P.Sector.LULUCF, P.GHGSector.LULUCF, "Afforestation, restoration and forest protection options"),
    "waste": ("Waste", P.Sector.WASTE, P.GHGSector.WASTE, "Waste collection, recycling and methane capture options"),
}

DISCLAIMER = (
    "This is a proposed concept generated from KCCC climate data for discussion. "
    "It is not an approved, funded or registered project, and no budget or emissions impact has been estimated."
)


def strongest_hazard(profile):
    scores = {
        "flood": profile.flood_risk_score,
        "drought": profile.drought_risk_score,
        "heat": profile.heat_risk_score,
        "erosion": profile.erosion_risk_score,
    }
    key = max(scores, key=lambda k: scores[k] or Decimal("0"))
    return (key, scores[key]) if (scores[key] or 0) > 0 else (None, None)


def risk_proposal(profile):
    hazard, score = strongest_hazard(profile)
    if hazard is None:
        return None
    h = HAZARDS[hazard]
    lga = profile.lga.lga_name
    seed = "seed" in (profile.data_source or "").lower() or "test" in (profile.data_source or "").lower()
    basis = (
        f"{lga} 2025 climate risk profile: overall {profile.overall_risk_score} ({profile.get_risk_level_display()}); "
        f"{hazard} risk score {score}. Data source: {profile.data_source}"
        + (" (development/test data, not yet validated)." if seed else ".")
    )
    ghg = h["ghg_sector"]
    return {
        "project_code": f"PROP-RISK-{profile.lga_id}-{hazard}-{profile.year}",
        "title": f"{lga}: {h['title']}",
        "project_type": P.ProjectType.CROSS_CUTTING if ghg else P.ProjectType.ADAPTATION,
        "sector": h["sector"],
        "priority": P.Priority.VERY_HIGH if profile.risk_level == "very_high" else P.Priority.HIGH,
        "lga": profile.lga,
        "public_summary": f"Proposed {h['category'].lower()} concept for {lga}, responding to a high {hazard} risk score.",
        "public_description": f"{basis}\n\nExample interventions to consider: {'; '.join(h['interventions'])}.\n\n{DISCLAIMER}",
        "description": basis,
        "climate_risk_relevance": basis,
        "climate_action_context": f"{h['category']} opportunity: {'; '.join(h['interventions'])}.",
        "primary_ghg_sector": ghg or P.GHGSector.NOT_ASSESSED,
    }


def ghg_proposal(sector, tonnes, year, preview):
    label, psector, ghg_sector, options = GHG_SECTORS[sector]
    basis = (
        f"GHG inventory {year}: {label} is one of the largest sectors at about {tonnes:,.0f} tCO2e statewide."
        + (" The inventory currently includes the temporary preview batch and is not the official inventory." if preview else "")
    )
    return {
        "project_code": f"PROP-GHG-{sector}-{year}",
        "title": f"Statewide {label} mitigation programme",
        "project_type": P.ProjectType.MITIGATION,
        "sector": psector,
        "priority": P.Priority.MEDIUM,
        "lga": None,
        "public_summary": f"Proposed statewide mitigation concept for the {label} sector, based on the GHG inventory.",
        "public_description": f"{basis}\n\nOptions to consider: {options}.\n\n{DISCLAIMER}",
        "description": basis,
        "climate_risk_relevance": "",
        "climate_action_context": basis,
        "primary_ghg_sector": ghg_sector,
    }


def staff_touched(project):
    """True if staff edited the project after the generator last wrote it."""
    return (
        project.auto_generated_at is None
        or project.status != P.Status.PROPOSED
        or project.updated_at > project.auto_generated_at
    )


class Command(BaseCommand):
    help = "Create Proposed projects from Climate Risk profiles and the GHG inventory (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Show what would be created; write nothing.")
        parser.add_argument("--risk-levels", nargs="+", default=["high", "very_high"], help="Risk levels that get a proposal.")
        parser.add_argument("--ghg-top", type=int, default=3, help="Number of largest GHG sectors that get a proposal.")

    def handle(self, *args, **opts):
        proposals = []

        profiles = (
            ClimateRiskProfile.objects.filter(is_active=True, risk_level__in=opts["risk_levels"])
            .select_related("lga").order_by("-year", "-overall_risk_score")
        )
        latest = profiles.first().year if profiles.exists() else None
        for profile in profiles.filter(year=latest) if latest else []:
            data = risk_proposal(profile)
            if data:
                proposals.append(data)

        year = GHGInventoryEntry.objects.filter(status=GHGInventoryEntry.Status.APPROVED).order_by("-year").values_list("year", flat=True).first()
        if year and opts["ghg_top"] > 0:
            entries = GHGInventoryEntry.objects.filter(status=GHGInventoryEntry.Status.APPROVED, year=year)
            preview = entries.filter(notes=PREVIEW_BATCH_ID).exists()
            totals = entries.values("sector").annotate(t=Sum("co2e_tonnes")).order_by("-t")[: opts["ghg_top"]]
            for row in totals:
                if row["sector"] in GHG_SECTORS and row["t"]:
                    proposals.append(ghg_proposal(row["sector"], row["t"], year, preview))

        created = refreshed = skipped = 0
        for data in proposals:
            project = ClimateProject.objects.filter(project_code=data["project_code"]).first()
            if project is None:
                action = "create "
                created += 1
                if not opts["dry_run"]:
                    new = ClimateProject.objects.create(status=P.Status.PROPOSED, is_active=True, **data)
                    ClimateProject.objects.filter(pk=new.pk).update(auto_generated_at=new.updated_at)
            elif staff_touched(project):
                action = "keep   "
                skipped += 1
            else:
                changed = [k for k, v in data.items() if getattr(project, k) != v]
                if not changed:
                    action = "same   "
                    skipped += 1
                else:
                    action = "refresh"
                    refreshed += 1
                    if not opts["dry_run"]:
                        for k, v in data.items():
                            setattr(project, k, v)
                        project.save()
                        # pin the marker to the save time so this write is not mistaken for a staff edit
                        ClimateProject.objects.filter(pk=project.pk).update(auto_generated_at=project.updated_at)
            self.stdout.write(f"  {action} {data['project_code']:<34} {data['title']}")
        verb = "DRY RUN: would create" if opts["dry_run"] else "Created"
        self.stdout.write(self.style.SUCCESS(f"{verb} {created}, refreshed {refreshed}, left alone {skipped}."))
