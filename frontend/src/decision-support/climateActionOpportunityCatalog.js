// Climate Action Opportunity catalog — pure, static lookup only.
//
// Maps pathway IDs already produced by climatePathways.js's
// deriveActionPathwaysCore() to integration metadata (project category,
// relevant GHG sector, GHG relationship). It does not score, classify,
// trigger, or recompute anything — all risk/evidence/confidence/readiness
// logic remains owned by climatePathways.js and climateActionSignal.js.
//
// Pathway IDs below are verified against the current source of
// frontend/src/utils/climatePathways.js (deriveActionPathwaysCore): drought_ag,
// ecosystem, water_drainage, heat_green, no_signal. If that file adds or
// renames a pathway id, this catalog must be updated to match — never guess.
//
// ghgSectors uses the exact sector codes shared by both ClimateProject.Sector
// and GHGInventoryEntry.Sector (backend/projects/models.py,
// backend/ghg/models.py): energy, agriculture, waste, ippu, lulucf. Where no
// defensible mapping exists (pure adaptation, no mitigation co-benefit),
// ghgSectors is [] and ghgRelationship is null — never forced.

export const OPPORTUNITY_CATALOG = {
  drought_ag: {
    category: "Agriculture / Land",
    ghgSectors: ["agriculture"],
    ghgRelationship:
      "Some climate-smart agriculture and agroforestry interventions may reduce or avoid agricultural emissions while improving drought resilience. Actual mitigation impact depends on intervention design and baseline conditions.",
    hasMitigationBenefit: true,
    exampleInterventions: [
      "Climate-smart agriculture programmes",
      "Water-conservation and management",
      "Agroforestry",
    ],
  },
  ecosystem: {
    category: "Nature-Based Solutions",
    ghgSectors: ["lulucf"],
    ghgRelationship:
      "Restoration and revegetation can increase carbon sequestration and may contribute to LULUCF mitigation, subject to project design and accounting.",
    hasMitigationBenefit: true,
    exampleInterventions: [
      "Restoration and afforestation suitability screening",
      "Revegetation",
    ],
  },
  water_drainage: {
    category: "Flood / Water",
    ghgSectors: [],
    ghgRelationship: null,
    hasMitigationBenefit: false,
    exampleInterventions: [
      "Drainage and culvert infrastructure review",
      "Infrastructure-maintenance field assessment",
    ],
  },
  heat_green: {
    category: "Urban Resilience",
    ghgSectors: [],
    ghgRelationship: null,
    hasMitigationBenefit: false,
    exampleInterventions: [
      "Urban shade and tree-canopy planning",
      "Cooling infrastructure review",
    ],
  },
  no_signal: {
    category: null,
    ghgSectors: [],
    ghgRelationship: null,
    hasMitigationBenefit: false,
    exampleInterventions: [],
  },
};

export function getOpportunityForPathway(pathwayId) {
  return OPPORTUNITY_CATALOG[pathwayId] || null;
}
