import { useEffect, useMemo, useState } from "react";
import { useScrollReveal, revealClasses, useMotionEnabled } from "../hooks/useScrollReveal";
import {
  PublicCard,
  PublicDisclaimerNote,
  PublicEmptyState,
  PublicErrorBanner,
  PublicPrimaryButton,
  PublicPortalFooter,
  PublicPortalHeader,
  PublicSection,
  PublicSectionHeading,
} from "../components/PublicPortalChrome";
import {
  getClimateIntelligence,
  getPublicClimateRiskProfiles,
  getPublicElevationSummary,
  getPublicHistoricalSurfaceWater,
  getRemoteSensingLayers,
  getRemoteSensingLgaStats,
  getRemoteSensingLulcPreview,
} from "../services/api";
import { getAtlasLayerConfig } from "../config/climateAtlasLayers";
import { classifyNdvi, getPublicNdviError } from "../utils/publicNdvi";
import {
  computeClimateActionSignal,
  METHODOLOGY_NOTE as CLIMATE_ACTION_METHODOLOGY_NOTE,
  rankSignals,
  SIGNAL_LEVEL,
  SIGNAL_VISUAL,
} from "../decision-support/climateActionSignal";

// ---------------------------------------------------------------------------
// Data layer definitions - mirrors the sync_registry.py layer catalogue
// ---------------------------------------------------------------------------

const DATA_LAYERS = [
  {
    key: "ndvi",
    sourceLayers: ["ndvi", "ndvi_landsat"],
    label: "Vegetation / NDVI",
    status: "available",
    bullets: [
      "Landsat archive: 1985-2017, with documented archive gaps",
      "Sentinel-2: 2018-2025",
    ],
    detail: "23 LGAs - Annual, Wet & Dry seasons",
    source: "Landsat C2 L2 (LT05 / LE07 / LC08) - Sentinel-2 SR Harmonized - Google Earth Engine",
    note: "Landsat and Sentinel-2 NDVI are separate datasets, not a single calibrated series.",
  },
  {
    key: "rainfall",
    sourceLayers: ["rainfall"],
    label: "Rainfall",
    status: "available",
    detail: "CHIRPS v2.0 Daily - Annual, Wet & Dry seasons",
    source: "UCSB-CHG/CHIRPS/DAILY",
  },
  {
    key: "lst",
    sourceLayers: ["lst"],
    label: "Land Surface Temperature",
    status: "available",
    bullets: [
      "MODIS Terra MOD11A1: 2001-2025",
      "Annual, Wet & Dry seasons - 23 LGAs",
    ],
    detail: "Daily quality-filtered daytime LST - 1 km resolution",
    source: "MODIS Terra MOD11A1 v061 - Google Earth Engine",
    note: "Daytime LST is not equivalent to air temperature.",
  },
  {
    key: "temperature_anomaly",
    sourceLayers: ["temperature_anomaly"],
    label: "Temperature anomaly",
    status: "planned",
    detail: "Baseline-relative temperature product - processing required",
    source: "MODIS LST or ERA5-Land temperature source to be selected",
    note: "This is separate from absolute land surface temperature.",
  },
  {
    key: "flood_hazard",
    label: "Flood Hazard",
    status: "processing_required",
    detail: "Hazard modelling method and QA required before publication",
    source: "DEM, drainage, rainfall extremes, historical water and other factors",
  },
  {
    key: "flood_occurrence",
    sourceLayers: ["flood_occurrence"],
    label: "Historical surface-water occurrence",
    status: "available",
    detail: "JRC Global Surface Water occurrence archive - 1984-2021",
    source: "JRC Global Surface Water v1.4",
    note: "Historical surface-water occurrence is not a validated flood-hazard map.",
  },
  {
    key: "drought_index",
    sourceLayers: ["drought_index"],
    label: "SPI",
    status: "available",
    bullets: [
      "Fixed-window precipitation-only SPI",
      "Separate Annual, Wet Season, and Dry Season Gamma fits",
      "1991-2020 baseline",
    ],
    detail: "Annual/Wet 1981-2025, Dry Season 1982-2025",
    source: "CHIRPS v2.0 Daily rainfall totals",
    note: "Not an agricultural or hydrological drought indicator.",
  },
  {
    key: "lulc",
    sourceLayers: ["lulc"],
    label: "Land cover",
    status: "partial",
    detail: "Dynamic World v1 - public validated late wet season datasets",
    source: "GOOGLE/DYNAMICWORLD/V1",
  },
  {
    key: "elevation",
    sourceLayers: ["elevation"],
    label: "Elevation",
    status: "available",
    detail: "Elevation and terrain context layer - 23 LGAs",
    source: "SRTM elevation summary",
  },
  {
    key: "rainfall_anomaly",
    sourceLayers: ["rainfall_anomaly"],
    label: "Rainfall anomaly",
    status: "available",
    bullets: [
      "Database-derived from CHIRPS rainfall totals",
      "Percentage departure from the 1991-2020 LGA baseline",
      "Annual, Wet Season, and Dry Season coverage",
    ],
    detail: "Annual/Wet 1981-2025 - Dry Season 1982-2025 - 23 LGAs",
    source: "CHIRPS v2.0 Daily - 1991-2020 baseline - build_rainfall_anomaly command",
    note: "Not a drought index. Interpret alongside seasonal rainfall totals.",
  },
  {
    key: "local_obs",
    label: "Local Observations",
    status: "design_phase",
    detail: "Weather stations & river gauges - design phase",
    source: "",
  },
];
const STATUS_META = {
  available:     { label: "Available",      chipClass: "border-[#009B35]/30 bg-[#009B35]/10 text-[#007a29]" },
  partial:       { label: "Partially available", chipClass: "border-sky-200 bg-sky-50 text-sky-700" },
  processing_required: { label: "Processing required", chipClass: "border-amber-200 bg-amber-50 text-amber-700" },
  source_required: { label: "Source data required", chipClass: "border-rose-200 bg-rose-50 text-rose-700" },
  internal_preview: { label: "Internal preview", chipClass: "border-violet-200 bg-violet-50 text-violet-700" },
  in_development:{ label: "In development", chipClass: "border-amber-200 bg-amber-50 text-amber-700" },
  planned:       { label: "Planned",        chipClass: "border-slate-200 bg-slate-50 text-slate-600" },
  design_phase:  { label: "Design phase",   chipClass: "border-slate-200 bg-slate-50 text-slate-500" },
  coming_soon:   { label: "Coming Soon",     chipClass: "border-slate-200 bg-slate-50 text-slate-600" },
};

const INTELLIGENCE_LAYER_ORDER = [
  "ndvi",
  "rainfall",
  "rainfall_anomaly",
  "lst",
  "temperature_anomaly",
  "drought_index",
  "flood_occurrence",
  "lulc",
  "flood_hazard",
  "elevation",
];

const CONCERN_LABELS = {
  flood_risk_score: "Flood risk",
  drought_risk_score: "Drought risk",
  heat_risk_score: "Heat risk",
  erratic_rainfall_risk_score: "Erratic rainfall risk",
};

const CONCERN_ATLAS_KEYS = {
  flood_risk_score: "hazard_flood",
  drought_risk_score: "hazard_drought",
  heat_risk_score: "hazard_extreme_heat",
  erratic_rainfall_risk_score: "hazard_erratic_rainfall",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeLgaName(value) {
  return String(value || "").trim().toLowerCase();
}

function safeNumber(rawValue) {
  const n = parseFloat(rawValue);
  return Number.isFinite(n) ? n : null;
}

function countWithData(dataset) {
  if (!dataset?.results) return 0;
  return dataset.results.filter((item) => safeNumber(item.mean_value) !== null).length;
}

function stateMeanMetric(dataset) {
  if (!dataset?.results?.length) return null;
  const vals = dataset.results
    .map((r) => safeNumber(r.mean_value))
    .filter((v) => v !== null);
  if (!vals.length) return null;
  return vals.reduce((sum, v) => sum + v, 0) / vals.length;
}

function findLgaMetric(dataset, adminCode) {
  if (!dataset?.results?.length || !adminCode) return null;
  return dataset.results.find((item) => String(item.admin_code) === String(adminCode)) || null;
}

function metricForScope(dataset, adminCode) {
  if (!adminCode) return stateMeanMetric(dataset);
  return safeNumber(findLgaMetric(dataset, adminCode)?.mean_value);
}

function ndviForScope(dataset, adminCode) {
  return metricForScope(dataset, adminCode);
}

function formatMetric(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatWhole(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n).toLocaleString("en-US");
}

function formatArea(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n >= 1_000_000) return `${formatMetric(n / 1_000_000, 1)} km2`;
  return `${formatWhole(n)} m2`;
}

