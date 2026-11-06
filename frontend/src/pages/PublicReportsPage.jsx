import { useEffect, useMemo, useRef, useState } from "react";
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
import { useScrollReveal, revealClasses } from "../hooks/useScrollReveal";
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

// Matches the verified sourceModuleOptions already used by the admin
// Reports Centre (ReportsCentrePage.jsx) — source_module is a free-text
// backend field, so this is an application-level convention, not a
// database enum. Kept as a separate local copy, consistent with how
// reportTypeOptions is already duplicated between the admin and public
// report pages rather than shared across them.
const sourceModuleOptions = [
  { value: "climate_risk", label: "Climate Hazard Assessment and Risk Tracking" },
  { value: "ghg_inventory", label: "GHG Inventory" },
  { value: "project_portfolio", label: "Project Portfolio" },
  { value: "executive_dashboard", label: "Executive Dashboard" },
  { value: "administration", label: "Administration" },
  { value: "other", label: "Other" },
];

const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title A-Z" },
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

// Derives the three summary-card metrics from an UNFILTERED fetch of
// /api/public/reports/ (no report_type/reporting_year/search params), so
// the cards always reflect the global published set regardless of the
// Report Library's active filters.
//
// Each metric is null ONLY when the underlying API data is missing or
// malformed (e.g. the fetch failed, or a field isn't an array/object as
// expected) — never merely because the verified published count is 0.
// A genuinely empty, successfully-fetched dataset must render as 0, not
// "Not available".
//
// Public Reports: summary.total_public_reports (backend-authoritative
// count of ReportDocument rows that are is_active, is_public and
// status=PUBLISHED).
//
// Published Documents: a narrower count within that same set — reports
// that ALSO have an actual file attached. ReportDocument.file is
// nullable, so a report can be published with no document yet. The
// backend's get_public_file_url() returns "" when report.file is falsy
// and a real absolute URL otherwise (backend/public_portal/views.py), so
// a truthy file_url is a reliable signal of an attached, publicly
// accessible file, not an assumption — safe to count on.
//
// Report Types: count of DISTINCT report types actually represented
// among published reports (non-zero entries in summary.by_type), not the
// total number of possible ReportType choices (7).
function getReportsSummaryMetrics(unfilteredData) {
  const summary = unfilteredData?.summary || null;
  const results = unfilteredData?.results;

  const publicReportsCount = hasValidCount(summary?.total_public_reports)
    ? Number(summary.total_public_reports)
    : null;

  const publishedDocumentsCount = Array.isArray(results)
    ? results.filter((report) => Boolean(getReportFileUrl(report))).length
    : null;

  const byType = summary?.by_type;
  const reportTypesCount =
    byType && typeof byType === "object"
      ? Object.values(byType).filter((count) => Number(count) > 0).length
      : null;

  return { publicReportsCount, publishedDocumentsCount, reportTypesCount };
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

// Client-side sort over already-fetched reports (sort is not a server
// query param, so this never triggers a refetch). Mirrors the three sort
// options from the approved reference design.
function sortReports(reports, sort) {
  const list = [...reports];

  if (sort === "title") {
    return list.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
  }

  if (sort === "oldest") {
    return list.sort((a, b) => getReportSortTime(a) - getReportSortTime(b));
  }

  return list.sort((a, b) => getReportSortTime(b) - getReportSortTime(a));
}

const SUMMARY_CARD_TONES = [
  "bg-[#eef0ff] text-[#28266f] border-[#d9dcff]",
  "bg-[#e8f8ef] text-[#075f37] border-[#c9eed8]",
  "bg-[#f0e8ff] text-[#4b3a8f] border-[#e3d7fb]",
];

function SummaryCard({ label, value, tone }) {
  const isAvailable = value !== null && value !== undefined;
  const [cardRef, cardVisible] = useScrollReveal();

  return (
    <div
      ref={cardRef}
      className={revealClasses(
        cardVisible,
        `flex h-full flex-col items-start gap-1 rounded-xl border px-6 py-5 ${SUMMARY_CARD_TONES[tone]}`
      )}
      style={{ transitionDelay: cardVisible ? `${tone * 90}ms` : "0ms" }}
    >
      <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] opacity-80">
        <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
        {label}
      </span>

      <strong className="block text-3xl font-black tracking-tight">
        {isAvailable ? formatNumber(value) : "Not available"}
      </strong>
    </div>
  );
}

