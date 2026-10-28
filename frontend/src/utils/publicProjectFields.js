// Shared field getters/formatters for public project data, used by both
// PublicProjectsPage (directory) and PublicProjectDetailPage (full page) so
// the two views never silently disagree about field names or fabricate
// values the public API does not actually return.

export function hasValidNumber(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

export function formatNumber(value, maximumFractionDigits = 2) {
  if (!hasValidNumber(value)) return "—";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits });
}

export function formatCompactNumber(value) {
  if (!hasValidNumber(value)) return "—";
  const number = Number(value);
  if (number >= 1_000_000) return `${formatNumber(number / 1_000_000, 2)}M`;
  if (number >= 1_000) return `${formatNumber(number / 1_000, 1)}K`;
  return formatNumber(number, 0);
}

// Compact Naira formatter for KPI/summary display only. Returns null (never
// a fabricated "₦0") when the value is not a valid number — callers must
// render "Not available" for that case themselves.
export function formatNaira(value) {
  if (!hasValidNumber(value)) return null;
  const number = Number(value);
  if (number >= 1_000_000_000) return `₦${formatNumber(number / 1_000_000_000, 1)}B`;
  if (number >= 1_000_000) return `₦${formatNumber(number / 1_000_000, 1)}M`;
  if (number >= 1_000) return `₦${formatNumber(number / 1_000, 1)}K`;
  return `₦${formatNumber(number, 0)}`;
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

export function getProjectSector(project) {
  return (
    project.sector_display ||
    project.sector_name ||
    project.sector ||
    "Not specified"
  );
}

export function getProjectStatus(project) {
  return project.status_display || titleCase(project.status) || "Not specified";
}

export function getProjectStatusKey(project) {
  const status = String(project.status || project.status_display || "")
    .toLowerCase()
    .trim();
  if (status.includes("completed")) return "completed";
  if (status.includes("ongoing") || status.includes("active")) return "ongoing";
  if (status.includes("proposed") || status.includes("planned")) return "proposed";
  return "other";
}

export function getProjectLga(project) {
  return project.lga_name || project.lga || "Statewide";
}

export function getProjectFundingSource(project) {
  return project.funding_source || "Not specified";
}

export function getProjectImplementingMda(project) {
  return project.implementing_agency || "Not specified";
}

export function getProjectExternalLink(project) {
  const link = String(project.external_link || "").trim();
  return link || null;
}

export function getProjectReduction(project) {
  // null (not 0) when the field is genuinely absent — formatNumber() already
  // renders null/undefined as "—" rather than a fabricated zero impact.
  if (hasValidNumber(project.expected_ghg_reduction_tco2e)) return project.expected_ghg_reduction_tco2e;
  if (hasValidNumber(project.estimated_ghg_reduction_tco2e)) return project.estimated_ghg_reduction_tco2e;
  if (hasValidNumber(project.ghg_reduction_tco2e)) return project.ghg_reduction_tco2e;
  return null;
}

// null (not 0) when the field is genuinely absent — never fabricates a
// beneficiary count the public dataset does not actually report.
export function getProjectBeneficiaries(project) {
  if (hasValidNumber(project.expected_beneficiaries)) return project.expected_beneficiaries;
  if (hasValidNumber(project.beneficiaries)) return project.beneficiaries;
  if (hasValidNumber(project.total_beneficiaries)) return project.total_beneficiaries;
  return null;
}

// The public project API does not currently expose a financial/value field
// (see PublicProjectsPage's aboutDataItems "Why are financial values not
// shown?"). This checks the field names a future API change might use, but
// returns null (never a fabricated amount) when none are present — callers
// must render "Not available" for that case themselves, never an invented
// ₦ figure.
export function getProjectValue(project) {
  if (hasValidNumber(project.estimated_budget_naira)) return project.estimated_budget_naira;
  if (hasValidNumber(project.project_value_naira)) return project.project_value_naira;
  if (hasValidNumber(project.total_project_value_naira)) return project.total_project_value_naira;
  if (hasValidNumber(project.budget_naira)) return project.budget_naira;
  return null;
}

export function getProjectSummary(project) {
  return (
    project.public_summary ||
    project.summary ||
    project.climate_risk_relevance ||
    "Public summary for this project is being prepared."
  );
}

export function getProjectDescription(project) {
  return (
    project.public_description ||
    project.public_summary ||
    project.summary ||
    project.climate_risk_relevance ||
    "Detailed public description for this project is being prepared."
  );
}

export function getProjectPeriod(project) {
  const start = project.start_date || project.implementation_start;
  const end = project.end_date || project.implementation_end;
  if (!start && !end) return null;
  if (start && end) return `${start} – ${end}`;
  return start || end;
}

export function getStatusMeta(statusKey) {
  const meta = {
    ongoing: {
      label: "Ongoing",
      dot: "#030454",
      badge: "bg-[#030454]/10 text-[#030454]",
      title: "Ongoing Projects",
      description: "Projects currently under implementation.",
    },
    completed: {
      label: "Completed",
      dot: "#009B35",
      badge: "bg-[#009B35]/10 text-[#009B35]",
      title: "Completed Projects",
      description: "Projects reported as completed.",
    },
    proposed: {
      label: "Proposed",
      dot: "#F3B91E",
      badge: "bg-[#F3F74B]/35 text-[#030454]",
      title: "Proposed Projects",
      description: "Projects proposed or planned for implementation.",
    },
    other: {
      label: "Other",
      dot: "#64748B",
      badge: "bg-slate-100 text-slate-600",
      title: "Other Projects",
      description: "Projects with other implementation statuses.",
    },
  };
  return meta[statusKey] || meta.other;
}
