import { useEffect, useMemo, useState } from "react";
import {
  PublicCard,
  PublicDisclaimerNote,
  PublicEmptyState,
  PublicErrorBanner,
  PublicFaqAccordion,
  PublicPrimaryButton,
  PublicPortalFooter,
  PublicPortalHeader,
  PublicSecondaryButton,
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
import climateRiskDryland from "../assets/climate-risk-dryland.jpg";
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
  erosion_risk_score: "Erosion risk",
};

const CONCERN_ATLAS_KEYS = {
  flood_risk_score: "flood_occurrence",
  drought_risk_score: "drought_index",
  heat_risk_score: "lst",
  erosion_risk_score: "annual_lulc",
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

function sourceForScope(dataset, adminCode) {
  if (!dataset?.results?.length) return null;
  if (adminCode) return findLgaMetric(dataset, adminCode) || null;
  return dataset.results.find((item) => item.data_source || item.metadata) || dataset.results[0] || null;
}

function ndviForScope(dataset, adminCode) {
  return metricForScope(dataset, adminCode);
}

function formatNdvi(value) {
  return value === null || value === undefined ? null : value.toFixed(3);
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

function classifyNdvi(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "Not yet available";
  if (n >= 0.55) return "Healthy vegetation";
  if (n >= 0.35) return "Moderate vegetation";
  if (n >= 0.2) return "Sparse vegetation";
  return "Low vegetation";
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

function classifyLst(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "Not yet available";
  if (n >= 35) return "High surface temperature";
  if (n >= 30) return "Moderate surface temperature";
  return "Lower surface temperature";
}

function getLayerPeriod(layer) {
  return layer?.coverageNote?.replace(/^Coverage:\s*/i, "") || layer?.detail || "Not yet available";
}

function getConditionTone(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("healthy") || value.includes("near normal") || value.includes("near baseline") || value.includes("lower")) {
    return "border-[#009B35]/30 bg-[#009B35]/10 text-[#007a29]";
  }
  if (value.includes("moderate")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (
    value.includes("sparse") ||
    value.includes("low ") ||
    value.includes("high ") ||
    value.includes("dry") ||
    value.includes("above baseline") ||
    value.includes("below baseline") ||
    value.includes("extremely") ||
    value.includes("severely") ||
    value.includes("very wet")
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
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

function NdviSeasonalBars({ points, isLoading }) {
  const validValues = points.map((point) => point.value).filter((value) => value !== null && value !== undefined);

  if (isLoading) {
    return <p className="text-xs text-slate-500">Loading seasonal NDVI comparison...</p>;
  }
  if (!validValues.length) {
    return <p className="text-xs text-slate-500">Seasonal NDVI comparison is not yet available.</p>;
  }

  const maxValue = Math.max(...validValues, 0.01);

  return (
    <div className="space-y-1.5" role="group" aria-label="Seasonal NDVI comparison">
      {points.map((point) => {
        const hasValue = point.value !== null && point.value !== undefined;
        const widthPct = hasValue ? Math.max(4, (point.value / maxValue) * 100) : 0;
        return (
          <div key={point.label} className="flex items-center gap-2">
            <span className="w-[70px] shrink-0 text-[11px] font-bold text-slate-500">{point.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#E6EAEC]" aria-hidden="true">
              <div className="h-full rounded-full bg-[#009B35]" style={{ width: `${widthPct}%` }} />
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-[11px] font-bold text-slate-600">
              {hasValue ? point.value.toFixed(3) : "N/A"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PriorityLgaTable({ rows, limit, totalCount, onToggleLimit }) {
  return (
    <PublicCard className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">Priority LGAs by overall climate risk score</caption>
          <thead>
            <tr className="border-b border-[#D8DDE2] bg-[#F7F9FA] text-left text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              <th scope="col" className="px-4 py-3">Rank</th>
              <th scope="col" className="px-4 py-3">LGA</th>
              <th scope="col" className="px-4 py-3">Risk score</th>
              <th scope="col" className="px-4 py-3">Risk level</th>
              <th scope="col" className="px-4 py-3">Main concern</th>
              <th scope="col" className="px-4 py-3">Vulnerability</th>
              <th scope="col" className="px-4 py-3">Adaptive capacity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E6EAEC]">
            {rows.map((profile, index) => {
              const concern = getMainConcern(profile);
              const riskScore = formatMetric(profile.overall_risk_score, 1);
              const vulnerabilityScore = formatMetric(profile.vulnerability_score, 1);
              const adaptiveCapacityScore = formatMetric(profile.adaptive_capacity_score, 1);
              return (
                <tr key={profile.id ?? profile.lga ?? profile.lga_name}>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-500">{index + 1}</td>
                  <th scope="row" className="px-4 py-3 text-left font-black">
                    <a
                      href={buildAtlasHref(concern.atlasKey, { lgaName: profile.lga_name })}
                      aria-label={`Inspect ${profile.lga_name} in Climate Change Intelligence System`}
                      className="text-[#030454] underline-offset-4 transition-colors duration-200 hover:text-[#009B35] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30"
                    >
                      {profile.lga_name}
                    </a>
                  </th>
                  <td className="px-4 py-3 font-mono text-sm font-bold text-slate-700">{riskScore || "Not yet available"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${getRiskLevelTone(profile.risk_level)}`}>
                      {profile.risk_level_display || "Unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full border border-[#D8DDE2] bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {concern.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">
                    {vulnerabilityScore ? `${vulnerabilityScore} / 100` : "Not yet available"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">
                    {adaptiveCapacityScore ? `${adaptiveCapacityScore} / 100` : "Not yet available"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalCount > 5 && (
        <div className="border-t border-[#D8DDE2] bg-[#F7F9FA] px-4 py-3 text-right">
          <button
            type="button"
            onClick={onToggleLimit}
            className="text-xs font-black uppercase tracking-[0.1em] text-[#030454] transition hover:text-[#009B35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30"
          >
            {limit === "all" ? "Show top five" : `View all ${totalCount} LGAs`}
          </button>
        </div>
      )}
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
    available: "Open in Climate Change Intelligence System",
    partial: "Open in Climate Change Intelligence System",
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
                    {canOpenAtlas ? "Open in Climate Change Intelligence System" : actionLabelByStatus[layer.status] || "View source layer"}
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

function AdditionalIndicatorRow({ name, value, period, limitation, href, actionLabel = "Open in Climate Change Intelligence System" }) {
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

function KeyFindingsSection({ findings }) {
  return (
    <PublicSection className="bg-white py-10 lg:py-11" innerClassName="max-w-7xl">
      <PublicSectionHeading
        title="Key Findings"
      />
      <ul className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {findings.map((finding, index) => (
          <li key={index} className="border-l-4 border-[#009B35] pl-4">
            <p className="text-sm font-bold leading-6 text-[#030454]">{finding}</p>
          </li>
        ))}
      </ul>
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
        {displayed.map((signal) => (
          <PublicCard key={signal.admin_code || signal.admin_name} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black text-[#030454]">{signal.admin_name}</p>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] ${SIGNAL_VISUAL[signal.signal_level].badgeClass}`}>
                {signal.signal_label}
              </span>
            </div>
            <p className="mt-2 text-xs font-bold text-slate-700">
              {signal.dominant_concern || "Environmental stress evidence"}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              {signal.risk_level ? `${signal.risk_level_display} existing climate risk` : "Risk profile not yet available"}
            </p>
            {signal.exposure_evidence.length > 0 && (
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                {signal.exposure_evidence.map((item) => `${item.label}: ${Number(item.value).toLocaleString()}`).join(" · ")}
              </p>
            )}
            <a
              href={buildAtlasHref(DOMINANT_CONCERN_ATLAS_KEY[signal.dominant_concern] || "drought_index", { lgaName: signal.admin_name })}
              aria-label={`Inspect ${signal.admin_name} in Climate Change Intelligence System`}
              className="mt-3 inline-block text-xs font-black text-[#009B35] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30"
            >
              Inspect
            </a>
          </PublicCard>
        ))}
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

function KadunaCompactVisual() {
  return (
    <div className="flex h-full min-h-[110px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 p-3">
      <svg viewBox="0 0 48 48" role="img" aria-label="Kaduna State outline" className="h-9 w-9" fill="none">
        <path
          d="M24 4 L40 14 L36 34 L12 34 L8 14 Z"
          stroke="#F3F74B"
          strokeWidth="2.5"
          strokeLinejoin="round"
          fill="#009B35"
          fillOpacity="0.25"
        />
      </svg>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">Kaduna State &middot; 23 LGAs</p>
    </div>
  );
}

function ExploreClimateDataSection() {
  return (
    <PublicSection
      className="bg-[#030454] py-6 lg:py-7"
      innerClassName="grid gap-6 max-w-7xl lg:grid-cols-[minmax(0,1fr)_200px] lg:items-center"
    >
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#F3F74B]">Spatial exploration</p>
        <h2 className="mt-2 font-['Playfair_Display'] text-2xl font-bold leading-tight text-white sm:text-3xl">
          Explore Climate Data
        </h2>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-white/75">
          Explore rainfall, vegetation, drought, temperature and land cover across Kaduna State's 23 LGAs.
        </p>
        <div className="mt-4">
          <PublicPrimaryButton
            onClick={() => {
              window.location.href = "/public/climate-atlas";
            }}
            showArrow
            className="px-5 py-2.5 text-xs"
          >
            Explore in Climate Change Intelligence System
          </PublicPrimaryButton>
        </div>
      </div>
      <KadunaCompactVisual />
    </PublicSection>
  );
}

function IndicatorSummaryCard({
  title,
  value,
  unit,
  period,
  status,
  source,
  children,
}) {
  return (
    <PublicCard className="flex flex-col p-4">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-sm font-black text-[#030454]">{title}</h3>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${getConditionTone(status)}`}>
            {status}
          </span>
        </div>
        <p className="mt-2 font-mono text-3xl font-black text-[#009B35]">
          {value || "Not yet available"}{value && unit ? <span className="ml-2 text-sm font-bold text-slate-500">{unit}</span> : null}
        </p>
        {children}
      </div>
      <div className="mt-3 border-t border-[#E6EAEC] pt-3">
        <p className="text-[11px] leading-4 text-slate-500">
          {period}
          {source && <span className="text-slate-400"> &middot; {source}</span>}
        </p>
      </div>
    </PublicCard>
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

function ClimateRiskExecutiveHero({ riskProfile }) {
  return (
    <PublicSection
      className="border-b border-[#D8DDE2] bg-white py-10 lg:py-11"
      innerClassName="grid gap-8 lg:grid-cols-[minmax(0,0.98fr)_minmax(360px,0.82fr)] lg:items-center"
    >
      <div className="flex flex-col justify-center py-2">
        <h1 className="max-w-3xl text-balance font-['Playfair_Display'] text-4xl font-black leading-tight text-[#030454] sm:text-5xl lg:text-6xl">
          Climate risks require timely, targeted action
        </h1>
        <p className="mt-5 max-w-2xl text-pretty text-base leading-8 text-slate-600 sm:text-lg">
          Explore Kaduna State's latest climate conditions, priority LGAs and key
          environmental indicators. Use the Climate Change Intelligence System for detailed maps and
          spatial analysis.
        </p>
        <div className="mt-6">
          <PublicPrimaryButton
            onClick={() => {
              window.location.href = "/public/climate-atlas";
            }}
            showArrow
            className="px-5 py-3 text-xs"
          >
            Climate Change Intelligence System
          </PublicPrimaryButton>
        </div>
        {riskProfile.updatedAt && (
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            Updated: {riskProfile.updatedAt}
          </p>
        )}
      </div>

      <div className="relative min-h-[280px] w-full overflow-hidden rounded-xl bg-[#030454] shadow-sm sm:min-h-[320px] lg:min-h-[360px]">
        <img
          src={climateRiskDryland}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(rgba(0,20,20,0.18), rgba(0,40,20,0.30))",
          }}
        />
        <div className="absolute inset-x-5 bottom-5 rounded-lg border border-white/18 bg-[#10351f]/88 p-5 text-white shadow-lg md:inset-x-auto md:bottom-auto md:right-8 md:top-1/2 md:w-[320px] md:-translate-y-1/2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#F3F74B]">
            Current Risk Level
          </p>
          <p className="mt-3 text-4xl font-black leading-none">{riskProfile.level}</p>

          <div className="mt-5 space-y-3 border-t border-white/10 pt-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/70">Assessment year</span>
              <strong className="text-white">{riskProfile.assessmentPeriod}</strong>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/70">High-risk LGAs</span>
              <strong className="text-white">{riskProfile.highRiskLgaCount}</strong>
            </div>
          </div>
        </div>
      </div>
    </PublicSection>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PublicClimateRiskPage() {
  const [annualData, setAnnualData] = useState(null);
  const [wetData, setWetData] = useState(null);
  const [dryData, setDryData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [publicLayerCatalog, setPublicLayerCatalog] = useState(null);
  const [publicRiskData, setPublicRiskData] = useState(null);

  const [rainAnnualData, setRainAnnualData] = useState(null);
  const [rainWetData, setRainWetData] = useState(null);
  const [rainDryData, setRainDryData] = useState(null);
  const [rainfallAnomalyData, setRainfallAnomalyData] = useState(null);
  const [spiData, setSpiData] = useState(null);
  const [lstData, setLstData] = useState(null);
  const [climateIntelligenceData, setClimateIntelligenceData] = useState(null);
  const [floodOccurrenceData, setFloodOccurrenceData] = useState(null);
  const [elevationData, setElevationData] = useState(null);
  const [lulcData, setLulcData] = useState(null);
  const [lgaLimit, setLgaLimit] = useState("5");
  const [selectedIndicatorLgaCode, setSelectedIndicatorLgaCode] = useState("");

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setApiError("");

      const [
        annualResult, wetResult, dryResult,
        rainAnnualResult, rainWetResult, rainDryResult, layerCatalogResult,
        publicRiskResult, rainfallAnomalyResult, spiResult, lstResult,
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
        getRemoteSensingLgaStats({ layer: "lst", year: 2025, season: "annual", admin_level: "lga" }),
        getClimateIntelligence({ year: 2025, season: "annual", admin_level: "lga" }),
        getPublicHistoricalSurfaceWater(),
        getPublicElevationSummary(),
        getRemoteSensingLulcPreview({ year: 2025, window: "late_wet_season", admin_level: "lga" }),
      ]);

      if (
        annualResult.status === "rejected" &&
        wetResult.status === "rejected" &&
        dryResult.status === "rejected"
      ) {
        setApiError("Could not load vegetation data. Please try again later.");
      }

      setAnnualData(annualResult.status === "fulfilled" ? annualResult.value : null);
      setWetData(wetResult.status === "fulfilled" ? wetResult.value : null);
      setDryData(dryResult.status === "fulfilled" ? dryResult.value : null);

      setRainAnnualData(rainAnnualResult.status === "fulfilled" ? rainAnnualResult.value : null);
      setRainWetData(rainWetResult.status === "fulfilled" ? rainWetResult.value : null);
      setRainDryData(rainDryResult.status === "fulfilled" ? rainDryResult.value : null);
      setRainfallAnomalyData(rainfallAnomalyResult.status === "fulfilled" ? rainfallAnomalyResult.value : null);
      setSpiData(spiResult.status === "fulfilled" ? spiResult.value : null);
      setLstData(lstResult.status === "fulfilled" ? lstResult.value : null);
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
  const selectedWetNdvi = useMemo(
    () => ndviForScope(wetData, selectedIndicatorLgaCode),
    [wetData, selectedIndicatorLgaCode],
  );
  const selectedDryNdvi = useMemo(
    () => ndviForScope(dryData, selectedIndicatorLgaCode),
    [dryData, selectedIndicatorLgaCode],
  );
  const selectedRainfall = useMemo(
    () => metricForScope(rainAnnualData, selectedIndicatorLgaCode),
    [rainAnnualData, selectedIndicatorLgaCode],
  );
  const selectedRainfallAnomaly = useMemo(
    () => metricForScope(rainfallAnomalyData, selectedIndicatorLgaCode),
    [rainfallAnomalyData, selectedIndicatorLgaCode],
  );
  const selectedSpi = useMemo(
    () => metricForScope(spiData, selectedIndicatorLgaCode),
    [spiData, selectedIndicatorLgaCode],
  );
  const selectedLst = useMemo(
    () => metricForScope(lstData, selectedIndicatorLgaCode),
    [lstData, selectedIndicatorLgaCode],
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
  const selectedRainfallSource = useMemo(
    () => sourceForScope(rainAnnualData, selectedIndicatorLgaCode),
    [rainAnnualData, selectedIndicatorLgaCode],
  );
  const selectedSpiSource = useMemo(
    () => sourceForScope(spiData, selectedIndicatorLgaCode),
    [spiData, selectedIndicatorLgaCode],
  );
  const selectedLstSource = useMemo(
    () => sourceForScope(lstData, selectedIndicatorLgaCode),
    [lstData, selectedIndicatorLgaCode],
  );
  const meanNdvi = useMemo(() => formatNdvi(selectedAnnualNdvi), [selectedAnnualNdvi]);
  const ndviSeasonPoints = useMemo(() => [
    { label: "Annual", value: selectedAnnualNdvi },
    { label: "Wet season", value: selectedWetNdvi },
    { label: "Dry season", value: selectedDryNdvi },
  ], [selectedAnnualNdvi, selectedWetNdvi, selectedDryNdvi]);
  const wetDryDifference = useMemo(() => {
    if (selectedWetNdvi === null || selectedWetNdvi === undefined) return null;
    if (selectedDryNdvi === null || selectedDryNdvi === undefined) return null;
    return selectedWetNdvi - selectedDryNdvi;
  }, [selectedWetNdvi, selectedDryNdvi]);
  const indicatorScopeLabel = selectedIndicatorLga
    ? selectedIndicatorLga.admin_name
    : "Kaduna State mean";
  const selectedLgaProfileHref = selectedIndicatorLga
    ? buildAtlasHref("ndvi", {
        adminCode: selectedIndicatorLga.admin_code,
        lgaName: selectedIndicatorLga.admin_name,
        season: "annual",
      })
    : "";

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
  const priorityLgaRows = useMemo(
    () =>
      [...publicRiskProfiles]
        .filter((profile) => Number.isFinite(Number(profile.overall_risk_score)))
        .sort((a, b) => Number(b.overall_risk_score) - Number(a.overall_risk_score)),
    [publicRiskProfiles],
  );
  const displayedPriorityRows = useMemo(
    () => (lgaLimit === "all" ? priorityLgaRows : priorityLgaRows.slice(0, 5)),
    [priorityLgaRows, lgaLimit],
  );
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
  const lstStatus = selectedClimateIntelligence?.indicators?.lst?.condition || classifyLst(selectedLst);
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
      actionLabel: "Open in Climate Change Intelligence System",
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
      actionLabel: "Open in Climate Change Intelligence System",
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
      actionLabel: "Open in Climate Change Intelligence System",
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
      actionLabel: elevationCount ? "Open in Climate Change Intelligence System" : "View release requirement",
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
  const keyFindings = useMemo(() => {
    const vegetationCopy = {
      "Healthy vegetation": "Vegetation conditions are generally healthy across Kaduna State.",
      "Moderate vegetation": "Vegetation conditions are moderate across Kaduna State.",
      "Sparse vegetation": "Vegetation conditions are below normal in parts of Kaduna State.",
      "Low vegetation": "Vegetation conditions are low in parts of Kaduna State.",
    };
    const temperatureCopy = {
      "High surface temperature": "Surface temperatures require continued monitoring.",
      "Moderate surface temperature": "Surface temperatures are within a moderate range.",
      "Lower surface temperature": "Surface temperatures remain in a lower range.",
    };

    return [
      hasPublicRiskCounts
        ? `${highRiskLgaCount} LGA${highRiskLgaCount === 1 ? "" : "s"} ${highRiskLgaCount === 1 ? "is" : "are"} currently classified as High or Very High Risk.`
        : "LGA risk classifications for the current period are not yet published.",
      vegetationCopy[vegetationStatus] || "Vegetation data for the current period is not yet available.",
      spiStatus !== "Not yet available"
        ? `Rainfall conditions are ${spiStatus.toLowerCase()}.`
        : "Rainfall and drought conditions for the current period are not yet available.",
      temperatureCopy[lstStatus] || "Surface temperature data for the current period is not yet available.",
    ];
  }, [hasPublicRiskCounts, highRiskLgaCount, vegetationStatus, spiStatus, lstStatus]);

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
  const aboutDataItems = useMemo(() => [
    {
      title: "Data sources",
      body: <div className="space-y-3"><p>Vegetation / NDVI uses Landsat Collection 2 Level 2 and Sentinel-2 Surface Reflectance Harmonized through Google Earth Engine.</p><p>Daytime LST uses MODIS Terra MOD11A1 v061. Rainfall, rainfall anomaly, and SPI use CHIRPS v2.0 daily rainfall totals where those layers are available in the public catalog.</p></div>,
    },
    {
      title: "Processing methodology",
      body: <div className="space-y-3"><p>NDVI values on this briefing page are derived from 2025 Sentinel-2 composites and summarized to LGA-level records for annual, wet-season, and dry-season windows.</p><p>The full Climate Change Intelligence System archive keeps Landsat NDVI and Sentinel-2 NDVI scientifically distinct; they are not presented as one calibrated series.</p><p>Rainfall anomaly is database-derived from CHIRPS rainfall totals as percentage departure from the 1991-2020 LGA baseline. SPI uses fixed-window precipitation-only gamma fits for Annual, Wet Season, and Dry Season windows.</p></div>,
    },
    { title: "Coverage", body: <p>Kaduna coverage is summarized at LGA level. The current public vegetation briefing reports annual, wet-season, and dry-season records where LGA data is available.</p> },
    { title: "Temporal frequency", body: <p>The current briefing view uses 2025 composites and the live public catalog state. Historical coverage noted in the catalog includes Sentinel-2 2018-2025, Landsat 1985-2017, MODIS LST 2001-2025, and CHIRPS-derived rainfall products where available.</p> },
    { title: "Spatial resolution", body: <p>Sentinel-2 NDVI is shown with the existing 60 m processing scale noted by the page. MODIS daytime LST is documented as a 1 km layer. LGA summaries aggregate raster products to administrative units.</p> },
    {
      title: "Known limitations",
      body: <div className="space-y-3"><p>LST is land surface temperature and is not equivalent to air temperature. SPI is a precipitation-only meteorological drought or wetness indicator and is not an agricultural or hydrological drought indicator.</p><p>Rainfall anomaly is not a drought index and should be interpreted alongside seasonal rainfall totals. Satellite rainfall totals are estimates, and local gauge validation is planned.</p></div>,
    },
    { title: "Interpretation guidance", body: <p>NDVI indicates vegetation condition and should be interpreted with season, rainfall, rainfall anomaly, SPI, and LST caveats before technical decisions. This public page is a briefing layer, not a replacement for technical GIS analysis.</p> },
    { title: "Administrative exposure estimates", body: <div className="space-y-3"><p>Estimated People in High-Risk LGAs is an administrative-area estimate based on WorldPop gridded population inside LGAs currently classified High or Very High. It is not a hazard-footprint exposure estimate.</p><p>The estimate assumes the selected gridded population layer and KCCC LGA boundaries are suitable for public planning context. It should be interpreted as a screening indicator, not a household count.</p></div> },
    { title: "Mapped building footprint assumptions", body: <div className="space-y-3"><p>Mapped Buildings in High-Risk LGAs uses Google Open Buildings footprints filtered by the published confidence threshold. Building footprint area is the summed mapped polygon area, not floor area, occupancy, replacement value, or service criticality.</p><p>Open Buildings identifies structures but does not classify facility function. Hospitals, schools, water, power, and emergency assets require a classified infrastructure inventory.</p></div> },
    { title: "Flood footprint exposure", body: <div className="space-y-3"><p>Flood Exposure uses the existing JRC Global Surface Water occurrence layer as a historical surface-water footprint and intersects it with WorldPop gridded population. Open Buildings structure and area aggregates are shown only after a cached building-footprint run completes successfully.</p><p>This differs from administrative exposure because it uses an actual mapped raster footprint instead of counting every person or structure within an LGA boundary.</p></div> },
    { title: "Exposure limitations", body: <div className="space-y-3"><p>Administrative indicators summarize people and mapped structures within administratively high-risk LGAs. They do not mean every person or structure is directly exposed to a specific flood, heat, drought, vegetation-stress, or forest-loss footprint.</p><p>Flood Exposure is a historical surface-water occurrence screen, not a real-time alert, flood forecast, or formal flood hazard designation. True spatial exposure estimates require dedicated hazard raster masks and asset-overlay analysis.</p></div> },
    { title: "Difference between Climate Intelligence and the Climate Change Intelligence System", body: <p>Climate Intelligence gives a concise public briefing with executive charts and dataset readiness. The Climate Change Intelligence System is the deeper interactive GIS experience for maps, year and season filtering, LGA drill-down, and basemap controls.</p> },
  ], []);

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <PublicPortalHeader activePage="climate-intelligence" compact showHero={false} showActions={false} />
      <ClimateRiskExecutiveHero riskProfile={riskProfile} />
      <PublicErrorBanner message={apiError} maxWidthClassName="max-w-7xl" />
      <KeyFindingsSection findings={keyFindings} />

      <PublicSection className="bg-[#F7F9FA] py-10 lg:py-11" innerClassName="max-w-7xl">
        <PublicSectionHeading title="Climate Indicators" description="Current condition indicators are summarised here; the Climate Change Intelligence System handles maps, seasons, periods and LGA spatial exploration." />
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-[#D8DDE2] bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between">
          <label className="block md:min-w-[280px]">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              View by LGA
            </span>
            <select
              value={selectedIndicatorLgaCode}
              onChange={(event) => setSelectedIndicatorLgaCode(event.target.value)}
              className="h-9 w-full rounded-md border border-[#D8DDE2] bg-white px-3 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/15"
            >
              <option value="">Kaduna State mean</option>
              {lgaOptions.map((lga) => (
                <option key={lga.admin_code} value={lga.admin_code}>
                  {lga.admin_name}
                </option>
              ))}
            </select>
          </label>
          <div className="text-xs leading-5 text-slate-500 md:text-right">
            <p>
              {lgaOptions.length
                ? `${lgaOptions.length} assessed LGAs available`
                : "LGA list loading"}
            </p>
            {selectedIndicatorLga && (
              <a
                href={selectedLgaProfileHref}
                className="font-black text-[#009B35] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35]/30"
              >
                Inspect this LGA in Climate Change Intelligence System
              </a>
            )}
          </div>
        </div>
        <div className="mt-5 grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <IndicatorSummaryCard
            title="NDVI / Vegetation Health"
            value={meanNdvi}
            unit="NDVI"
            period={`${indicatorScopeLabel} - 2025 annual`}
            status={vegetationStatus}
            source={sourceForScope(annualData, selectedIndicatorLgaCode)?.data_source}
          >
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                Seasonal NDVI comparison
              </p>
              <NdviSeasonalBars points={ndviSeasonPoints} isLoading={isLoading} />
              {wetDryDifference !== null && (
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Wet minus dry: {formatSignedMetric(wetDryDifference, 3) || "Not yet available"}
                </p>
              )}
            </div>
          </IndicatorSummaryCard>
          <IndicatorSummaryCard
            title="Rainfall Total"
            value={formatMetric(selectedRainfall, 1)}
            unit="mm"
            period={`${indicatorScopeLabel} - 2025 annual`}
            status={selectedRainfall !== null ? "Annual rainfall total" : "Not yet available"}
            source={selectedRainfallSource?.data_source || "CHIRPS v2.0 Daily"}
          >
            <p className="mt-3 text-[11px] leading-4 text-slate-500">
              Accumulated annual rainfall for the selected geography.
            </p>
          </IndicatorSummaryCard>
          <IndicatorSummaryCard
            title="SPI Drought"
            value={formatMetric(selectedSpi, 2)}
            unit="SPI"
            period={`${indicatorScopeLabel} - 2025 annual`}
            status={spiStatus}
            source={selectedSpiSource?.data_source || "CHIRPS v2.0 Daily rainfall"}
          >
            <p className="mt-3 text-[11px] leading-4 text-slate-500">
              SPI indicates meteorological wetness or dryness based on rainfall.
            </p>
          </IndicatorSummaryCard>
          <IndicatorSummaryCard
            title="Land Surface Temperature"
            value={formatMetric(selectedLst, 1)}
            unit="deg C"
            period={`${indicatorScopeLabel} - 2025 annual daytime`}
            status={lstStatus}
            source={selectedLstSource?.data_source || "MODIS Terra MOD11A1"}
          >
            <p className="mt-3 text-[11px] leading-4 text-slate-500">
              Daytime land-surface temperature, not air temperature.
            </p>
          </IndicatorSummaryCard>
        </div>

        <div className="mt-6 flex justify-center">
          <PublicSecondaryButton
            as="a"
            href="/public/climate-atlas"
            showArrow
            aria-label="Explore these indicators in the Climate Change Intelligence System"
            className="text-xs"
          >
            Explore These Indicators On The Map
          </PublicSecondaryButton>
        </div>
      </PublicSection>

      <PublicSection className="bg-white py-10 lg:py-11" innerClassName="max-w-7xl">
        <PublicSectionHeading
          title="Priority LGAs"
          description="The LGAs with the highest overall climate risk score in the latest validated assessment. Vulnerability reflects how susceptible people and systems in the LGA are to climate impacts; adaptive capacity reflects the LGA's existing ability to prepare for, respond to and recover from them — both are scored separately from hazard and exposure so they remain distinguishable rather than collapsed into the single overall score."
        />
        <div className="mt-5">
          <HowToReadScoresCard />
        </div>
        <div className="mt-7">
          {priorityLgaRows.length ? (
            <PriorityLgaTable
              rows={displayedPriorityRows}
              limit={lgaLimit}
              totalCount={priorityLgaRows.length}
              onToggleLimit={() => setLgaLimit(lgaLimit === "all" ? "5" : "all")}
            />
          ) : (
            <PublicEmptyState
              title="Priority LGA data is not yet available"
              message="Validated LGA risk profiles have not been published for the current period."
            />
          )}
        </div>
      </PublicSection>

      <AreasRequiringAttentionSection signals={rankedClimateActionSignals} />

      <ExploreClimateDataSection />

      <div id="processing-requirements">
        <PublicFaqAccordion
          title="Supporting Information"
          items={[
            {
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
              title: `${availableClimateLayerCount} of ${climateLayerCards.length} briefing datasets available`,
              body: <DataLayerAvailabilityTable layers={climateLayerCards} selectedLga={selectedIndicatorLga} />,
            },
            {
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
          className="bg-white px-4 py-10 sm:px-8 lg:px-10"
          containerClassName="mx-auto max-w-7xl"
        />
      </div>

      <div id="about-data">
        <PublicFaqAccordion title="About the Data" items={aboutDataItems} className="bg-[#F7F9FA] px-4 py-10 sm:px-8 lg:px-10" containerClassName="mx-auto max-w-7xl" />
      </div>

      <PublicSection className="bg-[#F7F9FA]" innerClassName="max-w-7xl">
        <PublicDisclaimerNote className="mt-0" toneClassName="bg-amber-50"><p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-amber-700">Climate risk profile records</p>The platform also holds climate risk profile records for Kaduna LGAs. These are composite assessment records built from multi-indicator scoring. They are <strong>not derived from real-time satellite measurements</strong> and have not been validated against remote-sensing data. The Climate Change Intelligence System is the correct tool for satellite-based exploration.</PublicDisclaimerNote>
      </PublicSection>

      <PublicPortalFooter />
    </main>
  );
}
