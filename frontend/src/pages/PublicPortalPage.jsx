import {
  PublicPortalFooter,
  PublicPortalHeader,
} from "../components/PublicPortalChrome";
import { useEffect, useMemo, useState } from "react";
import { getPublicPortalSummary } from "../services/api";
import PublicClimateRiskMapPreview from "../components/PublicClimateRiskMapPreview";
import PublicProjectMapPreview from "../components/PublicProjectMapPreview";

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function formatMoney(value) {
  return `₦${formatNumber(value, 2)}`;
}

function getRiskClass(level) {
  if (level === "very_high") return "bg-red-50 text-red-700";
  if (level === "high") return "bg-orange-50 text-orange-700";
  if (level === "moderate") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

function getProjectStatusClass(status) {
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

function getTypeClass(type) {
  if (type === "climate_risk") return "bg-green-50 text-green-700";
  if (type === "ghg_inventory") return "bg-purple-50 text-purple-700";
  if (type === "project_portfolio") return "bg-blue-50 text-blue-700";
  if (type === "ndc_progress") return "bg-orange-50 text-orange-700";
  if (type === "executive_brief") return "bg-indigo-50 text-indigo-700";
  if (type === "data_export") return "bg-cyan-50 text-cyan-700";
  return "bg-slate-100 text-slate-700";
}

export default function PublicPortalPage() {
  const [summaryData, setSummaryData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSummary() {
    setIsLoading(true);
    setError("");

    try {
      const data = await getPublicPortalSummary();
      setSummaryData(data.summary || {});
    } catch (err) {
      console.error(err);
      setError("Could not load public portal summary.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const climateRisk = summaryData?.climate_risk || {};
  const projects = summaryData?.projects || {};
  const reports = summaryData?.reports || {};

  const keyStats = useMemo(() => {
    return [
      {
        label: "LGAs Assessed",
        value: climateRisk.total_lgas || 0,
        helper: "Kaduna LGA climate risk profiles.",
      },
      {
        label: "High-Risk LGAs",
        value: climateRisk.high_or_very_high_lgas || 0,
        helper: "LGAs currently classified as High or Very High risk.",
      },
      {
        label: "Climate Projects",
        value: projects.total_projects || 0,
        helper: "Registered climate action projects.",
      },
      {
        label: "Published Reports",
        value: reports.total_public_reports || 0,
        helper: "Publicly available published reports.",
      },
    ];
  }, [climateRisk, projects, reports]);

  return (
    <main className="min-h-screen bg-slate-50">
      <PublicPortalHeader
        activePage="home"
        title="Public Climate Action Portal"
        description="Explore public climate risk summaries, climate action projects, and published reports from the Kaduna State Climate Command Centre."
      />

      <section className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
            Loading public portal summary...
          </div>
        ) : (
          <>
            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {keyStats.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <h2 className="mt-3 text-3xl font-bold">{item.value}</h2>
                  <p className="mt-2 text-sm text-slate-500">{item.helper}</p>
                </div>
              ))}
            </section>

            <PublicClimateRiskMapPreview />

            <PublicProjectMapPreview />

            <section className="grid gap-6 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <p className="text-sm font-medium text-emerald-700">
                      Climate Risk Snapshot
                    </p>
                    <h2 className="mt-1 text-2xl font-bold">
                      Kaduna LGA Climate Risk Summary
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Latest available public-facing summary of LGA climate risk
                      conditions.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={loadSummary}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                    <p className="text-sm text-blue-700">Latest Year</p>
                    <p className="mt-2 text-3xl font-bold text-blue-700">
                      {climateRisk.latest_year || "—"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
                    <p className="text-sm text-orange-700">
                      Average Risk Index
                    </p>
                    <p className="mt-2 text-3xl font-bold text-orange-700">
                      {formatNumber(climateRisk.average_risk, 2)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
                    <p className="text-sm text-red-700">
                      Highest Risk Index
                    </p>
                    <p className="mt-2 text-3xl font-bold text-red-700">
                      {formatNumber(climateRisk.highest_risk, 2)}
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="font-bold">Highest-Risk LGAs</h3>

                  <div className="mt-4 space-y-3">
                    {(climateRisk.top_lgas || []).map((profile, index) => (
                      <div
                        key={profile.id}
                        className="rounded-2xl border border-slate-200 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-bold">
                              {index + 1}. {profile.lga_name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Year {profile.year}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-2xl font-bold">
                              {formatNumber(profile.overall_risk_score, 2)}
                            </p>
                            <span
                              className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getRiskClass(
                                profile.risk_level
                              )}`}
                            >
                              {profile.risk_level_display}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}

                    {(climateRisk.top_lgas || []).length === 0 && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                        No climate risk summary records are available yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-sm font-medium text-emerald-700">
                    Project Portfolio Snapshot
                  </p>
                  <h2 className="mt-1 text-xl font-bold">
                    Climate Action Projects
                  </h2>

                  <div className="mt-5 space-y-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total projects</span>
                      <span className="font-bold">
                        {projects.total_projects || 0}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Portfolio budget</span>
                      <span className="font-bold">
                        {formatMoney(projects.total_budget_naira)}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Expected GHG reduction</span>
                      <span className="font-bold">
                        {formatNumber(
                          projects.total_expected_ghg_reduction_tco2e,
                          3
                        )}{" "}
                        tCO₂e
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Beneficiaries</span>
                      <span className="font-bold">
                        {formatNumber(
                          projects.total_expected_beneficiaries,
                          0
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-sm font-medium text-emerald-700">
                    Public Reports
                  </p>
                  <h2 className="mt-1 text-xl font-bold">
                    Published Documents
                  </h2>

                  <p className="mt-3 text-sm text-slate-500">
                    {reports.total_public_reports || 0} published public report
                    record(s) available.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/public/reports";
                    }}
                    className="mt-5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Open Reports Portal
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <p className="text-sm font-medium text-emerald-700">
                  Priority Climate Projects
                </p>
                <h2 className="mt-1 text-2xl font-bold">
                  Top Public Project Summary
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  These are selected high-priority projects from the climate
                  project portfolio.
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {(projects.top_projects || []).map((project) => (
                  <article
                    key={project.id}
                    className="rounded-2xl border border-slate-200 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getPriorityClass(
                          project.priority
                        )}`}
                      >
                        {project.priority_display}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getProjectStatusClass(
                          project.status
                        )}`}
                      >
                        {project.status_display}
                      </span>
                    </div>

                    <h3 className="mt-4 text-lg font-bold">
                      {project.title}
                    </h3>

                    <p className="mt-1 text-xs text-slate-400">
                      {project.project_code || "No code"} •{" "}
                      {project.lga_name || "Statewide"}
                    </p>

                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Sector</span>
                        <span className="font-semibold">
                          {project.sector_display}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-500">Budget</span>
                        <span className="font-semibold">
                          {formatMoney(project.estimated_budget_naira)}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-500">GHG reduction</span>
                        <span className="font-semibold">
                          {formatNumber(
                            project.expected_ghg_reduction_tco2e,
                            3
                          )}{" "}
                          tCO₂e
                        </span>
                      </div>
                    </div>
                  </article>
                ))}

                {(projects.top_projects || []).length === 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                    No public project summary records are available yet.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
              <p className="font-bold">Public Data Notice</p>
              <p className="mt-2">
                This public portal provides summary-level information. Official
                datasets, detailed technical reports, and validated documents
                should be accessed through the published reports portal.
              </p>
            </section>
          </>
        )}
      </section>

      <PublicPortalFooter />
    </main>
  );
}