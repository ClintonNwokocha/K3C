import { useEffect, useMemo, useState } from "react";
import {
  PublicEmptyState,
  PublicPortalFooter,
  PublicPortalHeader,
  PublicSectionIntro,
} from "../components/PublicPortalChrome";
import { getPublicReportDocuments } from "../services/api";

const reportTypeOptions = [
  { value: "climate_risk", label: "Climate Intelligence Report" },
  { value: "ghg_inventory", label: "GHG Inventory Report" },
  { value: "project_portfolio", label: "Project Portfolio Report" },
  { value: "ndc_progress", label: "NDC Progress Report" },
  { value: "executive_brief", label: "Executive Brief" },
  { value: "data_export", label: "Data Export" },
  { value: "other", label: "Other" },
];

const reportUseCases = {
  climate_risk: {
    label: "Risk planning",
    title: "Supports Climate Intelligence prioritisation",
    body: "Useful for identifying LGAs, hazards and risk drivers that may require preparedness, adaptation planning or further technical assessment.",
    tone: "green",
  },
  ghg_inventory: {
    label: "Emissions tracking",
    title: "Supports greenhouse gas accounting",
    body: "Useful for understanding emissions baselines, sector contributions, mitigation opportunities and public inventory communication.",
    tone: "blue",
  },
  project_portfolio: {
    label: "Implementation tracking",
    title: "Supports climate action visibility",
    body: "Useful for seeing where climate projects are happening, who may benefit and what mitigation or resilience outcomes are expected.",
    tone: "yellow",
  },
  ndc_progress: {
    label: "Target monitoring",
    title: "Supports NDC progress review",
    body: "Useful for understanding progress toward reduction targets, climate commitments and implementation milestones.",
    tone: "orange",
  },
  executive_brief: {
    label: "Decision briefing",
    title: "Supports leadership decisions",
    body: "Useful for quick policy, planning and coordination decisions where a concise evidence summary is needed.",
    tone: "indigo",
  },
  data_export: {
    label: "Technical data",
    title: "Supports technical analysis",
    body: "Useful for analysts who need structured outputs, tabular summaries or public datasets for further review.",
    tone: "cyan",
  },
  other: {
    label: "General evidence",
    title: "Supports public evidence access",
    body: "Useful for public awareness, coordination and reference where the document does not fall into the main reporting categories.",
    tone: "slate",
  },
};

const audienceGuidance = [
  {
    label: "Residents",
    title: "Read public summaries first",
    body: "Start with executive briefs and Climate Intelligence reports to understand what the evidence means for your community or LGA.",
  },
  {
    label: "Policy teams",
    title: "Use reports for prioritisation",
    body: "Use Climate Intelligence, GHG and project portfolio reports to support adaptation planning, budgeting discussions and coordination.",
  },
  {
    label: "Partners",
    title: "Locate evidence-backed entry points",
    body: "Use project and risk reports to identify where technical support, finance or implementation partnerships may be useful.",
  },
];

function formatNumber(value, maximumFractionDigits = 0) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function getOptionLabel(options, value) {
  return options.find((item) => item.value === value)?.label || value || "—";
}

function getReportFileUrl(report) {
  return (
    report.file_url ||
    report.document_url ||
    report.file ||
    report.download_url ||
    ""
  );
}

function normalizeReportsPayload(data) {
  if (Array.isArray(data)) {
    return {
      results: data,
      summary: {},
    };
  }

  return {
    results: data?.results || data?.reports || [],
    summary: data?.summary || {},
  };
}

function getTypeMeta(type) {
  return reportUseCases[type] || reportUseCases.other;
}

function getTypeClass(type) {
  if (type === "climate_risk") return "bg-[#009B35]/10 text-[#009B35]";
  if (type === "ghg_inventory") return "bg-[#030454]/10 text-[#030454]";
  if (type === "project_portfolio") return "bg-[#F3F74B]/50 text-[#030454]";
  if (type === "ndc_progress") return "bg-orange-50 text-orange-700";
  if (type === "executive_brief") return "bg-indigo-50 text-indigo-700";
  if (type === "data_export") return "bg-cyan-50 text-cyan-700";
  return "bg-slate-100 text-slate-700";
}

