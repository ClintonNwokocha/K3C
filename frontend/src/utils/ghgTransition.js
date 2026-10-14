import { availableNumber, SECTOR_LABELS } from "../decision-support/climateRecommendations.js";

export const SECTOR_INTERVENTIONS = {
  energy: ["Renewables / solar", "Mini-grids", "Clean cooking", "Energy efficiency", "Efficient buildings", "Public / electric transport"],
  agriculture: ["Climate-smart agriculture", "Livestock / feed improvement", "Manure management", "Fertiliser efficiency", "Rice water management"],
  lulucf: ["Reforestation", "Afforestation", "Agroforestry", "Forest protection", "Landscape restoration"],
  waste: ["Landfill methane management", "Composting", "Organic waste diversion", "Recycling", "Wastewater treatment"],
  ippu: ["Industrial efficiency", "Cleaner production", "Material substitution", "Low-carbon process changes"],
};

/** All amounts are tCO2e. No inferred baseline, target, LGA allocation or project subtraction. */
export function buildSectorTransitionRows(ghg = {}) {
  if (ghg.scope && ghg.scope !== "statewide") ghg = {};
  return Object.entries(SECTOR_LABELS).map(([sector, label]) => {
    const row = (ghg.sector_breakdown || []).find((r) => r.sector === sector);
    const configured = (ghg.sector_transition || []).find((r) => r.sector === sector);
    // Legacy summary returns zero for absent sectors; the missing year means unavailable, not zero emissions.
    const latest = row?.year ? availableNumber(row.total_co2e) : null;
    const baseline = availableNumber(configured?.baseline_tco2e);
    const target = availableNumber(configured?.target_tco2e);
    const reductionGoal = baseline !== null && target !== null ? baseline - target : null;
    const change = latest !== null && baseline !== null ? latest - baseline : null;
    const progress = latest !== null && reductionGoal > 0 ? ((baseline - latest) / reductionGoal) * 100 : null;
    const history = (configured?.history || []).filter((r) => r.year && availableNumber(r.total_co2e) !== null).sort((a, b) => a.year - b.year);
    const delta = history.length > 1 ? Number(history.at(-1).total_co2e) - Number(history.at(-2).total_co2e) : null;
    return { sector, label, scope: "statewide", latest, year: row?.year ?? null, baseline, baselineYear: configured?.baseline_year ?? null, target, targetYear: configured?.target_year ?? null, change, progress, gap: latest !== null && target !== null ? Math.max(0, latest - target) : null, history, trend: delta === null ? "Not Available" : delta > 0 ? "Increasing" : delta < 0 ? "Decreasing" : "Unchanged", interventions: SECTOR_INTERVENTIONS[sector] };
  });
}

/** Public API's totals.by_sector_year is built before explorer filters, from approved records. */
export function transitionFromPublicInventory(data) {
  const totals = data?.totals?.by_sector_year || [];
  const histories = Object.keys(SECTOR_LABELS).map((sector) => ({ sector, history: totals.filter((r) => r.sector === sector && availableNumber(r.emissions_tco2e) !== null).map((r) => ({ year: r.reporting_year, total_co2e: Number(r.emissions_tco2e) })) }));
  return {
    sector_transition: histories,
    sector_breakdown: histories.map(({ sector, history }) => {
      const latest = [...history].sort((a, b) => a.year - b.year).at(-1);
      return { sector, year: latest?.year ?? null, total_co2e: latest?.total_co2e ?? null };
    }),
  };
}