function formatSignedMetric(value, digits = 1, suffix = "") {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${n > 0 ? "+" : ""}${n.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}${suffix}`;
}

function classifyRainfallAnomaly(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "Not yet available";
  if (n <= -20) return "Well below baseline";
  if (n <= -10) return "Below baseline";
  if (n >= 20) return "Well above baseline";
  if (n >= 10) return "Above baseline";
  return "Near baseline";
}

function classifySpi(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "Not yet available";
  if (n <= -2) return "Extremely dry";
  if (n <= -1.5) return "Severely dry";
  if (n <= -1) return "Moderately dry";
  if (n >= 2) return "Extremely wet";
  if (n >= 1.5) return "Very wet";
  if (n >= 1) return "Moderately wet";
  return "Near normal";
}

function getLayerPeriod(layer) {
  return layer?.coverageNote?.replace(/^Coverage:\s*/i, "") || layer?.detail || "Not yet available";
}

const RISK_LEVEL_TONES = {
  very_high: "border-red-300 bg-red-100 text-red-800",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  moderate: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-[#009B35]/30 bg-[#009B35]/10 text-[#007a29]",
};

function getRiskLevelTone(riskLevel) {
  return RISK_LEVEL_TONES[String(riskLevel || "").toLowerCase()] || "border-slate-200 bg-slate-50 text-slate-600";
}

function toSeasonParam(season) {
  if (!season) return "annual";
  const value = String(season).toLowerCase();
  if (value.includes("wet")) return "wet_season";
  if (value.includes("dry")) return "dry_season";
  return "annual";
}

function buildAtlasHref(indicator, { adminCode = "", lgaName = "", season = "annual", period = "latest", year = "" } = {}) {
  const params = new URLSearchParams({
    indicator,
    period,
    season: toSeasonParam(season),
  });
  if (year) params.set("year", String(year));
  if (adminCode) params.set("admin_code", String(adminCode));
  if (lgaName) params.set("lga", lgaName);
  return `/public/climate-atlas?${params.toString()}`;
}

function layerToAtlasKey(layer) {
  if (layer?.key === "lulc") return "annual_lulc";
  if (layer?.key === "flood_hazard") return "flood_occurrence";
  return layer?.key;
}

function layerIsPublic(layer, publicLayerKeys) {
  const requiredLayers = layer.sourceLayers || [layer.key];
  return requiredLayers.every((layerKey) => publicLayerKeys.has(layerKey));
}

function getClimateLayerCards(publicLayerCatalog, publicLayerKeys, rainfallCardData) {
  const layerByKey = new Map(DATA_LAYERS.map((layer) => [layer.key, layer]));

  return INTELLIGENCE_LAYER_ORDER.map((key) => {
    const baseLayer = key === "rainfall" ? rainfallCardData : layerByKey.get(key);
    if (!baseLayer) return null;

    const isPublic =
      key === "rainfall"
        ? baseLayer.status === "available"
        : Boolean(publicLayerCatalog) && layerIsPublic(baseLayer, publicLayerKeys);

    let availabilityLabel = STATUS_META[baseLayer.status]?.label || "Not yet available";
    let status = baseLayer.status;
    if (isPublic && baseLayer.status === "available") {
      availabilityLabel = "Available";
      status = "available";
    } else if (isPublic && baseLayer.status === "partial") {
      availabilityLabel = "Partially available";
      status = "partial";
    }

    return {
      ...baseLayer,
      status,
      availabilityLabel,
    };
  }).filter(Boolean);
}

function getMainConcern(profile) {
  const scored = Object.keys(CONCERN_LABELS)
    .map((field) => ({ field, value: Number(profile?.[field]) }))
    .filter((item) => Number.isFinite(item.value));
  if (!scored.length) return { label: "Not yet available", atlasKey: "drought_index", field: null, value: null };
  const top = scored.sort((a, b) => b.value - a.value)[0];
  return { label: CONCERN_LABELS[top.field], atlasKey: CONCERN_ATLAS_KEYS[top.field], field: top.field, value: top.value };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PriorityLgaExplorer({ rows }) {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [concernFilter, setConcernFilter] = useState("all");
  const [sortMode, setSortMode] = useState("score-desc");

  const riskLevelOptions = useMemo(() => {
    const set = new Set();
    rows.forEach((row) => set.add(row.riskLevelDisplay));
    return [...set];
  }, [rows]);

  const concernOptions = useMemo(() => {
    const set = new Set();
    rows.forEach((row) => {
      if (row.concernLabel && row.concernLabel !== "Not assessed" && row.concernLabel !== "Not yet available") {
        set.add(row.concernLabel);
      }
    });
    return [...set].sort();
  }, [rows]);
  const concernFilterSupported = concernOptions.length > 0;

  const filteredRows = useMemo(() => {
    let result = rows;
    const query = search.trim().toLowerCase();
    if (query) result = result.filter((row) => row.lgaName.toLowerCase().includes(query));
    if (riskFilter !== "all") result = result.filter((row) => row.riskLevelDisplay === riskFilter);
    if (concernFilterSupported && concernFilter !== "all") {
      result = result.filter((row) => row.concernLabel === concernFilter);
    }

    const sorted = [...result];
    if (sortMode === "score-desc") {
      sorted.sort((a, b) => (b.riskScoreRaw ?? -1) - (a.riskScoreRaw ?? -1));
    } else if (sortMode === "score-asc") {
      sorted.sort((a, b) => {
        if (a.riskScoreRaw === null) return 1;
        if (b.riskScoreRaw === null) return -1;
        return a.riskScoreRaw - b.riskScoreRaw;
      });
    } else if (sortMode === "name") {
      sorted.sort((a, b) => a.lgaName.localeCompare(b.lgaName));
    }
    return sorted;
  }, [rows, search, riskFilter, concernFilter, concernFilterSupported, sortMode]);

  function resetFilters() {
    setSearch("");
    setRiskFilter("all");
    setConcernFilter("all");
    setSortMode("score-desc");
  }

  const hasActiveFilters =
    Boolean(search) || riskFilter !== "all" || concernFilter !== "all" || sortMode !== "score-desc";

  return (
    <PublicCard className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-[#D8DDE2] bg-[#FBFCFE] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search an LGA..."
            aria-label="Search LGAs"
            className="h-10 min-w-[200px] rounded-md border border-[#D8DDE2] bg-white px-3 text-sm outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
          />
          <select
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value)}
            aria-label="Filter by risk level"
            className="h-10 rounded-md border border-[#D8DDE2] bg-white px-3 text-sm outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
          >
            <option value="all">All risk levels</option>
            {riskLevelOptions.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
          {concernFilterSupported ? (
            <select
              value={concernFilter}
              onChange={(event) => setConcernFilter(event.target.value)}
              aria-label="Filter by main concern"
              className="h-10 rounded-md border border-[#D8DDE2] bg-white px-3 text-sm outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
            >
              <option value="all">All concerns</option>
              {concernOptions.map((label) => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
          ) : (
            <span
              title="Concern filtering is disabled because the current risk profiles do not include published per-hazard concern scores."
              className="rounded-md border border-dashed border-[#D8DDE2] bg-slate-50 px-3 py-2 text-xs font-bold text-slate-400"
            >
              Concern filter unavailable
            </span>
          )}
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value)}
            aria-label="Sort priority LGAs"
            className="h-10 rounded-md border border-[#D8DDE2] bg-white px-3 text-sm outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
          >
            <option value="score-desc">Risk score: high to low</option>
            <option value="score-asc">Risk score: low to high</option>
            <option value="name">LGA name: A-Z</option>
          </select>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            aria-label="Reset LGA filters and sorting"
            className="rounded-md border border-[#D8DDE2] bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset filters &#8630;
          </button>
          <span className="whitespace-nowrap text-xs font-bold text-slate-500">
            Showing {filteredRows.length} of {rows.length} LGA records
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <caption className="sr-only">Priority LGAs by overall climate risk score</caption>
          <thead>
            <tr className="border-b border-[#D8DDE2] bg-[#F7F9FA] text-left text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              <th scope="col" className="px-4 py-3">Rank</th>
              <th scope="col" className="px-4 py-3">Local Government Area</th>
              <th scope="col" className="px-4 py-3">Risk score</th>
              <th scope="col" className="px-4 py-3">Risk level</th>
              <th scope="col" className="px-4 py-3">Main concern</th>
              <th scope="col" className="px-4 py-3">Adaptive capacity</th>
              <th scope="col" className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E6EAEC]">
            {filteredRows.map((row, index) => (
              <tr key={row.key} className="transition hover:bg-[#F5FBF7]">
                <td className="px-4 py-3 font-mono text-xs font-bold text-slate-400">
                  {String(index + 1).padStart(2, "0")}
                </td>
                <th scope="row" className="px-4 py-3 text-left font-black text-[#030454]">
                  {row.lgaName}
                </th>
                <td className="px-4 py-3 font-mono text-sm font-bold text-slate-700">{row.riskScoreDisplay}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${getRiskLevelTone(row.riskLevelDisplay)}`}>
                    {row.riskLevelDisplay}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full border border-[#D8DDE2] bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    {row.concernLabel}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">{row.adaptiveCapacityDisplay}</td>
                <td className="px-4 py-3 text-right">
                  <a
                    href={row.atlasHref}
                    aria-label={`View ${row.lgaName} profile in the Climate Change Intelligence Tool`}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#009B35]/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.06em] text-[#009B35] transition hover:bg-[#009B35] hover:text-white"
                  >
                    View profile <span aria-hidden="true">&#8599;</span>
                  </a>
                </td>
              </tr>
            ))}
            {!filteredRows.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  No LGAs match the current search and filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col items-start gap-1 border-t border-[#D8DDE2] bg-[#FBFCFE] px-4 py-3 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Coverage view &middot; {rows.length} LGA records &middot; {rows.filter((row) => row.hasProfile).length} with a published risk assessment
        </span>
        <span>Risk scores and labels reflect the approved dataset.</span>
      </div>
    </PublicCard>
  );
}

