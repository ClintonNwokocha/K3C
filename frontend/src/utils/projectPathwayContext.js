import { SECTOR_LABELS } from "../decision-support/climateRecommendations.js";

/** Read planning context without creating a record or inventing an LGA registry ID. */
export function readProjectPathwayContext(search) {
  const params = new URLSearchParams(search);
  return {
    lga: params.get("lga") || "",
    sector: Object.hasOwn(SECTOR_LABELS, params.get("sector")) ? params.get("sector") : "",
    projectType: ["adaptation", "mitigation", "cross_cutting"].includes(params.get("project_type")) ? params.get("project_type") : "",
    suggestedProjectType: params.get("suggested_project_type") || "",
    recommendation: params.get("recommendation") || "",
    indicator: params.get("indicator") || "", year: params.get("year") || "", period: params.get("period") || "", season: params.get("season") || "",
    register: params.get("tab") === "form",
    contributingOnly: params.get("mitigation") === "assessed",
    projectIds: (params.get("project_ids") || "").split(",").filter((id) => /^\d+$/.test(id)),
  };
}

export function matchesContributingProject(project, context) {
  return !context.contributingOnly || context.projectIds.includes(String(project.id));
}
