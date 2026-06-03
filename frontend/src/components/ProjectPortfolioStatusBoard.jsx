import { useMemo } from "react";

const statusColumns = [
  {
    key: "proposed",
    label: "Proposed",
    description: "Ideas and early-stage project concepts.",
    tone: "slate",
  },
  {
    key: "planned",
    label: "Planned",
    description: "Approved or designed projects awaiting implementation.",
    tone: "yellow",
  },
  {
    key: "ongoing",
    label: "Ongoing",
    description: "Projects currently under implementation.",
    tone: "blue",
  },
  {
    key: "completed",
    label: "Completed",
    description: "Projects that have been fully implemented.",
    tone: "green",
  },
  {
    key: "suspended",
    label: "Suspended",
    description: "Paused projects requiring review or restart decision.",
    tone: "amber",
  },
  {
    key: "cancelled",
    label: "Cancelled",
    description: "Projects that will no longer proceed.",
    tone: "red",
  },
];

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function formatMoney(value) {
  return `₦${formatNumber(value, 0)}`;
}

function getColumnTone(tone) {
  const styles = {
    slate: {
      column: "border-slate-200 bg-slate-50",
      header: "border-slate-200 bg-white",
      badge: "bg-slate-100 text-slate-700",
      accent: "bg-slate-400",
    },
    yellow: {
      column: "border-[#F3F74B]/70 bg-[#F3F74B]/15",
      header: "border-[#F3F74B]/70 bg-white",
      badge: "bg-[#F3F74B]/45 text-[#030454]",
      accent: "bg-[#F3F74B]",
    },
    blue: {
      column: "border-[#030454]/15 bg-[#030454]/5",
      header: "border-[#030454]/15 bg-white",
      badge: "bg-[#030454]/10 text-[#030454]",
      accent: "bg-[#030454]",
    },
    green: {
      column: "border-[#009B35]/20 bg-[#009B35]/8",
      header: "border-[#009B35]/20 bg-white",
      badge: "bg-[#009B35]/10 text-[#009B35]",
      accent: "bg-[#009B35]",
    },
    amber: {
      column: "border-amber-200 bg-amber-50/60",
      header: "border-amber-200 bg-white",
      badge: "bg-amber-100 text-amber-700",
      accent: "bg-amber-500",
    },
    red: {
      column: "border-red-200 bg-red-50/60",
      header: "border-red-200 bg-white",
      badge: "bg-red-100 text-red-700",
      accent: "bg-red-500",
    },
  };

  return styles[tone] || styles.slate;
}

function getPriorityClass(priority) {
  if (priority === "very_high") return "bg-red-50 text-red-700";
  if (priority === "high") return "bg-orange-50 text-orange-700";
  if (priority === "medium") return "bg-[#F3F74B]/45 text-[#030454]";
  return "bg-[#009B35]/10 text-[#009B35]";
}

function truncateText(value, fallback = "Not specified") {
  const text = String(value || "").trim();
  return text || fallback;
}

function BoardMetaRow({ label, value, strong = false }) {
  const displayValue = truncateText(value);

  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-2 text-xs">
      <span className="text-slate-400">{label}</span>
      <span
        title={displayValue}
        className={`min-w-0 truncate text-right ${
          strong ? "font-black text-[#030454]" : "font-bold text-slate-700"
        }`}
      >
        {displayValue}
      </span>
    </div>
  );
}

