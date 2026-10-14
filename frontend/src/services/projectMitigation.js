import { availableNumber, SECTOR_LABELS } from "../decision-support/climateRecommendations.js";

export const NO_PROJECT_ASSESSMENT = "No project mitigation assessment available";
const FIELDS = ["contributing_projects", "expected_annual_tco2e", "verified_annual_tco2e", "reductions_avoided_tco2e", "removals_tco2e"];

/** Explicit v1 contract: annual impacts in tCO2e, statewide, no inventory arithmetic. */
export function normalizeProjectMitigation(payload) {
  if (payload?.scope !== "statewide" || payload?.unit !== "tCO2e/year" || !Array.isArray(payload?.sectors)) {
    return { status: "unavailable", message: NO_PROJECT_ASSESSMENT, sectors: [] };
  }
  const sectors = payload.sectors.filter((row) => Object.hasOwn(SECTOR_LABELS, row.sector)).map((row) => ({
    sector: row.sector,
    contributing_project_ids: Array.isArray(row.contributing_project_ids) ? row.contributing_project_ids.filter((id) => Number.isSafeInteger(id) && id > 0) : [],
    ...Object.fromEntries(FIELDS.map((field) => {
      const n = availableNumber(row[field]);
      return [field, n !== null && n >= 0 && (field !== "contributing_projects" || Number.isInteger(n)) ? n : null];
    })),
  }));
  const assessed = sectors.some((row) => FIELDS.slice(1).some((field) => row[field] !== null));
  return { status: assessed ? "available" : "unavailable", message: assessed ? "Annual project assessments; estimates and verified impacts are shown separately." : NO_PROJECT_ASSESSMENT, sectors };
}

/** Injected request keeps the pending Projects API integration isolated and testable.
 * No request is made until an endpoint is configured. Public UI never calls the staff endpoint.
 */
export async function fetchProjectMitigationSummary({ endpoint, request }) {
  if (!endpoint) return normalizeProjectMitigation(null);
  if (!endpoint.startsWith("/") || endpoint.startsWith("//")) return { ...normalizeProjectMitigation(null), reason: "Configure an API-relative endpoint" };
  try {
    const response = await request(endpoint);
    return normalizeProjectMitigation(response.data);
  } catch (error) {
    const status = error.response?.status;
    return { status: "unavailable", sectors: [], message: NO_PROJECT_ASSESSMENT, reason: status === 404 || status === 501 ? "Endpoint not available" : "Could not load project assessments" };
  }
}
