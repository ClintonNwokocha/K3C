import { strict as assert } from "node:assert";
import { test } from "node:test";
import { recommendClimateActions, buildActionLinks, recommendationFromPathway, storedProjectTypeForRecommendation } from "./climateRecommendations.js";
import { buildSectorTransitionRows, transitionFromPublicInventory } from "../utils/ghgTransition.js";
import { fetchProjectMitigationSummary, normalizeProjectMitigation, NO_PROJECT_ASSESSMENT } from "../services/projectMitigation.js";
import { readProjectPathwayContext, matchesContributingProject } from "../utils/projectPathwayContext.js";

const context = { lga: "Zaria", adminCode: "KD-ZAR", year: 2025, season: "wet_season", period: "Annual" };
const recommend = (indicator, value, extra = {}) => recommendClimateActions({ ...context, indicator, metrics: { [indicator]: { value } }, ...extra });

test("recommendation labels map only to existing stored project type codes", () => {
  assert.equal(storedProjectTypeForRecommendation("Climate Adaptation"), "adaptation");
  assert.equal(storedProjectTypeForRecommendation("Climate Mitigation"), "mitigation");
  for (const label of ["Adaptation & Mitigation", "Climate Adaptation & Mitigation", "Nature-Based Solutions & Ecosystem Restoration", "Climate Resilience & Disaster Risk Reduction", "Other combined intervention"]) {
    assert.equal(storedProjectTypeForRecommendation(label), "cross_cutting");
    const links = buildActionLinks({ id: "contract-check", suggestedProjectType: label, projectTypeCode: label, suggestedGhgSectors: [] });
    assert.equal(readProjectPathwayContext(new URL(links.register, "https://local.test").search).projectType, "cross_cutting");
  }
  assert.equal(readProjectPathwayContext("?project_type=Climate%20Adaptation").projectType, "");
  assert.equal(recommend("flood", 4)[0].projectTypeCode, "cross_cutting");
});

