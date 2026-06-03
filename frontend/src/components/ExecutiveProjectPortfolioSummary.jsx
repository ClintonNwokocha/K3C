import { useEffect, useMemo, useState } from "react";
import { getClimateProjects, getClimateRiskProfiles } from "../services/api";

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function formatMoney(value) {
  return `₦${formatNumber(value, 2)}`;
}

function getStatusClass(status) {
  if (status === "completed") return "bg-[#009B35]/10 text-[#009B35]";
  if (status === "ongoing") return "bg-[#030454]/10 text-[#030454]";
  if (status === "planned") return "bg-[#F3F74B]/45 text-[#030454]";
  if (status === "proposed") return "bg-slate-100 text-slate-700";
  if (status === "suspended") return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

function getPriorityClass(priority) {
  if (priority === "very_high") return "bg-red-50 text-red-700";
  if (priority === "high") return "bg-orange-50 text-orange-700";
  if (priority === "medium") return "bg-[#F3F74B]/45 text-[#030454]";
  return "bg-[#009B35]/10 text-[#009B35]";
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatCard({ label, value, helper, tone = "blue" }) {
  const toneClasses = {
    blue: "border-[#030454]/15 bg-[#030454]/5",
    green: "border-[#009B35]/20 bg-[#009B35]/8",
    yellow: "border-[#F3F74B]/70 bg-[#F3F74B]/25",
    red: "border-red-200 bg-red-50",
    orange: "border-orange-200 bg-orange-50",
    white: "border-slate-200 bg-white",
  };

  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm ${
        toneClasses[tone] || toneClasses.white
      }`}
    >
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <h3 className="mt-3 text-3xl font-black text-[#030454]">{value}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

function CountRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="font-black text-[#030454]">{value}</span>
    </div>
  );
}

export default function ExecutiveProjectPortfolioSummary() {
  const [projectData, setProjectData] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadPortfolioDashboard() {
    setIsLoading(true);
    setError("");

    try {
      const [projectsResponse, riskResponse] = await Promise.all([
        getClimateProjects({}),
        getClimateRiskProfiles({}),
      ]);

      setProjectData(projectsResponse);
      setRiskData(riskResponse);
    } catch (err) {
      console.error(err);
      setError("Could not load project portfolio dashboard summary.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPortfolioDashboard();
  }, []);

  const projects = projectData?.results || [];
  const summary = projectData?.summary || {};
  const riskProfiles = riskData?.results || [];

  const dashboardStats = useMemo(() => {
    const highPriorityProjects = projects.filter((project) =>
      ["high", "very_high"].includes(project.priority)
    );

    const ongoingProjects = projects.filter(
      (project) => project.status === "ongoing"
    );

    const completedProjects = projects.filter(
      (project) => project.status === "completed"
    );

    const projectLgaIds = new Set(
      projects
        .map((project) => project.lga)
        .filter((lgaId) => lgaId !== null && lgaId !== undefined && lgaId !== "")
        .map((lgaId) => String(lgaId))
    );

    const highRiskLgas = riskProfiles.filter((profile) =>
      ["high", "very_high"].includes(profile.risk_level)
    );

    const highRiskLgasWithoutProjects = highRiskLgas.filter(
      (profile) => !projectLgaIds.has(String(profile.lga))
    );

    const topPriorityProjects = [...projects]
      .sort((a, b) => {
        const priorityRank = {
          very_high: 4,
          high: 3,
          medium: 2,
          low: 1,
        };

        return (
          (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0) ||
          Number(b.estimated_budget_naira || 0) -
            Number(a.estimated_budget_naira || 0)
        );
      })
      .slice(0, 5);

    return {
      highPriorityCount: highPriorityProjects.length,
      ongoingCount: ongoingProjects.length,
      completedCount: completedProjects.length,
      highRiskLgasWithoutProjects,
      topPriorityProjects,
    };
  }, [projects, riskProfiles]);

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          Loading project portfolio summary...
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        {error}
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
            Project Portfolio Intelligence
          </p>

          <h2 className="mt-2 text-2xl font-black text-[#030454]">
            Climate Project Executive Summary
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Live summary of climate projects, budgets, expected mitigation
            outcomes, beneficiaries, implementation status and project coverage
            across high-risk LGAs.
          </p>
        </div>

        <button
          type="button"
          onClick={loadPortfolioDashboard}
          className="rounded-md border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
        >
          Refresh Projects
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Projects"
          value={summary.total_projects || 0}
          helper="Active projects in portfolio."
          tone="blue"
        />

        <StatCard
          label="Portfolio Budget"
          value={formatMoney(summary.total_budget_naira)}
          helper="Total estimated project value."
          tone="green"
        />

        <StatCard
          label="Expected GHG Reduction"
          value={formatNumber(summary.total_expected_ghg_reduction_tco2e, 3)}
          helper="tCO₂e expected."
          tone="yellow"
        />

        <StatCard
          label="Expected Beneficiaries"
          value={formatNumber(summary.total_expected_beneficiaries, 0)}
          helper="People expected to benefit."
          tone="white"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard
          label="High-Priority Projects"
          value={dashboardStats.highPriorityCount}
          helper="Projects marked High or Very High priority."
          tone="orange"
        />

        <StatCard
          label="Ongoing Projects"
          value={dashboardStats.ongoingCount}
          helper="Projects currently under implementation."
          tone="blue"
        />

        <StatCard
          label="High-Risk LGAs Without Projects"
          value={dashboardStats.highRiskLgasWithoutProjects.length}
          helper="High-risk LGAs with no project linked yet."
          tone="red"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h3 className="text-xl font-black text-[#030454]">
            Top Priority Projects
          </h3>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            Sorted by project priority and budget value.
          </p>

          <div className="mt-5 space-y-4">
            {dashboardStats.topPriorityProjects.map((project, index) => (
              <div
                key={project.id}
                className="rounded-2xl border border-slate-200 p-4 transition hover:border-[#009B35]/60 hover:bg-[#009B35]/5"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <p className="font-black text-[#030454]">
                      {index + 1}. {project.title}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {project.project_code || "No project code"} ·{" "}
                      {project.lga_name || "Statewide / Not specified"}
                    </p>

                    {(project.implementing_agency || project.funding_source) && (
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {project.implementing_agency && (
                          <>
                            <span className="font-bold text-[#030454]">
                              Agency:
                            </span>{" "}
                            {project.implementing_agency}
                          </>
                        )}

                        {project.implementing_agency &&
                          project.funding_source &&
                          " · "}

                        {project.funding_source && (
                          <>
                            <span className="font-bold text-[#030454]">
                              Funding:
                            </span>{" "}
                            {project.funding_source}
                          </>
                        )}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={`rounded-md px-3 py-1 text-xs font-bold ${getPriorityClass(
                          project.priority
                        )}`}
                      >
                        {project.priority_display || titleCase(project.priority)}
                      </span>

                      <span
                        className={`rounded-md px-3 py-1 text-xs font-bold ${getStatusClass(
                          project.status
                        )}`}
                      >
                        {project.status_display || titleCase(project.status)}
                      </span>

                      <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                        {project.sector_display || titleCase(project.sector)}
                      </span>
                    </div>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-lg font-black text-[#030454]">
                      {formatMoney(project.estimated_budget_naira)}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {formatNumber(
                        project.expected_ghg_reduction_tco2e,
                        3
                      )}{" "}
                      tCO₂e expected
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {dashboardStats.topPriorityProjects.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                No climate projects have been registered yet.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-black text-[#030454]">
              Projects by Type
            </h3>

            <div className="mt-5 space-y-3 text-sm">
              <CountRow label="Adaptation" value={summary.by_type?.adaptation || 0} />
              <CountRow label="Mitigation" value={summary.by_type?.mitigation || 0} />
              <CountRow
                label="Cross-cutting"
                value={summary.by_type?.cross_cutting || 0}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-black text-[#030454]">
              Projects by Status
            </h3>

            <div className="mt-5 space-y-3 text-sm">
              <CountRow label="Proposed" value={summary.by_status?.proposed || 0} />
              <CountRow label="Planned" value={summary.by_status?.planned || 0} />
              <CountRow label="Ongoing" value={summary.by_status?.ongoing || 0} />
              <CountRow
                label="Completed"
                value={summary.by_status?.completed || 0}
              />
              <CountRow
                label="Suspended"
                value={summary.by_status?.suspended || 0}
              />
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-5 py-4 text-sm leading-6 text-[#030454] shadow-sm">
            <h3 className="font-black">Planning Insight</h3>
            <p className="mt-1">
              High-risk LGAs without linked projects should be reviewed for
              adaptation investment, especially where vulnerability is high and
              adaptive capacity is weak.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}