// Same 0-100 normalized-index bands already used in the staff Climate
// Intelligence workspace (IndexExplanationBox) and in the Urgent Climate
// Action Signal's risk bucketing — reused here verbatim, not re-derived.
function HowToReadScoresCard() {
  return (
    <PublicCard className="border-[#030454]/15 bg-[#F7F9FA] p-5">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#030454]">
        How to read these scores
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Risk values are normalized indexes from <strong>0 to 100</strong>. A
        higher hazard, exposure or vulnerability score means higher concern.
        Adaptive capacity works the other way — a higher adaptive capacity
        score means a stronger existing ability to cope.
      </p>
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-[#009B35]/10 px-3 py-2 font-bold text-[#009B35]">
          0–39: Low
        </div>
        <div className="rounded-lg bg-[#F3F74B]/40 px-3 py-2 font-bold text-[#030454]">
          40–59: Moderate
        </div>
        <div className="rounded-lg bg-orange-50 px-3 py-2 font-bold text-orange-700">
          60–74: High
        </div>
        <div className="rounded-lg bg-red-50 px-3 py-2 font-bold text-red-700">
          75–100: Very High
        </div>
      </div>
    </PublicCard>
  );
}

function DataLayerAvailabilityTable({ layers, selectedLga }) {
  const actionLabelByStatus = {
    available: "Open in Climate Change Intelligence Tool",
    partial: "Open in Climate Change Intelligence Tool",
    processing_required: "View processing requirements",
    planned: "View processing requirements",
    internal_preview: "View source layer",
    design_phase: "View processing requirements",
    in_development: "View processing requirements",
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-[#D8DDE2] bg-white shadow-sm">
      <table className="min-w-[820px] w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#D8DDE2] bg-[#F7F9FA] text-left text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            <th scope="col" className="px-4 py-3">Dataset</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3">Latest period</th>
            <th scope="col" className="px-4 py-3">Coverage</th>
            <th scope="col" className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E6EAEC]">
          {layers.map((layer) => {
            const meta = STATUS_META[layer.status] || STATUS_META.planned;
            const atlasKey = layerToAtlasKey(layer);
            const atlasConfig = getAtlasLayerConfig(atlasKey);
            const canOpenAtlas = ["Available", "Partially available"].includes(layer.availabilityLabel || "");
            const href = canOpenAtlas && atlasConfig
              ? buildAtlasHref(atlasKey, {
                  adminCode: selectedLga?.admin_code,
                  lgaName: selectedLga?.admin_name,
                })
              : "#processing-requirements";
            return (
              <tr key={layer.key}>
                <th scope="row" className="px-4 py-3 text-left font-black text-[#030454]">{layer.label}</th>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${meta.chipClass}`}>
                    {layer.availabilityLabel || meta.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{getLayerPeriod(atlasConfig || layer)}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{layer.detail || atlasConfig?.coverageNote || "Not yet available"}</td>
                <td className="px-4 py-3 text-right">
                  <a
                    href={href}
                    className="text-xs font-black text-[#009B35] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30"
                  >
                    {canOpenAtlas ? "Open in Climate Change Intelligence Tool" : actionLabelByStatus[layer.status] || "View source layer"}
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AdditionalIndicatorRow({ name, value, period, limitation, href, actionLabel = "Open in Climate Change Intelligence Tool" }) {
  return (
    <div className="grid gap-2 border-b border-[#E6EAEC] px-4 py-3 last:border-b-0 md:grid-cols-[1.1fr_0.9fr_1fr_1.5fr_150px] md:items-center">
      <p className="font-black text-[#030454]">{name}</p>
      <p className="font-mono text-sm font-black text-[#009B35]">{value || "Not yet available"}</p>
      <p className="text-xs text-slate-600">{period}</p>
      <p className="text-xs leading-5 text-slate-500">{limitation}</p>
      {href ? (
        <a
          href={href}
          className="text-xs font-black text-[#009B35] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30 md:text-right"
        >
          {actionLabel}
        </a>
      ) : (
        <span className="text-xs font-bold text-slate-500 md:text-right">Source gated</span>
      )}
    </div>
  );
}

// Navy / soft-green / warm-cream, matching the approved three-finding
// treatment. Every value below is real, already-computed page state
// (risk-profile counts, vegetation and rainfall/SPI condition) - never a
// hard-coded sample.
const KEY_FINDING_TONES = [
  { card: "bg-[#030454] text-white", decor: "border-white/25" },
  { card: "bg-[#E6F7ED] text-[#030454]", decor: "border-[#009B35]/25" },
  { card: "bg-[#FDF5E3] text-[#030454]", decor: "border-[#d99718]/30" },
];

function KeyFindingCard({ item, index }) {
  const [cardRef, cardVisible] = useScrollReveal();
  const tone = KEY_FINDING_TONES[index % KEY_FINDING_TONES.length];

  return (
    <a
      ref={cardRef}
      href={item.href}
      style={{ transitionDelay: cardVisible ? `${index * 90}ms` : "0ms" }}
      className={revealClasses(
        cardVisible,
        `group relative isolate flex min-h-[210px] flex-col overflow-hidden rounded-2xl p-6 duration-300 motion-safe:hover:-translate-y-1.5 hover:shadow-[0_18px_38px_rgba(8,12,65,0.16)] ${tone.card}`
      )}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -right-6 top-5 h-20 w-20 rounded-full border opacity-50 transition-transform duration-500 motion-safe:group-hover:scale-110 ${tone.decor}`}
      />
      <p className="relative z-[1] text-[10px] font-black uppercase tracking-[0.12em] opacity-75">
        {item.kicker}
      </p>
      <p className="relative z-[1] mt-5 text-2xl font-black leading-tight sm:text-3xl">
        {item.big}
      </p>
      <p className="relative z-[1] mt-2 text-xs leading-5 opacity-85">{item.body}</p>
      <span className="relative z-[1] mt-auto flex w-fit items-center gap-1.5 border-b border-current pb-0.5 pt-4 text-[10px] font-black uppercase tracking-[0.08em]">
        {item.linkLabel} <span aria-hidden="true">&#8599;</span>
      </span>
    </a>
  );
}

function KeyFindingsSection({ findings }) {
  return (
    <PublicSection className="bg-white py-10 lg:py-11" innerClassName="max-w-7xl">
      <PublicSectionHeading
        eyebrow="At a glance"
        title="Key Findings"
        description="A quick, data-driven summary of the latest information on this page. Select a finding to explore the related section."
      />
      <div className="mt-7 grid gap-5 sm:grid-cols-3">
        {findings.map((item, index) => (
          <KeyFindingCard key={item.key} item={item} index={index} />
        ))}
      </div>
    </PublicSection>
  );
}

const DOMINANT_CONCERN_ATLAS_KEY = {
  Drought: "drought_index",
  Heat: "lst",
  "Vegetation stress": "ndvi",
  "Multiple climate stresses": "drought_index",
};

function AreasRequiringAttentionSection({ signals }) {
  const [showAll, setShowAll] = useState(false);
  const flagged = signals.filter((signal) => signal.signal_level !== SIGNAL_LEVEL.NO_CURRENT_SIGNAL);
  if (!flagged.length) return null;
  const displayed = showAll ? flagged : flagged.slice(0, 5);

  return (
    <PublicSection className="bg-[#F7F9FA] py-8 lg:py-9" innerClassName="max-w-7xl">
      <PublicSectionHeading
        title="Areas Requiring Attention"
        description="LGAs prioritised by the Urgent Climate Action Signal — current climate-hazard evidence, exposure and vulnerability context alongside the existing validated risk assessment. A decision-support prioritisation signal, not a forecast or emergency warning."
      />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {displayed.map((signal) => {
          const tone = SIGNAL_VISUAL[signal.signal_level];
          return (
            <PublicCard
              key={signal.admin_code || signal.admin_name}
              className="group relative overflow-hidden p-5 pl-6 transition duration-300 motion-safe:hover:-translate-y-1.5 hover:border-[#b2d9bf] hover:shadow-[0_18px_38px_rgba(8,12,65,0.1)]"
            >
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: tone.color }} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-[#030454]">{signal.admin_name}</h3>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    {signal.dominant_concern || "Environmental stress evidence"}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] ${tone.badgeClass}`}>
                  {signal.signal_label}
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                {signal.exposure_evidence.length > 0
                  ? signal.exposure_evidence.map((item) => `${item.label}: ${Number(item.value).toLocaleString()}`).join(" · ")
                  : "Review current climate-hazard evidence alongside the published assessment."}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-[#F6F8FB] p-2.5">
                  <p className="text-[8px] font-black uppercase tracking-[0.06em] text-slate-400">Risk level</p>
                  <p className="mt-0.5 text-xs font-black text-[#030454]">
                    {signal.risk_level ? signal.risk_level_display : "Not yet available"}
                  </p>
                </div>
                <div className="rounded-lg bg-[#F6F8FB] p-2.5">
                  <p className="text-[8px] font-black uppercase tracking-[0.06em] text-slate-400">Signal</p>
                  <p className="mt-0.5 text-xs font-black text-[#030454]">{signal.signal_label}</p>
                </div>
              </div>
              <a
                href={buildAtlasHref(DOMINANT_CONCERN_ATLAS_KEY[signal.dominant_concern] || "drought_index", { lgaName: signal.admin_name })}
                aria-label={`Inspect ${signal.admin_name} in Climate Change Intelligence Tool`}
                className="mt-4 flex items-center justify-between gap-2 border-t border-[#EDF0F4] pt-3 text-[10px] font-black uppercase tracking-[0.08em] text-[#009B35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30"
              >
                Inspect LGA record
                <span aria-hidden="true" className="transition-transform duration-200 motion-safe:group-hover:translate-x-1">
                  &#8599;
                </span>
              </a>
            </PublicCard>
          );
        })}
      </div>
      {flagged.length > 5 && (
        <div className="mt-4 text-right">
          <button
            type="button"
            onClick={() => setShowAll((current) => !current)}
            className="text-xs font-black uppercase tracking-[0.1em] text-[#030454] transition hover:text-[#009B35]"
          >
            {showAll ? "Show top five" : "View all flagged LGAs"}
          </button>
        </div>
      )}
      <p className="mt-4 text-[10px] leading-4 text-slate-400">{CLIMATE_ACTION_METHODOLOGY_NOTE}</p>
    </PublicSection>
  );
}

function ProcessingRequirementCard({ item }) {
  const meta = STATUS_META[item.stateKey] || STATUS_META.processing_required;
  return (
    <PublicCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-sm font-black text-[#030454]">{item.indicator}</h3>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${meta.chipClass}`}>
          {meta.label}
        </span>
      </div>
      <dl className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
        <div><dt className="inline font-black text-[#030454]">Source data: </dt><dd className="inline">{item.source}</dd></div>
        <div><dt className="inline font-black text-[#030454]">Processing: </dt><dd className="inline">{item.processing}</dd></div>
        <div><dt className="inline font-black text-[#030454]">Expected output: </dt><dd className="inline">{item.output}</dd></div>
        <div><dt className="inline font-black text-[#030454]">Current status: </dt><dd className="inline">{item.status}</dd></div>
        <div><dt className="inline font-black text-[#030454]">QA / release gate: </dt><dd className="inline">{item.gate}</dd></div>
      </dl>
    </PublicCard>
  );
}

const RISK_VISUAL_POINTS = [
  { left: "28%", top: "42%", delay: "0ms" },
  { left: "55%", top: "27%", delay: "600ms" },
  { left: "65%", top: "61%", delay: "1100ms" },
  { left: "42%", top: "70%", delay: "1600ms" },
];

// Decorative risk-overview panel. Deliberately not a literal map: this
// page has no bundled Kaduna boundary asset and the production Climate
// Change Intelligence Tool (linked via the CTA below) is the authoritative
// GIS surface. The only data shown here (risk level, assessment year,
// high-risk LGA count) is real, already-computed `riskProfile` data - the
// gradient/contours/pulsing points are ambient art direction only, with no
// invented values of their own, matching the approved reference's own
// treatment of this panel.
function ClimateRiskVisualPanel({ riskProfile, motionEnabled }) {
  return (
    <div
      className="relative min-h-[280px] w-full overflow-hidden rounded-2xl border border-white/15 shadow-[0_28px_65px_rgba(0,0,0,0.25)] sm:min-h-[320px] lg:min-h-[360px]"
      style={{
        background:
          "radial-gradient(ellipse at 55% 38%, #4c7a52 0%, #2d5a45 25%, #12302e 54%, #081a2e 100%)",
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[15%] -rotate-[20deg] rounded-[44%_56%_39%_61%/44%_42%_58%_56%] border border-[#c9f4a7]/35"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[25%] rotate-[20deg] rounded-[44%_56%_39%_61%/44%_42%_58%_56%] border border-[#f2ff3f]/35"
      />
      {RISK_VISUAL_POINTS.map((point, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`pointer-events-none absolute h-2.5 w-2.5 rounded-full bg-[#F3F74B] shadow-[0_0_0_6px_rgba(243,247,75,0.25),0_0_22px_rgba(243,247,75,0.9)] motion-reduce:animate-none ${
            motionEnabled ? "animate-pulse" : ""
          }`}
          style={{ left: point.left, top: point.top, animationDelay: point.delay }}
        />
      ))}
      <p className="absolute left-5 top-5 text-[10px] uppercase tracking-[0.14em] text-white/75">
        Kaduna State climate risk overview
      </p>
      <div className="absolute bottom-4 right-4 w-[210px] rounded-xl border border-white/30 bg-[#061f24]/85 p-4 backdrop-blur">
        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#c4e5c4]">
          Current risk level
        </p>
        <p className="mt-1 text-2xl font-black leading-tight text-white">
          {riskProfile.level}
        </p>
        <div className="mt-3 flex items-center justify-between text-[10px] text-white/75">
          <span>Assessment year</span>
          <b className="text-white">{riskProfile.assessmentPeriod}</b>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/75">
          <span>High-risk LGAs</span>
          <b className="text-[#ffb4c0]">{riskProfile.highRiskLgaCount}</b>
        </div>
      </div>
    </div>
  );
}

function ClimateRiskExecutiveHero({ riskProfile }) {
  const motionEnabled = useMotionEnabled();
  const [eyebrowRef, eyebrowVisible] = useScrollReveal();
  const [titleRef, titleVisible] = useScrollReveal();
  const [introRef, introVisible] = useScrollReveal();
  const [visualRef, visualVisible] = useScrollReveal();

  return (
    <section className="relative overflow-hidden bg-[#030454] px-4 py-12 text-white sm:px-8 sm:py-14 lg:px-10 lg:py-16">
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -right-40 -top-56 h-[34rem] w-[34rem] rounded-full border border-[#F3F74B]/20 motion-reduce:animate-none ${
          motionEnabled ? "animate-[spin_38s_linear_infinite]" : ""
        }`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-[14%] -bottom-40 h-72 w-72 rounded-full bg-[#009B35] opacity-20 blur-[90px] motion-reduce:animate-none ${
          motionEnabled ? "animate-pulse" : ""
        }`}
      />

      <div className="relative mx-auto grid max-w-[1536px] gap-10 lg:grid-cols-[minmax(0,0.98fr)_minmax(360px,0.82fr)] lg:items-center">
        <div>
          <p
            ref={eyebrowRef}
            className={revealClasses(eyebrowVisible, "text-xs font-black uppercase tracking-[0.22em] text-[#F3F74B]")}
          >
            Climate impact briefing
          </p>
          <h1
            ref={titleRef}
            className={revealClasses(
              titleVisible,
              "mt-5 max-w-3xl text-balance font-['Playfair_Display'] text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl"
            )}
            style={{ transitionDelay: titleVisible ? "80ms" : "0ms" }}
          >
            Climate risks require timely, targeted action
          </h1>
          <p
            ref={introRef}
            className={revealClasses(introVisible, "mt-5 max-w-2xl text-pretty text-base leading-8 text-white/78 sm:text-lg")}
            style={{ transitionDelay: introVisible ? "160ms" : "0ms" }}
          >
            Explore Kaduna State's latest climate impact, priority LGAs and key
            environmental indicators. Use the Climate Change Intelligence Tool for detailed maps and
            spatial insights.
          </p>
          <div
            className={revealClasses(introVisible, "mt-7 flex flex-wrap gap-4")}
            style={{ transitionDelay: introVisible ? "220ms" : "0ms" }}
          >
            <PublicPrimaryButton
              onClick={() => {
                window.location.href = "/public/climate-atlas";
              }}
              showArrow
              className="px-5 py-3.5 text-xs focus-visible:ring-offset-[#030454]"
            >
              Climate Change Intelligence Tool
            </PublicPrimaryButton>
          </div>
          {riskProfile.updatedAt && (
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-white/55">
              Updated: {riskProfile.updatedAt}
            </p>
          )}
        </div>

        <div
          ref={visualRef}
          className={revealClasses(visualVisible, "")}
          style={{ transitionDelay: visualVisible ? "140ms" : "0ms" }}
        >
          <ClimateRiskVisualPanel riskProfile={riskProfile} motionEnabled={motionEnabled} />
        </div>
      </div>
    </section>
  );
}

const ACCORDION_ICON_TONES = [
  "bg-[#e7f7ee] text-[#009B35]",
  "bg-[#e6eeff] text-[#1d4ed8]",
  "bg-[#fff0d6] text-[#b45309]",
];

function ReadBeyondHeadlineAccordion({ items }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#D8DDE2] bg-white">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={item.title} className={index > 0 ? "border-t border-[#D8DDE2]" : ""}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#F6FBF8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/40"
            >
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm ${ACCORDION_ICON_TONES[index % ACCORDION_ICON_TONES.length]}`}
                >
                  {item.icon}
                </span>
                <span className="text-sm font-black text-[#030454]">{item.title}</span>
              </span>
              <span
                aria-hidden="true"
                className={`shrink-0 text-xl font-black text-[#009B35] transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
              >
                +
              </span>
            </button>
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <div className="px-5 pb-5 pl-16 text-sm leading-7 text-slate-600">{item.body}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReadBeyondHeadlineSection({ items }) {
  return (
    <PublicSection className="bg-[#F7F9FA] py-10 lg:py-11" innerClassName="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
      <div className="rounded-2xl bg-[#030454] p-7 text-white">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#F3F74B]">Supporting information</p>
        <h2 className="mt-3 font-['Playfair_Display'] text-3xl font-bold leading-tight sm:text-4xl">
          Read beyond the headline.
        </h2>
        <p className="mt-3 text-sm leading-7 text-white/75">
          Make context and limitations easy to find. These expandable notes
          explain what is available, what still needs processing and how
          users should interpret the evidence.
        </p>
        <div className="mt-6 rounded-xl bg-white/10 px-4 py-3 text-xs font-bold text-[#F3F74B]">
          &#9679;&nbsp; Data transparency is part of climate intelligence.
        </div>
      </div>
      <ReadBeyondHeadlineAccordion items={items} />
    </PublicSection>
  );
}

const ABOUT_DATA_ICON_TONES = [
  "bg-[#e7f7ee] text-[#009B35]",
  "bg-[#e6eeff] text-[#1d4ed8]",
  "bg-[#fdf0e3] text-[#b45309]",
  "bg-[#f3e8ff] text-[#7c3aed]",
  "bg-[#fff0d6] text-[#92400e]",
  "bg-[#e0f2fe] text-[#0369a1]",
];

function AboutDataCard({ item, index }) {
  const [cardRef, cardVisible] = useScrollReveal();

  return (
    <article
      ref={cardRef}
      style={{ transitionDelay: cardVisible ? `${index * 70}ms` : "0ms" }}
      className={revealClasses(
        cardVisible,
        "rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-[0_6px_18px_rgba(16,25,77,0.05)] transition motion-safe:hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(16,25,77,0.1)]"
      )}
    >
      <span
        aria-hidden="true"
        className={`grid h-10 w-10 place-items-center rounded-xl text-base font-black ${ABOUT_DATA_ICON_TONES[index % ABOUT_DATA_ICON_TONES.length]}`}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <h3 className="mt-4 text-sm font-black text-[#030454]">{item.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{item.body}</p>
    </article>
  );
}

function AboutDataGrid({ items }) {
  return (
    <section className="bg-gradient-to-r from-[#fbf8d6] via-[#eaf7ea] to-[#fdf5e3] px-4 py-10 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#009B35]">Methodology</p>
          <h2 className="mt-3 font-['Playfair_Display'] text-3xl font-bold text-[#030454] sm:text-4xl">
            About the data
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            Concise transparency notes for every indicator shown on this
            page, linking back to the detailed evidence above where useful.
          </p>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <AboutDataCard key={item.title} item={item} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PublicClimateRiskPage() {
  const [annualData, setAnnualData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [publicLayerCatalog, setPublicLayerCatalog] = useState(null);
  const [publicRiskData, setPublicRiskData] = useState(null);

  const [rainAnnualData, setRainAnnualData] = useState(null);
  const [rainWetData, setRainWetData] = useState(null);
  const [rainDryData, setRainDryData] = useState(null);
  const [rainfallAnomalyData, setRainfallAnomalyData] = useState(null);
  const [spiData, setSpiData] = useState(null);
  const [climateIntelligenceData, setClimateIntelligenceData] = useState(null);
  const [floodOccurrenceData, setFloodOccurrenceData] = useState(null);
  const [elevationData, setElevationData] = useState(null);
  const [lulcData, setLulcData] = useState(null);
  const selectedIndicatorLgaCode = "";

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setApiError("");

      const [
        annualResult, wetResult, dryResult,
        rainAnnualResult, rainWetResult, rainDryResult, layerCatalogResult,
        publicRiskResult, rainfallAnomalyResult, spiResult,
        climateIntelligenceResult, floodOccurrenceResult, elevationResult, lulcResult,
      ] = await Promise.allSettled([
        getRemoteSensingLgaStats({ layer: "ndvi", year: 2025, season: "annual", admin_level: "lga" }),
        getRemoteSensingLgaStats({ layer: "ndvi", year: 2025, season: "wet_season", admin_level: "lga" }),
        getRemoteSensingLgaStats({ layer: "ndvi", year: 2025, season: "dry_season", admin_level: "lga" }),
        getRemoteSensingLgaStats({ layer: "rainfall", year: 2025, season: "annual", admin_level: "lga" }),
        getRemoteSensingLgaStats({ layer: "rainfall", year: 2025, season: "wet_season", admin_level: "lga" }),
        getRemoteSensingLgaStats({ layer: "rainfall", year: 2025, season: "dry_season", admin_level: "lga" }),
        getRemoteSensingLayers(),
        getPublicClimateRiskProfiles(),
        getRemoteSensingLgaStats({ layer: "rainfall_anomaly", year: 2025, season: "annual", admin_level: "lga" }),
        getRemoteSensingLgaStats({ layer: "drought_index", year: 2025, season: "annual", admin_level: "lga" }),
        getClimateIntelligence({ year: 2025, season: "annual", admin_level: "lga" }),
        getPublicHistoricalSurfaceWater(),
        getPublicElevationSummary(),
        getRemoteSensingLulcPreview({ year: 2025, window: "late_wet_season", admin_level: "lga" }),
      ]);

      setApiError(getPublicNdviError(
        [annualResult, wetResult, dryResult], layerCatalogResult,
      ));

      setAnnualData(annualResult.status === "fulfilled" ? annualResult.value : null);

      setRainAnnualData(rainAnnualResult.status === "fulfilled" ? rainAnnualResult.value : null);
      setRainWetData(rainWetResult.status === "fulfilled" ? rainWetResult.value : null);
      setRainDryData(rainDryResult.status === "fulfilled" ? rainDryResult.value : null);
      setRainfallAnomalyData(rainfallAnomalyResult.status === "fulfilled" ? rainfallAnomalyResult.value : null);
      setSpiData(spiResult.status === "fulfilled" ? spiResult.value : null);
      setClimateIntelligenceData(climateIntelligenceResult.status === "fulfilled" ? climateIntelligenceResult.value : null);
      setFloodOccurrenceData(floodOccurrenceResult.status === "fulfilled" ? floodOccurrenceResult.value : null);
      setElevationData(elevationResult.status === "fulfilled" ? elevationResult.value : null);
      setLulcData(lulcResult.status === "fulfilled" ? lulcResult.value : null);
      setPublicLayerCatalog(layerCatalogResult.status === "fulfilled"
        ? (layerCatalogResult.value?.results || []) : []);
      setPublicRiskData(publicRiskResult.status === "fulfilled"
        ? publicRiskResult.value : null);

      setIsLoading(false);
    }

    load();
  }, []);

  const rainAnnualCount = countWithData(rainAnnualData);
  const rainWetCount = countWithData(rainWetData);
  const rainDryCount = countWithData(rainDryData);
  const elevationCount = countWithData(elevationData);
  const lgaOptions = useMemo(() => {
    const seen = new Set();
    return (annualData?.results || [])
      .filter((item) => item.admin_code && item.admin_name)
      .map((item) => ({
        admin_code: item.admin_code,
        admin_name: item.admin_name,
      }))
      .filter((item) => {
        const key = String(item.admin_code);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => String(a.admin_name).localeCompare(String(b.admin_name)));
  }, [annualData]);
  const selectedIndicatorLga = useMemo(
    () =>
      lgaOptions.find(
        (item) => String(item.admin_code) === String(selectedIndicatorLgaCode)
      ) || null,
    [lgaOptions, selectedIndicatorLgaCode],
  );
  const selectedAnnualNdvi = useMemo(
    () => ndviForScope(annualData, selectedIndicatorLgaCode),
    [annualData, selectedIndicatorLgaCode],
  );
  const selectedRainfallAnomaly = useMemo(
    () => metricForScope(rainfallAnomalyData, selectedIndicatorLgaCode),
    [rainfallAnomalyData, selectedIndicatorLgaCode],
  );
  const selectedSpi = useMemo(
    () => metricForScope(spiData, selectedIndicatorLgaCode),
    [spiData, selectedIndicatorLgaCode],
  );
  const selectedFloodOccurrence = useMemo(
    () => metricForScope(floodOccurrenceData, selectedIndicatorLgaCode),
    [floodOccurrenceData, selectedIndicatorLgaCode],
  );
  const selectedLulcSnapshot = useMemo(() => {
    if (!lulcData?.results?.length) return null;
    if (selectedIndicatorLgaCode) {
      return lulcData.results.find((item) => String(item.admin_code) === String(selectedIndicatorLgaCode)) || null;
    }
    const counts = new Map();
    lulcData.results.forEach((item) => {
      if (!item.dominant_label) return;
      counts.set(item.dominant_label, (counts.get(item.dominant_label) || 0) + 1);
    });
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return dominant ? {
      dominant_label: dominant[0],
      dominant_pct: null,
      admin_name: "Kaduna State",
    } : null;
  }, [lulcData, selectedIndicatorLgaCode]);
  const indicatorScopeLabel = selectedIndicatorLga
    ? selectedIndicatorLga.admin_name
    : "Kaduna State mean";
  const publicRiskProfiles = useMemo(
    () => publicRiskData?.results || [],
    [publicRiskData],
  );

  const rainfallCardData = useMemo(() => {
    if (isLoading) {
      return { key: "rainfall", label: "Rainfall", status: "in_development", detail: "Loading coverage data...", source: "", note: "" };
    }
    const anyLoaded = rainAnnualCount !== null || rainWetCount !== null || rainDryCount !== null;
    if (!anyLoaded) {
      return { key: "rainfall", label: "Rainfall", status: "in_development", detail: "CHIRPS v2.0 Daily - coverage data currently unavailable", source: "", note: "" };
    }
    const parts = [];
    if (rainAnnualCount !== null) parts.push(`Annual: ${rainAnnualCount} LGAs`);
    if (rainWetCount !== null) parts.push(`Wet season: ${rainWetCount} LGAs`);
    if (rainDryCount !== null) parts.push(`Dry season: ${rainDryCount} LGAs`);
    return {
      key: "rainfall",
      label: "Rainfall",
      status: "available",
      detail: `2025 - ${parts.join(" - ")}`,
      source: "CHIRPS v2.0 Daily - Historical: Annual/Wet 1981-2025 - Dry 1982-2025",
      note: "Rainfall totals are satellite-derived estimates. Local gauge validation is planned.",
    };
  }, [isLoading, rainAnnualCount, rainWetCount, rainDryCount]);

  const publicLayerKeys = useMemo(
    () => new Set((publicLayerCatalog || []).map((layer) => layer.key)),
    [publicLayerCatalog],
  );
  const climateLayerCards = useMemo(
    () => getClimateLayerCards(publicLayerCatalog, publicLayerKeys, rainfallCardData),
    [publicLayerCatalog, publicLayerKeys, rainfallCardData],
  );
  const availableClimateLayerCount = climateLayerCards.filter(
    (layer) => layer.availabilityLabel === "Available",
  ).length;
  const publicRiskSummary = publicRiskData?.summary || {};
  const exposureSummary = publicRiskSummary || {};
  const floodExposure = exposureSummary.flood_exposure || {};
  const hasPublicRiskCounts = Boolean(publicRiskSummary.risk_counts);
  const highRiskLgaCount =
    (publicRiskSummary.risk_counts?.high || 0) +
    (publicRiskSummary.risk_counts?.very_high || 0);
  const exposureCache = publicRiskSummary.high_risk_exposure_cache || {};
  const highestRiskProfile = useMemo(
    () =>
      [...publicRiskProfiles].sort(
        (a, b) =>
          Number(b.overall_risk_score || 0) -
          Number(a.overall_risk_score || 0)
      )[0],
    [publicRiskProfiles],
  );
  // Full 23-LGA coverage: every LGA known to the page (via the NDVI LGA
  // list already loaded for the indicator explorer) is shown, with real
  // published risk-profile data where it exists and an explicit "Pending"
  // row - never a silently dropped LGA or a fabricated score - where it
  // does not.
  const fullLgaCoverageRows = useMemo(() => {
    const profileByName = new Map();
    publicRiskProfiles.forEach((profile) => {
      if (profile.lga_name) profileByName.set(normalizeLgaName(profile.lga_name), profile);
    });

    function rowFromProfile(profile, fallbackName) {
      const concern = getMainConcern(profile);
      const riskScoreRaw = safeNumber(profile.overall_risk_score);
      const adaptiveCapacity = formatMetric(profile.adaptive_capacity_score, 1);
      return {
        key: profile.id ?? profile.lga_name ?? fallbackName,
        lgaName: profile.lga_name || fallbackName,
        riskScoreRaw,
        riskScoreDisplay: formatMetric(profile.overall_risk_score, 1) || "—",
        riskLevelDisplay: profile.risk_level_display || "Unknown",
        concernLabel: concern.label,
        adaptiveCapacityDisplay: adaptiveCapacity ? `${adaptiveCapacity} / 100` : "Not yet available",
        atlasHref: buildAtlasHref(concern.atlasKey, { lgaName: profile.lga_name || fallbackName }),
        hasProfile: true,
      };
    }

    const coveredNames = new Set();
    const rows = lgaOptions.map((lga) => {
      const key = normalizeLgaName(lga.admin_name);
      coveredNames.add(key);
      const profile = profileByName.get(key);
      if (!profile) {
        return {
          key: lga.admin_code,
          lgaName: lga.admin_name,
          riskScoreRaw: null,
          riskScoreDisplay: "—",
          riskLevelDisplay: "Pending",
          concernLabel: "Not assessed",
          adaptiveCapacityDisplay: "Not yet available",
          atlasHref: buildAtlasHref("drought_index", { lgaName: lga.admin_name }),
          hasProfile: false,
        };
      }
      return rowFromProfile(profile, lga.admin_name);
    });

    // A published risk profile whose LGA name is absent from the NDVI LGA
    // list is still included, so a real record is never dropped just
    // because another dataset's coverage differs.
    publicRiskProfiles.forEach((profile) => {
      if (!profile.lga_name) return;
      const key = normalizeLgaName(profile.lga_name);
      if (coveredNames.has(key)) return;
      coveredNames.add(key);
      rows.push(rowFromProfile(profile, profile.lga_name));
    });

    return rows.sort((a, b) => {
      if (a.riskScoreRaw === null && b.riskScoreRaw === null) return a.lgaName.localeCompare(b.lgaName);
      if (a.riskScoreRaw === null) return 1;
      if (b.riskScoreRaw === null) return -1;
      return b.riskScoreRaw - a.riskScoreRaw;
    });
  }, [lgaOptions, publicRiskProfiles]);
  // Urgent Climate Action Signal — same shared computation as the Climate
  // Change Intelligence System map (frontend/src/decision-support/climateActionSignal.js).
  // No new API calls: risk profiles, indicators and exposure breakdown are
  // already loaded on this page.
  const climateActionSignals = useMemo(() => {
    const ciByName = {};
    for (const item of climateIntelligenceData?.results || []) {
      if (item.admin_name) ciByName[normalizeLgaName(item.admin_name)] = item;
    }
    const summary = publicRiskData?.summary || {};
    const exposureByName = {};
    for (const item of summary.high_risk_lga_population_breakdown || []) {
      const key = normalizeLgaName(item.lga_name);
      exposureByName[key] = { ...(exposureByName[key] || {}), estimated_people: item.estimated_people };
    }
    for (const item of summary.high_risk_lga_building_breakdown || []) {
      const key = normalizeLgaName(item.lga_name);
      exposureByName[key] = { ...(exposureByName[key] || {}), mapped_buildings: item.mapped_buildings };
    }
    return publicRiskProfiles
      .filter((profile) => profile.lga_name)
      .map((profile) => {
        const key = normalizeLgaName(profile.lga_name);
        const ciItem = ciByName[key] || null;
        return computeClimateActionSignal({
          admin_code: profile.lga,
          admin_name: profile.lga_name,
          riskProfile: profile,
          hazards: ciItem?.hazards || null,
          indicators: ciItem?.indicators || null,
          exposure: exposureByName[key] || null,
        });
      });
  }, [publicRiskProfiles, climateIntelligenceData, publicRiskData]);

  const rankedClimateActionSignals = useMemo(
    () => rankSignals(climateActionSignals),
    [climateActionSignals],
  );

  const selectedClimateIntelligence = useMemo(() => {
    if (!climateIntelligenceData?.results?.length) return null;
    if (selectedIndicatorLgaCode) {
      return climateIntelligenceData.results.find((item) => String(item.admin_code) === String(selectedIndicatorLgaCode)) || null;
    }
    return climateIntelligenceData.results[0] || null;
  }, [climateIntelligenceData, selectedIndicatorLgaCode]);
  const vegetationStatus = selectedClimateIntelligence?.indicators?.ndvi?.condition || classifyNdvi(selectedAnnualNdvi);
  const rainfallAnomalyStatus = selectedClimateIntelligence?.indicators?.rainfall_anomaly?.condition || classifyRainfallAnomaly(selectedRainfallAnomaly);
  const spiStatus = selectedClimateIntelligence?.indicators?.spi?.condition || classifySpi(selectedSpi);
  const lulcDatasetIsPublic = Boolean(lulcData?.dataset?.is_public && lulcData?.dataset?.is_validated);
  const exposurePeople = exposureSummary.estimated_people_in_high_risk_lgas;
  const exposureBuildings = exposureSummary.mapped_buildings_in_high_risk_lgas;
  const exposureBuildingArea = exposureSummary.mapped_building_footprint_area_m2;
  const floodPopulation = exposureSummary.flood_population_exposed;
  const pendingIndicators = useMemo(() => [
    {
      indicator: "Temperature Anomaly",
      stateKey: "processing_required",
      source: "MODIS daytime LST or ERA5-Land near-surface air temperature",
      processing: "Select the temperature source, define a climatological baseline, calculate current minus baseline, aggregate to LGAs, classify above or below normal.",
      output: "Surface-temperature anomaly or near-surface air-temperature anomaly by LGA, with baseline period and unit documented.",
      status: "No public temperature-anomaly records exist in the current layer catalogue.",
      gate: "Method review, QA against missing pixels and units, then explicit publication approval.",
    },
    {
      indicator: "Flood Hazard",
      stateKey: "processing_required",
      source: "DEM, drainage network, rainfall intensity or extremes, historical surface-water occurrence, optional soils and land cover.",
      processing: "Condition DEM, derive flow direction and accumulation, normalize contributing factors, run a documented weighted overlay or validated model, then aggregate hazard classes to LGAs.",
      output: "Validated flood-hazard class or score by LGA.",
      status: "Historical surface-water occurrence is public, but no validated flood-hazard layer exists.",
      gate: "Hydrology method review, validation, and publication approval.",
    },
    {
      indicator: "Flood Structure Exposure",
      stateKey: "processing_required",
      source: "JRC occurrence mask and Google Open Buildings footprints.",
      processing: "Run bounded building-footprint intersections against the approved flood or occurrence mask and cache LGA aggregates.",
      output: "Exposed structure count by LGA with confidence threshold.",
      status: floodExposure.building_method || "Building-footprint exposure aggregate is not complete.",
      gate: "Batch completion, QA of footprint intersections, and public exposure validation.",
    },
    {
      indicator: "Flood Built-Area Exposure",
      stateKey: "processing_required",
      source: "JRC occurrence mask and building footprint areas.",
      processing: "Aggregate building footprint area inside the approved hazard or occurrence mask by LGA.",
      output: "Exposed built-area in m2 or km2 by LGA.",
      status: "Current public summary has no validated built-area exposure value.",
      gate: "Area reconciliation, unit QA, and public exposure validation.",
    },
  ], [floodExposure.building_method]);
  const additionalIndicatorItems = useMemo(() => [
    {
      name: "Rainfall Anomaly",
      value: formatSignedMetric(selectedRainfallAnomaly, 1, "%") || rainfallAnomalyStatus,
      period: `${indicatorScopeLabel} - 2025 annual`,
      limitation: "Percentage departure from the 1991-2020 rainfall baseline; not a drought index.",
      href: buildAtlasHref("rainfall_anomaly", {
        adminCode: selectedIndicatorLga?.admin_code,
        lgaName: selectedIndicatorLga?.admin_name,
        season: "annual",
      }),
      actionLabel: "Open in Climate Change Intelligence Tool",
    },
    {
      name: "Historical Surface-Water Occurrence",
      value: formatMetric(selectedFloodOccurrence, 1) ? `${formatMetric(selectedFloodOccurrence, 1)}%` : "Not yet available",
      period: `${indicatorScopeLabel} - 1984-2021 archive`,
      limitation: "Observed historical water occurrence; not a validated flood-hazard map.",
      href: buildAtlasHref("flood_occurrence", {
        adminCode: selectedIndicatorLga?.admin_code,
        lgaName: selectedIndicatorLga?.admin_name,
        season: "annual",
        year: 2021,
      }),
      actionLabel: "Open in Climate Change Intelligence Tool",
    },
    {
      name: "Land Cover",
      value: lulcDatasetIsPublic && selectedLulcSnapshot?.dominant_label ? selectedLulcSnapshot.dominant_label : "Partially available",
      period: lulcDatasetIsPublic ? `${lulcData?.dataset?.year || 2025} late wet season` : "Public summary pending",
      limitation: "Dominant-class context only; no land-cover change is inferred here.",
      href: buildAtlasHref("annual_lulc", {
        adminCode: selectedIndicatorLga?.admin_code,
        lgaName: selectedIndicatorLga?.admin_name,
        season: "annual",
        year: lulcData?.dataset?.year || 2025,
      }),
      actionLabel: "Open in Climate Change Intelligence Tool",
    },
    {
      name: "People in High-Risk LGAs",
      value: formatWhole(exposurePeople),
      period: `${publicRiskSummary.year || "2025"} risk profile`,
      limitation: "Administrative-area exposure estimate, not people inside a hazard footprint.",
      href: "#about-data",
      actionLabel: "View source notes",
    },
    {
      name: "Structures in High-Risk LGAs",
      value: formatWhole(exposureBuildings),
      period: `${publicRiskSummary.year || "2025"} risk profile`,
      limitation: formatArea(exposureBuildingArea)
        ? `Mapped footprint area: ${formatArea(exposureBuildingArea)}; not critical-infrastructure classification.`
        : "Mapped building footprints only; not critical-infrastructure classification.",
      href: "#about-data",
      actionLabel: "View assumptions",
    },
    {
      name: "Flood Population Exposure",
      value: formatWhole(floodPopulation),
      period: `${floodExposure.observation_period || "1984-2021"} mask; ${floodExposure.population_source_year || "2020"} population`,
      limitation: floodExposure.note || "Historical-water footprint screen, not a real-time alert or formal hazard score.",
      href: buildAtlasHref("flood_occurrence", {
        adminCode: selectedIndicatorLga?.admin_code,
        lgaName: selectedIndicatorLga?.admin_name,
        season: "annual",
        year: 2021,
      }),
      actionLabel: "View source layer",
    },
    {
      name: "Elevation status",
      value: elevationCount ? `Published — ${elevationCount} LGAs` : "Public release pending",
      period: "SRTM terrain summary",
      limitation: "Minimum, mean and maximum elevation in metres by LGA.",
      href: buildAtlasHref("elevation", {
        adminCode: selectedIndicatorLga?.admin_code,
        lgaName: selectedIndicatorLga?.admin_name,
      }),
      actionLabel: elevationCount ? "Open in Climate Change Intelligence Tool" : "View release requirement",
    },
  ], [
    elevationCount,
    exposureBuildingArea,
    exposureBuildings,
    exposurePeople,
    floodExposure.note,
    floodExposure.observation_period,
    floodExposure.population_source_year,
    floodPopulation,
    indicatorScopeLabel,
    lulcData?.dataset?.year,
    lulcDatasetIsPublic,
    publicRiskSummary.year,
    rainfallAnomalyStatus,
    selectedFloodOccurrence,
    selectedIndicatorLga,
    selectedLulcSnapshot,
    selectedRainfallAnomaly,
  ]);
  const keyFindingCards = useMemo(() => {
    const vegetationCopy = {
      "Healthy vegetation": "Vegetation conditions are generally healthy across Kaduna State.",
      "Moderate vegetation": "Vegetation conditions are moderate across Kaduna State.",
      "Sparse vegetation": "Vegetation conditions are below normal in parts of Kaduna State.",
      "Low vegetation": "Vegetation conditions are low in parts of Kaduna State.",
    };

    return [
      {
        key: "risk-profile",
        kicker: "01 / Risk profile",
        big: hasPublicRiskCounts ? `${highRiskLgaCount} LGA${highRiskLgaCount === 1 ? "" : "s"}` : "Not yet available",
        body: hasPublicRiskCounts
          ? "Currently classified as High or Very High risk in the published assessment summary."
          : "LGA risk classifications for the current period are not yet published.",
        linkLabel: "Explore priority LGAs",
        href: "#priority",
      },
      {
        key: "vegetation",
        kicker: "02 / Vegetation",
        big: vegetationStatus !== "Not yet available" ? vegetationStatus : "Data gap",
        body: vegetationCopy[vegetationStatus] || "Vegetation data for the current period is not yet available in this briefing.",
        linkLabel: "Read supporting data notes",
        href: "#supporting",
      },
      {
        key: "rainfall",
        kicker: "03 / Rainfall",
        big: spiStatus !== "Not yet available" ? spiStatus : "Review",
        body: spiStatus !== "Not yet available"
          ? `Rainfall conditions are classified as ${spiStatus.toLowerCase()}; interpret alongside seasonal context.`
          : "Rainfall conditions require interpretation alongside seasonal context.",
        linkLabel: "Read supporting data notes",
        href: "#supporting",
      },
    ];
  }, [hasPublicRiskCounts, highRiskLgaCount, vegetationStatus, spiStatus]);

  const riskProfile = useMemo(() => ({
    level: highestRiskProfile?.risk_level_display || "Not yet published",
    highRiskLgaCount: hasPublicRiskCounts ? highRiskLgaCount : "Not yet published",
    assessmentPeriod: publicRiskSummary.year || "Not yet published",
    updatedAt: exposureCache.generated_at || "",
  }), [
    exposureCache.generated_at,
    hasPublicRiskCounts,
    highRiskLgaCount,
    highestRiskProfile,
    publicRiskSummary.year,
  ]);
  // Exactly six named topics, consolidating the same real methodology notes
  // used elsewhere on this page (the per-indicator limitation text below is
  // also visible inline in the "Read beyond the headline" indicator table) -
  // no generic placeholder copy was substituted.
  const aboutDataSixCards = useMemo(() => [
    {
      title: "Data Sources",
      body: "Vegetation/NDVI uses Landsat Collection 2 Level 2 and Sentinel-2 Surface Reflectance Harmonized via Google Earth Engine. Daytime LST uses MODIS Terra MOD11A1 v061. Rainfall, rainfall anomaly and SPI use CHIRPS v2.0 daily rainfall totals where those layers are in the public catalog.",
    },
    {
      title: "Processing Methodology",
      body: "NDVI values are derived from 2025 Sentinel-2 composites, summarized to LGA-level records for annual, wet-season and dry-season windows. Landsat and Sentinel-2 NDVI remain scientifically distinct series. Rainfall anomaly is the percentage departure from the 1991-2020 LGA baseline; SPI uses fixed-window precipitation-only gamma fits.",
    },
    {
      title: "Spatial Coverage",
      body: "Kaduna coverage is summarized at LGA level across all reporting windows where data is available. Sentinel-2 NDVI uses a 60 m processing scale; MODIS daytime LST is a 1 km layer. Raster products are aggregated to administrative units.",
    },
    {
      title: "Temporal Frequency",
      body: "This briefing uses 2025 composites and the live public catalog state. Historical catalog coverage includes Sentinel-2 2018-2025, Landsat 1985-2017, MODIS LST 2001-2025, and CHIRPS-derived rainfall products where available.",
    },
    {
      title: "Known Limitations",
      body: "LST is surface temperature, not air temperature. SPI is precipitation-only and not an agricultural or hydrological drought indicator; rainfall anomaly is not a drought index. Administrative exposure estimates (people, buildings) are screening indicators tied to LGA boundaries, WorldPop and Open Buildings data - not hazard-footprint or infrastructure-criticality assessments. Satellite rainfall totals are estimates pending local gauge validation.",
    },
    {
      title: "Interpretation Guidance",
      body: "NDVI indicates vegetation condition and should be read alongside season, rainfall, rainfall anomaly, SPI and LST caveats before technical decisions. This page is a briefing layer, not a replacement for GIS analysis - use the Climate Change Intelligence Tool for interactive maps, year/season filtering and LGA drill-down.",
    },
  ], []);

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <PublicPortalHeader activePage="climate-intelligence" compact showHero={false} showActions={false} />
      <ClimateRiskExecutiveHero riskProfile={riskProfile} />
      <PublicErrorBanner message={apiError} maxWidthClassName="max-w-7xl" />
      <KeyFindingsSection findings={keyFindingCards} />

      <PublicSection className="bg-white py-10 lg:py-11" innerClassName="max-w-7xl">
        <PublicSectionHeading
          title="Priority LGAs"
          description="Review the state's LGAs ranked by overall climate risk score in the latest validated assessment. Use the search, risk and concern filters to explore coverage; adaptive capacity reflects an LGA's existing ability to prepare for, respond to and recover from climate impacts, scored separately from the overall risk score."
        />
        <div className="mt-5">
          <HowToReadScoresCard />
        </div>
        <div className="mt-7">
          {fullLgaCoverageRows.length ? (
            <PriorityLgaExplorer rows={fullLgaCoverageRows} />
          ) : (
            <PublicEmptyState
              title="Priority LGA data is not yet available"
              message="Validated LGA risk profiles have not been published for the current period."
            />
          )}
        </div>
      </PublicSection>

      <AreasRequiringAttentionSection signals={rankedClimateActionSignals} />

      <div id="supporting">
        <div id="processing-requirements" />
        <ReadBeyondHeadlineSection
          items={[
            {
              icon: "\u25A4",
              title: `${additionalIndicatorItems.length} additional climate and exposure indicators`,
              body: (
                <div className="overflow-hidden rounded-lg border border-[#D8DDE2]">
                  {additionalIndicatorItems.map((item) => (
                    <AdditionalIndicatorRow key={item.name} {...item} />
                  ))}
                </div>
              ),
            },
            {
              icon: "\u25F7",
              title: `${availableClimateLayerCount} of ${climateLayerCards.length} briefing datasets available`,
              body: <DataLayerAvailabilityTable layers={climateLayerCards} selectedLga={selectedIndicatorLga} />,
            },
            {
              icon: "\u2691",
              title: `${pendingIndicators.length} indicators require further processing`,
              body: (
                <div className="grid gap-3 md:grid-cols-2">
                  {pendingIndicators.map((item) => (
                    <ProcessingRequirementCard key={item.indicator} item={item} />
                  ))}
                </div>
              ),
            },
          ]}
        />
      </div>

      <div id="about-data">
        <AboutDataGrid items={aboutDataSixCards} />
      </div>

      <PublicSection className="bg-[#F7F9FA]" innerClassName="max-w-7xl">
        <PublicDisclaimerNote className="mt-0" toneClassName="bg-amber-50"><p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-amber-700">Climate risk profile records</p>The platform also holds climate risk profile records for Kaduna LGAs. These are composite assessment records built from multi-indicator scoring. They are <strong>not derived from real-time satellite measurements</strong> and have not been validated against remote-sensing data. The Climate Change Intelligence Tool is the correct tool for satellite-based exploration.</PublicDisclaimerNote>
      </PublicSection>

      <PublicPortalFooter />
    </main>
  );
}
