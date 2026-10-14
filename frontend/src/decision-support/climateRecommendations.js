import { deriveActionPathwaysCore } from "../utils/climatePathways.js";
import { classifyNdvi, classifyRainfallAnomaly, classifySpi, classifyLst } from "./climateActionSignal.js";

export const SECTOR_LABELS = { energy: "Energy", agriculture: "Agriculture", lulucf: "LULUCF", ippu: "IPPU", waste: "Waste" };

const RULES = {
  drought_ag: {
    projectType: "Climate Adaptation", sectors: ["agriculture"],
    interventions: ["Water harvesting", "Irrigation with sustainable water sourcing", "Drought-resilient agriculture", "Soil moisture conservation"],
    mitigation: "Not assessed; agricultural mitigation depends on project practices, energy use and a measured baseline.",
  },
  ecosystem: {
    projectType: "Nature-Based Solutions & Ecosystem Restoration", sectors: ["lulucf"],
    interventions: ["Agroforestry", "Reforestation where ecologically appropriate", "Landscape restoration", "Erosion and soil restoration"],
    mitigation: "Potential carbon removals; requires land-use baseline, permanence, leakage and carbon accounting.",
  },
  heat_green: {
    projectType: "Climate Adaptation & Mitigation", sectors: ["energy", "lulucf"],
    interventions: ["Urban greening", "Shade and tree planting", "Energy-efficient buildings", "Cool roofs"],
    mitigation: "Potential Energy savings or LULUCF removals, depending on design; neither is quantified by LST.",
  },
  water_drainage: {
    projectType: "Climate Resilience & Disaster Risk Reduction", sectors: [],
    interventions: ["Drainage review", "Watershed management", "Retention and water storage", "Flood preparedness"],
    mitigation: "Not Assessed; no mitigation evidence is supplied by this water or rainfall signal.",
  },
};

export function availableNumber(value) {
  return value !== null && value !== undefined && value !== "" && typeof value !== "boolean" && Number.isFinite(Number(value)) ? Number(value) : null;
}

/** Recommendation labels are display context; only these legacy codes may be stored. */
export function storedProjectTypeForRecommendation(label) {
  if (label === "Climate Adaptation") return "adaptation";
  if (label === "Climate Mitigation") return "mitigation";
  return "cross_cutting";
}

/** Convert an existing pathway to a suggested action, never a project record. */
export function recommendationFromPathway(pathway, context = {}) {
  const rule = RULES[pathway.id];
  if (!rule) return null;
  // The legacy pathway engine also screens restoration from a dry anomaly.
  // Restoration recommendations require actual vegetation evidence here.
  if (pathway.id === "ecosystem" && !pathway.triggers?.some((t) => /NDVI|vegetation condition/i.test(t))) return null;
  const severe = /severe|extreme/i.test(context.severity || pathway.triggers?.join(" ") || "");
  return {
    id: pathway.id, title: pathway.theme, rationale: pathway.triggers?.join("; ") || pathway.actionConsideration,
    priority: severe ? "High" : "Planning review",
    priorityBasis: severe ? "Existing severe/extreme classification; verify local exposure before prioritising investment." : "Screening evidence only; local exposure and feasibility are unverified.",
    suggestedProjectType: rule.projectType, projectTypeCode: storedProjectTypeForRecommendation(rule.projectType),
    suggestedGhgSectors: rule.sectors, suggestedGhgSector: rule.sectors.map((s) => SECTOR_LABELS[s]).join(" / ") || "Not Assessed",
    adaptationRelevance: pathway.actionConsideration, mitigationRelevance: rule.mitigation,
    limitations: [pathway.scientificCaution, "Suggested action only; not an approved intervention or registered project. No emissions impact has been estimated."],
    interventions: rule.interventions, context,
  };
}

/** Existing classifier bands and pathway explanations; only available selected metrics trigger rules. */
export function recommendClimateActions({ indicator, classification, severity, lga, adminCode, year, period, season, metrics = {} }) {
  const aliases = { drought: "spi", drought_index: "spi", vegetation: "ndvi", temperature: "lst" };
  const key = aliases[indicator] || indicator;
  const context = { indicator, severity, lga, adminCode, year, period, season };
  const metric = metrics[key];
  const value = availableNumber(metric?.value ?? metric);
  if (value === null) return [];
  const condition = classification || metric?.condition;
  let pathways = [];
  if (key === "spi") pathways = deriveActionPathwaysCore({ spiCond: condition || classifySpi(value), spiValue: value });
  if (key === "rainfall_anomaly") {
    pathways = deriveActionPathwaysCore({ raCond: condition || classifyRainfallAnomaly(value), raValue: value }).filter((p) => p.id === "drought_ag");
  }
  if (key === "ndvi") pathways = deriveActionPathwaysCore({ ndviCond: condition || classifyNdvi(value), ndviValue: value });
  if (key === "lst") pathways = deriveActionPathwaysCore({ lstCond: condition || classifyLst(value), lstValue: value });
  if (key === "flood") pathways = deriveActionPathwaysCore({ floodMean: value });
  // A wet anomaly or a large rainfall total alone is not a flood hazard. Require a supplied flood classification.
  if (key === "rainfall" && /^(high flood risk|very high flood risk|flood signal)$/i.test(condition || "")) {
    pathways = [{ id: "water_drainage", theme: "Rainfall and Flood Preparedness Review", triggers: [`Rainfall ${value} mm; supplied classification: ${condition}`], actionConsideration: "Review drainage, storage and emergency preparedness with local flood evidence.", scientificCaution: "Rainfall totals alone cannot establish flooding. Validate drainage, terrain, exposure and the source of the flood classification." }];
  }
  return pathways.map((p) => recommendationFromPathway(p, context)).filter(Boolean);
}

/** LGA stays planning context; it is never sent as an inventory geography filter. */
export function buildActionLinks(action) {
  const c = action.context || {};
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ lga: c.lga, admin_code: c.adminCode, indicator: c.indicator, year: c.year, period: c.period, season: c.season, recommendation: action.id, suggested_project_type: action.suggestedProjectType, project_type: storedProjectTypeForRecommendation(action.suggestedProjectType) })) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const sector = action.suggestedGhgSectors[0];
  if (sector) params.set("sector", sector);
  const ghg = new URLSearchParams({ ...(sector ? { sector } : {}), ...(c.lga ? { from_lga: c.lga } : {}), recommendation: action.id });
  return { projects: `/public/projects?${params}`, register: `/?page=projects&tab=form&${params}`, ghg: `/public/ghg-inventory?${ghg}` };
}
