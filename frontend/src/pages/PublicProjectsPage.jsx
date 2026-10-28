import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, Layers, Leaf, Wallet, X } from "lucide-react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  PublicCard,
  PublicEmptyState,
  PublicErrorBanner,
  PublicFaqAccordion,
  PublicDisclaimerNote,
  PublicLoadingState,
  PublicPortalFooter,
  PublicPortalHeader,
  PublicPrimaryButton,
  PublicSecondaryButton,
  PublicSection,
  PublicSectionHeading,
} from "../components/PublicPortalChrome";
import { getClimateIntelligenceProfile, getPublicPortalSummary } from "../services/api";
import { PUBLIC_EVENT_NAMES, trackPublicEvent } from "../config/analytics";
import { deriveActionPathways } from "../utils/climatePathways";
import ClimateActionOpportunitiesPanel from "../components/ClimateActionOpportunitiesPanel";
import { SECTOR_LABELS } from "../decision-support/climateRecommendations.js";
import { readProjectPathwayContext, matchesContributingProject } from "../utils/projectPathwayContext.js";
import ProjectPathwayNotice from "../components/ProjectPathwayNotice";
import {
  hasValidNumber,
  formatNumber,
  formatCompactNumber,
  formatNaira,
  getProjectSector,
  getProjectStatus,
  getProjectStatusKey,
  getProjectLga,
  getProjectFundingSource,
  getProjectImplementingMda,
  getProjectExternalLink,
  getProjectReduction,
  getProjectBeneficiaries,
  getProjectValue,
  getProjectSummary,
  getProjectDescription,
  getProjectPeriod,
  getStatusMeta,
} from "../utils/publicProjectFields.js";

const KADUNA_CENTER = [10.5105, 7.4165];

const NIGERIA_BOUNDS = [
  [3.5, 2.5],
  [14.5, 15.0],
];

// ---------------------------------------------------------------------------
// Image mapping — add new project titles here as lowercase keys
// ---------------------------------------------------------------------------

const PROJECT_TITLE_IMAGE_MAP = {
  "kaduna north blue carbon & ecosystem restoration": "afforestation.jfif",
  "makarfi iii mini-grids project": "grids.jfif",
  "chikun afforestation": "afforestation1.jfif",
  "lere afforestation project": "tree.jpg",
  "chikun solar mini-grid project": "mini_grid.jfif",
  "kaduna urban flood drainage upgrade": "infrastructure.jfif",
};

const PROJECT_IMAGE_DEFAULT = "afforestation.jfif";

// ---------------------------------------------------------------------------

const kadunaOuterBoundaryStyle = {
  color: "#030454",
  weight: 4,
  opacity: 1,
  fillOpacity: 0,
  lineCap: "round",
  lineJoin: "round",
};

const lgaBoundaryStyle = {
  color: "#030454",
  weight: 1.6,
  opacity: 0.55,
  fillColor: "#009B35",
  fillOpacity: 0.05,
  lineCap: "round",
  lineJoin: "round",
};

const LGA_LABEL_CONFIG = {
  "birnin gwari": {
    position: [10.72, 6.52],
    label: "BIRNIN GWARI",
    minZoom: 7.2,
    size: "large",
  },
  giwa: { position: [11.18, 7.3], label: "GIWA", minZoom: 7.4 },
  igabi: { position: [10.79, 7.55], label: "IGABI", minZoom: 7.4 },
  chikun: { position: [10.38, 7.25], label: "CHIKUN", minZoom: 7.4 },
  kajuru: { position: [10.28, 7.72], label: "KAJURU", minZoom: 7.4 },
  kauru: { position: [10.1, 8.16], label: "KAURU", minZoom: 7.4 },
  "zangon kataf": {
    position: [9.94, 7.78],
    label: "ZANGON KATAF",
    minZoom: 7.4,
  },
  kachia: { position: [9.83, 7.83], label: "KACHIA", minZoom: 7.4 },
  kagarko: { position: [9.56, 7.55], label: "KAGARKO", minZoom: 7.4 },
  jaba: { position: [9.57, 8.16], label: "JABA", minZoom: 8.1 },
  "jema'a": { position: [9.49, 8.27], label: "JEMA'A", minZoom: 8.1 },
  jemaa: { position: [9.49, 8.27], label: "JEMA'A", minZoom: 8.1 },
  sanga: { position: [9.32, 8.37], label: "SANGA", minZoom: 7.4 },
  kaura: { position: [9.82, 8.5], label: "KAURA", minZoom: 8.1 },
  lere: { position: [10.45, 8.55], label: "LERE", minZoom: 7.4 },
  kubau: { position: [10.8, 8.38], label: "KUBAU", minZoom: 7.4 },
  ikara: { position: [11.2, 8.23], label: "IKARA", minZoom: 7.4 },
  soba: { position: [11.02, 7.92], label: "SOBA", minZoom: 8.5 },
  zaria: { position: [11.08, 7.67], label: "ZARIA", minZoom: 8.7 },
  "sabon gari": {
    position: [11.17, 7.71],
    label: "SABON GARI",
    minZoom: 8.7,
  },
  kudan: { position: [11.24, 7.7], label: "KUDAN", minZoom: 8.6 },
  makarfi: { position: [11.39, 7.89], label: "MAKARFI", minZoom: 8.5 },
  "kaduna north": {
    position: [10.58, 7.45],
    label: "KADUNA NORTH",
    minZoom: 9.4,
  },
  "kaduna south": {
    position: [10.47, 7.44],
    label: "KADUNA SOUTH",
    minZoom: 9.4,
  },
};

