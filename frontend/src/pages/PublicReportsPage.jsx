import {
  PublicEmptyState,
  PublicPortalFooter,
  PublicPortalHeader,
} from "../components/PublicPortalChrome";
import { useEffect, useMemo, useState } from "react";
import { getPublicReportDocuments } from "../services/api";

const reportTypeOptions = [
  { value: "climate_risk", label: "Climate Risk Report" },
  { value: "ghg_inventory", label: "GHG Inventory Report" },
  { value: "project_portfolio", label: "Project Portfolio Report" },
  { value: "ndc_progress", label: "NDC Progress Report" },
  { value: "executive_brief", label: "Executive Brief" },
  { value: "data_export", label: "Data Export" },
  { value: "other", label: "Other" },
];

function formatNumber(value, maximumFractionDigits = 0) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
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

function getYearOptions(reports) {
  const years = reports
    .map((report) => report.reporting_year)
    .filter(Boolean);

  return Array.from(new Set(years)).sort((a, b) => b - a);
}

export default function PublicReportsPage() {
  const [reportsData, setReportsData] = useState(null);
  const [filters, setFilters] = useState({
    report_type: "all",
    reporting_year: "",
    search: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadReports() {
    setIsLoading(true);
    setError("");

    try {
      const params = {};

      if (filters.report_type !== "all") {
        params.report_type = filters.report_type;
      }

      if (filters.reporting_year) {
        params.reporting_year = filters.reporting_year;
      }

      if (filters.search.trim()) {
        params.search = filters.search.trim();
      }

      const data = await getPublicReportDocuments(params);
      setReportsData(data);
    } catch (err) {
      console.error(err);
      setError("Could not load public reports.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.report_type, filters.reporting_year]);

  const reports = reportsData?.results || [];
  const summary = reportsData?.summary || {};

  const yearOptions = useMemo(() => getYearOptions(reports), [reports]);

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    loadReports();
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <PublicPortalHeader
        activePage="reports"
        title="Public Reports Portal"
        description="Access published public reports, executive briefs, climate risk documents, GHG inventory outputs, project portfolio summaries, NDC progress reports, and public data exports."
      />

      <section className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">Published Public Reports</p>
            <h2 className="mt-3 text-3xl font-bold">
              {formatNumber(summary.total_public_reports)}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Reports currently available to the public.
            </p>
          </div>

          <div className="rounded-2xl border border-green-200 bg-green-50 p-6 shadow-sm">
            <p className="text-sm text-green-700">Climate Risk Reports</p>
            <h2 className="mt-3 text-3xl font-bold text-green-700">
              {summary.by_type?.climate_risk || 0}
            </h2>
          </div>

          <div className="rounded-2xl border border-purple-200 bg-purple-50 p-6 shadow-sm">
            <p className="text-sm text-purple-700">GHG Inventory Reports</p>
            <h2 className="mt-3 text-3xl font-bold text-purple-700">
              {summary.by_type?.ghg_inventory || 0}
            </h2>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
            <p className="text-sm text-blue-700">Project Portfolio Reports</p>
            <h2 className="mt-3 text-3xl font-bold text-blue-700">
              {summary.by_type?.project_portfolio || 0}
            </h2>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-lg font-bold">Published Reports</h2>
              <p className="text-sm text-slate-500">
                Filter published public reports by type, year, or keyword.
              </p>
            </div>

            <form
              onSubmit={handleSearchSubmit}
              className="flex flex-wrap gap-3"
            >
              <select
                value={filters.report_type}
                onChange={(event) =>
                  updateFilter("report_type", event.target.value)
                }
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="all">All report types</option>
                {reportTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>

              <select
                value={filters.reporting_year}
                onChange={(event) =>
                  updateFilter("reporting_year", event.target.value)
                }
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">All years</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>

              <input
                value={filters.search}
                onChange={(event) => updateFilter("search", event.target.value)}
                placeholder="Search reports..."
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />

              <button
                type="submit"
                className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Search
              </button>
            </form>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-500">Loading public reports...</p>
          ) : reports.length === 0 ? (
            <PublicEmptyState
                title="No published public reports yet"
                message="Reports will appear here after they are marked as Published and Public in the internal Reports Centre."
            />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {reports.map((report) => (
                <article
                  key={report.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getTypeClass(
                        report.report_type
                      )}`}
                    >
                      {report.report_type_display}
                    </span>

                    <span className="text-xs font-semibold text-slate-400">
                      {report.reporting_year || "No year"}
                    </span>
                  </div>

                  <h3 className="mt-4 text-lg font-bold">{report.title}</h3>

                  <p className="mt-2 line-clamp-3 text-sm text-slate-500">
                    {report.description || "No description provided."}
                  </p>

                  <div className="mt-4 text-xs text-slate-400">
                    Source module: {report.source_module || "Not specified"}
                  </div>

                  {report.file_url ? (
                    <a
                      href={report.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Open Report
                    </a>
                  ) : (
                    <span className="mt-5 inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-400">
                      File not attached
                    </span>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <PublicPortalFooter />
    </main>
  );
}