// The three required summary cards (Public Reports / Published Documents
// / Report Types), sourced from the unfiltered /api/public/reports/
// fetch so they never change when the Report Library's own filters do.
function ReportsSummaryCards({ metrics }) {
  const cards = [
    { label: "Public Reports", value: metrics.publicReportsCount },
    { label: "Published Documents", value: metrics.publishedDocumentsCount },
    { label: "Report Types", value: metrics.reportTypesCount },
  ];

  return (
    <PublicSection className="border-b border-[#D8DDE2] bg-[#F7F9FA]">
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card, index) => (
          <SummaryCard key={card.label} label={card.label} value={card.value} tone={index} />
        ))}
      </div>
    </PublicSection>
  );
}

const EVIDENCE_PATHS = [
  {
    key: "climate-intelligence",
    number: "01",
    kicker: "Understand the risk",
    title: "Climate intelligence",
    description:
      "Explore climate hazards, vulnerability, exposure and location-specific evidence to understand where action is most needed.",
    linkLabel: "Explore Climate Impact",
    href: "/public/climate-risk",
    icon: "bg-[#eaf0ff] text-[#263b9a]",
  },
  {
    key: "ghg-inventory",
    number: "02",
    kicker: "Measure the emissions",
    title: "GHG inventory",
    description:
      "Find inventory outputs, sector summaries and methodology that explain greenhouse gas emissions reporting.",
    linkLabel: "Explore GHG Inventory",
    href: "/public/ghg-inventory",
    icon: "bg-[#e6f7ed] text-[#078b4b]",
  },
  {
    key: "projects",
    number: "03",
    kicker: "Track the response",
    title: "Projects & progress",
    description:
      "Review public project records and published progress evidence, with planned outcomes clearly distinguished from verified results.",
    linkLabel: "Explore Climate Projects",
    href: "/public/projects",
    icon: "bg-[#f7fbd8] text-[#5b6700]",
  },
  {
    key: "briefs",
    number: "04",
    kicker: "Support decisions",
    title: "Policy & executive briefs",
    description:
      "Use concise, approved summaries to connect findings with planning priorities, coordination and climate policy.",
    linkLabel: "Browse reports and briefs",
    href: "#evidence-library",
    icon: "bg-[#f0edff] text-[#5e4bb4]",
  },
];

function EvidencePathCard({ item, index = 0 }) {
  const [cardRef, cardVisible] = useScrollReveal();

  return (
    <article
      ref={cardRef}
      className={revealClasses(
        cardVisible,
        "flex min-h-[220px] flex-col rounded-2xl border border-[#D8DDE2] bg-white p-5 shadow-sm hover:-translate-y-1 hover:shadow-md"
      )}
      style={{ transitionDelay: cardVisible ? `${index * 80}ms` : "0ms" }}
    >
      <div className="flex items-center justify-between">
        <span className={`grid h-11 w-11 place-items-center rounded-xl text-lg font-black ${item.icon}`}>
          {item.number}
        </span>
      </div>

      <span className="mt-4 text-[9px] font-black uppercase tracking-[0.16em] text-[#009B35]">
        {item.kicker}
      </span>
      <h3 className="mt-1.5 text-lg font-black leading-tight text-[#030454]">{item.title}</h3>
      <p className="mt-2 flex-1 text-xs leading-6 text-slate-600">{item.description}</p>

      <a
        href={item.href}
        className="mt-4 inline-flex w-fit items-center gap-2 text-xs font-black text-[#009B35] hover:underline"
      >
        {item.linkLabel}
        <span aria-hidden="true">{item.href.startsWith("#") ? "↓" : "↗"}</span>
      </a>
    </article>
  );
}

