import { useEffect, useMemo, useState } from "react";
import {
  PublicCard,
  PublicEmptyState,
  PublicErrorBanner,
  PublicLoadingState,
  PublicPortalFooter,
  PublicPortalHeader,
  PublicSection,
  PublicSectionHeading,
} from "../components/PublicPortalChrome";
import { getPublicReportDocuments } from "../services/api";
import { PUBLIC_EVENT_NAMES, trackPublicEvent } from "../config/analytics";

const reportTypeOptions = [
  { value: "climate_risk", label: "Climate Impact Report" },
  { value: "ghg_inventory", label: "GHG Inventory Report" },
  { value: "project_portfolio", label: "Project Portfolio Report" },
  { value: "ndc_progress", label: "NDC Progress Report" },
  { value: "executive_brief", label: "Executive Brief" },
  { value: "data_export", label: "Data Export" },
  { value: "other", label: "Other" },
];

function hasValidCount(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

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

// Fires the report_downloaded analytics event at the moment a user
// actually opens/downloads a report file — never for merely viewing the
// Reports page. Sends only a stable report identifier, never the file URL
// (which may carry a signed/query-string component) or the full report object.
function trackReportDownloaded(report) {
  trackPublicEvent(PUBLIC_EVENT_NAMES.REPORT_DOWNLOADED, {
    report: report.id || report.title,
  });
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

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

// Reporting year first (the report's actual subject year), falling back to
// the upload date. Returns null (never a fabricated date) when neither
// exists, so callers can omit the field entirely.
function getReportDateLabel(report) {
  if (report.reporting_year) return String(report.reporting_year);

  const date = parseDate(report.created_at);

  return date
    ? date.toLocaleDateString(undefined, { year: "numeric", month: "short" })
    : null;
}

// Reads the file extension directly from the real file_url — never a
// fabricated/assumed format. Returns null when there is no file or no
// discoverable extension.
function getReportFileFormat(fileUrl) {
  if (!fileUrl) return null;

  const match = String(fileUrl).split("?")[0].match(/\.([a-zA-Z0-9]{2,5})$/);

  return match ? match[1].toUpperCase() : null;
}

// Compact "Type · Date · Format" meta line shared by the Latest Publication
// panel and the report library rows — omits any part that is genuinely
// unavailable rather than showing a repeated "Not available".
function buildReportMetaParts(report) {
  const parts = [];
  const typeLabel =
    report.report_type_display || getOptionLabel(reportTypeOptions, report.report_type);

  if (typeLabel && typeLabel !== "—") parts.push(typeLabel);

  const dateLabel = getReportDateLabel(report);
  if (dateLabel) parts.push(dateLabel);

  const format = getReportFileFormat(getReportFileUrl(report));
  if (format) parts.push(format);

  return parts;
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

function ReportsHero({ publishedCount }) {
  return (
    <PublicSection className="border-b border-[#D8DDE2] bg-white">
      <div className="max-w-3xl py-2">
        <h1 className="text-balance font-['Playfair_Display'] text-4xl font-black leading-tight text-[#030454] sm:text-5xl">
          Reports &amp; Publications
        </h1>

        <p className="mt-4 text-pretty text-base leading-8 text-slate-600 sm:text-lg">
          Access approved climate reports, technical assessments, policy
          briefs, inventories and project reports published by the Kaduna
          Climate Command Centre.
        </p>

        <p className="mt-4 text-xs font-bold uppercase tracking-[0.1em] text-[#009B35]">
          {publishedCount > 0
            ? `${formatNumber(publishedCount)} published document${publishedCount === 1 ? "" : "s"}`
            : "No public reports have been published yet."}
        </p>
      </div>
    </PublicSection>
  );
}

function LatestPublicationSection({ report }) {
  if (!report) return null;

  const fileUrl = getReportFileUrl(report);
  const metaParts = buildReportMetaParts(report);
  const fileFormat = getReportFileFormat(fileUrl);

  return (
    <PublicSection className="bg-[#F7F9FA]">
      <PublicSectionHeading title="Latest Publication" />

      <PublicCard className="mt-5 p-6 sm:p-7">
        <p className="text-balance font-['Playfair_Display'] text-2xl font-bold leading-tight text-[#030454] sm:text-3xl">
          {report.title}
        </p>

        {report.description && (
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            {report.description}
          </p>
        )}

        {metaParts.length > 0 && (
          <p className="mt-4 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
            {metaParts.join(" · ")}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {fileUrl ? (
            <>
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackReportDownloaded(report)}
                className="rounded-md border border-[#030454] px-5 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:bg-[#030454] hover:text-white"
              >
                View Report
              </a>
              <a
                href={fileUrl}
                download
                onClick={() => trackReportDownloaded(report)}
                className="rounded-md bg-[#009B35] px-5 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e]"
              >
                Download{fileFormat ? ` ${fileFormat}` : ""}
              </a>
            </>
          ) : (
            <span className="text-xs font-black uppercase tracking-[0.08em] text-slate-400">
              File unavailable
            </span>
          )}
        </div>
      </PublicCard>
    </PublicSection>
  );
}

function ReportFilterPanel({ filters, updateFilter, years }) {
  return (
    <PublicCard className="p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_220px_180px]">
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            Search
          </span>
          <input
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Search by title, description, report type or source module..."
            className="h-10 w-full rounded-md border border-[#D8DDE2] bg-white px-3.5 text-sm text-[#030454] outline-none transition placeholder:text-slate-500 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            Report type
          </span>
          <select
            value={filters.report_type}
            onChange={(event) => updateFilter("report_type", event.target.value)}
            className="h-10 w-full rounded-md border border-[#D8DDE2] bg-white px-3.5 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
          >
            <option value="all">All report types</option>
            {reportTypeOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            Year
          </span>
          <select
            value={filters.reporting_year}
            onChange={(event) =>
              updateFilter("reporting_year", event.target.value)
            }
            className="h-10 w-full rounded-md border border-[#D8DDE2] bg-white px-3.5 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
          >
            <option value="">All years</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>
    </PublicCard>
  );
}

function ReportRow({ report }) {
  const fileUrl = getReportFileUrl(report);
  const fileFormat = getReportFileFormat(fileUrl);
  const metaParts = buildReportMetaParts(report);

  return (
    <div className="flex flex-col gap-3 border-b border-[#E6EAEC] bg-white px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="text-balance text-base font-bold leading-snug text-[#030454]">
          {report.title}
        </p>

        {report.description && (
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
            {report.description}
          </p>
        )}

        {metaParts.length > 0 && (
          <p className="mt-1.5 text-xs font-black uppercase tracking-[0.06em] text-slate-400">
            {metaParts.join(" · ")}
          </p>
        )}
      </div>

      {fileUrl ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackReportDownloaded(report)}
            className="rounded-md border border-[#030454] px-3.5 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:bg-[#030454] hover:text-white"
          >
            View Report
          </a>
          <a
            href={fileUrl}
            download
            onClick={() => trackReportDownloaded(report)}
            className="rounded-md bg-[#009B35] px-3.5 py-2 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e]"
          >
            Download{fileFormat ? ` ${fileFormat}` : ""}
          </a>
        </div>
      ) : (
        <span className="shrink-0 text-xs font-black uppercase tracking-[0.08em] text-slate-400">
          File unavailable
        </span>
      )}
    </div>
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
  const hasAnyReports = reports.length > 0;

  return (
    <PublicSection id="public-report-library" className="bg-[#F7F9FA]">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <PublicSectionHeading title="Report Library" />

        {hasAnyReports && !isLoading && (
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
            Showing {formatNumber(filteredReports.length)} of {formatNumber(reports.length)} report
            {reports.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {hasAnyReports && (
        <div className="mt-6">
          <ReportFilterPanel
            filters={filters}
            updateFilter={updateFilter}
            years={years}
          />
        </div>
      )}

      {isLoading ? (
        <PublicLoadingState
          message="Loading public reports..."
          className="mt-10"
          maxWidthClassName="max-w-none"
        />
      ) : !hasAnyReports ? (
        <div className="mt-8">
          <PublicEmptyState
            title="No public reports found"
            message="Approved KCCC reports and publications will appear here once they are published."
          />
        </div>
      ) : (
        <div className="mt-8">
          {filteredReports.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-[#D8DDE2] bg-white">
              {filteredReports.map((report) => (
                <ReportRow key={report.id || report.title} report={report} />
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
    </PublicSection>
  );
}

export default function PublicReportsPage() {
  const [reportsData, setReportsData] = useState(null);
  const [filters, setFilters] = useState({
    report_type: "all",
    reporting_year: "",
    search: "",
  });

  const requestKey = `${filters.report_type}|${filters.reporting_year}`;
  const [settledRequestKey, setSettledRequestKey] = useState(null);
  const [requestError, setRequestError] = useState(null);

  const isLoading = settledRequestKey !== requestKey;
  const error = !isLoading && requestError?.key === requestKey ? requestError.message : "";

  useEffect(() => {
    let cancelled = false;
    const key = requestKey;

    const params = {};

    if (filters.report_type && filters.report_type !== "all") {
      params.report_type = filters.report_type;
    }

    if (filters.reporting_year) {
      params.reporting_year = filters.reporting_year;
    }

    getPublicReportDocuments(params)
      .then((data) => {
        if (!cancelled) {
          setReportsData(normalizeReportsPayload(data));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setRequestError({ key, message: "Could not load public reports." });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSettledRequestKey(key);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const reports = useMemo(() => reportsData?.results || [], [reportsData]);
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

  // summary.total_public_reports is the authoritative API count (see
  // backend/public_portal/views.py's public_report_documents); reports.length
  // is used only as a fallback when that field is absent, never when the
  // whole fetch failed.
  const publishedCount = hasValidCount(summary.total_public_reports)
    ? summary.total_public_reports
    : reports.length;

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
        showHero={false}
        showActions={false}
      />

      <PublicErrorBanner message={error} maxWidthClassName="max-w-7xl" />

      <ReportsHero publishedCount={publishedCount} />

      <LatestPublicationSection report={featuredReport} />

      <ReportLibrary
        reports={reports}
        filteredReports={filteredReports}
        filters={filters}
        updateFilter={updateFilter}
        years={years}
        isLoading={isLoading}
      />

      <PublicPortalFooter />
    </main>
  );
}
