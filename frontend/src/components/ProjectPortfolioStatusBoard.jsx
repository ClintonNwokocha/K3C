const statusColumns = [
  {
    key: "proposed",
    label: "Proposed",
    description: "Ideas and early-stage project concepts.",
  },
  {
    key: "planned",
    label: "Planned",
    description: "Approved or designed projects awaiting implementation.",
  },
  {
    key: "ongoing",
    label: "Ongoing",
    description: "Projects currently under implementation.",
  },
  {
    key: "completed",
    label: "Completed",
    description: "Projects that have been fully implemented.",
  },
  {
    key: "suspended",
    label: "Suspended",
    description: "Paused projects requiring review or restart decision.",
  },
  {
    key: "cancelled",
    label: "Cancelled",
    description: "Projects that will no longer proceed.",
  },
];

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function formatMoney(value) {
  return `₦${formatNumber(value, 2)}`;
}

function getStatusHeaderClass(status) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "ongoing") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "planned") return "border-indigo-200 bg-indigo-50 text-indigo-800";
  if (status === "proposed") return "border-slate-200 bg-slate-50 text-slate-800";
  if (status === "suspended") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
}

function getPriorityClass(priority) {
  if (priority === "very_high") return "bg-red-50 text-red-700";
  if (priority === "high") return "bg-orange-50 text-orange-700";
  if (priority === "medium") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildStatusGroups(projects) {
  const groups = statusColumns.reduce((result, column) => {
    result[column.key] = [];
    return result;
  }, {});

  projects.forEach((project) => {
    const status = project.status || "proposed";

    if (!groups[status]) {
      groups[status] = [];
    }

    groups[status].push(project);
  });

  return groups;
}

function getColumnSummary(projects) {
  return {
    count: projects.length,
    budget: projects.reduce(
      (sum, project) => sum + Number(project.estimated_budget_naira || 0),
      0
    ),
    ghgReduction: projects.reduce(
      (sum, project) =>
        sum + Number(project.expected_ghg_reduction_tco2e || 0),
      0
    ),
    beneficiaries: projects.reduce(
      (sum, project) => sum + Number(project.expected_beneficiaries || 0),
      0
    ),
  };
}

export default function ProjectPortfolioStatusBoard({
  projects = [],
  canManage = false,
  onViewProject,
  onEditProject,
}) {
  const groups = buildStatusGroups(projects);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <p className="text-sm font-medium text-emerald-700">
          Project Status Board
        </p>
        <h2 className="mt-1 text-2xl font-bold">
          Portfolio Implementation Board
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          View projects by implementation status. This helps track movement
          from proposed concepts to completed climate actions.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-3 2xl:grid-cols-6">
        {statusColumns.map((column) => {
          const columnProjects = groups[column.key] || [];
          const summary = getColumnSummary(columnProjects);

          return (
            <div
              key={column.key}
              className="min-h-[320px] rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div
                className={`rounded-xl border p-4 ${getStatusHeaderClass(
                  column.key
                )}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{column.label}</h3>
                    <p className="mt-1 text-xs opacity-80">
                      {column.description}
                    </p>
                  </div>

                  <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold">
                    {summary.count}
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-2 rounded-xl bg-white p-3 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Budget</span>
                  <span className="font-semibold">
                    {formatMoney(summary.budget)}
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">GHG</span>
                  <span className="font-semibold">
                    {formatNumber(summary.ghgReduction, 3)} tCO₂e
                  </span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Beneficiaries</span>
                  <span className="font-semibold">
                    {formatNumber(summary.beneficiaries, 0)}
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {columnProjects.map((project) => (
                  <div
                    key={project.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold leading-snug">
                          {project.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {project.project_code || "No code"}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${getPriorityClass(
                          project.priority
                        )}`}
                      >
                        {project.priority_display || titleCase(project.priority)}
                      </span>
                    </div>

                    <div className="mt-3 space-y-2 text-xs text-slate-600">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">LGA</span>
                        <span className="font-medium text-right">
                          {project.lga_name || "Statewide"}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">Sector</span>
                        <span className="font-medium text-right">
                          {project.sector_display || titleCase(project.sector)}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">Budget</span>
                        <span className="font-medium text-right">
                          {formatMoney(project.estimated_budget_naira)}
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">GHG</span>
                        <span className="font-medium text-right">
                          {formatNumber(
                            project.expected_ghg_reduction_tco2e,
                            3
                          )}{" "}
                          tCO₂e
                        </span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">Beneficiaries</span>
                        <span className="font-medium text-right">
                          {formatNumber(project.expected_beneficiaries, 0)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onViewProject?.(project)}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        View
                      </button>

                      {canManage && (
                        <button
                          type="button"
                          onClick={() => onEditProject?.(project)}
                          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {columnProjects.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-400">
                    No {column.label.toLowerCase()} projects.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}