function ExploreEvidenceSection() {
  return (
    <PublicSection className="border-b border-[#D8DDE2] bg-white">
      <PublicSectionHeading
        eyebrow="Explore the evidence"
        title="Climate evidence, organised for action."
        description="Move from climate signals to emissions evidence, project delivery and policy decisions — all through one public library."
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {EVIDENCE_PATHS.map((item, index) => (
          <EvidencePathCard key={item.key} item={item} index={index} />
        ))}
      </div>
    </PublicSection>
  );
}

const HOW_IT_WORKS_STEPS = [
  {
    key: "discover",
    label: "Step 01",
    title: "Discover a publication",
    description: "Search by topic, reporting year, document type or source module.",
  },
  {
    key: "context",
    label: "Step 02",
    title: "Check the context",
    description: "Review the reporting period, issuer, version and methodology before drawing conclusions.",
  },
  {
    key: "access",
    label: "Step 03",
    title: "Access and cite the evidence",
    description: "Open the published document and retain its source details when sharing findings.",
  },
];

function HowItWorksSection() {
  return (
    <PublicSection className="border-b border-[#D8DDE2] bg-white">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#009B35]">
            A simple way through the data
          </span>
          <h2 className="mt-3 font-['Playfair_Display'] text-3xl font-bold leading-tight text-[#030454] sm:text-4xl">
            Find it. Understand it. Put it to work.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-slate-600">
            Every publication should make its source, coverage and limitations clear — so the
            evidence can be interpreted responsibly.
          </p>
          <a
            href="#evidence-library"
            className="mt-5 inline-flex w-fit items-center gap-2 rounded-md bg-[#030454] px-5 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#060a7a]"
          >
            Start with the library <span aria-hidden="true">↓</span>
          </a>
        </div>

        <div className="space-y-6">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <div key={step.key} className="flex gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#030454] text-base font-black text-[#E9FF35]">
                {step.label.replace("Step ", "")}
              </span>
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[#009B35]">
                  {step.label}
                </span>
                <h3 className="mt-0.5 text-base font-black text-[#030454]">{step.title}</h3>
                <p className="mt-1 text-xs leading-6 text-slate-600">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PublicSection>
  );
}

const AUDIENCE_CARDS = [
  {
    key: "residents",
    label: "Residents",
    title: "Read public summaries first",
    description:
      "Start with executive briefs and Climate Intelligence reports to understand what the evidence means for your community or LGA.",
  },
  {
    key: "policy",
    label: "Policy teams",
    title: "Use reports for prioritisation",
    description:
      "Use Climate Intelligence, GHG inventory and project portfolio reports to support adaptation planning, budgeting discussions and coordination.",
  },
  {
    key: "partners",
    label: "Partners",
    title: "Locate evidence-backed entry points",
    description:
      "Use project and risk reports to identify where technical support, finance or implementation partnerships may be useful.",
  },
];

function AudienceCard({ card, index }) {
  const [cardRef, cardVisible] = useScrollReveal();

  return (
    <article
      ref={cardRef}
      className={revealClasses(
        cardVisible,
        "rounded-2xl border border-[#D8DDE2] bg-white p-5 shadow-sm hover:-translate-y-1 hover:shadow-md"
      )}
      style={{ transitionDelay: cardVisible ? `${index * 80}ms` : "0ms" }}
    >
      <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#009B35]">
        {card.label}
      </span>
      <h3 className="mt-1.5 text-base font-black leading-snug text-[#030454]">{card.title}</h3>
      <p className="mt-2 text-xs leading-6 text-slate-600">{card.description}</p>
    </article>
  );
}

function AudienceSection() {
  return (
    <PublicSection className="border-b border-[#D8DDE2] bg-white">
      <div className="grid gap-4 sm:grid-cols-3">
        {AUDIENCE_CARDS.map((card, index) => (
          <AudienceCard key={card.key} card={card} index={index} />
        ))}
      </div>
    </PublicSection>
  );
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

// Bound to the SAME filters.report_type state as the dropdown in
// ReportFilterPanel below, rather than introducing a second, independent
// filter dimension — the reference's demo used two separate state fields
// (category + type) that could silently contradict each other.
function CategoryPillRow({ activeType, total, items, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by report category">
      <button
        type="button"
        onClick={() => onSelect("all")}
        aria-pressed={activeType === "all"}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition motion-safe:active:scale-95 ${
          activeType === "all"
            ? "border-[#030454] bg-[#030454] text-white"
            : "border-[#D8DDE2] bg-white text-slate-600 hover:-translate-y-0.5 hover:border-[#009B35]/45"
        }`}
      >
        All reports
        <b className="opacity-70">{total}</b>
      </button>

      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onSelect(item.value)}
          aria-pressed={activeType === item.value}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition motion-safe:active:scale-95 ${
            activeType === item.value
              ? "border-[#030454] bg-[#030454] text-white"
              : "border-[#D8DDE2] bg-white text-slate-600 hover:-translate-y-0.5 hover:border-[#009B35]/45"
          }`}
        >
          {item.label}
          <b className="opacity-70">{item.count}</b>
        </button>
      ))}
    </div>
  );
}

