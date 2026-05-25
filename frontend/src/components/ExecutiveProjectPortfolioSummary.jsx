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
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "ongoing") return "bg-blue-50 text-blue-700";
  if (status === "planned") return "bg-indigo-50 text-indigo-700";
  if (status === "proposed") return "bg-slate-100 text-slate-700";
  if (status === "suspended") return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
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
    );

    const highRiskLgas = riskProfiles.filter((profile) =>
      ["high", "very_high"].includes(profile.risk_level)
    );

    const highRiskLgasWithoutProjects = highRiskLgas.filter(
      (profile) => !projectLgaIds.has(profile.lga)
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
          <p className="text-sm font-medium text-emerald-700">
            Project Portfolio Intelligence
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            Climate Project Executive Summary
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Live summary of climate projects, budgets, expected mitigation
            outcomes, beneficiaries, project status and project coverage across
            high-risk LGAs.
          </p>
        </div>

        <button
          type="button"
          onClick={loadPortfolioDashboard}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh Projects
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Total Projects</p>
          <h3 className="mt-3 text-3xl font-bold">
            {summary.total_projects || 0}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Active projects in portfolio.
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <p className="text-sm text-blue-700">Portfolio Budget</p>
          <h3 className="mt-3 text-3xl font-bold text-blue-700">
            {formatMoney(summary.total_budget_naira)}
          </h3>
          <p className="mt-2 text-sm text-blue-700">
            Total estimated project value.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <p className="text-sm text-emerald-700">Expected GHG Reduction</p>
          <h3 className="mt-3 text-3xl font-bold text-emerald-700">
            {formatNumber(summary.total_expected_ghg_reduction_tco2e, 3)}
          </h3>
          <p className="mt-2 text-sm text-emerald-700">tCO₂e expected.</p>
        </div>

        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
          <p className="text-sm text-orange-700">Expected Beneficiaries</p>
          <h3 className="mt-3 text-3xl font-bold text-orange-700">
            {formatNumber(summary.total_expected_beneficiaries, 0)}
          </h3>
          <p className="mt-2 text-sm text-orange-700">
            People expected to benefit.
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
          <p className="text-sm text-orange-700">High-Priority Projects</p>
          <h3 className="mt-3 text-3xl font-bold text-orange-700">
            {dashboardStats.highPriorityCount}
          </h3>
          <p className="mt-2 text-sm text-orange-700">
            Projects marked High or Very High priority.
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <p className="text-sm text-blue-700">Ongoing Projects</p>
          <h3 className="mt-3 text-3xl font-bold text-blue-700">
            {dashboardStats.ongoingCount}
          </h3>
          <p className="mt-2 text-sm text-blue-700">
            Projects currently under implementation.
          </p>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-sm text-red-700">High-Risk LGAs Without Projects</p>
          <h3 className="mt-3 text-3xl font-bold text-red-700">
            {dashboardStats.highRiskLgasWithoutProjects.length}
          </h3>
          <p className="mt-2 text-sm text-red-700">
            High-risk LGAs with no project linked yet.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h3 className="text-lg font-bold">Top Priority Projects</h3>
          <p className="mt-1 text-sm text-slate-500">
            Sorted by project priority and budget value.
          </p>

          <div className="mt-5 space-y-4">
            {dashboardStats.topPriorityProjects.map((project, index) => (
              <div
                key={project.id}
                className="rounded-2xl border border-slate-200 p-4"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <p className="font-bold">
                      {index + 1}. {project.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {project.project_code || "No project code"} •{" "}
                      {project.lga_name || "Statewide / Not specified"}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getPriorityClass(
                          project.priority
                        )}`}
                      >
                        {project.priority_display || titleCase(project.priority)}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                          project.status
                        )}`}
                      >
                        {project.status_display || titleCase(project.status)}
                      </span>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {project.sector_display || titleCase(project.sector)}
                      </span>
                    </div>
                  </div>

                  <div className="text-left md:text-right">
                    <p className="text-lg font-bold">
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
            <h3 className="text-lg font-bold">Projects by Type</h3>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Adaptation</span>
                <span className="font-semibold">
                  {summary.by_type?.adaptation || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Mitigation</span>
                <span className="font-semibold">
                  {summary.by_type?.mitigation || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Cross-cutting</span>
                <span className="font-semibold">
                  {summary.by_type?.cross_cutting || 0}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold">Projects by Status</h3>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Proposed</span>
                <span className="font-semibold">
                  {summary.by_status?.proposed || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Planned</span>
                <span className="font-semibold">
                  {summary.by_status?.planned || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Ongoing</span>
                <span className="font-semibold">
                  {summary.by_status?.ongoing || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Completed</span>
                <span className="font-semibold">
                  {summary.by_status?.completed || 0}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 shadow-sm">
            <h3 className="font-bold">Planning Insight</h3>
            <p className="mt-2">
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