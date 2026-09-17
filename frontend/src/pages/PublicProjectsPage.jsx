import { useEffect, useMemo, useState } from "react";
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
import { getPublicPortalSummary } from "../services/api";
import { PUBLIC_EVENT_NAMES, trackPublicEvent } from "../config/analytics";

const KADUNA_CENTER = [10.5105, 7.4165];
const PROJECT_SLIDE_INTERVAL_MS = 6000;

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

function hasValidNumber(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

function formatNumber(value, maximumFractionDigits = 2) {
  if (!hasValidNumber(value)) return "—";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits });
}

function formatCompactNumber(value) {
  if (!hasValidNumber(value)) return "—";
  const number = Number(value);
  if (number >= 1_000_000) return `${formatNumber(number / 1_000_000, 2)}M`;
  if (number >= 1_000) return `${formatNumber(number / 1_000, 1)}K`;
  return formatNumber(number, 0);
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getProjectSector(project) {
  return (
    project.sector_display ||
    project.sector_name ||
    project.sector ||
    "Not specified"
  );
}

function getProjectStatus(project) {
  return project.status_display || titleCase(project.status) || "Not specified";
}

function getProjectStatusKey(project) {
  const status = String(project.status || project.status_display || "")
    .toLowerCase()
    .trim();
  if (status.includes("completed")) return "completed";
  if (status.includes("ongoing") || status.includes("active")) return "ongoing";
  if (status.includes("proposed") || status.includes("planned")) return "proposed";
  return "other";
}

function getProjectLga(project) {
  return project.lga_name || project.lga || "Statewide";
}

function getProjectFundingSource(project) {
  return project.funding_source || "Not specified";
}

function getProjectImplementingMda(project) {
  return project.implementing_agency || "Not specified";
}

function getProjectExternalLink(project) {
  const link = String(project.external_link || "").trim();
  return link || null;
}

function getProjectReduction(project) {
  return (
    project.expected_ghg_reduction_tco2e ||
    project.estimated_ghg_reduction_tco2e ||
    project.ghg_reduction_tco2e ||
    0
  );
}

function getProjectBeneficiaries(project) {
  return (
    project.expected_beneficiaries ||
    project.beneficiaries ||
    project.total_beneficiaries ||
    0
  );
}

function getProjectSummary(project) {
  return (
    project.public_summary ||
    project.summary ||
    project.climate_risk_relevance ||
    "Public summary for this project is being prepared."
  );
}

function getProjectDescription(project) {
  return (
    project.public_description ||
    project.public_summary ||
    project.summary ||
    project.climate_risk_relevance ||
    "Detailed public description for this project is being prepared."
  );
}

function getProjectPeriod(project) {
  const start = project.start_date || project.implementation_start;
  const end = project.end_date || project.implementation_end;
  if (!start && !end) return null;
  if (start && end) return `${start} – ${end}`;
  return start || end;
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

function ProjectImage({
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

  useEffect(() => {
    setCandidateIndex(0);
  }, [project]);

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

function getStatusMeta(statusKey) {
  const meta = {
    ongoing: {
      label: "Ongoing",
      dot: "#030454",
      badge: "bg-[#030454]/10 text-[#030454]",
      title: "Ongoing Projects",
      description: "Projects currently under implementation.",
    },
    completed: {
      label: "Completed",
      dot: "#009B35",
      badge: "bg-[#009B35]/10 text-[#009B35]",
      title: "Completed Projects",
      description: "Projects reported as completed.",
    },
    proposed: {
      label: "Proposed",
      dot: "#F3B91E",
      badge: "bg-[#F3F74B]/35 text-[#030454]",
      title: "Proposed Projects",
      description: "Projects proposed or planned for implementation.",
    },
    other: {
      label: "Other",
      dot: "#64748B",
      badge: "bg-slate-100 text-slate-600",
      title: "Other Projects",
      description: "Projects with other implementation statuses.",
    },
  };
  return meta[statusKey] || meta.other;
}

function SummaryChip({ label, value, helper }) {
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

function ProjectsExecutiveHero({ projects, summary, onExploreMap }) {
  const lgaCount = new Set(projects.map((project) => getProjectLga(project))).size;
  const sectorCount = new Set(projects.map((project) => getProjectSector(project))).size;
  const totalProjects = summary.total_projects || projects.length || 0;
  const totalReduction = summary.total_expected_ghg_reduction_tco2e;

  return (
    <PublicSection
      className="border-b border-[#D8DDE2] bg-white !py-10 lg:!py-11"
      innerClassName="grid gap-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-stretch"
    >
      <div className="flex min-h-[260px] flex-col justify-center py-2">
        <h1 className="max-w-4xl text-balance font-['Playfair_Display'] text-4xl font-black leading-tight text-[#030454] sm:text-5xl lg:text-6xl">
          Climate action projects
        </h1>

        <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-slate-600 sm:text-lg">
          Explore public climate action projects, where they are happening,
          who they benefit, and their estimated greenhouse gas removal
          outcomes across Kaduna State.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <PublicPrimaryButton onClick={onExploreMap}>
            Explore Map
          </PublicPrimaryButton>
          <PublicSecondaryButton
            onClick={() => {
              window.location.href = "/public/reports";
            }}
          >
            View Reports
          </PublicSecondaryButton>
        </div>
      </div>

      <PublicCard className="flex min-h-[260px] flex-col justify-between border-[#009B35]/25 p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#009B35]">
            Portfolio snapshot
          </p>
          <p className="mt-4 text-4xl font-black leading-tight text-[#030454] sm:text-5xl">
            {totalProjects}
          </p>
          <p className="mt-2 text-sm font-bold uppercase tracking-[0.08em] text-slate-500">
            Public projects
          </p>
        </div>

        <div className="mt-5 grid gap-3 border-t border-[#D8DDE2] pt-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500">LGAs represented</span>
            <strong className="text-right text-[#030454]">{lgaCount}</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500">Sectors represented</span>
            <strong className="text-right text-[#030454]">{sectorCount}</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500">Estimated GHG impact</span>
            <strong className="text-right text-[#030454]">
              {formatCompactNumber(totalReduction)} tCO₂e
            </strong>
          </div>
        </div>
      </PublicCard>
    </PublicSection>
  );
}

function ProjectMetricRibbon({ projects, summary }) {
  const lgaCount = new Set(projects.map((project) => getProjectLga(project))).size;
  const ongoingCount = projects.filter((p) => getProjectStatusKey(p) === "ongoing").length;

  const ribbonItems = [
    { label: "Public climate projects", value: summary.total_projects || projects.length || 0 },
    { label: "LGAs represented", value: lgaCount },
    { label: "Ongoing projects", value: ongoingCount },
    { label: "Estimated GHG impact", value: `${formatCompactNumber(summary.total_expected_ghg_reduction_tco2e)} tCO₂e` },
  ];

  return (
    <section className="border-y border-[#D8DDE2] bg-[#F7F9FA]">
      <div className="mx-auto grid max-w-[1536px] grid-cols-2 gap-px bg-[#D8DDE2] lg:grid-cols-4">
        {ribbonItems.map((item) => (
          <div key={item.label} className="flex items-center gap-3 bg-white px-5 py-3.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#009B35]" aria-hidden="true" />
            <span>
              <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                {item.label}
              </span>
              <strong className="mt-1 block text-lg font-black text-[#030454]">
                {item.value}
              </strong>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProjectMapFilters({
  filters,
  setFilters,
  statusOptions,
  sectorOptions,
  lgaOptions,
  filteredCount,
}) {
  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  return (
    <PublicSection className="bg-[#F7F9FA] !py-10 lg:!py-11" innerClassName="">
      <PublicCard className="border-[#CAD2D7] p-3">
          <div className="grid gap-2.5 xl:grid-cols-[minmax(280px,1fr)_160px_200px_200px_auto] xl:items-end">
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
                      attribution="CartoDB Positron"
                      url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
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

function RotatingProjectCard({ projects, activeIndex, onReadMore }) {
  const project = projects[activeIndex % projects.length];
  const statusKey = getProjectStatusKey(project);
  const statusMeta = getStatusMeta(statusKey);
  const beneficiaries = getProjectBeneficiaries(project);
  const period = getProjectPeriod(project);

  return (
    <PublicCard
      as="article"
      className="grid overflow-hidden p-0 transition hover:-translate-y-0.5 hover:border-[#009B35]/45 hover:shadow-md lg:grid-cols-[1.1fr_0.9fr]"
    >
      <div className="relative min-h-[190px] bg-[#030454]">
        <ProjectImage project={project} alt={project.title} label="Climate Action Project" />
        <div className="absolute left-3 top-3">
          <span className={`rounded-full px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] ${statusMeta.badge}`}>
            {getProjectStatus(project)}
          </span>
        </div>
      </div>
      <div className="flex flex-col justify-between p-4 lg:p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
            {getProjectLga(project)}
          </p>
          <h3 className="mt-1.5 text-balance font-['Playfair_Display'] text-xl font-bold leading-tight text-[#030454] sm:text-2xl">
            {project.title}
          </h3>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{getProjectSummary(project)}</p>
        </div>
        <div className="mt-3">
          <dl className="grid gap-x-4 gap-y-1 text-xs leading-5 text-slate-600 sm:grid-cols-2">
            <div><dt className="inline font-black text-[#030454]">Sector: </dt><dd className="inline">{getProjectSector(project)}</dd></div>
            <div><dt className="inline font-black text-[#030454]">Funded by: </dt><dd className="inline">{getProjectFundingSource(project)}</dd></div>
            {beneficiaries > 0 && (
              <div><dt className="inline font-black text-[#030454]">Beneficiaries: </dt><dd className="inline">{formatCompactNumber(beneficiaries)}</dd></div>
            )}
            <div><dt className="inline font-black text-[#030454]">Estimated GHG reduction: </dt><dd className="inline">{formatNumber(getProjectReduction(project), 0)} tCO₂e</dd></div>
            {period && (
              <div><dt className="inline font-black text-[#030454]">Implementation period: </dt><dd className="inline">{period}</dd></div>
            )}
          </dl>
          <button
            type="button"
            onClick={() => onReadMore(project)}
            aria-label={`View project details for ${project.title}`}
            className="mt-3.5 inline-flex items-center gap-2 rounded-md border border-[#030454] px-3.5 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:bg-[#030454] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30"
          >
            View project details <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </PublicCard>
  );
}

function ProjectShowcaseSection({ title, description, projects, onReadMore }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (projects.length <= 1) return undefined;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % projects.length);
    }, PROJECT_SLIDE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [projects.length]);

  useEffect(() => { setActiveIndex(0); }, [projects]);

  function goToPrevious() {
    setActiveIndex((current) => (current - 1 + projects.length) % projects.length);
  }

  function goToNext() {
    setActiveIndex((current) => (current + 1) % projects.length);
  }

  return (
    <PublicCard as="section" className="overflow-hidden border-[#CAD2D7] p-0">
      <div className="flex flex-col justify-between gap-2 border-b border-[#E6EAEC] bg-white px-5 py-3.5 md:flex-row md:items-center">
        <div className="flex items-baseline gap-3">
          <h2 className="text-balance font-['Playfair_Display'] text-2xl font-bold text-[#030454]">{title}</h2>
          <span className="rounded-full bg-[#030454]/8 px-2.5 py-1 text-xs font-black text-[#030454]">
            {projects.length}
          </span>
        </div>
        {description && <p className="max-w-2xl text-sm leading-6 text-slate-600">{description}</p>}
      </div>
      <div className="p-4">
        {projects.length > 0 ? (
          <>
            <RotatingProjectCard projects={projects} activeIndex={activeIndex} onReadMore={onReadMore} />
            {projects.length > 1 && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={goToPrevious}
                  aria-label={`Show previous project in ${title}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#D8DDE2] bg-white text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30"
                >
                  <span aria-hidden="true">←</span>
                </button>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-500">
                    {activeIndex + 1} of {projects.length} projects
                  </span>
                  <div className="hidden gap-1.5 sm:flex">
                    {projects.map((project, index) => (
                      <button
                        key={project.id || project.project_code || index}
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        className={`h-2 rounded-full transition ${
                          index === activeIndex ? "w-6 bg-[#009B35]" : "w-2 bg-slate-300 hover:bg-slate-400"
                        }`}
                        aria-label={`Show project ${index + 1} of ${projects.length} in ${title}`}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={goToNext}
                  aria-label={`Show next project in ${title}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#D8DDE2] bg-white text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30"
                >
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <PublicEmptyState
            title="No projects in this category"
            message="No public project records are currently available for this implementation status."
          />
        )}
      </div>
    </PublicCard>
  );
}

function ProjectShowcase({ projects, onReadMore }) {
  const groupedProjects = useMemo(() => ({
    ongoing: projects.filter((p) => getProjectStatusKey(p) === "ongoing"),
    completed: projects.filter((p) => getProjectStatusKey(p) === "completed"),
    proposed: projects.filter((p) => getProjectStatusKey(p) === "proposed"),
    other: projects.filter((p) => getProjectStatusKey(p) === "other"),
  }), [projects]);

  return (
    <PublicSection className="bg-[#F7F9FA] !py-10 lg:!py-11">
      <div className="space-y-[26px]">
        <ProjectShowcaseSection
          title={getStatusMeta("ongoing").title}
          description={getStatusMeta("ongoing").description}
          projects={groupedProjects.ongoing}
          onReadMore={onReadMore}
        />
        <ProjectShowcaseSection
          title={getStatusMeta("completed").title}
          description={getStatusMeta("completed").description}
          projects={groupedProjects.completed}
          onReadMore={onReadMore}
        />
        <ProjectShowcaseSection
          title={getStatusMeta("proposed").title}
          description={getStatusMeta("proposed").description}
          projects={groupedProjects.proposed}
          onReadMore={onReadMore}
        />
        {groupedProjects.other.length > 0 && (
          <ProjectShowcaseSection
            title={getStatusMeta("other").title}
            description={getStatusMeta("other").description}
            projects={groupedProjects.other}
            onReadMore={onReadMore}
          />
        )}
      </div>
    </PublicSection>
  );
}

function ProjectReadMorePanel({ project, onClose }) {
  if (!project) return null;
  const statusMeta = getStatusMeta(getProjectStatusKey(project));

  return (
    <div className="fixed inset-0 z-[9999] bg-[#030454]/60 px-4 py-6 backdrop-blur-sm sm:px-8">
      <PublicCard className="mx-auto flex max-h-full max-w-5xl flex-col overflow-hidden p-0 shadow-lg">
        <div className="flex items-start justify-between gap-4 border-b border-[#E6EAEC] bg-[#F7F9FA] px-6 py-5">
          <div>
            <span className={`rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] ${statusMeta.badge}`}>
              {getProjectStatus(project)}
            </span>
            <h2 className="mt-4 text-balance font-['Playfair_Display'] text-3xl font-bold text-[#030454]">{project.title}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {getProjectLga(project)} · {getProjectSector(project)}
            </p>
          </div>
          <PublicSecondaryButton
            onClick={onClose}
            className="px-3 py-2 text-sm"
          >
            Close
          </PublicSecondaryButton>
        </div>
        <div className="grid overflow-y-auto lg:grid-cols-[0.9fr_1.1fr]">
          <div className="min-h-[320px] bg-[#030454]">
            <ProjectImage project={project} alt={project.title} label="Project image pending" />
          </div>
          <div className="space-y-5 p-6">
            <p className="text-sm leading-7 text-slate-600">{getProjectDescription(project)}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <SummaryChip label="Project code" value={project.project_code || "Not published"} />
              <SummaryChip
                label="Project type"
                value={project.project_type_display || project.project_type || "Not specified"}
              />
              <SummaryChip label="Implementing MDA" value={getProjectImplementingMda(project)} />
              <SummaryChip label="Funding source" value={getProjectFundingSource(project)} />
              <SummaryChip label="Beneficiaries" value={formatCompactNumber(getProjectBeneficiaries(project))} />
              <SummaryChip
                label="Estimated GHG reduction"
                value={`${formatNumber(getProjectReduction(project), 0)} tCO₂e`}
              />
              {getProjectPeriod(project) && (
                <SummaryChip label="Implementation period" value={getProjectPeriod(project)} />
              )}
            </div>
            {getProjectExternalLink(project) && (
              <a
                href={getProjectExternalLink(project)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#009B35] underline-offset-4 hover:underline"
              >
                Visit project resource <span aria-hidden="true">→</span>
              </a>
            )}
            <PublicDisclaimerNote className="">
              This public detail view excludes budget and financial values.
            </PublicDisclaimerNote>
          </div>
        </div>
      </PublicCard>
    </div>
  );
}

export default function PublicProjectsPage() {
  const [summaryData, setSummaryData] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [filters, setFilters] = useState({ status: "all", sector: "all", lga: "all", search: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Fires the project_viewed analytics event only for the deliberate
  // "read more" action, never for incidental re-renders. Sends only a
  // stable project identifier, never the full project object.
  function handleProjectReadMore(project) {
    trackPublicEvent(PUBLIC_EVENT_NAMES.PROJECT_VIEWED, {
      project: project?.id || project?.project_code || project?.title,
    });
    setSelectedProject(project);
  }

  async function loadSummary() {
    setIsLoading(true);
    setError("");
    try {
      const data = await getPublicPortalSummary();
      setSummaryData(data.summary || {});
    } catch (err) {
      console.error(err);
      setError("Could not load public project portfolio summary.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadSummary(); }, []);

  const projectSummary = summaryData?.projects || {};

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

  const sectorOptions = useMemo(() => getUniqueOptions(projectList, getProjectSector), [projectList]);
  const lgaOptions = useMemo(() => getUniqueOptions(projectList, getProjectLga), [projectList]);

  const filteredProjects = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return projectList.filter((project) => {
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
  }, [projectList, filters]);

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <PublicPortalHeader
        activePage="projects"
        compact
        showHero={false}
        showActions={false}
      />

      <PublicErrorBanner message={error} />

      {isLoading ? (
        <PublicLoadingState message="Loading public project portfolio..." />
      ) : (
        <>
          <ProjectsExecutiveHero
            projects={projectList}
            summary={projectSummary}
            onExploreMap={() => {
              document
                .getElementById("public-project-map")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
          <ProjectMetricRibbon projects={projectList} summary={projectSummary} />
          <ProjectMapFilters
            filters={filters}
            setFilters={setFilters}
            statusOptions={statusOptions}
            sectorOptions={sectorOptions}
            lgaOptions={lgaOptions}
            filteredCount={filteredProjects.length}
          />
          <ProjectLocationMap projects={filteredProjects} onReadMore={handleProjectReadMore} />
          <ProjectShowcase projects={filteredProjects} onReadMore={handleProjectReadMore} />
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
