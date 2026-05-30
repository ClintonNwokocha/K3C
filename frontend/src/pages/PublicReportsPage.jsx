import { useEffect, useMemo, useState } from "react";
import {
  PublicEmptyState,
  PublicPortalFooter,
  PublicPortalHeader,
} from "../components/PublicPortalChrome";
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
  if (type === "climate_risk") return "bg-[#2292A4]/10 text-[#214560]";
  if (type === "ghg_inventory") return "bg-[#4E7492]/10 text-[#214560]";
  if (type === "project_portfolio") return "bg-[#C8A84A]/18 text-[#0B1726]";
  if (type === "ndc_progress") return "bg-orange-50 text-orange-700";
  if (type === "executive_brief") return "bg-indigo-50 text-indigo-700";
  if (type === "data_export") return "bg-slate-100 text-slate-700";

  return "bg-slate-100 text-slate-700";
}

function getYearOptions(reports) {
  const years = reports
    .map((report) => report.reporting_year)
    .filter(Boolean);

  return Array.from(new Set(years)).sort((a, b) => b - a);
}

function ReportStat({ label, value, tone = "default" }) {
  const toneClasses = {
    default: "border-[#CAD2D7] bg-white",
    blue: "border-[#4E7492]/35 bg-[#4E7492]/8",
    teal: "border-[#2292A4]/35 bg-[#2292A4]/8",
    gold: "border-[#C8A84A]/45 bg-[#C8A84A]/12",
  };

  return (
    <div
      className={`rounded-lg border p-5 shadow-sm ${
        toneClasses[tone] || toneClasses.default
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-3 font-['Playfair_Display'] text-4xl font-bold text-[#0B1726]">
        {formatNumber(value)}
      </p>
    </div>
  );
}

function ReportCard({ report }) {
  return (
    <article className="rounded-lg border border-[#CAD2D7] bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-[#4E7492]/60 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span
          className={`rounded-md px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${getTypeClass(
            report.report_type
          )}`}
        >
          {report.report_type_display}
        </span>

        <span className="rounded-md bg-[#DFE3E4]/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">
          {report.reporting_year || "No year"}
        </span>
      </div>

      <h3 className="mt-5 text-lg font-bold leading-snug text-[#0B1726]">
        {report.title}
      </h3>

      <p className="mt-3 line-clamp-4 text-sm font-light leading-6 text-slate-600">
        {report.description || "No description provided."}
      </p>

      <div className="mt-5 border-t border-[#E6EAEC] pt-4 text-xs text-slate-500">
        <span className="font-bold uppercase tracking-[0.1em] text-slate-400">
          Source Module:
        </span>{" "}
        {report.source_module || "Not specified"}
      </div>

      <div className="mt-5">
        {report.file_url ? (
          <a
            href={report.file_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-md bg-[#2292A4] px-5 py-3 text-xs font-bold uppercase tracking-[0.08em] text-white transition hover:bg-[#1d7f90]"
          >
            Open Report
          </a>
        ) : (
          <span className="inline-flex rounded-md border border-[#CAD2D7] px-5 py-3 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
            File Not Attached
          </span>
        )}
      </div>
    </article>
  );
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
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#0B1726]">
      <PublicPortalHeader
        activePage="reports"
        compact
        tag="Published Climate Evidence"
        title={
          <>
            Public Reports and
            <br />
            <span className="text-[#C8A84A]">Evidence Library</span>
          </>
        }
        description="Access published climate reports, executive briefs, GHG inventory outputs, project summaries, NDC progress reports and validated public data exports."
        primaryActionLabel="Browse Reports"
        secondaryActionLabel="Public Home"
        onPrimaryAction={() => {
          const section = document.getElementById("reports-library");
          section?.scrollIntoView({ behavior: "smooth" });
        }}
        onSecondaryAction={() => {
          window.location.href = "/public";
        }}
      />

      <section className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-10">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ReportStat
            label="Published Reports"
            value={summary.total_public_reports || 0}
          />

          <ReportStat
            label="Climate Risk Reports"
            value={summary.by_type?.climate_risk || 0}
            tone="teal"
          />

          <ReportStat
            label="GHG Inventory Reports"
            value={summary.by_type?.ghg_inventory || 0}
            tone="blue"
          />

          <ReportStat
            label="Project Portfolio Reports"
            value={summary.by_type?.project_portfolio || 0}
            tone="gold"
          />
        </section>

        <section
          id="reports-library"
          className="rounded-lg border border-[#CAD2D7] bg-white p-6 shadow-sm"
        >
          <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#2292A4]">
                Published evidence
              </p>

              <h2 className="mt-2 font-['Playfair_Display'] text-4xl font-bold text-[#0B1726]">
                Reports Library
              </h2>

              <p className="mt-3 max-w-2xl text-sm font-light leading-7 text-slate-600">
                Filter published public reports by type, year or keyword.
                Documents shown here are intended for public access.
              </p>
            </div>

            <form
              onSubmit={handleSearchSubmit}
              className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end"
            >
              <select
                value={filters.report_type}
                onChange={(event) =>
                  updateFilter("report_type", event.target.value)
                }
                className="rounded-md border border-[#CAD2D7] bg-white px-4 py-3 text-sm outline-none focus:border-[#2292A4] focus:ring-2 focus:ring-[#2292A4]/10"
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
                className="rounded-md border border-[#CAD2D7] bg-white px-4 py-3 text-sm outline-none focus:border-[#2292A4] focus:ring-2 focus:ring-[#2292A4]/10"
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
                className="rounded-md border border-[#CAD2D7] bg-white px-4 py-3 text-sm outline-none focus:border-[#2292A4] focus:ring-2 focus:ring-[#2292A4]/10 sm:col-span-2 lg:min-w-[260px]"
              />

              <button
                type="submit"
                className="rounded-md bg-[#C8A84A] px-6 py-3 text-xs font-bold uppercase tracking-[0.08em] text-[#0B1726] transition hover:bg-[#d8b85c]"
              >
                Search
              </button>
            </form>
          </div>

          {isLoading ? (
            <div className="rounded-lg border border-[#CAD2D7] bg-[#DFE3E4]/45 p-6 text-sm text-slate-500">
              Loading public reports...
            </div>
          ) : reports.length === 0 ? (
            <PublicEmptyState
              title="No published public reports yet"
              message="Reports will appear here after they are marked as Published and Public in the internal Reports Centre."
            />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {reports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          )}
        </section>

        <section className="border-l-4 border-[#2292A4] bg-white px-5 py-4 text-xs leading-6 text-slate-600">
          <strong className="text-[#0B1726]">Public reports notice:</strong>{" "}
          This library contains reports that have been marked as public and
          published by authorised staff. Draft, internal, archived and non-public
          reports are not displayed here.
        </section>
      </section>

      <PublicPortalFooter />
    </main>
  );
}