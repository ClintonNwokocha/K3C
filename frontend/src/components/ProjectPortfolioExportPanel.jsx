function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function escapeCsvValue(value) {
  const text = String(value ?? "");

  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function downloadCsv(filename, rows) {
  const csvContent = rows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(","))
    .join("\n");

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function buildProjectRows(projects) {
  return [
    [
      "Project ID",
      "Project Code",
      "Title",
      "Project Type",
      "Sector",
      "Status",
      "Priority",
      "LGA",
      "Implementing Agency",
      "Funding Source",
      "Estimated Budget Naira",
      "Expected GHG Reduction tCO2e",
      "Expected Beneficiaries",
      "Start Date",
      "End Date",
      "Climate Risk Relevance",
      "Location Notes",
      "Created At",
      "Updated At",
    ],
    ...projects.map((project) => [
      project.id,
      project.project_code || "",
      project.title || "",
      project.project_type_display || project.project_type || "",
      project.sector_display || project.sector || "",
      project.status_display || project.status || "",
      project.priority_display || project.priority || "",
      project.lga_name || "Statewide / Not specified",
      project.implementing_agency || "",
      project.funding_source || "",
      project.estimated_budget_naira || 0,
      project.expected_ghg_reduction_tco2e || 0,
      project.expected_beneficiaries || 0,
      project.start_date || "",
      project.end_date || "",
      project.climate_risk_relevance || "",
      project.location_notes || "",
      project.created_at || "",
      project.updated_at || "",
    ]),
  ];
}

function buildSummaryRows(projects, summary) {
  const byStatus = summary?.by_status || {};
  const byType = summary?.by_type || {};

  return [
    ["Metric", "Value"],
    ["Total Projects", summary?.total_projects || projects.length],
    ["Total Budget Naira", summary?.total_budget_naira || 0],
    [
      "Total Expected GHG Reduction tCO2e",
      summary?.total_expected_ghg_reduction_tco2e || 0,
    ],
    [
      "Total Expected Beneficiaries",
      summary?.total_expected_beneficiaries || 0,
    ],
    ["Adaptation Projects", byType.adaptation || 0],
    ["Mitigation Projects", byType.mitigation || 0],
    ["Cross-cutting Projects", byType.cross_cutting || 0],
    ["Proposed Projects", byStatus.proposed || 0],
    ["Planned Projects", byStatus.planned || 0],
    ["Ongoing Projects", byStatus.ongoing || 0],
    ["Completed Projects", byStatus.completed || 0],
    ["Suspended Projects", byStatus.suspended || 0],
    ["Cancelled Projects", byStatus.cancelled || 0],
  ];
}

function getTimestamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

export default function ProjectPortfolioExportPanel({
  projects = [],
  filteredProjects = [],
  summary = {},
}) {
  function exportFilteredProjects() {
    downloadCsv(
      `project_portfolio_filtered_${getTimestamp()}.csv`,
      buildProjectRows(filteredProjects)
    );
  }

  function exportAllLoadedProjects() {
    downloadCsv(
      `project_portfolio_all_loaded_${getTimestamp()}.csv`,
      buildProjectRows(projects)
    );
  }

  function exportSummary() {
    downloadCsv(
      `project_portfolio_summary_${getTimestamp()}.csv`,
      buildSummaryRows(projects, summary)
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            Export Readiness
          </p>
          <h2 className="mt-1 text-lg font-bold">
            Project Portfolio CSV Exports
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Export filtered projects, all loaded projects, or a summary table
            for reporting, Excel analysis, and briefing preparation.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={exportFilteredProjects}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Export Filtered Projects
          </button>

          <button
            type="button"
            onClick={exportAllLoadedProjects}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export All Loaded
          </button>

          <button
            type="button"
            onClick={exportSummary}
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
          >
            Export Summary
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">Filtered Projects</p>
          <p className="mt-2 text-2xl font-bold">{filteredProjects.length}</p>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">All Loaded Projects</p>
          <p className="mt-2 text-2xl font-bold">{projects.length}</p>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">Filtered Budget Preview</p>
          <p className="mt-2 text-2xl font-bold">
            ₦
            {formatNumber(
              filteredProjects.reduce(
                (sum, project) =>
                  sum + Number(project.estimated_budget_naira || 0),
                0
              ),
              2
            )}
          </p>
        </div>
      </div>
    </section>
  );
}