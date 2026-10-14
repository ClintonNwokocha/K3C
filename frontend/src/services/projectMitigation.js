import { availableNumber, SECTOR_LABELS } from "../decision-support/climateRecommendations.js";

export const NO_PROJECT_ASSESSMENT = "No project mitigation assessment available";

// Real contract: GET /api/portfolio/projects/ghg-summary/ (backend/projects/views.py::project_ghg_sector_summary).
const NUMERIC_FIELD_MAP = {
  expected_annual_tco2e: "expected_annual_impact_tco2e",
  verified_annual_tco2e: "verified_annual_impact_tco2e",
  reductions_avoided_tco2e: "expected_reduction_avoided_tco2e",
  removals_tco2e: "expected_removal_tco2e",
};

export function normalizeProjectMitigation(payload) {
  if (payload?.status !== "ok" || !Array.isArray(payload?.sectors)) {
    return {
      status: "unavailable",
      message: NO_PROJECT_ASSESSMENT,
      sectors: [],
    };
  }

  const sectors = payload.sectors
    .filter((row) => Object.hasOwn(SECTOR_LABELS, row.sector))
    .map((row) => {
      const projectCount = availableNumber(row.project_count);
      const unassessedCount = availableNumber(row.unassessed_impact_project_count);

      const contributingProjects =
        projectCount !== null && Number.isInteger(projectCount)
          ? Math.max(
              0,
              projectCount -
                (Number.isInteger(unassessedCount) ? unassessedCount : 0)
            )
          : null;

      return {
        sector: row.sector,

        // Backend does not return per-project IDs for this rollup.
        contributing_project_ids: [],

        contributing_projects: contributingProjects,

        ...Object.fromEntries(
          Object.entries(NUMERIC_FIELD_MAP).map(
            ([outputField, sourceField]) => {
              const n = availableNumber(row[sourceField]);
              return [outputField, n !== null && n >= 0 ? n : null];
            }
          )
        ),
      };
    });

  const assessed = sectors.some((row) =>
    Object.keys(NUMERIC_FIELD_MAP).some(
      (field) => row[field] !== null
    )
  );

  return {
    status: assessed ? "available" : "unavailable",
    message: assessed
      ? "Annual project assessments; estimates and verified impacts are shown separately."
      : NO_PROJECT_ASSESSMENT,
    sectors,
  };
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