function ProjectMiniCard({ project, canManage, onViewProject, onEditProject }) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-[#009B35]/60 hover:shadow-md">
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4
              title={project.title}
              className="line-clamp-2 text-sm font-black leading-5 text-[#030454]"
            >
              {project.title || "Untitled project"}
            </h4>

            <p
              title={project.project_code || "No project code"}
              className="mt-1 truncate text-[11px] font-medium text-slate-400"
            >
              {project.project_code || "No project code"}
            </p>
          </div>

          <span
            className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] ${getPriorityClass(
              project.priority
            )}`}
          >
            {project.priority_display || project.priority || "Priority"}
          </span>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-2">
            <BoardMetaRow label="LGA" value={project.lga_name || "Statewide"} />
            <BoardMetaRow label="Agency" value={project.implementing_agency} />
            <BoardMetaRow label="Funding" value={project.funding_source} />
            <BoardMetaRow
              label="Sector"
              value={project.sector_display || project.sector}
            />
          </div>
        </div>

        <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <BoardMetaRow
            label="Budget"
            value={formatMoney(project.estimated_budget_naira)}
            strong
          />
          <BoardMetaRow
            label="GHG"
            value={`${formatNumber(
              project.expected_ghg_reduction_tco2e,
              2
            )} tCO₂e`}
            strong
          />
          <BoardMetaRow
            label="People"
            value={formatNumber(project.expected_beneficiaries, 0)}
            strong
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onViewProject(project)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
          >
            View
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => onEditProject(project)}
              className="rounded-md bg-[#009B35] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#00842e]"
            >
              Edit
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ProjectPortfolioStatusBoard({
  projects = [],
  canManage,
  onViewProject,
  onEditProject,
}) {
  const groupedProjects = useMemo(() => {
    return statusColumns.reduce((groups, column) => {
      groups[column.key] = projects.filter(
        (project) => project.status === column.key
      );
      return groups;
    }, {});
  }, [projects]);

  const columnSummaries = useMemo(() => {
    return statusColumns.reduce((summaries, column) => {
      const columnProjects = groupedProjects[column.key] || [];

      summaries[column.key] = {
        count: columnProjects.length,
        budget: columnProjects.reduce(
          (total, project) =>
            total + Number(project.estimated_budget_naira || 0),
          0
        ),
        ghg: columnProjects.reduce(
          (total, project) =>
            total + Number(project.expected_ghg_reduction_tco2e || 0),
          0
        ),
        beneficiaries: columnProjects.reduce(
          (total, project) =>
            total + Number(project.expected_beneficiaries || 0),
          0
        ),
      };

      return summaries;
    }, {});
  }, [groupedProjects]);

  return (
    <div className="w-full overflow-x-auto pb-3">
      <div className="flex min-w-max gap-4">
        {statusColumns.map((column) => {
          const tone = getColumnTone(column.tone);
          const columnProjects = groupedProjects[column.key] || [];
          const summary = columnSummaries[column.key];

          return (
            <section
              key={column.key}
              className={`flex w-[320px] shrink-0 flex-col rounded-2xl border p-3 ${tone.column}`}
            >
              <div className={`overflow-hidden rounded-xl border ${tone.header}`}>
                <div className={`h-1.5 ${tone.accent}`} />

                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-[#030454]">
                        {column.label}
                      </p>
                      <p className="mt-2 min-h-[42px] text-xs leading-5 text-slate-500">
                        {column.description}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${tone.badge}`}
                    >
                      {summary.count}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 text-[11px]">
                    <BoardMetaRow
                      label="Budget"
                      value={formatMoney(summary.budget)}
                      strong
                    />
                    <BoardMetaRow
                      label="GHG"
                      value={`${formatNumber(summary.ghg, 2)} tCO₂e`}
                      strong
                    />
                    <BoardMetaRow
                      label="People"
                      value={formatNumber(summary.beneficiaries, 0)}
                      strong
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 flex min-h-[420px] flex-1 flex-col gap-3">
                {columnProjects.map((project) => (
                  <ProjectMiniCard
                    key={project.id}
                    project={project}
                    canManage={canManage}
                    onViewProject={onViewProject}
                    onEditProject={onEditProject}
                  />
                ))}

                {columnProjects.length === 0 && (
                  <div className="flex min-h-[140px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/70 p-4 text-center text-xs text-slate-400">
                    No {column.label.toLowerCase()} projects.
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}