function getToneClasses(tone) {
  const classes = {
    green: "border-[#009B35]/25 bg-[#009B35]/5",
    blue: "border-[#030454]/20 bg-[#030454]/5",
    yellow: "border-[#F3F74B] bg-[#F3F74B]/25",
    orange: "border-orange-200 bg-orange-50",
    indigo: "border-indigo-200 bg-indigo-50",
    cyan: "border-cyan-200 bg-cyan-50",
    slate: "border-slate-200 bg-slate-50",
  };

  return classes[tone] || classes.slate;
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function formatDate(value) {
  const date = parseDate(value);

  if (!date) return "Not published";

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getReportSortTime(report) {
  const createdDate = parseDate(report.created_at || report.updated_at);

  if (createdDate) return createdDate.getTime();

  if (report.reporting_year) {
    return Number(report.reporting_year) || 0;
  }

  return 0;
}

function getFeaturedReport(reports) {
  if (!reports.length) return null;

  return [...reports].sort((a, b) => getReportSortTime(b) - getReportSortTime(a))[0];
}

function EvidenceRibbon({ reports, summary, years }) {
  const reportTypes =
    summary.report_type_count ||
    new Set(reports.map((report) => report.report_type).filter(Boolean)).size ||
    0;

  const latestYear =
    summary.latest_year ||
    years[0] ||
    (reports.length ? "Available" : "Not published");

  const items = [
    `Public reports: ${summary.total_reports || reports.length || 0}`,
    `Published documents: ${summary.published_reports || reports.length || 0}`,
    `Report types: ${reportTypes}`,
    `Latest year: ${latestYear}`,
    `Climate Intelligence evidence: ${
      reports.some((report) => report.report_type === "climate_risk")
        ? "Available"
        : "Pending"
    }`,
    `GHG evidence: ${
      reports.some((report) => report.report_type === "ghg_inventory")
        ? "Available"
        : "Pending"
    }`,
    `Project evidence: ${
      reports.some((report) => report.report_type === "project_portfolio")
        ? "Available"
        : "Pending"
    }`,
    "Only public-approved documents are shown",
  ];

  const scrollingItems = [...items, ...items];

  return (
    <section className="overflow-hidden border-y border-[#D8DDE2] bg-white">
      <style>
        {`
          @keyframes reports-evidence-ribbon {
            0% {
              transform: translateX(0);
            }

            100% {
              transform: translateX(-50%);
            }
          }

          .reports-evidence-ribbon-track {
            width: max-content;
            animation: reports-evidence-ribbon 55s linear infinite;
            will-change: transform;
          }

          .reports-evidence-ribbon-track:hover {
            animation-play-state: paused;
          }

          @media (prefers-reduced-motion: reduce) {
            .reports-evidence-ribbon-track {
              animation: none;
              flex-wrap: wrap;
              width: 100%;
            }
          }
        `}
      </style>

      <div className="reports-evidence-ribbon-track flex">
        {scrollingItems.map((item, index) => (
          <div
            key={`${item}-${index}`}
            className="flex items-center gap-3 border-r border-[#E6EAEC] px-6 py-4 text-xs font-black uppercase tracking-[0.1em] text-[#030454]"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-[#009B35]" />
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

function FeaturedReportPanel({ report }) {
  if (!report) {
    return (
      <section className="bg-[#F7F9FA] px-4 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1536px]">
          <PublicEmptyState
            title="No featured report available"
            message="Published public reports will appear here once they are approved and available."
          />
        </div>
      </section>
    );
  }

  const fileUrl = getReportFileUrl(report);
  const meta = getTypeMeta(report.report_type);

  return (
    <section className="bg-[#F7F9FA] px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-[1536px] gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="overflow-hidden rounded-md border border-[#CAD2D7] bg-[#030454] text-white shadow-sm">
          <div className="relative p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(0,155,53,0.35),transparent_30%),radial-gradient(circle_at_90%_10%,rgba(243,247,75,0.18),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.06)_0_1px,transparent_1px_34px)]" />

            <div className="relative">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F3F74B]">
                Featured evidence document
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <span
                  className={`rounded-sm px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${getTypeClass(
                    report.report_type
                  )}`}
                >
                  {report.report_type_display ||
                    getOptionLabel(reportTypeOptions, report.report_type)}
                </span>

                {report.reporting_year && (
                  <span className="rounded-sm bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-white">
                    {report.reporting_year}
                  </span>
                )}
              </div>

              <h2 className="mt-5 font-['Playfair_Display'] text-4xl font-bold leading-tight text-white md:text-5xl">
                {report.title}
              </h2>

              <p className="mt-5 max-w-3xl text-sm leading-7 text-white/75">
                {report.description ||
                  "This public report is available as an approved evidence document."}
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                {fileUrl ? (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md bg-[#F3F74B] px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-[#030454] transition hover:bg-white"
                  >
                    Open featured report
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-md bg-white/15 px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-white/50"
                  >
                    File unavailable
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    document
                      .getElementById("public-report-library")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="rounded-md border border-white/35 px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-white hover:text-[#030454]"
                >
                  Browse library
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`rounded-md border p-6 shadow-sm ${getToneClasses(
            meta.tone
          )}`}
        >
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#009B35]">
            What this report supports
          </p>

          <h3 className="mt-3 font-['Playfair_Display'] text-3xl font-bold leading-tight text-[#030454]">
            {meta.title}
          </h3>

          <p className="mt-4 text-sm leading-7 text-slate-600">{meta.body}</p>

          <div className="mt-6 grid gap-3 rounded-md bg-white/70 p-4 text-xs leading-6 text-slate-600">
            {report.source_module && (
              <p>
                <span className="font-black text-[#030454]">Source module:</span>{" "}
                {report.source_module}
              </p>
            )}

            {report.generated_by_name && (
              <p>
                <span className="font-black text-[#030454]">Generated by:</span>{" "}
                {report.generated_by_name}
              </p>
            )}

            <p>
              <span className="font-black text-[#030454]">Uploaded:</span>{" "}
              {formatDate(report.created_at)}
            </p>
          </div>

          <div className="mt-6 rounded-md border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-5 py-4 text-sm leading-7 text-[#030454]">
            Use public reports as approved evidence references. For formal
            decisions, consult the full report and its methodology notes.
          </div>
        </div>
      </div>
    </section>
  );
}

function EvidenceUseStrip() {
  return (
    <section className="border-y border-[#D8DDE2] bg-white px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-[1536px] gap-4 lg:grid-cols-3">
        {audienceGuidance.map((item) => (
          <article
            key={item.label}
            className="rounded-md border border-[#D8DDE2] bg-[#F7F9FA] p-5 shadow-sm"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#009B35]">
              {item.label}
            </p>

            <h3 className="mt-2 text-lg font-black text-[#030454]">
              {item.title}
            </h3>

            <p className="mt-3 text-sm leading-7 text-slate-600">{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReportFilterPanel({ filters, updateFilter, years }) {
  return (
    <div className="rounded-md border border-[#D8DDE2] bg-[#F7F9FA] p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
        <input
          value={filters.search}
          onChange={(event) => updateFilter("search", event.target.value)}
          placeholder="Search by title, description, report type or source module..."
          className="h-12 rounded-md border border-[#D8DDE2] bg-white px-4 text-sm text-[#030454] outline-none transition placeholder:text-slate-400 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
        />

        <select
          value={filters.report_type}
          onChange={(event) => updateFilter("report_type", event.target.value)}
          className="h-12 rounded-md border border-[#D8DDE2] bg-white px-4 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
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
          className="h-12 rounded-md border border-[#D8DDE2] bg-white px-4 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
        >
          <option value="">All years</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ReportTypeChips({ reports, activeType, onSelect }) {
  const counts = reportTypeOptions.map((option) => ({
    ...option,
    count: reports.filter((report) => report.report_type === option.value)
      .length,
  }));

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSelect("all")}
        className={`rounded-full px-4 py-2 text-xs font-black transition ${
          activeType === "all"
            ? "bg-[#030454] text-white"
            : "bg-white text-slate-600 hover:bg-[#030454] hover:text-white"
        }`}
      >
        All reports
      </button>

      {counts.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onSelect(item.value)}
          className={`rounded-full px-4 py-2 text-xs font-black transition ${
            activeType === item.value
              ? "bg-[#030454] text-white"
              : "bg-white text-slate-600 hover:bg-[#030454] hover:text-white"
          }`}
        >
          {item.label} · {item.count}
        </button>
      ))}
    </div>
  );
}

function ReportCard({ report }) {
  const fileUrl = getReportFileUrl(report);
  const meta = getTypeMeta(report.report_type);

  return (
    <article className="group flex h-full flex-col rounded-md border border-[#D8DDE2] bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-[#009B35]/70 hover:shadow-md">
      <div className="mb-4 flex flex-wrap gap-2">
        <span
          className={`rounded-sm px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${getTypeClass(
            report.report_type
          )}`}
        >
          {report.report_type_display ||
            getOptionLabel(reportTypeOptions, report.report_type)}
        </span>

        {report.reporting_year && (
          <span className="rounded-sm bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">
            {report.reporting_year}
          </span>
        )}
      </div>

      <h3 className="text-xl font-black leading-snug text-[#030454]">
        {report.title}
      </h3>

      <p className="mt-3 line-clamp-3 text-sm leading-7 text-slate-600">
        {report.description || "No report description has been provided."}
      </p>

      <div
        className={`mt-5 rounded-md border p-4 ${getToneClasses(meta.tone)}`}
      >
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#009B35]">
          Supports
        </p>

        <p className="mt-1 text-sm font-black text-[#030454]">{meta.label}</p>
      </div>

      <div className="mt-5 grid gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500">
        {report.source_module && (
          <p>
            <span className="font-bold text-[#030454]">Source module:</span>{" "}
            {report.source_module}
          </p>
        )}

        {report.generated_by_name && (
          <p>
            <span className="font-bold text-[#030454]">Generated by:</span>{" "}
            {report.generated_by_name}
          </p>
        )}

        <p>
          <span className="font-bold text-[#030454]">Uploaded:</span>{" "}
          {formatDate(report.created_at)}
        </p>
      </div>

      <div className="mt-auto pt-6">
        {fileUrl ? (
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-md bg-[#009B35] px-5 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e]"
          >
            Open Report →
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-md bg-slate-100 px-5 py-3 text-sm font-black uppercase tracking-[0.08em] text-slate-400"
          >
            File Unavailable
          </button>
        )}
      </div>
    </article>
  );
}

function ReportLibrary({
  reports,
  filteredReports,
  filters,
  updateFilter,
  years,
  isLoading,
}) {
  return (
    <section
      id="public-report-library"
      className="bg-[#F7F9FA] px-4 py-16 sm:px-8 lg:px-10 lg:py-20"
    >
      <div className="mx-auto max-w-[1536px]">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <PublicSectionIntro
            title="Evidence library"
            description="Browse public-facing Climate Intelligence reports, greenhouse gas inventory outputs, project portfolio reports, executive briefs and data exports."
          />

          <div className="rounded-md bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-[#030454] shadow-sm">
            {formatNumber(filteredReports.length)} matching document
            {filteredReports.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <ReportFilterPanel
            filters={filters}
            updateFilter={updateFilter}
            years={years}
          />

          <ReportTypeChips
            reports={reports}
            activeType={filters.report_type}
            onSelect={(value) => updateFilter("report_type", value)}
          />
        </div>

        {isLoading ? (
          <div className="mt-10 rounded-md border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
            Loading public reports...
          </div>
        ) : (
          <div className="mt-10">
            {filteredReports.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filteredReports.map((report) => (
                  <ReportCard key={report.id || report.title} report={report} />
                ))}
              </div>
            ) : (
              <PublicEmptyState
                title="No public reports found"
                message="No published public reports match the selected filters."
              />
            )}
          </div>
        )}
      </div>
    </section>
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

      if (filters.report_type && filters.report_type !== "all") {
        params.report_type = filters.report_type;
      }

      if (filters.reporting_year) {
        params.reporting_year = filters.reporting_year;
      }

      const data = await getPublicReportDocuments(params);
      setReportsData(normalizeReportsPayload(data));
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

  const filteredReports = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    if (!search) return reports;

    return reports.filter((report) => {
      return (
        String(report.title || "").toLowerCase().includes(search) ||
        String(report.description || "").toLowerCase().includes(search) ||
        String(report.report_type_display || "")
          .toLowerCase()
          .includes(search) ||
        String(report.source_module || "").toLowerCase().includes(search)
      );
    });
  }, [reports, filters.search]);

  const years = useMemo(() => {
    const yearSet = new Set();

    reports.forEach((report) => {
      if (report.reporting_year) {
        yearSet.add(String(report.reporting_year));
      }
    });

    return Array.from(yearSet).sort((a, b) => Number(b) - Number(a));
  }, [reports]);

  const featuredReport = useMemo(() => {
    return getFeaturedReport(reports);
  }, [reports]);

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <PublicPortalHeader
        activePage="reports"
        compact
        title={<>Public reports and evidence documents</>}
        description="Access approved climate reports, evidence documents, public briefs and validated outputs published through the Kaduna Climate Command Centre."
        showActions={false}
      />

      {error && (
        <section className="px-4 py-4 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        </section>
      )}

      <EvidenceRibbon reports={reports} summary={summary} years={years} />

      <FeaturedReportPanel report={featuredReport} />

      <EvidenceUseStrip />

      <ReportLibrary
        reports={reports}
        filteredReports={filteredReports}
        filters={filters}
        updateFilter={updateFilter}
        years={years}
        isLoading={isLoading}
      />

      <section className="border-y border-slate-200 bg-[#030454] px-4 py-12 text-white sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h3 className="font-['Playfair_Display'] text-3xl font-bold">
              Return to climate intelligence portal
            </h3>

            <p className="mt-3 max-w-2xl text-sm font-light leading-7 text-white/70">
              Go back to the public portal to view the Climate Intelligence map, public
              project summary and partner information.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/public";
            }}
            className="w-fit rounded-md bg-[#009B35] px-6 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e]"
          >
            Back to Public Portal
          </button>
        </div>
      </section>

      <PublicPortalFooter />
    </main>
  );
}