test("severe drought uses existing SPI threshold and recommends agricultural adaptation", () => {
  const [action] = recommend("spi", -1.8);
  assert.equal(action.id, "drought_ag");
  assert.equal(action.priority, "High");
  assert.equal(action.suggestedProjectType, "Climate Adaptation");
  assert.equal(action.suggestedGhgSector, "Agriculture");
  assert.equal(action.interventions.length, 4);
  assert.match(action.mitigationRelevance, /Not assessed/);
});
test("NDVI stress recommends restoration without claiming land suitability", () => {
  const [action] = recommend("ndvi", 0.2);
  assert.equal(action.id, "ecosystem");
  assert.equal(action.suggestedGhgSector, "LULUCF");
  assert.equal(action.suggestedProjectType, "Nature-Based Solutions & Ecosystem Restoration");
  assert.match(action.limitations.join(" "), /land.tenure/i);
});
test("high daytime LST suggests heat measures and conditional Energy / LULUCF benefits", () => {
  const [action] = recommend("lst", 39);
  assert.equal(action.id, "heat_green");
  assert.deepEqual(action.suggestedGhgSectors, ["energy", "lulucf"]);
  assert.equal(action.suggestedProjectType, "Climate Adaptation & Mitigation");
  assert.match(action.limitations.join(" "), /not equivalent to air temperature/i);
});
test("historical water/flood screening has GHG Not Assessed", () => {
  const [action] = recommend("flood", 4);
  assert.equal(action.id, "water_drainage");
  assert.equal(action.suggestedGhgSector, "Not Assessed");
  assert.deepEqual(action.suggestedGhgSectors, []);
  assert.match(action.limitations.join(" "), /not a flood forecast/);
});
test("rainfall flood classification needs a real metric and is pure adaptation", () => {
  assert.equal(recommend("rainfall", 1400).length, 0);
  const [action] = recommend("rainfall", 1400, { classification: "flood signal" });
  assert.equal(action.suggestedGhgSector, "Not Assessed");
  assert.match(action.limitations.join(" "), /totals alone cannot establish flooding/i);
});
test("anomaly direction is honest; wet and near-normal anomalies are not labelled hazards", () => {
  assert.equal(recommend("rainfall_anomaly", 25).length, 0);
  assert.equal(recommend("rainfall_anomaly", -8).length, 0);
  assert.deepEqual(recommend("rainfall_anomaly", -25).map((a) => a.id), ["drought_ag"]);
  assert.equal(recommend("spi", -0.5).length, 0);
  assert.equal(recommendationFromPathway({ id: "ecosystem", triggers: ["Rainfall anomaly: drier than baseline"] }), null);
});
test("missing, invalid, or unavailable selected metric cannot trigger recommendations", () => {
  for (const value of [null, undefined, "", NaN, Infinity]) assert.equal(recommend("ndvi", value).length, 0);
  assert.equal(recommendClimateActions({ indicator: "ndvi", classification: "sparse/stressed vegetation" }).length, 0);
  assert.equal(recommendClimateActions({ indicator: "ndvi", metrics: { spi: { value: -2 } } }).length, 0);
});
test("inventory scope stays statewide; absent sector values do not become fake zero LGA emissions", () => {
  const rows = buildSectorTransitionRows({ sector_breakdown: [{ sector: "energy", year: 2025, total_co2e: 100 }, { sector: "waste", year: null, total_co2e: 0 }], lga: "Zaria", lga_emissions: 123 });
  assert.equal(rows.length, 5);
  assert.ok(rows.every((row) => row.scope === "statewide" && !("lga_emissions" in row)));
  assert.equal(rows.find((r) => r.sector === "energy").latest, 100);
  assert.equal(rows.find((r) => r.sector === "waste").latest, null);
});
test("first year is not a baseline; missing targets and progress remain unavailable", () => {
  const [row] = buildSectorTransitionRows({ sector_breakdown: [{ sector: "energy", year: 2025, total_co2e: 80 }], sector_transition: [{ sector: "energy", history: [{ year: 2020, total_co2e: 100 }, { year: 2025, total_co2e: 80 }] }] });
  assert.equal(row.baseline, null); assert.equal(row.target, null);
  assert.equal(row.change, null); assert.equal(row.progress, null); assert.equal(row.gap, null);
  assert.equal(row.trend, "Decreasing");
});
test("explicit LGA inventory payload cannot be relabelled statewide", () => {
  const [row] = buildSectorTransitionRows({ scope: "lga", sector_breakdown: [{ sector: "energy", year: 2025, total_co2e: 123 }] });
  assert.equal(row.latest, null);
});
test("project adapter rejects invalid metrics, missing envelope fields, and external endpoint configuration", async () => {
  assert.equal(normalizeProjectMitigation(null).status, "unavailable");
  assert.equal(normalizeProjectMitigation({ sectors: [] }).status, "unavailable");
  assert.equal(normalizeProjectMitigation({ status: "ok" }).status, "unavailable");
  const invalid = normalizeProjectMitigation({
    status: "ok",
    sectors: [{ sector: "energy", project_count: 1.5, unassessed_impact_project_count: 0, expected_annual_impact_tco2e: -10, verified_annual_impact_tco2e: null }],
  });
  assert.equal(invalid.status, "unavailable");
  assert.equal(invalid.sectors[0].contributing_projects, null);
  assert.equal(invalid.sectors[0].expected_annual_tco2e, null);
  assert.equal(invalid.sectors[0].verified_annual_tco2e, null);
  assert.deepEqual(invalid.sectors[0].contributing_project_ids, []);
  let called = false;
  await fetchProjectMitigationSummary({ endpoint: "https://external.test/", request: async () => { called = true; } });
  assert.equal(called, false);
});
test("explicit baseline and target support transparent progress; zero emissions is valid", () => {
  const [row] = buildSectorTransitionRows({ sector_breakdown: [{ sector: "energy", year: 2025, total_co2e: 80 }], sector_transition: [{ sector: "energy", baseline_tco2e: 100, target_tco2e: 60 }] });
  assert.equal(row.change, -20); assert.equal(row.progress, 50); assert.equal(row.gap, 20);
  assert.equal(buildSectorTransitionRows({ sector_breakdown: [{ sector: "energy", year: 2025, total_co2e: 0 }] })[0].latest, 0);
});
test("public statewide progress uses unfiltered totals, not LGA chart or gas selections", () => {
  const data = transitionFromPublicInventory({ chart: { series: [{ key: "energy", values: [{ year: 2025, value: 999 }] }] }, totals: { by_sector_year: [{ sector: "energy", reporting_year: 2025, emissions_tco2e: 100 }] } });
  assert.equal(buildSectorTransitionRows(data)[0].latest, 100);
});
test("missing endpoint and 404 return an honest unavailable assessment, never invented impacts", async () => {
  let requested = false;
  const absent = await fetchProjectMitigationSummary({ request: async () => { requested = true; } });
  assert.equal(requested, false); assert.equal(absent.message, NO_PROJECT_ASSESSMENT);
  const missing = await fetchProjectMitigationSummary({ endpoint: "/pending/", request: async () => { throw { response: { status: 404 } }; } });
  assert.equal(missing.status, "unavailable"); assert.deepEqual(missing.sectors, []);
});
test("project summary derives contributing counts from real backend fields and keeps expected/verified separate", async () => {
  const payload = {
    status: "ok",
    sectors: [
      { sector: "energy", project_count: 5, unassessed_impact_project_count: 2, expected_annual_impact_tco2e: 10, verified_annual_impact_tco2e: 0, expected_reduction_avoided_tco2e: 8, expected_removal_tco2e: 2 },
      { sector: "agriculture", project_count: 1, unassessed_impact_project_count: 3, expected_annual_impact_tco2e: null, verified_annual_impact_tco2e: null },
    ],
  };
  const result = await fetchProjectMitigationSummary({ endpoint: "/summary/", request: async () => ({ data: payload }) });
  assert.equal(result.status, "available");
  const energy = result.sectors.find((s) => s.sector === "energy");
  assert.equal(energy.contributing_projects, 3);
  assert.equal(energy.expected_annual_tco2e, 10);
  assert.equal(energy.verified_annual_tco2e, 0);
  assert.equal(energy.reductions_avoided_tco2e, 8);
  assert.equal(energy.removals_tco2e, 2);
  assert.deepEqual(energy.contributing_project_ids, []);
  // unassessed_impact_project_count exceeding project_count must floor at 0, never go negative.
  const agriculture = result.sectors.find((s) => s.sector === "agriculture");
  assert.equal(agriculture.contributing_projects, 0);
  assert.equal(buildSectorTransitionRows({ sector_breakdown: [{ sector: "energy", year: 2025, total_co2e: 100 }], project_summary: payload })[0].latest, 100);
});
test("routing carries action context, never LGA inventory filters, and registration does not create a project", () => {
  const [action] = recommend("spi", -1.8);
  const links = buildActionLinks(action);
  const project = readProjectPathwayContext(new URL(links.register, "https://local.test").search);
  assert.equal(project.lga, "Zaria"); assert.equal(project.register, true);
  assert.equal(project.projectType, "adaptation"); assert.equal(project.year, "2025");
  assert.equal(project.season, "wet_season"); assert.equal(project.indicator, "spi");
  const ghg = new URL(links.ghg, "https://local.test").searchParams;
  assert.equal(ghg.get("from_lga"), "Zaria"); assert.equal(ghg.has("geography"), false); assert.equal(ghg.has("lga"), false);
});
test("contributing navigation only matches explicitly supplied real project IDs", () => {
  const c = readProjectPathwayContext("?sector=energy&mitigation=assessed&project_ids=1,2,invalid");
  assert.equal(matchesContributingProject({ id: 1 }, c), true);
  assert.equal(matchesContributingProject({ id: 3 }, c), false);
  assert.equal(matchesContributingProject({ id: 1 }, readProjectPathwayContext("?mitigation=assessed")), false);
});