const aboutDataItems = [
  {
    title: "What project information is shown publicly?",
    body: "The public project portfolio shows approved summary information such as project title, sector, LGA, implementation status, funding source, expected beneficiaries, estimated GHG reduction figures and public project descriptions.",
  },
  {
    title: "Why are financial values not shown?",
    body: "Financial values are intentionally excluded from the public project view. Detailed budget, funding amount and procurement information should only be shown through approved official reporting channels where appropriate.",
  },
  {
    title: "How are project locations shown?",
    body: "Project points are shown using latitude and longitude coordinates recorded for each project. Where coordinates are not yet available, the project remains visible in the showcase but will not appear as a point on the map.",
  },
  {
    title: "How should the estimated GHG figures be interpreted?",
    body: "Individual projects show an 'Estimated GHG reduction' figure representing expected mitigation outcomes, which may come from avoided emissions (for example, cleaner energy projects) or direct removals (for example, afforestation and other land-based projects). The portfolio-wide total is shown as 'Estimated GHG impact' because it combines both mechanisms without double-counting. These are planning estimates unless independently verified and published through approved technical reports.",
  },
  {
    title: "Proper use of the data",
    body: "The public portfolio should support transparency, coordination and awareness. Technical users should consult approved project documents, implementation reports and evidence records before making formal decisions.",
  },
];

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/'/g, "'")
    .replace(/`/g, "'")
    .replace(/ʻ/g, "'")
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getApiOrigins() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const origins = [];
  try {
    if (apiBaseUrl) {
      origins.push(new URL(apiBaseUrl, window.location.origin).origin);
    }
  } catch {
    // Ignore invalid env URL.
  }
  origins.push("http://127.0.0.1:8000");
  origins.push("http://localhost:8000");
  origins.push("");
  return Array.from(new Set(origins));
}

function mediaUrl(path, origin = "") {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return origin ? `${origin}${safePath}` : safePath;
}

// ---------------------------------------------------------------------------
// Direct title → image lookup. Add new entries to PROJECT_TITLE_IMAGE_MAP.
// ---------------------------------------------------------------------------
function buildProjectImageCandidates(project) {
  const titleKey = String(project.title || "").trim().toLowerCase();
  const fileName = PROJECT_TITLE_IMAGE_MAP[titleKey] || PROJECT_IMAGE_DEFAULT;
  return getApiOrigins().map((origin) =>
    mediaUrl(`/media/project_images/${fileName}`, origin)
  );
}

function getUniqueOptions(projects, getter) {
  return Array.from(
    new Set(
      projects
        .map((project) => getter(project))
        .filter((value) => value && value !== "Not specified")
    )
  ).sort((a, b) => String(a).localeCompare(String(b)));
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ProjectImageFallback({ project, label = "Climate Action Project" }) {
  return (
    <div className="flex h-full min-h-[260px] items-center justify-center bg-gradient-to-br from-[#030454] via-[#009B35] to-[#030454] px-8 text-center">
      <div>
        <p className="font-['Playfair_Display'] text-4xl font-bold text-white">
          {getProjectSector(project)}
        </p>
        <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-white/75">
          {label}
        </p>
      </div>
    </div>
  );
}

export function ProjectImage({
  project,
  alt,
  label,
  className = "h-full w-full object-cover",
}) {
  const candidates = useMemo(
    () => buildProjectImageCandidates(project),
    [project]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [candidateIndexForProject, setCandidateIndexForProject] = useState(project);

  if (project !== candidateIndexForProject) {
    setCandidateIndexForProject(project);
    setCandidateIndex(0);
  }

  if (!candidates.length || candidateIndex >= candidates.length) {
    return <ProjectImageFallback project={project} label={label} />;
  }

  return (
    <img
      src={candidates[candidateIndex]}
      alt={alt || project.title || "Climate action project"}
      className={className}
      onError={() => setCandidateIndex((current) => current + 1)}
    />
  );
}

function getProjectCoordinates(project) {
  const latitude = Number(project.latitude);
  const longitude = Number(project.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  return [latitude, longitude];
}

function isCoordinateInsideNigeria(coordinates) {
  if (!coordinates) return false;
  const [latitude, longitude] = coordinates;
  const [[south, west], [north, east]] = NIGERIA_BOUNDS;
  return (
    latitude >= south &&
    latitude <= north &&
    longitude >= west &&
    longitude <= east
  );
}

function getValidNigeriaProjectCoordinates(project) {
  const coordinates = getProjectCoordinates(project);
  if (!isCoordinateInsideNigeria(coordinates)) return null;
  return coordinates;
}

export function SummaryChip({ label, value, helper }) {
  return (
    <PublicCard className="px-4 py-4">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-xl font-black text-[#030454]">{value}</p>
      {helper && (
        <p className="mt-1 text-xs leading-5 text-slate-600">{helper}</p>
      )}
    </PublicCard>
  );
}

// summary.total_projects is the authoritative API count; a real client-side
// projects.length is used only as a fallback when the API omits that field
// (never when the whole fetch failed, which must read as "Not available"
// rather than a fabricated 0).
function formatProjectCount(summaryTotal, fallbackCount, hasError) {
  if (hasError) return "Not available";
  if (hasValidNumber(summaryTotal)) return formatNumber(summaryTotal, 0);
  return fallbackCount;
}

function ProjectsExecutiveHero({ onExploreMap }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#030454] via-[#0b1455] to-[#063b35] px-4 py-10 text-white sm:px-8 lg:px-10 lg:py-11">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-56 h-[34rem] w-[34rem] rounded-full border border-[#009B35]/25"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-[#F3F74B]/18"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[18%] -bottom-56 h-80 w-80 rounded-full bg-[#009B35] opacity-20 blur-[90px]"
      />

      <div className="relative mx-auto max-w-[1536px]">
        <div className="flex max-w-3xl flex-col justify-center py-2">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#F3F74B]">
            Climate action portfolio
          </p>
          <h1 className="mt-4 text-balance font-['Playfair_Display'] text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
            Climate action projects
          </h1>

          <p className="mt-5 text-pretty text-base leading-8 text-white/78 sm:text-lg">
            Explore public climate action projects, where they are happening,
            who they benefit, and their estimated greenhouse gas removal
            outcomes across Kaduna State.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <PublicPrimaryButton onClick={onExploreMap}>
              Explore Map
            </PublicPrimaryButton>
            <PublicSecondaryButton
              inverse
              onClick={() => {
                window.location.href = "/public/reports";
              }}
            >
              View Reports
            </PublicSecondaryButton>
          </div>
        </div>
      </div>
    </section>
  );
}

const PORTFOLIO_METRIC_TONES = [
  "border-[#d9dcff] bg-[#eef0ff] text-[#28266f]",
  "border-[#c9eed8] bg-[#e8f8ef] text-[#075f37]",
  "border-[#cfe0ff] bg-[#eef4ff] text-[#1d3f8f]",
  "border-[#f5e6ad] bg-[#fff7df] text-[#805500]",
];

function PortfolioMetricCard({ icon: Icon, tone, label, value, helper }) {
  const toneClass = PORTFOLIO_METRIC_TONES[tone % PORTFOLIO_METRIC_TONES.length];

  return (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-xl border p-5 transition duration-200 motion-safe:hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(8,12,65,0.1)] ${toneClass}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-current opacity-[0.07] transition-transform duration-500 motion-safe:group-hover:scale-125"
      />
      <Icon size={18} className="relative z-[1] opacity-80" aria-hidden="true" />
      <p className="relative z-[1] mt-3 text-[10px] font-black uppercase tracking-[0.14em] opacity-80">
        {label}
      </p>
      <p className="relative z-[1] mt-2 text-2xl font-black leading-tight">{value}</p>
      {helper ? <p className="relative z-[1] mt-2 text-xs leading-5 opacity-80">{helper}</p> : null}
    </div>
  );
}

function PortfolioSnapshotSection({ projects, summary, hasError }) {
  const totalProjects = formatProjectCount(summary.total_projects, projects.length, hasError);
  const totalReduction = summary.total_expected_ghg_reduction_tco2e;

  // No per-project value is ever fabricated — the total is only computed
  // from projects that actually carry a valid value field (see
  // getProjectValue). If none do (the current public API does not expose
  // one — see aboutDataItems), this is null and the card truthfully reports
  // "Not available" rather than inventing a ₦ amount.
  const projectValues = projects.map(getProjectValue).filter(hasValidNumber);
  const totalValue = projectValues.length
    ? projectValues.reduce((sum, value) => sum + Number(value), 0)
    : null;
  const totalValueDisplay = !hasError && hasValidNumber(totalValue) ? formatNaira(totalValue) : "Not available";
  const totalValueHelper = hasError
    ? "Portfolio summary is temporarily unavailable."
    : hasValidNumber(totalValue)
      ? "Combined value across public project records."
      : "Project financial values are not available in the public dataset.";

  return (
    <section aria-label="Portfolio snapshot" className="border-b border-[#D8DDE2] bg-[#F7F9FA] px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1536px]">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#009B35]">
          Portfolio snapshot
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <PortfolioMetricCard
            icon={Layers}
            tone={0}
            label="Public projects"
            value={totalProjects}
            helper="Approved projects visible on the public portal."
          />
          <PortfolioMetricCard
            icon={Wallet}
            tone={1}
            label="Total project value"
            value={totalValueDisplay}
            helper={totalValueHelper}
          />
          <PortfolioMetricCard
            icon={Leaf}
            tone={2}
            label="Estimated GHG impact"
            value={hasValidNumber(totalReduction) ? `${formatCompactNumber(totalReduction)} tCO₂e` : "Not available"}
            helper="Expected project impact — not official inventory emissions."
          />
        </div>
      </div>
    </section>
  );
}

const PROJECT_SORT_OPTIONS = [
  { value: "status", label: "Status (default order)" },
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "ghg_desc", label: "Highest estimated GHG impact" },
];

function ProjectDirectoryToolbar({
  filters,
  setFilters,
  statusOptions,
  sectorOptions,
  lgaOptions,
  filteredCount,
  sortBy,
  onSortChange,
  view,
  onViewChange,
  onExportCsv,
  canExportCsv,
}) {
  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  return (
    <PublicSection id="public-project-directory" className="bg-[#F7F9FA] !py-10 lg:!py-11" innerClassName="">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#009B35]">Browse</p>
          <h2 className="mt-1 font-['Playfair_Display'] text-2xl font-bold text-[#030454] sm:text-3xl">
            Project Directory
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-[#D8DDE2] bg-white p-1">
            {[
              { key: "list", label: "List" },
              { key: "map", label: "Map" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => onViewChange(option.key)}
                aria-pressed={view === option.key}
                className={`rounded px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.08em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30 ${
                  view === option.key
                    ? "bg-[#030454] text-white"
                    : "text-slate-500 hover:text-[#030454]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onExportCsv}
            disabled={!canExportCsv}
            aria-label="Export currently filtered projects as CSV"
            className="flex items-center gap-2 rounded-md border border-[#D8DDE2] bg-white px-3.5 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={14} aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </div>

      <PublicCard className="mt-4 border-[#CAD2D7] p-3">
        <div className="grid gap-2.5 xl:grid-cols-[minmax(240px,1fr)_150px_170px_170px_190px_auto] xl:items-end">
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Search
            </span>
            <input
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search title, LGA, sector, code or funding source..."
              className="h-9 w-full rounded-md border border-[#D8DDE2] bg-white px-3.5 text-sm text-[#030454] outline-none transition placeholder:text-slate-500 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Status
            </span>
            <select
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
              className="h-9 w-full rounded-md border border-[#D8DDE2] bg-white px-3.5 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
            >
              <option value="all">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {getStatusMeta(status).label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Sector
            </span>
            <select
              value={filters.sector}
              onChange={(event) => updateFilter("sector", event.target.value)}
              className="h-9 w-full rounded-md border border-[#D8DDE2] bg-white px-3.5 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
            >
              <option value="all">All sectors</option>
              {sectorOptions.map((sector) => (
                <option key={sector} value={sector}>
                  {sector}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              LGA
            </span>
            <select
              value={filters.lga}
              onChange={(event) => updateFilter("lga", event.target.value)}
              className="h-9 w-full rounded-md border border-[#D8DDE2] bg-white px-3.5 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
            >
              <option value="all">All LGAs</option>
              {lgaOptions.map((lga) => (
                <option key={lga} value={lga}>
                  {lga}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
              Sort by
            </span>
            <select
              value={sortBy}
              onChange={(event) => onSortChange(event.target.value)}
              className="h-9 w-full rounded-md border border-[#D8DDE2] bg-white px-3.5 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
            >
              {PROJECT_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <span className="rounded-full border border-[#D8DDE2] bg-[#F7F9FA] px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
              {filteredCount === 1 ? "1 project found" : `${filteredCount} projects found`}
            </span>
            <button
              type="button"
              onClick={() =>
                setFilters({ status: "all", sector: "all", lga: "all", search: "" })
              }
              className="rounded-md border border-[#D8DDE2] bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30"
            >
              Reset
            </button>
          </div>
        </div>
      </PublicCard>
    </PublicSection>
  );
}

function MapPanes() {
  const map = useMap();

  useEffect(() => {
    function ensurePane(name, zIndex, pointerEvents) {
      let pane = map.getPane(name);
      if (!pane) pane = map.createPane(name);
      pane.style.zIndex = String(zIndex);
      pane.style.pointerEvents = pointerEvents;
    }
    ensurePane("lgaBoundaryPane", 390, "none");
    ensurePane("kadunaOuterBoundaryPane", 430, "none");
    ensurePane("lgaLabelPane", 500, "none");
    ensurePane("projectPointPane", 700, "auto");
  }, [map]);

  return null;
}

function KadunaMapBounds({ boundaryData, lgaData, projects }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
      const geometryData = boundaryData || lgaData;
      if (geometryData) {
        const bounds = L.geoJSON(geometryData).getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [24, 24], maxZoom: 8 });
          // Padded generously (not just 0.35) so popups near the state's edge
          // have enough room to auto-pan fully into view instead of being
          // clipped against the hard maxBounds wall.
          map.setMaxBounds(bounds.pad(1));
          return;
        }
      }
      const coordinates = projects
        .map((project) => getValidNigeriaProjectCoordinates(project))
        .filter(Boolean);
      if (!coordinates.length) return;
      if (coordinates.length === 1) { map.setView(coordinates[0], 9); return; }
      map.fitBounds(coordinates, { padding: [40, 40], maxZoom: 10 });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [boundaryData, lgaData, map, projects]);

  return null;
}

function KadunaOuterBoundaryLayer({ data }) {
  if (!data) return null;
  return (
    <GeoJSON
      key="kaduna-outer-boundary"
      data={data}
      pane="kadunaOuterBoundaryPane"
      interactive={false}
      style={kadunaOuterBoundaryStyle}
    />
  );
}

function KadunaLgaBoundaryLayer({ data }) {
  if (!data) return null;
  return (
    <GeoJSON
      key="kaduna-lgas"
      data={data}
      pane="lgaBoundaryPane"
      interactive={false}
      style={lgaBoundaryStyle}
    />
  );
}

function getLgaNameFromFeature(feature) {
  return (
    feature?.properties?.lga_name ||
    feature?.properties?.LGA_NAME ||
    feature?.properties?.lga ||
    feature?.properties?.LGA ||
    feature?.properties?.name ||
    feature?.properties?.NAME ||
    "LGA"
  );
}

function getLabelConfigForLga(name, feature) {
  const normalized = normalizeName(name);
  if (LGA_LABEL_CONFIG[normalized]) return LGA_LABEL_CONFIG[normalized];
  try {
    const layer = L.geoJSON(feature);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      const center = bounds.getCenter();
      return {
        position: [center.lat, center.lng],
        label: String(name || "").toUpperCase(),
        minZoom: 8.6,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function KadunaLgaLabels({ data }) {
  const map = useMap();
  const [currentZoom, setCurrentZoom] = useState(map.getZoom());

  useEffect(() => {
    function handleZoomEnd() { setCurrentZoom(map.getZoom()); }
    map.on("zoomend", handleZoomEnd);
    return () => { map.off("zoomend", handleZoomEnd); };
  }, [map]);

  const labels = useMemo(() => {
    if (!data?.features?.length) return [];
    return data.features
      .map((feature, index) => {
        const name = getLgaNameFromFeature(feature);
        const config = getLabelConfigForLga(name, feature);
        if (!config?.position) return null;
        if (currentZoom < Number(config.minZoom || 8.6)) return null;
        return {
          id: feature?.id || `${name}-${index}`,
          label: config.label || String(name).toUpperCase(),
          position: config.position,
          size: config.size || "normal",
        };
      })
      .filter(Boolean);
  }, [data, currentZoom]);

  if (!labels.length) return null;

  return (
    <>
      {labels.map((label) => (
        <Marker
          key={label.id}
          position={label.position}
          pane="lgaLabelPane"
          interactive={false}
          keyboard={false}
          icon={L.divIcon({
            className: "",
            html: `
              <div style="
                display:inline-block;
                max-width:${label.size === "large" ? "120px" : "88px"};
                transform:translate(-50%, -50%);
                color:#030454;
                font-family:Arial, Helvetica, sans-serif;
                font-size:${label.size === "large" ? "10.5px" : "10px"};
                font-weight:900;
                line-height:1;
                letter-spacing:0.04em;
                text-align:center;
                text-transform:uppercase;
                white-space:normal;
                opacity:0.92;
                pointer-events:none;
                text-shadow:
                  -1px -1px 0 rgba(255,255,255,0.96),
                   1px -1px 0 rgba(255,255,255,0.96),
                  -1px  1px 0 rgba(255,255,255,0.96),
                   1px  1px 0 rgba(255,255,255,0.96),
                   0px  2px 5px rgba(255,255,255,0.95);
              ">
                ${escapeHtml(label.label)}
              </div>
            `,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          })}
        />
      ))}
    </>
  );
}

function ProjectLocationMap({ projects, onReadMore }) {
  const [kadunaBoundary, setKadunaBoundary] = useState(null);
  const [kadunaLgas, setKadunaLgas] = useState(null);
  const [boundaryError, setBoundaryError] = useState("");

  const mappedProjects = projects.filter((project) =>
    Boolean(getValidNigeriaProjectCoordinates(project))
  );

  useEffect(() => {
    let isMounted = true;
    async function loadBoundaries() {
      try {
        let lgaResponse = await fetch("/data/kaduna_lgas.geojson", { cache: "no-cache" });
        if (!lgaResponse.ok) {
          lgaResponse = await fetch("/data/kaduna_lgas_dev.geojson", { cache: "no-cache" });
        }
        if (!lgaResponse.ok) throw new Error("Kaduna LGA boundary file could not be loaded.");
        const lgaData = await lgaResponse.json();
        if (isMounted) { setKadunaLgas(lgaData); setBoundaryError(""); }
        try {
          const boundaryResponse = await fetch("/data/kaduna_boundary.geojson", { cache: "no-cache" });
          if (boundaryResponse.ok) {
            const boundaryData = await boundaryResponse.json();
            if (isMounted) setKadunaBoundary(boundaryData);
          }
        } catch { /* Optional boundary file. */ }
      } catch (error) {
        console.error(error);
        if (isMounted) {
          setBoundaryError(
            "Kaduna LGA boundaries could not be loaded. Project points are still shown where coordinates are available."
          );
        }
      }
    }
    loadBoundaries();
    return () => { isMounted = false; };
  }, []);

  return (
    <PublicSection className="bg-[#F7F9FA] !py-10 lg:!py-11" innerClassName="">
      <PublicCard className="overflow-hidden border-[#CAD2D7] p-0">
        <div id="public-project-map">
          <div className="flex flex-col justify-between gap-3 border-b border-[#E6EAEC] px-4 py-3 md:flex-row md:items-start">
            <div>
              <PublicSectionHeading
                title="Project locations across Kaduna State"
                description="Project points show where public climate action projects are taking place. Kaduna State and LGA boundaries provide geographic context."
              />
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              {["ongoing", "completed", "proposed"].map((key) => {
                const meta = getStatusMeta(key);
                return (
                  <span key={key} className="flex items-center gap-2 rounded-full border border-[#D8DDE2] bg-[#F7F9FA] px-3 py-2 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.dot }} />
                    {meta.label}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="p-3 sm:p-4">
            {mappedProjects.length > 0 || kadunaLgas ? (
              <>
                <div className="relative overflow-hidden rounded-lg border border-[#D8DDE2]">
                  <style>
                    {`
                      .kccc-project-tooltip {
                        border: 1px solid rgba(3, 4, 84, 0.18);
                        border-radius: 8px;
                        box-shadow: 0 12px 30px rgba(3, 4, 84, 0.2);
                        font-family: DM Sans, Arial, sans-serif;
                      }
                      .kccc-project-tooltip::before { display: none; }
                      .kccc-project-popup .leaflet-popup-content-wrapper {
                        border-radius: 14px;
                        box-shadow: 0 24px 60px rgba(3, 4, 84, 0.28);
                      }
                      .kccc-project-popup .leaflet-popup-content { margin: 14px; }
                    `}
                  </style>
                  <MapContainer
                    center={KADUNA_CENTER}
                    zoom={8}
                    minZoom={7}
                    maxZoom={13}
                    maxBounds={NIGERIA_BOUNDS}
                    maxBoundsViscosity={1.0}
                    scrollWheelZoom={false}
                    className="h-[560px] w-full"
                  >
                    <MapPanes />
                    <TileLayer
                      attribution="&copy; OpenStreetMap contributors"
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <KadunaMapBounds boundaryData={kadunaBoundary} lgaData={kadunaLgas} projects={mappedProjects} />
                    <KadunaLgaBoundaryLayer data={kadunaLgas} />
                    <KadunaOuterBoundaryLayer data={kadunaBoundary} />
                    <KadunaLgaLabels data={kadunaLgas} />

                    {mappedProjects.map((project, index) => {
                      const coordinates = getValidNigeriaProjectCoordinates(project);
                      const statusKey = getProjectStatusKey(project);
                      const statusMeta = getStatusMeta(statusKey);
                      return (
                        <CircleMarker
                          key={project.id || project.project_code || `${project.title}-${index}`}
                          center={coordinates}
                          radius={11}
                          pane="projectPointPane"
                          pathOptions={{
                            color: "#FFFFFF",
                            weight: 2.5,
                            fillColor: statusMeta.dot,
                            fillOpacity: 0.95,
                          }}
                          eventHandlers={{
                            mouseover: (event) => {
                              event.target.setRadius(14);
                              event.target.setStyle({ weight: 3.5, fillOpacity: 1 });
                              event.target.bringToFront();
                              event.target.openTooltip();
                            },
                            mouseout: (event) => {
                              event.target.setRadius(11);
                              event.target.setStyle({ weight: 2.5, fillOpacity: 0.95 });
                              event.target.closeTooltip();
                            },
                            click: (event) => { event.target.openPopup(); },
                          }}
                        >
                          <Tooltip direction="top" offset={[0, -10]} opacity={1} className="kccc-project-tooltip">
                            <span className="font-['DM_Sans'] text-xs font-black text-[#030454]">
                              {project.title}
                            </span>
                          </Tooltip>
                          <Popup
                            className="kccc-project-popup"
                            autoPan
                            autoPanPaddingTopLeft={[20, 40]}
                            autoPanPaddingBottomRight={[20, 20]}
                            maxWidth={300}
                            maxHeight={420}
                          >
                            <div className="min-w-[260px] font-['DM_Sans']">
                              <p className="text-base font-black leading-snug text-[#030454]">{project.title}</p>
                              <p className="mt-2 text-xs text-slate-500">
                                {getProjectLga(project)} · {getProjectSector(project)}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <span className={`rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${statusMeta.badge}`}>
                                  {getProjectStatus(project)}
                                </span>
                              </div>
                              <p className="mt-3 text-xs leading-5 text-slate-600">{getProjectSummary(project)}</p>
                              <div className="mt-3 grid gap-1 text-xs leading-5 text-slate-600">
                                <p>Implementing MDA: <strong>{getProjectImplementingMda(project)}</strong></p>
                                <p>Funded by: <strong>{getProjectFundingSource(project)}</strong></p>
                                <p>Beneficiaries: <strong>{formatCompactNumber(getProjectBeneficiaries(project))}</strong></p>
                                <p>Estimated GHG reduction: <strong>{formatNumber(getProjectReduction(project), 0)} tCO₂e</strong></p>
                              </div>
                              <button
                                type="button"
                                onClick={() => onReadMore(project)}
                                aria-label={`View project details for ${project.title}`}
                                className="mt-3 text-xs font-black uppercase tracking-[0.08em] text-[#009B35]"
                              >
                                View project details →
                              </button>
                            </div>
                          </Popup>
                        </CircleMarker>
                      );
                    })}
                  </MapContainer>
                </div>

                {boundaryError && (
                  <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">
                    {boundaryError}
                  </p>
                )}
                {mappedProjects.length === 0 && (
                  <p className="mt-3 rounded-md border border-slate-200 bg-[#F7F9FA] px-4 py-3 text-xs font-bold text-slate-600">
                    No project points match the selected filters, or project coordinates have not yet been added.
                  </p>
                )}
              </>
            ) : (
              <PublicEmptyState
                title="Project locations are not yet available"
                message="Add latitude and longitude to public project records to show them as points on the map."
              />
            )}
          </div>
        </div>
      </PublicCard>
    </PublicSection>
  );
}

const PROJECT_DIRECTORY_GRID_COLS =
  "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto]";

function ProjectDirectoryRow({ project, onReadMore }) {
  const statusMeta = getStatusMeta(getProjectStatusKey(project));
  const projectValue = getProjectValue(project);
  const title = project.title || "Untitled project";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onReadMore(project)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onReadMore(project);
        }
      }}
      aria-label={`View project details for ${title}`}
      className={`group grid cursor-pointer gap-2 border-b border-[#E6EAEC] bg-white px-4 py-4 transition hover:bg-[#F7F9FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30 md:items-center md:gap-4 md:px-5 md:py-3.5 ${PROJECT_DIRECTORY_GRID_COLS}`}
    >
      <div className="min-w-0">
        <p className="text-balance font-['Playfair_Display'] text-base font-bold leading-snug text-[#030454]">
          {title}
        </p>
        <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-slate-500">
          {getProjectSummary(project)}
        </p>
      </div>

      <div className="text-xs text-slate-600 md:text-sm md:text-[#030454]">
        <span className="font-black uppercase tracking-[0.1em] text-slate-400 md:hidden">Sector: </span>
        {getProjectSector(project)}
      </div>

      <div className="text-xs text-slate-600 md:text-sm md:text-[#030454]">
        <span className="font-black uppercase tracking-[0.1em] text-slate-400 md:hidden">LGA: </span>
        {getProjectLga(project)}
      </div>

      <div>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${statusMeta.badge}`}>
          {getProjectStatus(project)}
        </span>
      </div>

      <div className="text-xs font-bold text-slate-600 md:text-sm md:text-[#030454]">
        <span className="font-black uppercase tracking-[0.1em] text-slate-400 md:hidden">Value: </span>
        {hasValidNumber(projectValue) ? formatNaira(projectValue) : "Not available"}
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onReadMore(project);
        }}
        aria-hidden="true"
        tabIndex={-1}
        className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.08em] text-[#009B35] transition group-hover:text-[#00722A] md:justify-self-end"
      >
        View project
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function ProjectDirectoryList({ projects, onReadMore }) {
  if (!projects.length) {
    return (
      <PublicEmptyState
        title="No projects match the current filters"
        message="Try a different search term, or reset the filters to see the full public project portfolio."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#D8DDE2] bg-white">
      <div
        className={`hidden border-b border-[#E6EAEC] bg-[#F7F9FA] px-5 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 md:grid md:gap-4 ${PROJECT_DIRECTORY_GRID_COLS}`}
      >
        <span>Project</span>
        <span>Sector</span>
        <span>LGA</span>
        <span>Status</span>
        <span>Project value</span>
        <span className="justify-self-end">Action</span>
      </div>
      {projects.map((project) => (
        <ProjectDirectoryRow
          key={project.id || project.project_code || project.title}
          project={project}
          onReadMore={onReadMore}
        />
      ))}
    </div>
  );
}

// Reused by both the slide-over panel and the full project detail page so
// the two views never silently disagree about which fields exist.
export function ProjectKeyMetrics({ project }) {
  const projectValue = getProjectValue(project);
  const beneficiaries = getProjectBeneficiaries(project);
  const reduction = getProjectReduction(project);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SummaryChip
        label="Total project value"
        value={hasValidNumber(projectValue) ? formatNaira(projectValue) : "Not available"}
        helper={hasValidNumber(projectValue) ? undefined : "Not available in the public dataset."}
      />
      <SummaryChip
        label="Expected beneficiaries"
        value={hasValidNumber(beneficiaries) ? formatCompactNumber(beneficiaries) : "Not available"}
      />
      <SummaryChip
        label="Estimated GHG reduction"
        value={hasValidNumber(reduction) ? `${formatNumber(reduction, 0)} tCO₂e` : "Not available"}
      />
      <SummaryChip
        label="Implementing agency"
        value={getProjectImplementingMda(project) || "Not available"}
      />
    </div>
  );
}

function ProjectDetailPanelBody({ project }) {
  const period = getProjectPeriod(project);
  const externalLink = getProjectExternalLink(project);

  return (
    <div className="space-y-5">
      <ProjectKeyMetrics project={project} />

      {period && <SummaryChip label="Timeline" value={period} />}

      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Project summary</p>
        <p className="mt-2 text-sm leading-7 text-slate-600">{getProjectDescription(project)}</p>
      </div>

      {Object.hasOwn(SECTOR_LABELS, project.sector) && (
        <a
          href={`/public/ghg-inventory?sector=${encodeURIComponent(project.sector)}&from_lga=${encodeURIComponent(getProjectLga(project))}`}
          className="inline-block text-sm font-bold text-[#173B91] underline"
        >
          View GHG Sector — Kaduna State inventory
        </a>
      )}

      {externalLink && (
        <a
          href={externalLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#009B35] underline-offset-4 hover:underline"
        >
          Visit project resource <span aria-hidden="true">→</span>
        </a>
      )}

      <PublicDisclaimerNote className="">
        This public detail view excludes budget and financial values not already published by the project record.
      </PublicDisclaimerNote>
    </div>
  );
}

function ProjectReadMorePanel({ project, onClose }) {
  if (!project) return null;
  const statusMeta = getStatusMeta(getProjectStatusKey(project));
  const projectId = project.id ?? project.project_code;

  return (
    <div className="fixed inset-0 z-[9999]">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-[#030454]/15"
      />

      <div className="absolute inset-y-0 right-0 flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:w-[85%] md:w-[45%] lg:w-[40%]">
        <div className="h-32 shrink-0 bg-[#030454] sm:h-36">
          <ProjectImage project={project} alt={project.title} label="Climate Action Project" />
        </div>
        <div className="flex items-start justify-between gap-4 border-b border-[#E6EAEC] bg-[#F7F9FA] px-6 py-5">
          <div className="min-w-0">
            <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] ${statusMeta.badge}`}>
              {getProjectStatus(project)}
            </span>
            <h2 className="mt-3 text-balance font-['Playfair_Display'] text-2xl font-bold leading-tight text-[#030454]">
              {project.title}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {getProjectSector(project)} · {getProjectLga(project)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close project details"
            className="shrink-0 rounded-md border border-[#D8DDE2] bg-white p-2 text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <ProjectDetailPanelBody project={project} />
        </div>

        {projectId != null && (
          <div className="border-t border-[#E6EAEC] bg-[#F7F9FA] px-6 py-4">
            <a
              href={`/public/projects/${encodeURIComponent(projectId)}`}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[#030454] px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#0B1A78] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/40"
            >
              Open full project page <span aria-hidden="true">→</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PublicProjectsPage() {
  const [pathwayContext] = useState(() => readProjectPathwayContext(window.location.search));
  // Full page load from e.g. /public/projects?lga=Zaria — read once, stable
  // for the lifetime of this page instance (no client-side router).
  const lgaParam = new URLSearchParams(window.location.search).get("lga") || "";

  const [summaryData, setSummaryData] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [filters, setFilters] = useState({
    status: "all",
    sector: SECTOR_LABELS[pathwayContext.sector] || "all",
    lga: lgaParam || "all",
    search: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [pathways, setPathways] = useState([]);
  const [view, setView] = useState("list");
  const [sortBy, setSortBy] = useState("status");

  // Fires the project_viewed analytics event only for the deliberate
  // "read more" action, never for incidental re-renders. Sends only a
  // stable project identifier, never the full project object.
  function handleProjectReadMore(project) {
    trackPublicEvent(PUBLIC_EVENT_NAMES.PROJECT_VIEWED, {
      project: project?.id || project?.project_code || project?.title,
    });
    setSelectedProject(project);
  }

  useEffect(() => {
    let cancelled = false;

    getPublicPortalSummary()
      .then((data) => {
        if (!cancelled) {
          setSummaryData(data.summary || {});
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setError("Could not load public project portfolio summary.");
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

  // Mount-only: reuses the existing public climate-intelligence profile
  // endpoint and the existing deriveActionPathways() engine (climatePathways.js)
  // — no new scoring/classification logic. No-op when no ?lga= is present.
  useEffect(() => {
    if (!lgaParam) return undefined;

    let cancelled = false;

    const seasons = { "Full Year": "annual", "Wet Season": "wet_season", "Dry Season": "dry_season", annual: "annual", wet_season: "wet_season", dry_season: "dry_season" };
    getClimateIntelligenceProfile({ admin_name: lgaParam, season: seasons[pathwayContext.season] || "annual", ...(/^\d{4}$/.test(pathwayContext.year) ? { year: Number(pathwayContext.year) } : {}) })
      .then((data) => {
        if (cancelled) return;
        const profile = data.profile || null;
        setPathways(
          profile ? deriveActionPathways({ ciProfile: profile, floodSnap: null, isFloodAvailable: false }) : []
        );
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("fetchCiProfile failed:", err);
          setPathways([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [lgaParam, pathwayContext.season, pathwayContext.year]);

  const projectSummary = useMemo(() => summaryData?.projects || {}, [summaryData]);

  const projectList = useMemo(() => {
    const rows =
      projectSummary.public_projects ||
      projectSummary.top_projects ||
      projectSummary.results ||
      [];
    return [...rows];
  }, [projectSummary]);

  const statusOptions = useMemo(() => {
    const orderedStatuses = ["ongoing", "completed", "proposed", "other"];
    return orderedStatuses.filter((status) =>
      projectList.some((project) => getProjectStatusKey(project) === status)
    );
  }, [projectList]);

  const sectorOptions = useMemo(() => {
    const options = getUniqueOptions(projectList, getProjectSector);
    const label = SECTOR_LABELS[pathwayContext.sector];
    return label && !options.includes(label) ? [...options, label] : options;
  }, [projectList, pathwayContext.sector]);
  const lgaOptions = useMemo(() => {
    const base = getUniqueOptions(projectList, getProjectLga);
    // Keeps a ?lga= selection visible in the filter even when that LGA
    // currently has zero registered projects (an honest, real result).
    return lgaParam && !base.includes(lgaParam) ? [...base, lgaParam] : base;
  }, [projectList, lgaParam]);

  const filteredProjects = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return projectList.filter((project) => {
      if (!matchesContributingProject(project, pathwayContext)) return false;
      const statusKey = getProjectStatusKey(project);
      const sector = getProjectSector(project);
      const lga = getProjectLga(project);
      if (filters.status !== "all" && statusKey !== filters.status) return false;
      if (filters.sector !== "all" && sector !== filters.sector) return false;
      if (filters.lga !== "all" && lga !== filters.lga) return false;
      if (!search) return true;
      return (
        String(project.title || "").toLowerCase().includes(search) ||
        String(getProjectSummary(project)).toLowerCase().includes(search) ||
        String(sector).toLowerCase().includes(search) ||
        String(lga).toLowerCase().includes(search) ||
        String(getProjectFundingSource(project)).toLowerCase().includes(search) ||
        String(project.project_code || "").toLowerCase().includes(search)
      );
    });
  }, [projectList, filters, pathwayContext]);

  const sortedProjects = useMemo(() => {
    const rows = [...filteredProjects];
    if (sortBy === "name_asc") {
      rows.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    } else if (sortBy === "name_desc") {
      rows.sort((a, b) => String(b.title || "").localeCompare(String(a.title || "")));
    } else if (sortBy === "ghg_desc") {
      rows.sort((a, b) => {
        const reductionA = getProjectReduction(a);
        const reductionB = getProjectReduction(b);
        const valueA = hasValidNumber(reductionA) ? Number(reductionA) : -Infinity;
        const valueB = hasValidNumber(reductionB) ? Number(reductionB) : -Infinity;
        return valueB - valueA;
      });
    }
    return rows;
  }, [filteredProjects, sortBy]);

  // Exports the CURRENT FILTERED/SORTED projects only, using real underlying
  // field values (not display-formatted strings) and only real fields.
  function handleExportCsv() {
    if (!sortedProjects.length) return;

    function escapeCsvCell(value) {
      const str = String(value ?? "");
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }

    const headers = [
      "Title",
      "Project code",
      "Status",
      "Sector",
      "LGA",
      "Implementing organisation",
      "Funding source",
      "Beneficiaries",
      "Estimated GHG reduction (tCO2e)",
      "Implementation period",
    ];

    const rows = sortedProjects.map((project) => {
      const reduction = getProjectReduction(project);
      return [
        project.title || "",
        project.project_code || "",
        getProjectStatus(project),
        getProjectSector(project),
        getProjectLga(project),
        getProjectImplementingMda(project),
        getProjectFundingSource(project),
        getProjectBeneficiaries(project),
        hasValidNumber(reduction) ? reduction : "",
        getProjectPeriod(project) || "",
      ];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kccc-public-projects-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <PublicPortalHeader
        activePage="projects"
        compact
        showHero={false}
        showActions={false}
      />

      <PublicErrorBanner message={error} />
      <ProjectPathwayNotice context={pathwayContext} />

      {isLoading ? (
        <PublicLoadingState message="Loading public project portfolio..." />
      ) : (
        <>
          <ProjectsExecutiveHero
            onExploreMap={() => {
              setView("map");
              document
                .getElementById("public-project-directory")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
          <PortfolioSnapshotSection projects={projectList} summary={projectSummary} hasError={Boolean(error)} />
          {lgaParam && (
            <ClimateActionOpportunitiesPanel
              lgaName={lgaParam}
              pathways={pathways}
              existingProjects={projectList}
            />
          )}
          <ProjectDirectoryToolbar
            filters={filters}
            setFilters={setFilters}
            statusOptions={statusOptions}
            sectorOptions={sectorOptions}
            lgaOptions={lgaOptions}
            filteredCount={filteredProjects.length}
            sortBy={sortBy}
            onSortChange={setSortBy}
            view={view}
            onViewChange={setView}
            onExportCsv={handleExportCsv}
            canExportCsv={sortedProjects.length > 0}
          />
          {view === "map" ? (
            <ProjectLocationMap projects={filteredProjects} onReadMore={handleProjectReadMore} />
          ) : (
            <PublicSection className="bg-[#F7F9FA] !pt-0 !pb-10 lg:!pb-11" innerClassName="">
              <ProjectDirectoryList projects={sortedProjects} onReadMore={handleProjectReadMore} />
            </PublicSection>
          )}
          <PublicFaqAccordion
            items={aboutDataItems}
            className="bg-[#F7F9FA] px-4 pt-10 pb-11 sm:px-8 lg:px-10 lg:pt-11"
            containerClassName="mx-auto max-w-5xl"
          />
        </>
      )}

      <ProjectReadMorePanel project={selectedProject} onClose={() => setSelectedProject(null)} />
      <PublicPortalFooter />
    </main>
  );
}