function ReportFilterPanel({ filters, updateFilter, years }) {
  return (
    <PublicCard className="p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_140px_200px]">
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

        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            Source module
          </span>
          <select
            value={filters.source_module}
            onChange={(event) => updateFilter("source_module", event.target.value)}
            className="h-10 w-full rounded-md border border-[#D8DDE2] bg-white px-3.5 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
          >
            <option value="all">All source modules</option>
            {sourceModuleOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </PublicCard>
  );
}

// Accessible report-details modal. Receives the actual DOM node that
// triggered it (not a ref object), so focus restoration on close never
// depends on a ref whose current value could already have moved on.
function ReportDetailsModal({ report, onClose, triggerElement }) {
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const triggerElementRef = useRef(triggerElement);
  // The parent keys this component by report id, so each report opened
  // is a fresh mount and this always starts false -- no reduced-motion
  // branch needed here since the enter transition is pure opacity/scale
  // and motion-reduce: below removes it without changing end state.
  const [isEntered, setIsEntered] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    triggerElementRef.current = triggerElement;
  }, [triggerElement]);

  // Deliberately empty deps: this must run exactly once on mount and its
  // cleanup exactly once on unmount, so focus restoration can never be
  // triggered by an unrelated parent re-render changing onClose's identity.
  useEffect(() => {
    closeButtonRef.current?.focus();
    const frame = requestAnimationFrame(() => setIsEntered(true));

    return () => {
      cancelAnimationFrame(frame);
      triggerElementRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) return;

      const focusable = modalRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      // If focus has somehow landed outside the dialog entirely, pull it
      // back in rather than only handling the first/last boundary case.
      if (!modalRef.current.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!report) return null;

  const fileUrl = getReportFileUrl(report);
  const fileFormat = getReportFileFormat(fileUrl);
  const typeLabel =
    report.report_type_display || getOptionLabel(reportTypeOptions, report.report_type);
  const dateLabel = getReportDateLabel(report);

  // Only real fields the backend actually returns (see
  // backend/public_portal/views.py's public_report_documents) — no
  // invented metadata such as licence, version or methodology.
  const fields = [
    ["Report type", typeLabel !== "—" ? typeLabel : null],
    ["Reporting year", report.reporting_year ? String(report.reporting_year) : null],
    ["Source module", report.source_module || null],
    ["Published", dateLabel],
    ["File format", fileFormat],
  ].filter(([, value]) => Boolean(value));

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[#060a35]/70 p-5 backdrop-blur-sm transition-opacity duration-300 motion-reduce:transition-none ${
        isEntered ? "opacity-100" : "opacity-0"
      }`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        className={`max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl bg-white shadow-2xl transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none motion-reduce:scale-100 ${
          isEntered ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <div className="flex items-start justify-between gap-4 bg-[#030454] px-6 py-5 text-white">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#E9FF35]">
              Report details
            </p>
            <h2 id="report-modal-title" className="mt-1 text-xl font-black leading-tight">
              {report.title}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close report details"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/40 text-lg transition hover:bg-white/10"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          {report.description && (
            <p className="text-sm leading-7 text-slate-600">{report.description}</p>
          )}

          {fields.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {fields.map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[#D8DDE2] p-3">
                  <small className="block text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                    {label}
                  </small>
                  <strong className="mt-1 block text-sm text-[#030454]">{value}</strong>
                </div>
              ))}
            </div>
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
        </div>
      </div>
    </div>
  );
}

function ReportRow({ report, onViewDetails }) {
  const fileUrl = getReportFileUrl(report);
  const fileFormat = getReportFileFormat(fileUrl);
  const metaParts = buildReportMetaParts(report);

  return (
    <div className="flex flex-col gap-3 border-b border-[#E6EAEC] bg-white px-4 py-4 transition last:border-b-0 hover:bg-[#F7F9FA] sm:flex-row sm:items-center sm:justify-between sm:px-5">
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

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={(event) => onViewDetails(report, event.currentTarget)}
          className="rounded-md px-2 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#009B35] transition hover:underline"
        >
          View details
        </button>

        {fileUrl ? (
          <>
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
          </>
        ) : (
          <span className="text-xs font-black uppercase tracking-[0.08em] text-slate-400">
            File unavailable
          </span>
        )}
      </div>
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
  categoryPills,
  onResetFilters,
  onViewDetails,
}) {
  const hasAnyReports = reports.length > 0;

  return (
    <PublicSection id="public-report-library" className="bg-[#F7F9FA]">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <PublicSectionHeading
          eyebrow="Evidence library"
          title="Report Library"
          description="Browse public-facing Climate Intelligence reports, greenhouse gas inventory outputs, project portfolio reports and executive briefs."
        />

        {hasAnyReports && !isLoading && (
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
            Showing {formatNumber(filteredReports.length)} of {formatNumber(reports.length)} report
            {reports.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {hasAnyReports && (
        <>
          <div className="mt-6">
            <ReportFilterPanel
              filters={filters}
              updateFilter={updateFilter}
              years={years}
            />
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CategoryPillRow
              activeType={filters.report_type}
              total={categoryPills.total}
              items={categoryPills.items}
              onSelect={(value) => updateFilter("report_type", value)}
            />

            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={onResetFilters}
                className="whitespace-nowrap text-xs font-black uppercase tracking-[0.08em] text-slate-500 transition hover:text-[#030454]"
              >
                Reset filters
              </button>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
                Sort by
                <select
                  value={filters.sort}
                  onChange={(event) => updateFilter("sort", event.target.value)}
                  className="h-9 rounded-md border border-[#D8DDE2] bg-white px-2.5 text-xs font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
                >
                  {sortOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </>
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
        <div className="mt-6">
          {filteredReports.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-[#D8DDE2] bg-white">
              {filteredReports.map((report) => (
                <ReportRow
                  key={report.id || report.title}
                  report={report}
                  onViewDetails={onViewDetails}
                />
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

const DEFAULT_FILTERS = {
  report_type: "all",
  reporting_year: "",
  search: "",
  source_module: "all",
  sort: "newest",
};

export default function PublicReportsPage() {
  const [reportsData, setReportsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  // Single unfiltered fetch, once, on mount. The backend already returns
  // the complete, unpaginated published set (see
  // backend/public_portal/views.py's public_report_documents — no limit
  // or pagination is applied), so report type, year, search, source
  // module and sorting are all applied client-side below instead of
  // re-fetching per filter change. This is also the authoritative source
  // for the three global summary cards, since it is never re-filtered.
  useEffect(() => {
    let cancelled = false;

    getPublicReportDocuments({})
      .then((data) => {
        if (!cancelled) {
          setReportsData(normalizeReportsPayload(data));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setError("Could not load public reports.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const allReports = useMemo(() => reportsData?.results || [], [reportsData]);

  const summaryMetrics = useMemo(
    () => getReportsSummaryMetrics(reportsData),
    [reportsData]
  );

  const categoryPills = useMemo(() => {
    const byType = reportsData?.summary?.by_type || {};

    return {
      total: hasValidCount(reportsData?.summary?.total_public_reports)
        ? reportsData.summary.total_public_reports
        : 0,
      items: reportTypeOptions.map((option) => ({
        value: option.value,
        label: option.label.replace(" Report", ""),
        count: Number(byType[option.value]) || 0,
      })),
    };
  }, [reportsData]);

  // Mirrors what used to be the server-filtered-by-type-and-year response
  // (requestKey was `${report_type}|${reporting_year}`) — the Latest
  // Publication panel and the "showing X of Y" count both key off this,
  // same as before. Search/source module/sort remain purely additive on
  // top, same as before.
  const reportsMatchingPrimaryFilters = useMemo(() => {
    return allReports.filter((report) => {
      const matchesType =
        filters.report_type === "all" || report.report_type === filters.report_type;
      const matchesYear =
        !filters.reporting_year ||
        String(report.reporting_year || "") === filters.reporting_year;

      return matchesType && matchesYear;
    });
  }, [allReports, filters.report_type, filters.reporting_year]);

  const filteredReports = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    const matched = reportsMatchingPrimaryFilters.filter((report) => {
      const matchesSearch =
        !search ||
        String(report.title || "").toLowerCase().includes(search) ||
        String(report.description || "").toLowerCase().includes(search) ||
        String(report.report_type_display || "")
          .toLowerCase()
          .includes(search) ||
        String(report.source_module || "").toLowerCase().includes(search);

      const matchesSourceModule =
        filters.source_module === "all" ||
        String(report.source_module || "") === filters.source_module;

      return matchesSearch && matchesSourceModule;
    });

    return sortReports(matched, filters.sort);
  }, [reportsMatchingPrimaryFilters, filters.search, filters.source_module, filters.sort]);

  // Year options narrow with the active report-type filter (the same
  // facet relationship that existed when this list came from a
  // type-filtered server response), but never self-narrow from the year
  // filter itself.
  const years = useMemo(() => {
    const yearSet = new Set();

    allReports.forEach((report) => {
      if (
        report.reporting_year &&
        (filters.report_type === "all" || report.report_type === filters.report_type)
      ) {
        yearSet.add(String(report.reporting_year));
      }
    });

    return Array.from(yearSet).sort((a, b) => Number(b) - Number(a));
  }, [allReports, filters.report_type]);

  const featuredReport = useMemo(() => {
    return getFeaturedReport(reportsMatchingPrimaryFilters);
  }, [reportsMatchingPrimaryFilters]);

  const [selectedReport, setSelectedReport] = useState(null);
  const [modalTriggerElement, setModalTriggerElement] = useState(null);

  function handleViewDetails(report, triggerElement) {
    setSelectedReport(report);
    setModalTriggerElement(triggerElement || null);
  }

  // Deliberately does not clear modalTriggerElement: the modal is about
  // to unmount (selectedReport becomes null) and has already captured the
  // trigger element internally while mounted. It is simply overwritten
  // the next time a report is opened.
  function handleCloseDetails() {
    setSelectedReport(null);
  }

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
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

      <ReportsHero publishedCount={summaryMetrics.publicReportsCount ?? allReports.length} />

      <ReportsSummaryCards metrics={summaryMetrics} />

      <ExploreEvidenceSection />

      <HowItWorksSection />

      <AudienceSection />

      <LatestPublicationSection report={featuredReport} />

      <ReportLibrary
        reports={reportsMatchingPrimaryFilters}
        filteredReports={filteredReports}
        filters={filters}
        updateFilter={updateFilter}
        years={years}
        isLoading={isLoading}
        categoryPills={categoryPills}
        onResetFilters={resetFilters}
        onViewDetails={handleViewDetails}
      />

      <PublicPortalFooter />

      {selectedReport && (
        <ReportDetailsModal
          key={selectedReport.id || selectedReport.title}
          report={selectedReport}
          onClose={handleCloseDetails}
          triggerElement={modalTriggerElement}
        />
      )}
    </main>
  );
}
