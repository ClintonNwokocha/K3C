function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits });
}

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getRiskClass(level) {
  if (level === "very_high") return "bg-red-50 text-red-700";
  if (level === "high") return "bg-orange-50 text-orange-700";
  if (level === "moderate") return "bg-[#F3F74B]/45 text-[#030454]";
  return "bg-[#009B35]/10 text-[#009B35]";
}

function getProjectStatusClass(status) {
  if (status === "completed") return "bg-[#009B35]/10 text-[#009B35]";
  if (status === "ongoing") return "bg-[#030454]/10 text-[#030454]";
  if (status === "planned") return "bg-[#F3F74B]/45 text-[#030454]";
  return "bg-slate-100 text-slate-700";
}

function getReportStatusClass(status) {
  if (status === "published") return "bg-[#009B35]/10 text-[#009B35]";
  if (status === "approved") return "bg-[#030454]/10 text-[#030454]";
  if (status === "review") return "bg-[#F3F74B]/45 text-[#030454]";
  return "bg-slate-100 text-slate-700";
}

function InsightErrorNotice({ label }) {
  return <p className="text-xs font-bold text-red-600">Couldn't load {label}.</p>;
}

// Replaces the old static "Current platform readiness" block with real
// decision-maker signals. Data is supplied by useExecutiveDashboardData
// (fetched once in Dashboard.jsx) plus the ghgSummary already fetched at
// App level — this component performs no fetching of its own.
export default function DashboardRecentInsights({
  risk,
  projects,
  reports,
  ghgSummary,
  loading,
  errors = {},
}) {
  const topLgas = risk?.top_lgas?.slice(0, 3) || [];
  const recentProjects = projects?.results?.slice(0, 3) || [];
  const recentReports = reports?.results?.slice(0, 3) || [];
  const ghg = ghgSummary?.ghg || null;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
          Priority LGAs
        </p>

        {errors.risk ? (
          <InsightErrorNotice label="Climate Intelligence data" />
        ) : loading ? (
          <p className="mt-2 text-sm text-slate-400">Loading…</p>
        ) : topLgas.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No risk profiles available yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {topLgas.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
              >
                <span className="font-bold text-[#030454]">{profile.lga_name}</span>

                <span
                  className={`rounded-md px-2 py-1 text-xs font-bold ${getRiskClass(
                    profile.risk_level
                  )}`}
                >
                  {profile.risk_level_display || titleCase(profile.risk_level)} ·{" "}
                  {formatNumber(profile.overall_risk_score, 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#030454]">
          Latest GHG position
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {ghg?.latest_total_mtco2e != null
            ? `Latest approved GHG total: ${formatNumber(ghg.latest_total_mtco2e, 2)} MtCO₂e (${ghg.latest_year ?? "—"}).`
            : "No approved GHG data yet."}
        </p>
      </div>

      <div>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
          Recent Projects
        </p>

        {errors.projects ? (
          <InsightErrorNotice label="project data" />
        ) : loading ? (
          <p className="mt-2 text-sm text-slate-400">Loading…</p>
        ) : recentProjects.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No projects registered yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {recentProjects.map((project) => (
              <div key={project.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-bold text-[#030454]">{project.title}</span>
                  <span
                    className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${getProjectStatusClass(
                      project.status
                    )}`}
                  >
                    {project.status_display || titleCase(project.status)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{formatDate(project.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
          Recent Reports
        </p>

        {errors.reports ? (
          <InsightErrorNotice label="report data" />
        ) : loading ? (
          <p className="mt-2 text-sm text-slate-400">Loading…</p>
        ) : recentReports.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No reports recorded yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {recentReports.map((report) => (
              <div key={report.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-bold text-[#030454]">{report.title}</span>
                  <span
                    className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${getReportStatusClass(
                      report.status
                    )}`}
                  >
                    {report.status_display || titleCase(report.status)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDate(report.created_at)} · {report.is_public ? "Public" : "Internal"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
