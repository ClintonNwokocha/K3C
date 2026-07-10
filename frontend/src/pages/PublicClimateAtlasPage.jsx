import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Expand,
  Grid3x3,
  Layers,
  Link2,
  LocateFixed,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  Plus,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  GeoJSON,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  getClimateIntelligence,
  getClimateIntelligenceProfile,
  getElevationPreview,
  getElevationTileUrl,
  getElevationTileUrlPublic,
  getFloodOccurrencePreview,
  getPublicElevationSummary,
  getPublicHistoricalSurfaceWater,
  sampleElevationPoint,
  sampleElevationPointPublic,
  getGeeStatus,
  getPublicClimateRiskProfiles,
  getRemoteSensingDashboardKpis,
  getRemoteSensingLayers,
  getRemoteSensingLgaStats,
  getRemoteSensingLulcPreview,
  getRemoteSensingLulcTileUrl,
} from "../services/api";
import {
  ANNUAL_LULC_INTERNAL_CONFIG,
  CLIMATE_ATLAS_LAYER_ORDER,
  ELEVATION_INTERNAL_CONFIG,
  FLOOD_OCCURRENCE_INTERNAL_CONFIG,
  getAtlasAvailableLayerConfigs,
  getAtlasLayerConfig,
  getAtlasLegendState,
  getAtlasNoDataMessage,
  getAtlasRuntimeCopy,
  getAtlasStatusBarNoDataMessage,
  getAtlasVariableStatistic,
} from "../config/climateAtlasLayers";
import LgaClimateBrief from "../components/LgaClimateBrief";

const KADUNA_CENTER = [10.45, 7.75];
const KADUNA_ZOOM = 7;
const WARD_VISIBLE_ZOOM = 10;
const LGA_LABEL_ZOOM = 8;
const WARD_LABEL_ZOOM = 13;

const SEASONS = ["Full Year", "Dry Season", "Wet Season"];

const ATLAS_VARIABLES = CLIMATE_ATLAS_LAYER_ORDER.map((key) => {
  const config = getAtlasLayerConfig(key);
  return {
    key: config.key,
    label: config.selectorLabel,
    source: "remote_sensing",
    sourceLayers: config.backendLayerKeys,
    unit: config.unit,
    dataSource: config.dataSource,
    coverageNote: config.coverageNote,
  };
});

const SEASON_PARAM = {
  "Full Year": "annual",
  "Wet Season": "wet_season",
  "Dry Season": "dry_season",
};
const ATLAS_PERIODS = [
  { id: "latest",    label: "Latest",    startYear: null, endYear: null, ticks: [] },
  { id: "2021-2025", label: "2021–2025", startYear: 2021, endYear: 2025, ticks: [2021, 2022, 2023, 2024, 2025] },
  { id: "2011-2020", label: "2011–2020", startYear: 2011, endYear: 2020, ticks: [2011, 2015, 2020] },
  { id: "2001-2010", label: "2001–2010", startYear: 2001, endYear: 2010, ticks: [2001, 2005, 2010] },
  { id: "1991-2000", label: "1991–2000", startYear: 1991, endYear: 2000, ticks: [1991, 1995, 2000] },
  { id: "1981-1990", label: "1981–1990", startYear: 1981, endYear: 1990, ticks: [1981, 1985, 1990] },
];

// Per-variable period overrides. Variables not listed here use ATLAS_PERIODS (full historical set).
// NDVI uses a unified list spanning both Landsat (1985–2017) and Sentinel-2 (2018–2025) eras.
// No period spans the 2017–2018 sensor transition – the year-to-layer resolution handles routing.
const VARIABLE_PERIOD_CONFIGS = {
  // flood_occurrence: JRC GSW v1.4 is a static period-of-record product.
  // year=2021 is the label; the archive spans 1984-2021.
  flood_occurrence: [
    { id: "flood-archive", label: "1984–2021 archive", startYear: 2021, endYear: 2021, ticks: [2021] },
  ],
  // elevation: SRTM static DEM — single acquisition (~2000). Not seasonal.
  elevation: [
    { id: "srtm-2000", label: "SRTM static DEM", startYear: 2000, endYear: 2000, ticks: [2000] },
  ],
  // LULC: only years with stored data. "latest" id triggers backend-resolved year (omits year param).
  // 2018 pilot has only 5 LGAs; 2024 is the validated 23-LGA dataset.
  annual_lulc: [
    { id: "latest",    label: "Latest",           startYear: null, endYear: null, ticks: [] },
    { id: "lulc-2024", label: "2024",             startYear: 2024, endYear: 2024, ticks: [2024] },
    { id: "lulc-2018", label: "2018 (5-LGA pilot)", startYear: 2018, endYear: 2018, ticks: [2018] },
  ],
  ndvi: [
    { id: "latest",    label: "Latest",    startYear: null, endYear: null, ticks: [] },
    { id: "2021-2025", label: "2021–2025", startYear: 2021, endYear: 2025, ticks: [2021, 2022, 2023, 2024, 2025] },
    { id: "2018-2020", label: "2018–2020", startYear: 2018, endYear: 2020, ticks: [2018, 2019, 2020] },
    { id: "2011-2017", label: "2011–2017", startYear: 2011, endYear: 2017, ticks: [2011, 2014, 2017] },
    { id: "2001-2010", label: "2001–2010", startYear: 2001, endYear: 2010, ticks: [2001, 2005, 2010] },
    { id: "1991-2000", label: "1991–2000", startYear: 1991, endYear: 2000, ticks: [1991, 1995, 2000] },
    { id: "1985-1990", label: "1985–1990", startYear: 1985, endYear: 1990, ticks: [1985, 1987, 1990] },
  ],
  lst: [
    { id: "latest",    label: "Latest",    startYear: null, endYear: null, ticks: [] },
    { id: "2021-2025", label: "2021–2025", startYear: 2021, endYear: 2025, ticks: [2021, 2022, 2023, 2024, 2025] },
    { id: "2011-2020", label: "2011–2020", startYear: 2011, endYear: 2020, ticks: [2011, 2015, 2020] },
    { id: "2001-2010", label: "2001–2010", startYear: 2001, endYear: 2010, ticks: [2001, 2005, 2010] },
  ],
};

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function formatNumber(value) {
  if (!hasValue(value)) return "No data";
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getFeatureName(feature) {
  const p = feature?.properties || {};
  return p.lganame || p.LGANAME || p.lga_name || p.LGA_NAME || p.NAME || p.name || "Unnamed LGA";
}

function getWardName(feature) {
  const p = feature?.properties || {};
  return p.wardname || p.WARDNAME || p.ward_name || p.WARD_NAME || "Unnamed Ward";
}

function getWardLgaName(feature) {
  const p = feature?.properties || {};
  return p.lganame || p.LGANAME || p.lga_name || p.LGA_NAME || "Unknown LGA";
}

function buildLookup(items) {
  return items.reduce((acc, item) => {
    acc[normalizeName(item.lga_name)] = item;
    return acc;
  }, {});
}

function getColor(value) {
  if (!hasValue(value)) return "#d9dee3";
  const n = Number(value);
  if (n >= 75) return "#b91c1c";
  if (n >= 60) return "#ea580c";
  if (n >= 40) return "#f59e0b";
  return "#1d9e75";
}

// NDVI-specific palette. Negative values are valid (water/rock) and rendered in blue.
// Scale: < 0 â†’ blue, 0â€"0.1 â†’ tan, 0.1â€"0.2 â†’ yellow-green, 0.2â€"0.35 â†’ light green,
//        0.35â€"0.5 â†’ medium green, 0.5â€"0.65 â†’ dark green, 0.65+ â†’ very dark green.
function getNdviColor(value) {
  if (value === null || value === undefined || value === "") return "#d9dee3";
  const n = Number(value);
  if (!Number.isFinite(n)) return "#d9dee3";
  if (n < 0)    return "#b2d8e8";
  if (n < 0.1)  return "#e8d5a3";
  if (n < 0.2)  return "#c8e07a";
  if (n < 0.35) return "#8ec541";
  if (n < 0.5)  return "#4aad52";
  if (n < 0.65) return "#2d7d32";
  return "#1a5e20";
}

// Rainfall Total sequential blue palette. Breaks are data-driven (P20/P40/P60/P80).
// Static fallback [700, 1000, 1300, 1600] covers Kaduna annual range (665â€"1884 mm).
function getRainfallColor(value, breaks) {
  if (value === null || value === undefined || value === "") return "#d9dee3";
  const mm = Number(value);
  if (!Number.isFinite(mm)) return "#d9dee3";
  const [b0, b1, b2, b3] = breaks || [700, 1000, 1300, 1600];
  if (mm >= b3) return "#084594";
  if (mm >= b2) return "#2171b5";
  if (mm >= b1) return "#6baed6";
  if (mm >= b0) return "#bdd7e7";
  return "#eff3ff";
}

// Rainfall Anomaly diverging palette (BrBG-inspired): brown (dry) â†’ neutral (0%) â†’ blue-green (wet).
// Breaks are data-driven (P33/P75 of absolute values from loaded records).
// Static fallback: Â±20% inner, Â±60% outer.
function getAnomalyColor(value, breaks) {
  if (value === null || value === undefined || value === "") return "#d9dee3";
  const pct = Number(value);
  if (!Number.isFinite(pct)) return "#d9dee3";
  const [neg2, neg1, pos1, pos2] = breaks || [-60, -20, 20, 60];
  if (pct <= neg2) return "#8c510a";
  if (pct <= neg1) return "#dfc27d";
  if (pct < 0)     return "#f6e8c3";
  if (pct < pos1)  return "#c7eae5";
  if (pct < pos2)  return "#80cdc1";
  return "#01665e";
}

function getDroughtSpiCategory(value) {
  if (!hasValue(value)) return "No data";
  const spi = Number(value);
  if (spi <= -2.0) return "Extreme drought";
  if (spi <= -1.5) return "Severe drought";
  if (spi <= -1.0) return "Moderate drought";
  if (spi < 1.0) return "Near normal";
  if (spi < 1.5) return "Moderately wet";
  if (spi < 2.0) return "Very wet";
  return "Extremely wet";
}

function getDroughtSpiColor(value) {
  if (value === null || value === undefined || value === "") return "#d9dee3";
  const spi = Number(value);
  if (!Number.isFinite(spi)) return "#d9dee3";
  if (spi <= -2.0) return "#7f2704";
  if (spi <= -1.5) return "#d94801";
  if (spi <= -1.0) return "#fdae6b";
  if (spi < 1.0) return "#f7f7f7";
  if (spi < 1.5) return "#9ecae1";
  if (spi < 2.0) return "#3182bd";
  return "#08519c";
}

// LST sequential temperature palette. 20Â°C cool blue â†’ 45Â°C deep red (RdYlBu-derived).
function getLstColor(value) {
  if (value === null || value === undefined || value === "") return "#d9dee3";
  const t = Number(value);
  if (!Number.isFinite(t)) return "#d9dee3";
  if (t < 25) return "#4575b4";
  if (t < 30) return "#91bfdb";
  if (t < 35) return "#fee090";
  if (t < 40) return "#fc8d59";
  return "#d73027";
}

// SRTM terrain ramp calibrated to Kaduna's actual range (~500–950 m):
// <550 low plains | 550–650 lower plateau | 650–750 central plateau | 750–850 upland | ≥850 highland
function getElevationColor(value) {
  if (value === null || value === undefined || value === "") return "#d9dee3";
  const n = Number(value);
  if (!Number.isFinite(n)) return "#d9dee3";
  if (n < 550) return "#f7fcf5";
  if (n < 650) return "#c7e9c0";
  if (n < 750) return "#74c476";
  if (n < 850) return "#238b45";
  return "#00441b";
}

// JRC GSW occurrence palette (blue ramp): 0–5 near-white → ≥60 deep navy.
// Bins: 0–5 / 5–15 / 15–30 / 30–60 / ≥60.
function getFloodOccurrenceColor(value) {
  if (value === null || value === undefined || value === "") return "#d9dee3";
  const n = Number(value);
  if (!Number.isFinite(n)) return "#d9dee3";
  if (n < 5)  return "#f7fbff";
  if (n < 15) return "#c6dbef";
  if (n < 30) return "#6baed6";
  if (n < 60) return "#2171b5";
  return "#084594";
}

// Official Google Dynamic World v1 class colours — kept in sync with backend _DW_PREVIEW_COLORS.
const LULC_CLASS_COLORS = {
  water:              "#419BDF",
  trees:              "#397D49",
  grass:              "#88B053",
  flooded_vegetation: "#7A87C6",
  crops:              "#E49635",
  shrub_scrub:        "#DFC35A",
  built_area:         "#C4281B",
  bare_ground:        "#A59B8F",
  snow_ice:           "#B39FE1",
};

// Formats a rainfall value as whole mm (â‰¥100) or one-decimal mm (<100).
function formatRainfall(value) {
  if (!hasValue(value)) return "No data";
  const mm = Number(value);
  return mm >= 100
    ? `${Math.round(mm).toLocaleString()} mm`
    : `${mm.toFixed(1)} mm`;
}

function getFeatureCenter(feature) {
  try {
    return L.geoJSON(feature).getBounds().getCenter();
  } catch {
    return null;
  }
}

function ElevationMapClickHandler({ onPointClick }) {
  useMapEvents({
    click(e) {
      onPointClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FitBounds({ geoJson }) {
  const map = useMap();

  useEffect(() => {
    if (!geoJson) return;
    const timer = window.setTimeout(() => {
      map.invalidateSize();
      const bounds = L.geoJSON(geoJson).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 8 });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [geoJson, map]);

  return null;
}

function ZoomWatcher({ onZoomChange }) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
}

function LabelMarker({ position, text, type }) {
  if (!position) return null;

  const className =
    type === "state"
      ? "kccc-label-state"
      : type === "ward"
        ? "kccc-label-ward"
        : "kccc-label-lga";

  return (
    <Marker
      position={position}
      interactive={false}
      icon={L.divIcon({
        className,
        html: `<span>${text}</span>`,
      })}
    />
  );
}

function BoundaryLabels({ stateGeoJson, lgaGeoJson, wardGeoJson, zoom, showWards }) {
  const stateCenter = useMemo(() => {
    if (!stateGeoJson) return null;
    return getFeatureCenter(stateGeoJson.features?.[0] || stateGeoJson);
  }, [stateGeoJson]);

  const lgaLabels = useMemo(() => {
    if (!lgaGeoJson?.features) return [];
    return lgaGeoJson.features.map((feature) => ({
      name: getFeatureName(feature),
      center: getFeatureCenter(feature),
    }));
  }, [lgaGeoJson]);

  const wardLabels = useMemo(() => {
    if (!wardGeoJson?.features) return [];
    return wardGeoJson.features.map((feature) => ({
      name: getWardName(feature),
      center: getFeatureCenter(feature),
    }));
  }, [wardGeoJson]);

  return (
    <>
      {zoom >= LGA_LABEL_ZOOM &&
        lgaLabels.map((item) => (
          <LabelMarker key={`lga-label-${item.name}`} position={item.center} text={item.name} type="lga" />
        ))}

      {showWards &&
        zoom >= WARD_LABEL_ZOOM &&
        wardLabels.map((item, index) => (
          <LabelMarker key={`ward-label-${index}-${item.name}`} position={item.center} text={item.name} type="ward" />
        ))}
    </>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <label className="block border-b border-[#E6EAEC] px-5 py-4">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-[#CAD2D7] bg-white px-3 text-sm font-bold text-[#030454] outline-none focus:border-[#009B35]"
      >
        {children}
      </select>
    </label>
  );
}

function IndicatorSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = options.find((o) => o.key === value);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative border-b border-[#E6EAEC] px-5 py-4">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
        Climate indicator
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between rounded-md border border-[#CAD2D7] bg-white px-3 py-2 text-left text-sm font-bold text-[#030454] outline-none focus:border-[#009B35]"
        aria-expanded={open}
      >
        <span className="leading-snug">{selected?.label ?? "Select..."}</span>
        {open ? <ChevronUp size={14} className="ml-2 mt-0.5 shrink-0 text-slate-400" /> : <ChevronDown size={14} className="ml-2 mt-0.5 shrink-0 text-slate-400" />}
      </button>
      {open && (
        <ul className="absolute left-5 right-5 z-[960] mt-1 max-h-60 overflow-y-auto rounded-md border border-[#CAD2D7] bg-white py-1 shadow-xl">
          {options.map((option) => (
            <li key={option.key}>
              <button
                type="button"
                onClick={() => { onChange(option.key); setOpen(false); }}
                className={`block w-full px-3 py-2.5 text-left text-sm leading-snug ${
                  option.key === value
                    ? "bg-[#030454] font-black text-white"
                    : "font-bold text-[#030454] hover:bg-[#EEF3FF]"
                }`}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MapResizer({ layoutKey }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 310);
    return () => clearTimeout(t);
  }, [map, layoutKey]);
  return null;
}

function AtlasToolButton({ label, icon, active, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      title={label}
      className={`group relative flex h-12 w-12 items-center justify-center border-b border-[#173B91]/30 transition ${
        active ? "bg-[#173B91] text-white" : "bg-white text-[#173B91] hover:bg-[#F3F7FF]"
      }`}
    >
      {icon}
      <span className="pointer-events-none absolute right-14 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-[#173B91] px-3 py-1.5 text-xs font-bold text-white shadow-lg group-hover:block">
        {label}
      </span>
    </button>
  );
}

function AtlasMapTools({
  stateGeoJson,
  lgaGeoJson,
  showGrid,
  setShowGrid,
  showWards,
  setShowWards,
  isFullscreen,
  setIsFullscreen,
  onToolMessage,
  onCapture,
}) {
  const map = useMap();

  function showMessage(message) {
    onToolMessage(message);
    window.setTimeout(() => onToolMessage(""), 2200);
  }

  function resetView() {
    const target = stateGeoJson || lgaGeoJson;
    const bounds = L.geoJSON(target).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 8 });
  }

  function toggleFullscreen() {
    const target = map.getContainer()?.parentElement;
    if (!document.fullscreenElement && target) {
      target.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }

  function locateUser() {
    map.locate({ setView: true, maxZoom: 11 });
    showMessage("Locating user position...");
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showMessage("Atlas link copied.");
    } catch {
      showMessage("Could not copy link.");
    }
  }

  return (
    <div className="absolute right-4 top-24 z-[900] flex flex-col overflow-visible rounded-md border border-[#173B91] bg-white shadow-md">
      <AtlasToolButton label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} icon={isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />} onClick={toggleFullscreen} />
      <AtlasToolButton label="Zoom in" icon={<ZoomIn size={18} />} onClick={() => map.zoomIn()} />
      <AtlasToolButton label="Select LGA" icon={<MousePointer2 size={18} />} onClick={() => showMessage("Click any LGA or ward polygon to select.")} />
      <AtlasToolButton label="Zoom out" icon={<ZoomOut size={18} />} onClick={() => map.zoomOut()} />
      <AtlasToolButton label="Reset view" icon={<Expand size={18} />} onClick={resetView} />
      <AtlasToolButton label="Locate me" icon={<LocateFixed size={18} />} onClick={locateUser} />
      <AtlasToolButton label="Toggle grid" icon={<Grid3x3 size={18} />} active={showGrid} onClick={() => setShowGrid((v) => !v)} />
      <AtlasToolButton label="Toggle ward boundaries" icon={<Layers size={18} />} active={showWards} onClick={() => setShowWards((v) => !v)} />
      <AtlasToolButton label="Export screenshot" icon={<Camera size={18} />} onClick={onCapture} />
      <AtlasToolButton label="Copy link" icon={<Link2 size={18} />} onClick={copyShareLink} />
    </div>
  );
}

function BasemapSwitcher({ baseMap, setBaseMap }) {
  const [open, setOpen] = useState(false);

  const options = [
    { key: "satellite", label: "Satellite" },
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
    { key: "streets", label: "Streets" },
    { key: "terrain", label: "Terrain" },
  ];

  return (
    <div className="absolute right-20 top-24 z-[940] w-44 overflow-hidden rounded-xl border border-[#D8DDE2] bg-white shadow-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-black text-[#030454] hover:bg-[#F7F9FA]"
      >
        <span>Basemap</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="border-t border-[#E6EAEC]">
          {options.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setBaseMap(item.key);
                setOpen(false);
              }}
              className={`block w-full px-4 py-3 text-left text-xs font-bold ${
                baseMap === item.key
                  ? "bg-[#030454] text-white"
                  : "bg-white text-slate-700 hover:bg-[#F7F9FA]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BriefingPanel({ question, answer, onQuestionChange, onAsk }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col border-l border-[#E6EAEC] pl-5">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#009B35]">Climate briefing</p>
          <p className="text-xs font-bold text-slate-500">Ask about this map</p>
        </div>
        <span className="rounded-full bg-[#F7F9FA] px-3 py-1 text-[10px] font-black text-slate-500">Rule-based</span>
      </div>

      {answer && (
        <p className="mb-2 max-h-12 overflow-auto rounded-md bg-[#F7F9FA] px-3 py-2 text-xs leading-5 text-slate-600">
          {answer}
        </p>
      )}

      <div className="flex gap-2">
        <input
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onAsk();
          }}
          placeholder="Ask about rainfall, rainfall anomaly, NDVI, land surface temperature..."
          className="h-9 flex-1 rounded-md border border-[#CAD2D7] px-3 text-xs outline-none focus:border-[#009B35]"
        />
        <button type="button" onClick={onAsk} className="rounded-md bg-[#030454] px-4 text-xs font-black text-white hover:bg-[#009B35]">
          Ask
        </button>
      </div>
    </div>
  );
}

function CICardBody({ ciItem, ciLoading, showLulc }) {
  if (ciLoading && !ciItem) {
    return <p className="text-[10px] italic text-slate-300">Loading...</p>;
  }
  if (!ciItem) return null;
  return (
    <div className="space-y-1 text-[10px]">
      {ciItem.summary?.vegetation_condition && (
        <div className="flex items-start gap-2">
          <span className="w-24 shrink-0 text-slate-400">Vegetation</span>
          <span className="font-bold capitalize text-slate-700">{ciItem.summary.vegetation_condition}</span>
        </div>
      )}
      {ciItem.summary?.water_condition && (
        <div className="flex items-start gap-2">
          <span className="w-24 shrink-0 text-slate-400">Rainfall</span>
          <span className="font-bold capitalize text-slate-700">{ciItem.summary.water_condition}</span>
        </div>
      )}
      {ciItem.summary?.drought_condition && (
        <div className="flex items-start gap-2">
          <span className="w-24 shrink-0 text-slate-400">Drought</span>
          <span className="font-bold capitalize text-slate-700">{ciItem.summary.drought_condition}</span>
        </div>
      )}
      {ciItem.summary?.heat_condition && (
        <div className="flex items-start gap-2">
          <span className="w-24 shrink-0 text-slate-400">Surface temp.</span>
          <span className="font-bold capitalize text-slate-700">{ciItem.summary.heat_condition}</span>
        </div>
      )}
      {showLulc && ciItem.summary?.dominant_land_cover && (
        <div className="flex items-start gap-2">
          <span className="w-24 shrink-0 text-slate-400">Land cover</span>
          <span className="font-bold capitalize text-slate-700">{ciItem.summary.dominant_land_cover}</span>
        </div>
      )}
      {ciItem.summary?.overall_status && (
        <p className="mt-1 rounded bg-white/60 px-1.5 py-1 font-bold capitalize text-[#030454]">
          {ciItem.summary.overall_status}
        </p>
      )}
    </div>
  );
}

function CIProfilePanel({ profile, loading, error, showLulc }) {
  if (loading) {
    return <p className="text-[10px] text-slate-400">Loading climate intelligence profile...</p>;
  }
  if (error === "notfound" || (!loading && !profile && !error)) {
    return <p className="text-[10px] text-slate-400">Climate intelligence profile is not available for this LGA/year.</p>;
  }
  if (error) {
    return <p className="text-[10px] text-red-500">Climate intelligence profile could not be loaded.</p>;
  }

  const { sections, briefing, cautions, method_notes } = profile;
  const { rainfall, vegetation, temperature, drought, land_cover } = sections || {};

  const hasAnySectionData = rainfall?.total || vegetation || drought || temperature || land_cover;

  return (
    <div className="space-y-2 text-[10px]">
      {!hasAnySectionData && !briefing?.length && (
        <p className="italic text-slate-400">No detailed data available for this LGA/year.</p>
      )}

      <div className="space-y-1">
        {rainfall?.total?.value != null && (
          <div className="flex items-start gap-2">
            <span className="w-24 shrink-0 text-slate-500">Rainfall</span>
            <span className="font-bold text-slate-700">
              {formatRainfall(rainfall.total.value)}
              {rainfall.anomaly?.condition && (
                <span className="font-normal text-slate-500"> · {rainfall.anomaly.condition}</span>
              )}
            </span>
          </div>
        )}
        {vegetation?.condition && (
          <div className="flex items-start gap-2">
            <span className="w-24 shrink-0 text-slate-500">Vegetation</span>
            <span className="font-bold capitalize text-slate-700">{vegetation.condition}</span>
          </div>
        )}
        {drought && (
          <div className="flex items-start gap-2">
            <span className="w-24 shrink-0 text-slate-500">Drought (SPI)</span>
            <span className="font-bold capitalize text-slate-700">
              {drought.value != null ? `${Number(drought.value).toFixed(2)} · ` : ""}
              {drought.condition || "No data"}
            </span>
          </div>
        )}
        {temperature?.condition && (
          <div className="flex items-start gap-2">
            <span className="w-24 shrink-0 text-slate-500">Surface temp.</span>
            <span className="font-bold capitalize text-slate-700">
              {temperature.value != null ? `${Number(temperature.value).toFixed(1)} °C · ` : ""}
              {temperature.condition}
            </span>
          </div>
        )}
        {showLulc && land_cover && (
          <div className="flex items-start gap-2">
            <span className="w-24 shrink-0 text-slate-500">Land cover</span>
            <div>
              <span className="font-bold capitalize text-slate-700">
                {land_cover.dominant_label || land_cover.dominant_class}
                {land_cover.dominant_pct != null && (
                  <span className="font-normal text-slate-500"> {Number(land_cover.dominant_pct).toFixed(1)}%</span>
                )}
              </span>
              <p className="mt-0.5 text-[9px] leading-3 text-amber-600">Internal preview · Not published · Not validated</p>
            </div>
          </div>
        )}
      </div>

      {briefing?.length > 0 && (
        <div className="space-y-0.5 border-t border-[#E6EAEC] pt-2">
          {briefing.map((line, i) => (
            <p key={i} className="leading-4 text-slate-500">• {line}</p>
          ))}
        </div>
      )}

      {cautions?.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {cautions.map((c, i) => (
            <p key={i} className="leading-4 text-amber-700">⚠ {c}</p>
          ))}
        </div>
      )}

      {method_notes?.length > 0 && (
        <details className="mt-1 border-t border-[#E6EAEC] pt-2">
          <summary className="cursor-pointer select-none text-[9px] font-bold text-slate-400 hover:text-slate-600">
            Method notes
          </summary>
          <div className="mt-1 space-y-1">
            {method_notes.map((note, i) => (
              <p key={i} className="text-[9px] leading-[1.4] text-slate-400">{note}</p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function PublicClimateAtlasPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const isExportMode = searchParams.get("export") === "1";
  // Internal developer QA gates — never shown in the public Atlas selector.
  const INTERNAL_LULC_PREVIEW_PARAM = searchParams.get("internal_lulc_preview") === "1";
  const INTERNAL_FLOOD_PREVIEW_PARAM = searchParams.get("internal_flood_preview") === "1";
  const INTERNAL_ELEVATION_PREVIEW_PARAM = searchParams.get("internal_elevation_preview") === "1";

  const captureRef = useRef(null);
  // Always holds the latest styleLgaFeature so Leaflet event handlers never close over stale state.
  const styleLgaFeatureRef = useRef(null);
  const resolveFeatureRef = useRef(null);
  const formatHoverValueRef = useRef(null);
  // Tracks current variable key so mouseover guards raster-overlay modes (no opaque fill).
  const variableKeyRef = useRef(null);
  // ciLookupRef: kept fresh every render so mouseover handlers never read stale CI data.
  const ciLookupRef = useRef({});

  const [stateGeoJson, setStateGeoJson] = useState(null);
  const [lgaGeoJson, setLgaGeoJson] = useState(null);
  const [wardGeoJson, setWardGeoJson] = useState(null);

  const [profiles, setProfiles] = useState([]);
  const [remoteStats, setRemoteStats] = useState([]);
  const [remoteStatsError, setRemoteStatsError] = useState(false);
  const [publicLayerCatalog, setPublicLayerCatalog] = useState(null);
  const [geeStatus, setGeeStatus] = useState(null);

  const [briefingQuestion, setBriefingQuestion] = useState("");
  const [briefingAnswer, setBriefingAnswer] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [baseMap, setBaseMap] = useState(isExportMode ? (searchParams.get("basemap") || "satellite") : "satellite");
  const [showGrid, setShowGrid] = useState(false);
  const [showWards, setShowWards] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(KADUNA_ZOOM);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toolMessage, setToolMessage] = useState("");

  const [selectedLgaFeature, setSelectedLgaFeature] = useState(null);
  const [selectedWard, setSelectedWard] = useState(null);
  const [error, setError] = useState("");
  const [remoteStatsLoading, setRemoteStatsLoading] = useState(false);
  const [lulcData, setLulcData] = useState(null);
  const [lulcTileUrl, setLulcTileUrl] = useState(null);
  const [lulcAvailableYears, setLulcAvailableYears] = useState(null);
  const [lulcDisplayMode, setLulcDisplayMode] = useState("cartographic");
  const [floodOccurrenceData, setFloodOccurrenceData] = useState(null);
  const [elevationData, setElevationData] = useState(null);
  const [elevationDisplayMode, setElevationDisplayMode] = useState("terrain_detail");
  const [elevationTileUrl, setElevationTileUrl] = useState(null);
  const [elevationPointSample, setElevationPointSample] = useState(null);
  const [elevationPointLoading, setElevationPointLoading] = useState(false);

  const [ciLookup, setCiLookup] = useState({});
  const [ciLoading, setCiLoading] = useState(false);

  const [ciProfile, setCiProfile] = useState(null);
  const [ciProfileLoading, setCiProfileLoading] = useState(false);
  const [ciProfileError, setCiProfileError] = useState(null);
  const [ciProfileOpen, setCiProfileOpen] = useState(false);
  const [ciBriefOpen, setCiBriefOpen] = useState(false);

  const [config, setConfig] = useState({
    variableKey: isExportMode ? (searchParams.get("variable") || "rainfall") : "rainfall",
    season: "Full Year",
    period: "Latest",
    opacity: 0.68,
    year: isExportMode ? Number(searchParams.get("year") || "2025") : 2025,
    admin_level: "lga",
  });

  const publicLayerKeys = useMemo(
    () => new Set((publicLayerCatalog || []).map((layer) => layer.key)),
    [publicLayerCatalog],
  );
  const isElevationPublic = publicLayerKeys.has("elevation");
  const isFloodPublic = publicLayerKeys.has("flood_occurrence");
  const availableVariables = useMemo(() => {
    const base = !publicLayerCatalog
      ? ATLAS_VARIABLES.filter((item) => item.key === "rainfall")
      : getAtlasAvailableLayerConfigs(publicLayerKeys).map((configItem) => ({
          key: configItem.key,
          label: configItem.selectorLabel,
          // elevation/flood_occurrence use dedicated load functions — not loadRemoteStats.
          source: (configItem.key === "elevation" || configItem.key === "flood_occurrence")
            ? "public_static"
            : "remote_sensing",
          sourceLayers: configItem.backendLayerKeys,
          unit: configItem.unit,
          dataSource: configItem.dataSource,
          coverageNote: configItem.coverageNote,
        }));
    const withLulc = !INTERNAL_LULC_PREVIEW_PARAM ? base : [
      ...base,
      {
        key: ANNUAL_LULC_INTERNAL_CONFIG.key,
        label: ANNUAL_LULC_INTERNAL_CONFIG.selectorLabel,
        source: ANNUAL_LULC_INTERNAL_CONFIG.source,
        sourceLayers: [],
        unit: ANNUAL_LULC_INTERNAL_CONFIG.unit,
        dataSource: ANNUAL_LULC_INTERNAL_CONFIG.dataSource,
        coverageNote: ANNUAL_LULC_INTERNAL_CONFIG.coverageNote,
      },
    ];
    // Only inject internal preview if the layer is not already in the public catalog.
    const withFlood = (
      !INTERNAL_FLOOD_PREVIEW_PARAM ||
      withLulc.some((item) => item.key === "flood_occurrence")
    ) ? withLulc : [
      ...withLulc,
      {
        key: FLOOD_OCCURRENCE_INTERNAL_CONFIG.key,
        label: FLOOD_OCCURRENCE_INTERNAL_CONFIG.selectorLabel,
        source: FLOOD_OCCURRENCE_INTERNAL_CONFIG.source,
        sourceLayers: [],
        unit: FLOOD_OCCURRENCE_INTERNAL_CONFIG.unit,
        dataSource: FLOOD_OCCURRENCE_INTERNAL_CONFIG.dataSource,
        coverageNote: FLOOD_OCCURRENCE_INTERNAL_CONFIG.coverageNote,
      },
    ];
    if (
      !INTERNAL_ELEVATION_PREVIEW_PARAM ||
      withFlood.some((item) => item.key === "elevation")
    ) return withFlood;
    return [
      ...withFlood,
      {
        key: ELEVATION_INTERNAL_CONFIG.key,
        label: ELEVATION_INTERNAL_CONFIG.selectorLabel,
        source: ELEVATION_INTERNAL_CONFIG.source,
        sourceLayers: [],
        unit: ELEVATION_INTERNAL_CONFIG.unit,
        dataSource: ELEVATION_INTERNAL_CONFIG.dataSource,
        coverageNote: ELEVATION_INTERNAL_CONFIG.coverageNote,
      },
    ];
  }, [publicLayerCatalog, publicLayerKeys, INTERNAL_LULC_PREVIEW_PARAM, INTERNAL_FLOOD_PREVIEW_PARAM, INTERNAL_ELEVATION_PREVIEW_PARAM]);
  const variable = availableVariables.find((item) => item.key === config.variableKey) || availableVariables[0] || ATLAS_VARIABLES[0];
  const selectedVariableAvailable = availableVariables.some((item) => item.key === config.variableKey);

  // Build LULC period options dynamically from available_years returned by the backend,
  // so the selector only shows years that actually exist in the database.
  // Falls back to the hardcoded VARIABLE_PERIOD_CONFIGS.annual_lulc until the API responds.
  const lulcPeriods = useMemo(() => {
    const base = [{ id: "latest", label: "Latest", startYear: null, endYear: null, ticks: [] }];
    if (!lulcAvailableYears?.length) return VARIABLE_PERIOD_CONFIGS.annual_lulc;
    return [
      ...base,
      ...lulcAvailableYears.map(({ year, label }) => ({
        id: `lulc-${year}`,
        label,
        startYear: year,
        endYear: year,
        ticks: [year],
      })),
    ];
  }, [lulcAvailableYears]);

  const variablePeriods = variable.key === "annual_lulc"
    ? lulcPeriods
    : (VARIABLE_PERIOD_CONFIGS[variable.key] || ATLAS_PERIODS);
  const variableConfig = getAtlasLayerConfig(variable.key);
  const variableStatistic = getAtlasVariableStatistic(variable.key)?.label || "Spatial mean";
  const variableStatisticDetail = getAtlasVariableStatistic(variable.key)?.detail || "";
  const profilesByName = useMemo(() => buildLookup(profiles), [profiles]);
  const metricsByName = useMemo(() => buildLookup(remoteStats), [remoteStats]);
  const lulcLookup = useMemo(() => {
    if (!lulcData?.results) return {};
    return lulcData.results.reduce((acc, item) => {
      acc[normalizeName(item.admin_name)] = item;
      return acc;
    }, {});
  }, [lulcData]);
  const lulcClasses = lulcData?.classes || {};
  const floodOccurrenceLookup = useMemo(() => {
    if (!floodOccurrenceData?.results) return {};
    return floodOccurrenceData.results.reduce((acc, item) => {
      if (item.admin_code) acc[item.admin_code] = item;
      acc[normalizeName(item.admin_name)] = item;
      return acc;
    }, {});
  }, [floodOccurrenceData]);
  const elevationLookup = useMemo(() => {
    if (!elevationData?.results) return {};
    return elevationData.results.reduce((acc, item) => {
      if (item.admin_code) acc[item.admin_code] = item;
      acc[normalizeName(item.admin_name)] = item;
      return acc;
    }, {});
  }, [elevationData]);
  const wardsVisible = showWards && currentZoom >= WARD_VISIBLE_ZOOM;
  const totalLgaCount = lgaGeoJson?.features?.length || 23;

  // Active period from central registry — single source of truth for slider bounds and ticks.
  const activePeriod = variablePeriods.find((p) => p.label === config.period) || variablePeriods[0];
  const isLatest = activePeriod.id === "latest";
  const sliderMin = activePeriod.startYear ?? config.year;
  const sliderMax = activePeriod.endYear ?? config.year;
  const tickYears = activePeriod.ticks;

  // Unified NDVI source resolution: "Latest" always uses Sentinel-2 (resolves to 2025).
  // Explicit years ≤ 2017 route to the Landsat layer; 2018+ stay on Sentinel-2.
  const activeNdviLayerKey = variable.key === "ndvi"
    ? (isLatest ? "ndvi" : config.year <= 2017 ? "ndvi_landsat" : "ndvi")
    : null;
  const isNdviLandsat = activeNdviLayerKey === "ndvi_landsat";
  const runtimeCopy = getAtlasRuntimeCopy(variable.key, config.year);
  const activeDataSource = runtimeCopy?.dataSource || variable.dataSource;
  const activeCoverageNote = runtimeCopy?.coverageNote || "";
  const popupConfig = variableConfig?.popup || {};

  // Derived from selectedLgaFeature so the popup re-resolves reactively when
  // remoteStats / profiles update (year, season, or variable change).
  const selectedLga = useMemo(
    () => (selectedLgaFeature ? resolveFeature(selectedLgaFeature) : null),
    [selectedLgaFeature, metricsByName, profilesByName, variable, lulcLookup, floodOccurrenceLookup, elevationLookup],
  );

  // Mean NDVI across all returned LGAs â€" drives the briefing panel.
  const meanNdviFromStats = useMemo(() => {
    if (variable.key !== "ndvi" || !remoteStats.length) return null;
    const vals = remoteStats.flatMap((s) => {
      const v = Number(s.mean_value);
      return Number.isFinite(v) ? [v] : [];
    });
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [remoteStats, variable.key]);

  // Symmetric anomaly breaks from the loaded records (P33/P75 of absolute values).
  // Used by both styleLgaFeature and the anomaly legend.
  const anomalyBreaks = useMemo(() => {
    if (variable.key !== "rainfall_anomaly" || !remoteStats.length) return null;
    const vals = remoteStats
      .map((s) => Number(s.mean_value))
      .filter((v) => Number.isFinite(v));
    if (vals.length < 2) return null;
    const absVals = vals.map(Math.abs).sort((a, b) => a - b);
    const n = absVals.length;
    const inner = Math.max(5,  absVals[Math.floor(0.33 * (n - 1))]);
    const outer = Math.max(10, absVals[Math.floor(0.75 * (n - 1))]);
    return [-outer, -inner, inner, outer];
  }, [variable.key, remoteStats]);

  // P20/P40/P60/P80 breaks derived from the loaded rainfall stats â€" used by both
  // styleLgaFeature and the legend. Recomputed whenever the loaded stats change.
  const rainfallBreaks = useMemo(() => {
    if (variable.key !== "rainfall" || !remoteStats.length) return null;
    const vals = remoteStats
      .map((s) => Number(s.mean_value))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);
    if (vals.length < 4) return null;
    const q = (p) => vals[Math.floor(p * (vals.length - 1))];
    return [q(0.2), q(0.4), q(0.6), q(0.8)];
  }, [variable.key, remoteStats]);
  const legendState = useMemo(
    () => getAtlasLegendState(variable.key, { rainfallBreaks, anomalyBreaks }),
    [variable.key, rainfallBreaks, anomalyBreaks],
  );

  const selectedLgaCiItem = useMemo(
    () => !selectedLga ? null : (ciLookup[selectedLga.metric?.admin_code] || ciLookup[normalizeName(selectedLga.name)] || null),
    [selectedLga, ciLookup],
  );

  const layoutKey = `${sidebarOpen ? "open" : "closed"}-${selectedLga ? "lga" : selectedWard ? "ward" : "none"}`;

  async function captureAtlasLayout() {
    setToolMessage("Generating export...");
    try {
      const params = new URLSearchParams({
        variable: config.variableKey,
        year: String(config.year),
        basemap: baseMap,
      });
      const response = await fetch(`/api/public/atlas-export/?${params}`);
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `kccc-climate-atlas-${config.variableKey}-${config.year}.png`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      setToolMessage("Atlas exported.");
      window.setTimeout(() => setToolMessage(""), 2200);
    } catch {
      setToolMessage("Export failed. Please try again.");
      window.setTimeout(() => setToolMessage(""), 4000);
    }
  }

  function updateConfig(key, value) {
    if (key === "year" || key === "season") {
      setSelectedLgaFeature(null);
    }
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function updatePeriod(label) {
    setSelectedLgaFeature(null);
    const period = variablePeriods.find((p) => p.label === label) || variablePeriods[0];
    if (period.id === "latest") {
      setConfig((prev) => ({ ...prev, period: label }));
      return;
    }
    const { startYear, endYear } = period;
    setConfig((prev) => ({
      ...prev,
      period: label,
      year: prev.year >= startYear && prev.year <= endYear ? prev.year : endYear,
    }));
  }

  function handleVariableChange(newKey) {
    if (!availableVariables.some((item) => item.key === newKey)) return;
    const periods = newKey === "annual_lulc"
      ? lulcPeriods
      : (VARIABLE_PERIOD_CONFIGS[newKey] || ATLAS_PERIODS);
    const currentPeriodValid = periods.some((p) => p.label === config.period);
    setSelectedLgaFeature(null);
    setConfig((prev) => ({
      ...prev,
      variableKey: newKey,
      ...(newKey === "flood_occurrence"
        ? { period: "1984–2021 archive", year: 2021 }
        : newKey === "elevation"
          ? { period: "SRTM static DEM", year: 2000 }
          : currentPeriodValid ? {} : { period: "Latest" }),
      // LULC raster benefits from higher opacity so fine detail is visible.
      ...(newKey === "annual_lulc" ? { opacity: 0.9 } : {}),
    }));
    // Switch away from dark/satellite basemaps when entering LULC so the
    // cartographic layer is legible against a neutral background.
    if (newKey === "annual_lulc" && (baseMap === "satellite" || baseMap === "dark")) {
      setBaseMap("light");
    }
  }

  function generateClimateBriefing() {
    const q = briefingQuestion.trim().toLowerCase();

    if (!q) {
      if (variable.key === "elevation") {
        setBriefingAnswer("Ask about elevation, terrain, altitude, or LGA-level topographic conditions. This is static SRTM terrain data (~2000) — not a climate variable or hazard forecast.");
      } else if (variable.key === "flood_occurrence") {
        setBriefingAnswer("Ask about surface water occurrence, flood, or LGA-level conditions. This is a static archive (1984–2021) — not a real-time flood indicator.");
      } else {
        setBriefingAnswer("Ask about rainfall, rainfall anomaly, NDVI, vegetation, land surface temperature, or LGA-level climate conditions.");
      }
      return;
    }

    if (variable.key === "annual_lulc") {
      const changeSafeguardTerms = ["change", "loss", "gain", "deforestation", "trend", "increase", "decrease", "decline", "grow", "shift"];
      if (changeSafeguardTerms.some((kw) => q.includes(kw))) {
        setBriefingAnswer("This preview shows annual land-use / land-cover classification for a selected year only. Change analysis, trend reporting, and loss / gain statements are not supported in this preview.");
        return;
      }
      const n = lulcData?.results?.length || 0;
      const ds = lulcData?.dataset;
      const qs = lulcData?.quality_summary;
      setBriefingAnswer(
        `Annual Land Use / Land Cover (internal preview): ${n} LGA${n !== 1 ? "s" : ""} loaded for ${ds?.year || config.year}. ` +
        `Method: Dynamic World v1 ${ds?.composite_window || "late_wet_season"} (Sep–Oct composite). ` +
        (qs ? `Quality: ${qs.high} high / ${qs.medium} medium / ${qs.low} low. ` : "") +
        `Internal preview only — not published, not yet validated.`
      );
      return;
    }

    if (q.includes("ward")) {
      setBriefingAnswer("Ward boundaries appear from zoom level 10 upward. Ward labels appear from zoom level 13 upward.");
      return;
    }

    if (q.includes("anomaly") || (q.includes("rainfall") && q.includes("baseline"))) {
      if (variable.key === "rainfall_anomaly" && remoteStats.length > 0) {
        const vals = remoteStats.map((s) => Number(s.mean_value)).filter((v) => Number.isFinite(v));
        const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        const direction = mean !== null ? (mean > 2 ? "above" : mean < -2 ? "below" : "near") : "–";
        setBriefingAnswer(
          `Rainfall Anomaly (${config.season} ${config.year}): Kaduna mean departure is ${mean !== null ? `${mean >= 0 ? "+" : ""}${mean.toFixed(1)}%` : "N/A"} – ${direction} the 1991–2020 baseline. Anomaly is not a drought index; interpret alongside rainfall totals.`
        );
      } else {
        setBriefingAnswer(
          "Rainfall Anomaly shows percentage departure from the 1991–2020 CHIRPS baseline for each LGA and season. Positive values indicate wetter than normal; negative values indicate drier. Select 'Rainfall Anomaly (%)' to explore by year and season."
        );
      }
      return;
    }

    if (q.includes("rain")) {
      if (variable.key === "rainfall" && remoteStats.length > 0) {
        const vals = remoteStats.map((s) => Number(s.mean_value)).filter((v) => Number.isFinite(v));
        const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        setBriefingAnswer(
          `Rainfall Total (CHIRPS v2.0, ${config.season} ${config.year}): mean ${mean !== null ? `${Math.round(mean)} mm` : "N/A"} across ${remoteStats.length} LGAs. This is an accumulated seasonal total – not a rainfall anomaly.`
        );
      } else {
        setBriefingAnswer(
          "CHIRPS v2.0 rainfall totals are available for all 23 Kaduna LGAs (Annual/Wet 1981–2025, Dry 1982–2025). Select 'Rainfall Total (mm)' to explore by year and season."
        );
      }
      return;
    }

    if (q.includes("drought")) {
      if (variable.key === "drought_index" && remoteStats.length > 0) {
        const vals = remoteStats.map((s) => Number(s.mean_value)).filter((v) => Number.isFinite(v));
        const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        setBriefingAnswer(
          `Meteorological Drought Conditions (SPI, ${config.season} ${config.year}): mean SPI is ${mean !== null ? mean.toFixed(2) : "N/A"} across ${remoteStats.length} LGAs. This is a fixed-window precipitation-only SPI; only SPI values at or below -1.0 are drought categories.`
        );
      } else {
        setBriefingAnswer(
          "Meteorological Drought Conditions (SPI) is a public Atlas layer. It is a fixed-window precipitation-only SPI calculated separately for each LGA and seasonal window against a 1991-2020 baseline; it does not measure soil moisture, crop stress, streamflow, or groundwater drought."
        );
      }
      return;
    }

    if (q.includes("temperature") || q.includes("heat") || q.includes("lst")) {
      if (variable.key === "lst" && remoteStats.length > 0) {
        const vals = remoteStats.map((s) => Number(s.mean_value)).filter((v) => Number.isFinite(v));
        const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        setBriefingAnswer(
          `Land Surface Temperature (MODIS Terra, ${config.season} ${config.year}): mean ${mean !== null ? `${mean.toFixed(1)}°C` : "N/A"} across ${remoteStats.length} LGAs. Daytime LST – not equivalent to air temperature.`
        );
      } else {
        setBriefingAnswer(
          "Land Surface Temperature (Daytime) uses MODIS Terra MOD11A1 daily 1 km data (2001–2025). Daytime LST is not equivalent to air temperature. Select 'Land Surface Temperature (Daytime)' to explore by year and season."
        );
      }
      return;
    }

    if (q.includes("ndvi") || q.includes("vegetation") || q.includes("landsat")) {
      if (variable.key === "ndvi" && isNdviLandsat && meanNdviFromStats !== null) {
        setBriefingAnswer(`NDVI (Landsat, ${config.season} ${config.year}): mean ${meanNdviFromStats.toFixed(3)} across ${remoteStats.length} LGAs. Sensor varies by period (LT05/LE07/LC08). Not comparable with Sentinel-2 NDVI without cross-sensor calibration.`);
      } else if (variable.key === "ndvi" && isNdviLandsat) {
        setBriefingAnswer(`Landsat NDVI (1985–2017) is selected for ${config.season} ${config.year}. Sensor varies by period: LT05, LE07, LC08. Archive gaps exist for some LGAs and years. Not comparable with Sentinel-2 NDVI.`);
      } else if (meanNdviFromStats !== null) {
        setBriefingAnswer(`NDVI (Sentinel-2, ${config.season} ${config.year}): mean ${meanNdviFromStats.toFixed(3)} across ${remoteStats.length} LGAs. Values near 1.0 indicate dense vegetation; near 0 indicate bare land or cloud-affected pixels.`);
      } else {
        setBriefingAnswer("Vegetation / NDVI covers 1985–2025 using two separate sources: Landsat C2 (1985–2017) and Sentinel-2 (2018–2025). The data source updates automatically with the selected year.");
      }
      return;
    }

    if (q.includes("elevation") || q.includes("terrain") || q.includes("altitude") || q.includes("height")) {
      if (variable.key === "elevation" && elevationData?.results?.length) {
        const vals = elevationData.results
          .map((r) => Number(r.mean_value))
          .filter((v) => Number.isFinite(v));
        const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        const min = vals.length ? Math.min(...vals) : null;
        const max = vals.length ? Math.max(...vals) : null;
        setBriefingAnswer(
          `Elevation (USGS SRTMGL1_003, ~2000): ` +
          `mean elevation across ${elevationData.results.length} Kaduna LGAs is ` +
          `${mean !== null ? `${mean.toFixed(0)} m` : "N/A"} ` +
          `(range: ${min !== null ? `${min.toFixed(0)}` : "?"} – ${max !== null ? `${max.toFixed(0)} m` : "?"} m). ` +
          `This is static topographic terrain data — not a climate variable, not a hazard forecast. ` +
          `Internal preview only — not published.`
        );
      } else {
        setBriefingAnswer(
          "Elevation data (USGS SRTMGL1_003 30 m SRTM DEM, ~2000) is available as an internal preview. " +
          "It shows mean LGA terrain elevation in metres. Static topographic layer — not a climate variable, " +
          "not a flood risk or hazard indicator."
        );
      }
      return;
    }

    if (q.includes("flood")) {
      if (variable.key === "flood_occurrence" && floodOccurrenceData?.results?.length) {
        const vals = floodOccurrenceData.results
          .map((r) => Number(r.mean_value))
          .filter((v) => Number.isFinite(v));
        const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        setBriefingAnswer(
          `Historical Surface Water Occurrence (JRC GSW v1.4, 1984–2021): ` +
          `mean occurrence across ${floodOccurrenceData.results.length} Kaduna LGAs is ` +
          `${mean !== null ? `${mean.toFixed(1)}%` : "N/A"} of the observation period. ` +
          `This is a static archive indicator — not a real-time alert or flood forecast. ` +
          `Internal preview only — not published.`
        );
      } else if (variable.key === "flood_occurrence") {
        setBriefingAnswer(
          "Historical Surface Water Occurrence (JRC GSW v1.4) shows the percentage of the 1984–2021 " +
          "Landsat observation period that open surface water was detected for each LGA. " +
          "Static archive — not a real-time alert or flood forecast. Internal preview only."
        );
      } else {
        setBriefingAnswer(
          "Historical Surface Water Occurrence (JRC GSW v1.4, 1984–2021) is available as an internal " +
          "preview via ?internal_flood_preview=1. It is a static archive indicator — not a real-time " +
          "alert or flood forecast."
        );
      }
      return;
    }

    setBriefingAnswer(`${variable.label} is selected for ${config.season}. Data source: ${variable.dataSource}. Period: ${config.period}.`);
  }

  async function loadInitialData() {
    setError("");

    try {
      const [stateResponse, lgaResponse, wardResponse] = await Promise.all([
        fetch("/data/kaduna_state.geojson", { cache: "no-cache" }),
        fetch("/data/kaduna_lga.geojson", { cache: "no-cache" }),
        fetch("/data/kaduna_ward.geojson", { cache: "no-cache" }),
      ]);

      if (!stateResponse.ok) throw new Error("Kaduna State GeoJSON could not be loaded.");
      if (!lgaResponse.ok) throw new Error("Kaduna LGA GeoJSON could not be loaded.");
      if (!wardResponse.ok) throw new Error("Kaduna Ward GeoJSON could not be loaded.");

      const [stateData, lgaData, wardData] = await Promise.all([
        stateResponse.json(),
        lgaResponse.json(),
        wardResponse.json(),
      ]);

      setStateGeoJson(stateData);
      setLgaGeoJson(lgaData);
      setWardGeoJson(wardData);

      const results = await Promise.allSettled([
        getPublicClimateRiskProfiles(),
        getRemoteSensingDashboardKpis(),
        getGeeStatus(),
        getRemoteSensingLayers(),
      ]);

      if (results[0].status === "fulfilled") setProfiles(results[0].value.results || []);
      if (results[2].status === "fulfilled") setGeeStatus(results[2].value || null);
      if (results[3].status === "fulfilled") {
        setPublicLayerCatalog(results[3].value.results || []);
      } else {
        setPublicLayerCatalog([]);
      }
    } catch (err) {
      console.error(err);
      setPublicLayerCatalog([]);
      setError(err.message || "Could not load Kaduna Climate Atlas.");
    }
  }

  async function loadRemoteStats() {
    if (!publicLayerCatalog || !selectedVariableAvailable) {
      setRemoteStats([]);
      setRemoteStatsError(false);
      return;
    }

    if (variable.source !== "remote_sensing") {
      setRemoteStats([]);
      setRemoteStatsError(false);
      return;
    }

    setRemoteStatsLoading(true);
    setRemoteStatsError(false);
    try {
      // Dry Season 1982 safeguard: no rainfall_anomaly records exist for dry_season 1981
      // (CHIRPS incomplete Nov 1980â€"Mar 1981). Reset year and re-trigger via state update.
      if ((variable.key === "rainfall_anomaly" || variable.key === "drought_index") && SEASON_PARAM[config.season] === "dry_season" && !isLatest && config.year === 1981) {
        updateConfig("year", 1982);
        return;
      }

      // For NDVI, resolve the backend layer key from the active year.
      // "Latest" always requests ndvi (Sentinel-2) without a year; explicit years â‰¤ 2017 use ndvi_landsat.
      const resolvedLayerKey = variable.key === "ndvi"
        ? (isLatest ? "ndvi" : config.year <= 2017 ? "ndvi_landsat" : "ndvi")
        : variable.key;
      const params = {
        layer: resolvedLayerKey,
        season: SEASON_PARAM[config.season] || "annual",
        admin_level: config.admin_level,
      };
      // "Latest" omits year so the backend resolves the most recent stored year.
      if (!isLatest) {
        params.year = config.year;
      }
      const data = await getRemoteSensingLgaStats(params);
      setRemoteStats(data.results || []);
      // Sync the resolved year back to the slider when period is "Latest".
      const resolvedYear = data.filters?.year;
      if (isLatest && resolvedYear && resolvedYear !== config.year) {
        updateConfig("year", resolvedYear);
      }
    } catch (err) {
      console.error("loadRemoteStats failed:", {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
        baseURL: err.config?.baseURL,
        url: err.config?.url,
      });
      setRemoteStats([]);
      // 404 means the layer is not yet public â€" treat as empty results, not a connection error.
      setRemoteStatsError(err.response?.status !== 404);
    } finally {
      setRemoteStatsLoading(false);
    }
  }

  async function loadLulcDataAndTile() {
    if (!INTERNAL_LULC_PREVIEW_PARAM) return;

    // Step 1: Fetch LGA class stats and dataset metadata.
    let resolvedYear = null;
    try {
      const params = {};
      // "Latest" period: omit year so the backend returns the most recent dataset.
      if (!isLatest && config.year) params.year = config.year;
      const data = await getRemoteSensingLulcPreview(params);
      setLulcData(data);
      setLulcAvailableYears(data.available_years || null);
      resolvedYear = data?.dataset?.year ?? (isLatest ? null : config.year);
      // Sync config.year to the returned dataset year so sliders and labels stay consistent.
      if (resolvedYear && resolvedYear !== config.year) {
        setConfig((prev) => ({ ...prev, year: resolvedYear }));
      }
    } catch (err) {
      console.error("loadLulcData failed:", err);
      setLulcData(null);
    }

    // Step 2: Fetch the GEE tile URL for the exact resolved year so the raster
    // matches the LGA stats dataset.  Runs after step 1 so we use the actual year.
    try {
      const tileParams = resolvedYear ? { year: resolvedYear } : {};
      tileParams.display_mode = lulcDisplayMode;
      const tileData = await getRemoteSensingLulcTileUrl(tileParams);
      setLulcTileUrl(tileData?.tile?.tile_url || null);
    } catch (err) {
      console.error("loadLulcTileUrl failed:", err);
      setLulcTileUrl(null);
    }
  }

  async function loadFloodOccurrenceData() {
    const usePublic = publicLayerKeys.has("flood_occurrence");
    if (!usePublic && !INTERNAL_FLOOD_PREVIEW_PARAM) return;
    try {
      const data = usePublic
        ? await getPublicHistoricalSurfaceWater()
        : await getFloodOccurrencePreview();
      setFloodOccurrenceData(data);
    } catch (err) {
      console.error("loadFloodOccurrenceData failed:", err);
      setFloodOccurrenceData(null);
    }
  }

  async function loadElevationData() {
    const usePublic = publicLayerKeys.has("elevation");
    if (!usePublic && !INTERNAL_ELEVATION_PREVIEW_PARAM) return;
    try {
      const data = usePublic
        ? await getPublicElevationSummary()
        : await getElevationPreview();
      setElevationData(data);
    } catch (err) {
      console.error("loadElevationData failed:", err);
      setElevationData(null);
    }
  }

  async function loadElevationTileUrl() {
    const isPublic = publicLayerKeys.has("elevation");
    if (!isPublic && !INTERNAL_ELEVATION_PREVIEW_PARAM) return;
    try {
      const data = isPublic
        ? await getElevationTileUrlPublic()
        : await getElevationTileUrl();
      setElevationTileUrl(data?.tile?.tile_url || null);
    } catch (err) {
      console.error("loadElevationTileUrl failed:", err);
      setElevationTileUrl(null);
    }
  }

  async function handleElevationPointClick(lat, lng) {
    const isPublic = publicLayerKeys.has("elevation");
    if (!isPublic && !INTERNAL_ELEVATION_PREVIEW_PARAM) return;
    setElevationPointLoading(true);
    setElevationPointSample(null);
    try {
      const data = isPublic
        ? await sampleElevationPointPublic(lat, lng)
        : await sampleElevationPoint(lat, lng);
      setElevationPointSample(data?.sample || null);
    } catch {
      setElevationPointSample(null);
    } finally {
      setElevationPointLoading(false);
    }
  }

  async function loadClimateIntelligence() {
    setCiLoading(true);
    try {
      const params = {
        year: config.year,
        season: SEASON_PARAM[config.season] || "annual",
      };
      if (INTERNAL_LULC_PREVIEW_PARAM) params.include_lulc_preview = "true";
      const data = await getClimateIntelligence(params);
      const lookup = {};
      for (const item of data.results || []) {
        if (item.admin_code) lookup[item.admin_code] = item;
        lookup[normalizeName(item.admin_name)] = item;
      }
      setCiLookup(lookup);
    } catch (err) {
      console.error("loadClimateIntelligence failed:", err);
      setCiLookup({});
    } finally {
      setCiLoading(false);
    }
  }

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!publicLayerCatalog) return;
    if (selectedVariableAvailable) return;
    const fallback = availableVariables.find((item) => item.key === "rainfall") || availableVariables[0] || VARIABLES[0];
    setConfig((current) => ({
      ...current,
      variableKey: fallback.key,
      period: "Latest",
    }));
  }, [publicLayerCatalog, selectedVariableAvailable, availableVariables]);

  useEffect(() => {
    if (variable.key !== "drought_index") return;
    if (SEASON_PARAM[config.season] !== "dry_season") return;
    if (isLatest || config.year !== 1981) return;
    updateConfig("year", 1982);
  }, [variable.key, config.season, config.year, isLatest]);

  useEffect(() => {
    loadRemoteStats();
  }, [config.variableKey, config.year, config.season, config.admin_level, config.period, publicLayerCatalog, selectedVariableAvailable]);

  useEffect(() => {
    if (variable.key !== "annual_lulc" || !INTERNAL_LULC_PREVIEW_PARAM) {
      if (lulcData !== null) setLulcData(null);
      if (lulcTileUrl !== null) setLulcTileUrl(null);
      if (lulcAvailableYears !== null) setLulcAvailableYears(null);
      return;
    }
    loadLulcDataAndTile();
  }, [config.variableKey, config.year, config.period, lulcDisplayMode]);

  useEffect(() => {
    const isPublic = publicLayerKeys.has("flood_occurrence");
    if (variable.key !== "flood_occurrence" || (!isPublic && !INTERNAL_FLOOD_PREVIEW_PARAM)) {
      if (floodOccurrenceData !== null) setFloodOccurrenceData(null);
      return;
    }
    loadFloodOccurrenceData();
  }, [config.variableKey, publicLayerCatalog]);

  useEffect(() => {
    const isPublic = publicLayerKeys.has("elevation");
    if (variable.key !== "elevation" || (!isPublic && !INTERNAL_ELEVATION_PREVIEW_PARAM)) {
      if (elevationData !== null) setElevationData(null);
      if (elevationTileUrl !== null) setElevationTileUrl(null);
      if (elevationPointSample !== null) setElevationPointSample(null);
      return;
    }
    loadElevationData();
  }, [config.variableKey, publicLayerCatalog]);

  useEffect(() => {
    const isPublic = publicLayerKeys.has("elevation");
    if (variable.key !== "elevation" || (!isPublic && !INTERNAL_ELEVATION_PREVIEW_PARAM)) return;
    if (elevationDisplayMode !== "terrain_detail") {
      if (elevationTileUrl !== null) setElevationTileUrl(null);
      setElevationPointSample(null);
      return;
    }
    loadElevationTileUrl();
  }, [config.variableKey, elevationDisplayMode, publicLayerCatalog]);

  useEffect(() => {
    if (!config.year) return;
    loadClimateIntelligence();
  }, [config.year, config.season]);

  useEffect(() => {
    if (!selectedLgaFeature) {
      setCiProfile(null);
      setCiProfileError(null);
      return;
    }
    async function fetchCiProfile() {
      setCiProfileLoading(true);
      setCiProfileError(null);
      try {
        const adminCode = selectedLga?.metric?.admin_code;
        const params = {
          year: config.year,
          season: SEASON_PARAM[config.season] || "annual",
        };
        if (adminCode) {
          params.admin_code = adminCode;
        } else {
          params.admin_name = getFeatureName(selectedLgaFeature);
        }
        if (INTERNAL_LULC_PREVIEW_PARAM) params.include_lulc_preview = "true";
        const data = await getClimateIntelligenceProfile(params);
        setCiProfile(data.profile || null);
      } catch (err) {
        console.error("fetchCiProfile failed:", err);
        setCiProfileError(err.response?.status === 404 ? "notfound" : "error");
      } finally {
        setCiProfileLoading(false);
      }
    }
    fetchCiProfile();
  }, [selectedLgaFeature, config.year, config.season]);

  useEffect(() => {
    setCiBriefOpen(false);
  }, [selectedLgaFeature]);

  useEffect(() => {
    if (isExportMode && lgaGeoJson) {
      document.body.dataset.atlasExportReady = "1";
    }
  }, [isExportMode, lgaGeoJson]);

  function resolveFeature(feature) {
    const name = String(getFeatureName(feature)).trim();
    const key = normalizeName(name);
    const profile = profilesByName[key] || null;
    const metric = metricsByName[key] || null;
    const lulcSnap = lulcLookup[key] || null;
    const floodSnap = floodOccurrenceLookup[key] || null;
    const elevSnap = elevationLookup[key] || null;
    let value;
    if (variable.key === "elevation") {
      value = elevSnap?.mean_value ?? null;
    } else if (variable.key === "flood_occurrence") {
      value = floodSnap?.mean_value ?? null;
    } else if (variable.source === "remote_sensing") {
      value = metric?.mean_value;
    } else {
      value = profile?.[variable.field];
    }

    return {
      name: profile?.lga_name || metric?.lga_name || elevSnap?.admin_name || floodSnap?.admin_name || lulcSnap?.admin_name || name,
      profile,
      metric: variable.key === "elevation" ? elevSnap : variable.key === "flood_occurrence" ? floodSnap : metric,
      lulcSnap,
      floodSnap,
      elevSnap,
      value,
      color: getColor(value),
    };
  }

  function styleStateBoundary() {
    return {
      color: "#171211",
      weight: 4,
      fillColor: "transparent",
      fillOpacity: 0,
      opacity: 1,
    };
  }

  function styleLgaFeature(feature) {
    const info = resolveFeature(feature);
    const isSelected = selectedLgaFeature != null &&
      normalizeName(getFeatureName(feature)) === normalizeName(getFeatureName(selectedLgaFeature));

    // LULC overlay mode: transparent fill so the GEE raster shows through.
    // LGA boundaries remain visible for spatial orientation.
    // No LGA dominant-class fill is used — that would misrepresent mixed land cover.
    if (variable.key === "annual_lulc") {
      return {
        color: isSelected ? "#009B35" : "#e2e8f0",
        weight: isSelected ? 2.5 : 1.5,
        fillColor: "transparent",
        fillOpacity: 0,
        opacity: 0.9,
        dashArray: isSelected ? "4 3" : "",
      };
    }

    // Elevation terrain detail: transparent fill so the SRTM raster shows through.
    // LGA boundaries remain for orientation; click/hover disabled in this mode.
    if (variable.key === "elevation" && elevationDisplayMode === "terrain_detail") {
      return {
        color: "#173B91",
        weight: 1.5,
        fillColor: "transparent",
        fillOpacity: 0,
        opacity: 0.55,
        dashArray: "",
      };
    }

    const fillColor = variable.key === "elevation"
      ? getElevationColor(info.value)
      : variable.key === "flood_occurrence"
      ? getFloodOccurrenceColor(info.value)
      : variable.source !== "remote_sensing"
        ? info.color
        : variable.key === "rainfall"
          ? getRainfallColor(info.value, rainfallBreaks)
          : variable.key === "rainfall_anomaly"
            ? getAnomalyColor(info.value, anomalyBreaks)
            : variable.key === "drought_index"
              ? getDroughtSpiColor(info.value)
              : variable.key === "lst"
                ? getLstColor(info.value)
                : getNdviColor(info.value);
    const hasFill = hasValue(info.value);
    // Selection: changes border only — fillColor is always data-driven and never altered.
    return {
      color: isSelected ? "#009B35" : "#ffffff",
      weight: isSelected ? 3 : 2,
      fillColor,
      fillOpacity: hasFill ? config.opacity : 0.18,
      opacity: 0.95,
      dashArray: isSelected ? "4 3" : "",
    };
  }
  function formatHoverValue(resolved) {
    if (variable.key === "annual_lulc") {
      const snap = resolved?.lulcSnap;
      if (!snap) return "No data";
      return `${snap.dominant_label || snap.dominant_class} (${Number(snap.dominant_pct).toFixed(1)}%)`;
    }
    const val = resolved?.value;
    if (val === null || val === undefined || !Number.isFinite(Number(val))) return "No data";
    if (variable.key === "elevation") return `${Number(val).toFixed(0)} m`;
    if (variable.key === "flood_occurrence") return `${Number(val).toFixed(1)}%`;
    if (variable.key === "rainfall") return formatRainfall(val);
    if (variable.key === "rainfall_anomaly") {
      const pct = Number(val);
      return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
    }
    if (variable.key === "drought_index") {
      return `${Number(val).toFixed(2)} SPI (${getDroughtSpiCategory(val)})`;
    }
    if (variable.key === "lst") return `${Number(val).toFixed(1)} °C`;
    if (variable.key === "ndvi") return Number(val).toFixed(3);
    return formatNumber(val);
  }

  // Synchronous ref updates — run on every render so Leaflet handlers always read current state.
  styleLgaFeatureRef.current = styleLgaFeature;
  resolveFeatureRef.current = resolveFeature;
  formatHoverValueRef.current = formatHoverValue;
  variableKeyRef.current = variable.key;
  ciLookupRef.current = ciLookup;

  function styleWardFeature() {
    return {
      color: "#d9b25f",
      weight: currentZoom >= 12 ? 0.9 : 0.55,
      fillColor: "transparent",
      fillOpacity: 0,
      opacity: currentZoom >= 12 ? 0.9 : 0.55,
      dashArray: currentZoom >= 12 ? "" : "3",
    };
  }

  function onEachLgaFeature(feature, layer) {
    layer.bindTooltip("", { sticky: true, direction: "top", className: "kccc-atlas-lga-tooltip" });
    layer.on({
      mouseover: (event) => {
        // Raster-overlay modes (LULC, elevation terrain-detail) use transparent fills.
        // Never apply an opaque fillOpacity that would obscure underlying tiles or
        // be mistaken for a land-cover class — use outline highlight only.
        const rasterMode = variableKeyRef.current === "annual_lulc" ||
          variableKeyRef.current === "elevation";
        event.target.setStyle({ weight: 3, color: "#030454", fillOpacity: rasterMode ? 0 : 0.82 });
        event.target.bringToFront?.();
        const resolved = resolveFeatureRef.current(feature);
        const valStr = formatHoverValueRef.current(resolved);
        // CI status line — 1 line max, backend wording only, silent when no data.
        const lookup = ciLookupRef.current;
        const ciItem = lookup[resolved.metric?.admin_code] || lookup[normalizeName(resolved.name)] || null;
        const overallStatus = ciItem?.summary?.overall_status;
        const ciLine = overallStatus
          ? `<br/><span style="font-weight:400;font-size:10px;color:#94a3b8">${overallStatus}</span>`
          : "";
        layer.setTooltipContent(
          `<strong>${resolved.name}</strong><br/><span style="font-weight:400;font-size:11px">${valStr}</span>${ciLine}`
        );
      },
      // Read from ref so this always uses the current style function, never a stale closure.
      mouseout: (event) => {
        event.target.setStyle(styleLgaFeatureRef.current(feature));
      },
      click: (event) => {
        setSelectedWard(null);
        setSelectedLgaFeature(feature);
        event.target.bringToFront?.();
      },
    });
  }

  function onEachWardFeature(feature, layer) {
    const wardName = getWardName(feature);
    const lgaName = getWardLgaName(feature);

    layer.bindTooltip(`<strong>${wardName}</strong><br/><span style="font-size:11px">${lgaName}</span>`, {
      sticky: true,
      direction: "top",
    });

    layer.on({
      mouseover: (event) => {
        event.target.setStyle({ weight: 2, color: "#F3F74B", fillOpacity: 0.08, fillColor: "#F3F74B" });
        event.target.bringToFront?.();
      },
      mouseout: (event) => event.target.setStyle(styleWardFeature(feature)),
      click: () => {
        setSelectedLgaFeature(null);
        setSelectedWard({ wardName, lgaName });
      },
    });
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-white font-['DM_Sans'] text-[#030454]">
      <style>{`
        .kccc-atlas-lga-tooltip {
          background: rgba(3, 4, 84, 0.92);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 6px;
          color: #fff;
          font-family: inherit;
          font-size: 12px;
          font-weight: 700;
          padding: 5px 10px;
          pointer-events: none;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
          white-space: nowrap;
        }
        .kccc-atlas-lga-tooltip::before {
          display: none;
        }
        .kccc-label-state span {
          color: #030454;
          font-size: 16px;
          font-weight: 900;
          text-shadow: 0 1px 3px white, 0 1px 8px white;
          white-space: nowrap;
        }
        .kccc-label-lga span {
          color: #030454;
          font-size: 11px;
          font-weight: 900;
          text-shadow: 0 1px 3px white, 0 1px 8px white;
          white-space: nowrap;
        }
        .kccc-label-ward span {
          color: #3b2f00;
          font-size: 9px;
          font-weight: 800;
          text-shadow: 0 1px 3px white, 0 1px 8px white;
          white-space: nowrap;
        }
      `}</style>

      <header className={`flex h-12 shrink-0 items-center justify-between border-b border-[#E6EAEC] bg-white px-5${isExportMode ? " hidden" : ""}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[#030454] text-xs font-black text-white">KS</div>
          <h1 className="text-sm font-black">Kaduna Interactive Climate Atlas - KCCC</h1>
        </div>

        <div className="text-center text-sm font-black text-[#030454]">
          {variable.key === "elevation"
            ? (isElevationPublic
              ? "Elevation LGA Summary — SRTM approximately 2000"
              : ELEVATION_INTERNAL_CONFIG.displayLabel)
            : variable.key === "flood_occurrence"
              ? (isFloodPublic
                ? "Historical Surface Water Occurrence — 1984–2021 archive"
                : FLOOD_OCCURRENCE_INTERNAL_CONFIG.displayLabel)
              : variable.label}
        </div>

        <div className="flex items-center gap-2">
          <a href="/public/climate-risk" className="rounded-full bg-[#F7F9FA] px-3 py-1 text-xs font-black hover:bg-[#DFE3E4]">&lt; Back to Climate Intelligence</a>
          <a href="/public/reports" className="rounded-full bg-[#F7F9FA] px-3 py-1 text-xs font-black hover:bg-[#DFE3E4]">Reports</a>
          <a href="/public/projects" className="rounded-full bg-[#F7F9FA] px-3 py-1 text-xs font-black hover:bg-[#DFE3E4]">Projects</a>
          <span className="rounded-full bg-[#009B35]/10 px-3 py-1 text-xs font-black text-[#009B35]">
            Database-backed climate data
          </span>
        </div>
      </header>

      <section className="flex min-h-0 flex-1">
        <aside className={`relative flex h-full shrink-0 flex-col border-r border-[#E6EAEC] bg-white transition-all duration-300 ${sidebarOpen ? "w-[300px]" : "w-[42px]"}${isExportMode ? " hidden" : ""}`}>
          <button
            type="button"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            title={sidebarOpen ? "Collapse" : "Expand"}
            onClick={() => setSidebarOpen((v) => !v)}
            className="absolute -right-5 top-7 z-[950] flex h-11 w-11 items-center justify-center rounded-full border border-[#D8DDE2] bg-white text-[#030454] shadow hover:bg-[#F7F9FA]"
          >
            {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>

          {sidebarOpen && (
            <>
              <div className="shrink-0 border-b border-[#E6EAEC] px-5 py-5">
                <h2 className="text-lg font-black text-[#8A0028]">KCCC Climate Atlas</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Select climate variables and view Kaduna LGA-level map intelligence.</p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pb-6">
                <IndicatorSelect
                  value={config.variableKey}
                  onChange={handleVariableChange}
                  options={availableVariables}
                />

                <div className="border-b border-[#E6EAEC] px-5 pb-3 pt-1">
                  {variable.key === "annual_lulc" ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5">
                      <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">Internal Preview</p>
                      <p className="mt-1 text-[10px] leading-4 text-amber-700">
                        Not Published · Not Yet Validated
                      </p>
                      <p className="mt-1.5 text-[10px] leading-4 text-amber-600">
                        {ANNUAL_LULC_INTERNAL_CONFIG.scientificCaution}
                      </p>
                      {lulcData?.dataset && (
                        <p className="mt-1.5 text-[10px] leading-4 text-amber-600">
                          Dataset: {lulcData.dataset.year} · {lulcData.dataset.method_version} · {lulcData.dataset.snapshot_count ?? lulcData.results?.length ?? 0} LGAs
                          {lulcData.quality_summary && (
                            <> · {lulcData.quality_summary.high}H / {lulcData.quality_summary.medium}M / {lulcData.quality_summary.low}L</>
                          )}
                        </p>
                      )}
                    </div>
                  ) : variable.key === "flood_occurrence" ? (
                    isFloodPublic ? (
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-600">Historical Surface Water Occurrence — 1984–2021 archive</p>
                        <p className="mt-1 text-[10px] leading-4 text-slate-600">
                          JRC Global Surface Water v1.4
                        </p>
                        <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
                          Percentage of the 1984–2021 Landsat observation period that open surface water was detected per LGA. Not a flood hazard assessment, not real-time monitoring, not a prediction, and not a vulnerability indicator.
                        </p>
                        {floodOccurrenceData?.results && (
                          <p className="mt-1.5 text-[10px] leading-4 text-slate-400">
                            {floodOccurrenceData.results.length} LGAs loaded
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5">
                        <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">Internal Preview</p>
                        <p className="mt-1 text-[10px] leading-4 text-amber-700">
                          Not Published · Static Archive · 1984–2021
                        </p>
                        <p className="mt-1.5 text-[10px] leading-4 text-amber-600">
                          {FLOOD_OCCURRENCE_INTERNAL_CONFIG.scientificCaution}
                        </p>
                        {floodOccurrenceData?.results && (
                          <p className="mt-1.5 text-[10px] leading-4 text-amber-600">
                            Dataset: JRC GSW v1.4 · {floodOccurrenceData.results.length} LGAs loaded
                          </p>
                        )}
                      </div>
                    )
                  ) : variable.key === "elevation" ? (
                    isElevationPublic ? (
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-600">Elevation LGA Summary — SRTM approximately 2000</p>
                        <p className="mt-1 text-[10px] leading-4 text-slate-600">
                          SRTM ~2000 · Static satellite-derived terrain
                        </p>
                        <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
                          Mean LGA terrain elevation from the USGS SRTMGL1 v003 dataset (~30 m source resolution). Static terrain context only — not a climate variable, not a hazard indicator, and not survey-grade ground truth.
                        </p>
                        {elevationData?.results && (
                          <p className="mt-1.5 text-[10px] leading-4 text-slate-400">
                            {elevationData.results.length} LGAs loaded
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5">
                        <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">Internal Preview</p>
                        <p className="mt-1 text-[10px] leading-4 text-amber-700">
                          Not Published · Not Active · Static DEM
                        </p>
                        <p className="mt-1.5 text-[10px] leading-4 text-amber-600">
                          {ELEVATION_INTERNAL_CONFIG.scientificCaution}
                        </p>
                        {elevationData?.results && elevationDisplayMode === "lga_summary" && (
                          <p className="mt-1.5 text-[10px] leading-4 text-amber-600">
                            Dataset: USGS SRTMGL1 v003 · {elevationData.results.length} LGAs loaded
                          </p>
                        )}
                        {elevationDisplayMode === "terrain_detail" && elevationTileUrl && (
                          <p className="mt-1.5 text-[10px] leading-4 text-amber-600">
                            SRTM raster loaded · click map to sample a terrain cell
                          </p>
                        )}
                        {elevationDisplayMode === "terrain_detail" && !elevationTileUrl && (
                          <p className="mt-1.5 text-[10px] leading-4 text-slate-400">
                            Terrain Detail requires GEE credentials.
                          </p>
                        )}
                      </div>
                    )
                  ) : (
                    (() => {
                      const planned = [
                        ...(!INTERNAL_FLOOD_PREVIEW_PARAM ? ["flood hazard"] : []),
                        ...(!INTERNAL_LULC_PREVIEW_PARAM ? ["annual land use / land cover (2018-present)"] : []),
                      ];
                      return planned.length > 0 ? (
                        <p className="text-[10px] leading-5 text-slate-400">
                          Planned indicators: {planned.join(" and ")}.
                        </p>
                      ) : null;
                    })()
                  )}
                  {variable.key !== "annual_lulc" && variableConfig?.scientificCaution && (
                    <p className="mt-2 text-[10px] leading-4 text-slate-400">
                      {variableConfig.scientificCaution}
                    </p>
                  )}
                  {variable.key === "ndvi" && variableConfig?.popup?.sourceHelp && (
                    <p className="mt-2 text-[10px] leading-4 text-slate-400">
                      {variableConfig.popup.sourceHelp}
                    </p>
                  )}
                </div>

                {variable.key === "annual_lulc" ? (
                  <div className="border-b border-[#E6EAEC] px-5 py-4">
                    <p className="mb-1 text-xs font-bold text-slate-600">Composite window</p>
                    <p className="text-sm font-black">Late Wet Season (Sep–Oct)</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">Fixed · dw_latewet_mode_v1</p>
                  </div>
                ) : variable.key === "flood_occurrence" ? (
                  <div className="border-b border-[#E6EAEC] px-5 py-4">
                    <p className="mb-1 text-xs font-bold text-slate-600">Coverage</p>
                    <p className="text-sm font-black">1984–2021 archive</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">Static product · annual (not seasonal)</p>
                  </div>
                ) : variable.key === "elevation" ? (
                  <div className="border-b border-[#E6EAEC] px-5 py-4">
                    <p className="mb-1 text-xs font-bold text-slate-600">Season</p>
                    <p className="text-sm font-black">Static topographic layer</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">Not seasonal · SRTM ~2000</p>
                  </div>
                ) : (
                  <SelectField label="Season" value={config.season} onChange={(value) => updateConfig("season", value)}>
                    {SEASONS.map((item) => <option key={item}>{item}</option>)}
                  </SelectField>
                )}

                {variable.key === "annual_lulc" ? (
                  <SelectField label="Dataset year" value={config.period} onChange={updatePeriod}>
                    {variablePeriods.map((p) => <option key={p.id} value={p.label}>{p.label}</option>)}
                  </SelectField>
                ) : variable.key === "flood_occurrence" ? (
                  <div className="border-b border-[#E6EAEC] px-5 py-4">
                    <p className="mb-1 text-xs font-bold text-slate-600">Archive period</p>
                    <p className="text-sm font-black">1984–2021</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">JRC GSW v1.4 · 30 m Landsat</p>
                  </div>
                ) : variable.key === "elevation" ? (
                  <div className="border-b border-[#E6EAEC] px-5 py-4">
                    <p className="mb-1 text-xs font-bold text-slate-600">Dataset year</p>
                    <p className="text-sm font-black">2000</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">USGS SRTMGL1 v003 · 30 m · NASA SRTM mission</p>
                  </div>
                ) : (
                  <SelectField label="Period" value={config.period} onChange={updatePeriod}>
                    {variablePeriods.map((p) => <option key={p.id} value={p.label}>{p.label}</option>)}
                  </SelectField>
                )}

                {variable.key === "elevation" && (isElevationPublic || INTERNAL_ELEVATION_PREVIEW_PARAM) && (
                  <div className="border-b border-[#E6EAEC] px-5 py-4">
                    <p className="mb-2 text-xs font-bold text-slate-600">Display mode</p>
                    <div className="flex gap-2">
                      {[
                        { value: "lga_summary", label: "LGA Summary" },
                        { value: "terrain_detail", label: "Terrain Detail (30 m)" },
                      ].map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setElevationDisplayMode(value)}
                          className={`flex-1 rounded-md border px-2 py-1.5 text-[10px] font-bold transition-colors ${
                            elevationDisplayMode === value
                              ? "border-amber-700 bg-amber-700 text-white"
                              : "border-[#D8DDE2] bg-white text-slate-600 hover:bg-[#F7F9FA]"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-400">
                      {elevationDisplayMode === "lga_summary"
                        ? "LGA mean elevation choropleth · click an LGA for statistics."
                        : "SRTM 30 m raster · click the map to sample a terrain cell."}
                    </p>
                  </div>
                )}

                {variable.key === "annual_lulc" && INTERNAL_LULC_PREVIEW_PARAM && (
                  <div className="border-b border-[#E6EAEC] px-5 py-4">
                    <p className="mb-2 text-xs font-bold text-slate-600">Map style</p>
                    <div className="flex gap-2">
                      {[
                        { value: "cartographic", label: "Atlas view" },
                        { value: "raw", label: "Raw Dynamic World" },
                      ].map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          disabled={!lulcTileUrl}
                          onClick={() => setLulcDisplayMode(value)}
                          title={!lulcTileUrl ? "GEE tile service required" : undefined}
                          className={`flex-1 rounded-md border px-2 py-1.5 text-[10px] font-bold transition-colors ${
                            !lulcTileUrl
                              ? "cursor-not-allowed border-[#D8DDE2] bg-[#F7F9FA] text-slate-400"
                              : lulcDisplayMode === value
                              ? "border-[#030454] bg-[#030454] text-white"
                              : "border-[#D8DDE2] bg-white text-slate-600 hover:bg-[#F7F9FA]"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-400">
                      {!lulcTileUrl
                        ? "GEE tile service unavailable — raster modes disabled."
                        : lulcDisplayMode === "cartographic"
                        ? "Generalized display for readability."
                        : "Unfiltered pixel classification for technical inspection."}
                    </p>
                  </div>
                )}

                <div className="border-b border-[#E6EAEC] px-5 py-5">
                  <div className="mb-3 flex justify-between text-sm">
                    <span className="font-bold text-slate-600">Overlay opacity</span>
                    <strong>{Math.round(config.opacity * 100)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="0.9"
                    step="0.05"
                    value={config.opacity}
                    onChange={(event) => updateConfig("opacity", Number(event.target.value))}
                    className="w-full accent-[#1d9e75]"
                  />
                </div>
              </div>

              {variable.key === "elevation" && elevationDisplayMode === "terrain_detail" && (
                <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-5 py-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-amber-700">Selected Point · Terrain Detail</p>
                  {elevationPointLoading && (
                    <p className="mt-1 text-[10px] text-slate-500">Sampling SRTM…</p>
                  )}
                  {!elevationPointLoading && !elevationPointSample && (
                    <p className="mt-1 text-[10px] text-slate-500">Click within Kaduna State to sample a terrain cell.</p>
                  )}
                  {!elevationPointLoading && elevationPointSample && (
                    <div className="mt-1.5 space-y-1.5">
                      <div className="rounded-md bg-white p-2.5">
                        <p className="text-[9px] text-slate-400">SRTM cell elevation</p>
                        <p className="mt-0.5 text-sm font-black text-slate-800">{Number(elevationPointSample.elevation_m).toFixed(0)} m</p>
                        <p className="text-[9px] text-slate-400">above sea level</p>
                      </div>
                      <div className="rounded-md bg-white p-2.5 text-[10px] text-slate-500">
                        <p>Lat: {Number(elevationPointSample.lat).toFixed(5)}° · Lng: {Number(elevationPointSample.lng).toFixed(5)}°</p>
                        <p>Source: {elevationPointSample.source}</p>
                        <p>Resolution: {elevationPointSample.source_resolution}</p>
                        <p>Acquisition: ~{elevationPointSample.acquisition_year} (static DEM)</p>
                      </div>
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[9px] text-amber-700">
                        {elevationPointSample.caution}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedLga && variable.key !== "elevation" || (selectedLga && variable.key === "elevation" && elevationDisplayMode === "lga_summary") ? (
                <div className="shrink-0 max-h-[24rem] overflow-y-auto border-t border-[#173B91]/20 bg-[#F7F9FA] px-5 py-3">
                  {/* LGA name + layer value */}
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#173B91]">Selected LGA</p>
                      <p className="mt-0.5 truncate text-xs font-black text-slate-800">{selectedLga.name}</p>
                      {hasValue(selectedLga.value) && variable.key !== "annual_lulc" && (
                        <p className="mt-0.5 text-[10px]">
                          <span className="font-bold text-[#030454]">{formatHoverValue(selectedLga)}</span>
                          <span className="ml-1.5 text-[9px] text-slate-400">
                            {variable.key === "elevation"
                              ? (isElevationPublic ? "Elevation LGA Summary — SRTM approximately 2000" : ELEVATION_INTERNAL_CONFIG.displayLabel)
                              : variable.key === "flood_occurrence"
                                ? (isFloodPublic ? "Historical Surface Water Occurrence — 1984–2021 archive" : FLOOD_OCCURRENCE_INTERNAL_CONFIG.displayLabel)
                                : variable.label}
                          </span>
                        </p>
                      )}
                      {variable.key === "annual_lulc" && selectedLga.lulcSnap && (
                        <p className="mt-0.5 text-[10px]">
                          <span className="font-bold capitalize text-[#030454]">{selectedLga.lulcSnap.dominant_label || selectedLga.lulcSnap.dominant_class}</span>
                          {selectedLga.lulcSnap.dominant_pct != null && (
                            <span className="ml-1.5 text-[9px] text-slate-400">{Number(selectedLga.lulcSnap.dominant_pct).toFixed(1)}% dominant</span>
                          )}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedLgaFeature(null)}
                      className="mt-0.5 shrink-0 text-base font-bold leading-none text-slate-400 hover:text-slate-600"
                      aria-label="Deselect LGA"
                    >
                      ×
                    </button>
                  </div>
                  {/* Climate indicators summary */}
                  <div className="border-t border-[#E6EAEC] pt-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Climate indicators</p>
                      <span className="text-[8px] font-bold text-slate-300">Rule-based</span>
                    </div>
                    <CICardBody ciItem={selectedLgaCiItem} ciLoading={ciLoading} showLulc={INTERNAL_LULC_PREVIEW_PARAM} />
                  </div>
                  {/* Profile details toggle */}
                  <div className="mt-2 border-t border-[#E6EAEC] pt-2">
                    <button
                      type="button"
                      onClick={() => setCiProfileOpen((v) => !v)}
                      className="flex w-full items-center justify-between text-[9px] font-black uppercase tracking-wide text-[#173B91] hover:text-[#009B35]"
                    >
                      <span>Profile details</span>
                      <span>{ciProfileOpen ? "^" : "v"}</span>
                    </button>
                    {ciProfileOpen && (
                      <div className="mt-2">
                        <CIProfilePanel
                          profile={ciProfile}
                          loading={ciProfileLoading}
                          error={ciProfileError}
                          showLulc={INTERNAL_LULC_PREVIEW_PARAM}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ): null}
            </>
          )}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div ref={captureRef} className="relative min-h-0 flex-1">
          <div className="absolute left-0 right-0 top-0 z-[800] border-b border-[#E6EAEC] bg-white/95 px-5 py-2 text-center text-sm backdrop-blur">
            {variable.key === "annual_lulc" ? (
              <>
                Data source: <strong>Dynamic World v1 · Sep–Oct composite</strong>
                <span className="mx-2 text-slate-400">|</span>
                Period: <strong>{lulcData?.dataset?.year ?? (config.year > 0 ? config.year : "resolving...")}</strong>
                <span className="mx-2 text-slate-400">|</span>
                Composite window: <strong>Late Wet Season (Sep–Oct)</strong>
                <span className="mx-2 text-slate-400">|</span>
                Zoom: <strong>{currentZoom}</strong>
                <span className="mx-2 text-slate-400">|</span>
                <span className="text-amber-600 font-bold">INTERNAL PREVIEW</span>
              </>
            ) : variable.key === "flood_occurrence" ? (
              <>
                Data source: <strong>JRC Global Surface Water v1.4</strong>
                <span className="mx-2 text-slate-400">|</span>
                Archive: <strong>1984–2021 · Static</strong>
                <span className="mx-2 text-slate-400">|</span>
                Metric: <strong>Mean occurrence %</strong>
                <span className="mx-2 text-slate-400">|</span>
                Zoom: <strong>{currentZoom}</strong>
                {!isFloodPublic && (
                  <><span className="mx-2 text-slate-400">|</span><span className="text-amber-600 font-bold">INTERNAL PREVIEW</span></>
                )}
              </>
            ) : variable.key === "elevation" ? (
              <>
                Data source: <strong>USGS SRTMGL1 v003</strong>
                <span className="mx-2 text-slate-400">|</span>
                Period: <strong>~2000 · Static DEM</strong>
                <span className="mx-2 text-slate-400">|</span>
                Metric: <strong>Mean elevation (m)</strong>
                <span className="mx-2 text-slate-400">|</span>
                Zoom: <strong>{currentZoom}</strong>
                {!isElevationPublic && (
                  <><span className="mx-2 text-slate-400">|</span><span className="text-amber-600 font-bold">INTERNAL PREVIEW</span></>
                )}
              </>
            ) : (
              <>
                Data source: <strong>{activeDataSource}</strong>
                <span className="mx-2 text-slate-400">|</span>
                Period: <strong>{config.period}</strong>
                <span className="mx-2 text-slate-400">|</span>
                Statistic: <strong>{variableStatistic}</strong>
                <span className="mx-2 text-slate-400">|</span>
                Zoom: <strong>{currentZoom}</strong>
              </>
            )}
          </div>

          {error ? (
            <div className="flex h-full items-center justify-center text-red-700">{error}</div>
          ) : !lgaGeoJson ? (
            <div className="flex h-full items-center justify-center text-slate-500">Loading Kaduna atlas...</div>
          ) : (
            <>
              <MapContainer center={KADUNA_CENTER} zoom={KADUNA_ZOOM} minZoom={6} maxZoom={15} zoomControl={false} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
                <ZoomWatcher onZoomChange={setCurrentZoom} />
                <MapResizer layoutKey={layoutKey} />

                {baseMap === "satellite" && (
                  <TileLayer
                    attribution="Esri World Imagery"
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  />
                )}

                {baseMap === "light" && (
                  <TileLayer
                    attribution="CartoDB Positron"
                    url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
                  />
                )}

                {baseMap === "dark" && (
                  <TileLayer
                    attribution="CartoDB Dark"
                    url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                  />
                )}

                {baseMap === "streets" && (
                  <TileLayer
                    attribution="OpenStreetMap"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                )}

                {baseMap === "terrain" && (
                  <TileLayer
                    attribution="OpenTopoMap"
                    url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                  />
                )}

                {variable.key === "annual_lulc" && lulcTileUrl && (
                  <TileLayer
                    key={lulcTileUrl}
                    url={lulcTileUrl}
                    attribution="Dynamic World v1 · Google / WRI · Google Earth Engine"
                    opacity={config.opacity}
                  />
                )}

                {variable.key === "elevation" && elevationDisplayMode === "terrain_detail" && elevationTileUrl && (
                  <TileLayer
                    key={elevationTileUrl}
                    url={elevationTileUrl}
                    attribution="USGS SRTMGL1 v003 · NASA SRTM · Google Earth Engine"
                    opacity={config.opacity}
                  />
                )}

                {variable.key === "elevation" && elevationDisplayMode === "terrain_detail" && (isElevationPublic || INTERNAL_ELEVATION_PREVIEW_PARAM) && (
                  <ElevationMapClickHandler onPointClick={handleElevationPointClick} />
                )}

                <FitBounds geoJson={stateGeoJson || lgaGeoJson} />

                <GeoJSON
                  key={`lga-${config.variableKey}-${config.year}-${config.season}-${config.opacity}-${profiles.length}-${remoteStats.length}-${lulcData?.results?.length ?? 0}-${lulcTileUrl ? "tile" : "no-tile"}-${lulcDisplayMode}-${floodOccurrenceData?.results?.length ?? 0}-${elevationData?.results?.length ?? 0}-${elevationDisplayMode}`}
                  data={lgaGeoJson}
                  style={styleLgaFeature}
                  onEachFeature={onEachLgaFeature}
                />

                {stateGeoJson && (
                  <GeoJSON key="state-boundary" data={stateGeoJson} style={styleStateBoundary} />
                )}

                {wardGeoJson && wardsVisible && (
                  <GeoJSON
                    key={`wards-${currentZoom}`}
                    data={wardGeoJson}
                    style={styleWardFeature}
                    onEachFeature={onEachWardFeature}
                  />
                )}

                <BoundaryLabels
                  stateGeoJson={stateGeoJson}
                  lgaGeoJson={lgaGeoJson}
                  wardGeoJson={wardGeoJson}
                  zoom={currentZoom}
                  showWards={wardsVisible}
                />

                {!isExportMode && (
                  <AtlasMapTools
                    stateGeoJson={stateGeoJson}
                    lgaGeoJson={lgaGeoJson}
                    showGrid={showGrid}
                    setShowGrid={setShowGrid}
                    showWards={showWards}
                    setShowWards={setShowWards}
                    isFullscreen={isFullscreen}
                    setIsFullscreen={setIsFullscreen}
                    onToolMessage={setToolMessage}
                    onCapture={captureAtlasLayout}
                  />
                )}
              </MapContainer>

              {!isExportMode && <BasemapSwitcher baseMap={baseMap} setBaseMap={setBaseMap} />}

              {!isExportMode && showGrid && (
                <div className="pointer-events-none absolute inset-0 z-[850] bg-[linear-gradient(rgba(3,4,84,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(3,4,84,0.16)_1px,transparent_1px)] bg-[size:64px_64px]" />
              )}

              {!isExportMode && toolMessage && (
                <div className="absolute bottom-32 left-1/2 z-[930] -translate-x-1/2 rounded-md bg-[#030454] px-4 py-2 text-xs font-bold text-white shadow-lg">
                  {toolMessage}
                </div>
              )}

              <div className="absolute bottom-24 left-6 z-[900] w-[300px] rounded-md border border-[#D8DDE2] bg-white p-3 shadow-lg">
                <div className="mb-2 flex justify-between text-xs font-bold text-slate-600">
                  <span>{variable.key === "annual_lulc" ? `Annual LULC · ${lulcData?.dataset?.year ?? config.year}` : variable.key === "flood_occurrence" ? "Historical Surface Water Occurrence — 1984–2021 archive" : variable.key === "elevation" ? "Elevation LGA Summary — SRTM approximately 2000" : variable.label}</span>
                  <span>{variable.key === "annual_lulc" ? "" : variable.unit}</span>
                </div>
                {variable.key === "elevation" ? (
                  <>
                    <div className="flex h-3 overflow-hidden rounded-full">
                      {["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"].map((c) => (
                        <div key={c} className="flex-1" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    {elevationDisplayMode === "terrain_detail" ? (
                      <>
                        <div className="mt-2 flex justify-between text-xs text-slate-500">
                          <span>400 m</span><span>550</span><span>700</span><span>850</span><span>≥1000 m</span>
                        </div>
                        <p className="mt-2 text-[10px] text-amber-600">
                          SRTM Raster · Kaduna · raster visualization · source 30 m
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="mt-2 flex justify-between text-xs text-slate-500">
                          <span>&lt;550 m</span><span>550</span><span>650</span><span>750</span><span>≥850 m</span>
                        </div>
                        <p className="mt-2 text-[10px] text-slate-400">
                          {isElevationPublic ? "Mean elevation · metres above sea level · SRTM ~30 m" : "Internal preview · Mean elevation · metres above sea level · SRTM 30 m"}
                        </p>
                      </>
                    )}
                  </>
                ) : variable.key === "flood_occurrence" ? (
                  <>
                    <div className="flex h-3 overflow-hidden rounded-full">
                      {["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#084594"].map((c) => (
                        <div key={c} className="flex-1" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-slate-500">
                      <span>0%</span>
                      <span>5%</span>
                      <span>15%</span>
                      <span>30%</span>
                      <span>60%+</span>
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400">
                      {isFloodPublic ? "JRC GSW v1.4 · 1984–2021 archive" : "Internal preview · JRC GSW v1.4 · 1984–2021 archive"}
                    </p>
                  </>
                ) : variable.key === "annual_lulc" ? (
                  <>
                    <div className="grid grid-cols-1 gap-1 text-[10px] text-slate-600">
                      {Object.entries(lulcClasses).map(([cls, { label, color }]) => (
                        <div key={cls} className="flex items-center gap-2">
                          <span className="h-3 w-4 shrink-0 rounded-sm border border-slate-200" style={{ backgroundColor: color }} />
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-amber-600">
                      Internal preview · Sep–Oct composite · Dynamic World v1
                      {lulcDisplayMode === "cartographic"
                        ? " · Atlas view (generalized)"
                        : " · Raw Dynamic World (unfiltered)"}
                    </p>
                  </>
                ) : legendState?.type === "drought_index" ? (
                  <>
                    <div className="grid grid-cols-1 gap-1 text-[10px] text-slate-600">
                      {legendState.rows.map(([color, range, label]) => (
                        <div key={range} className="flex items-center gap-2">
                          <span className="h-3 w-4 rounded-sm border border-slate-200" style={{ backgroundColor: color }} />
                          <span className="w-28 font-bold">{range}</span>
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400">{legendState.caption}</p>
                  </>
                ) : legendState ? (
                  <>
                    <div
                      className="h-3 rounded-full"
                      style={{ background: `linear-gradient(to right, ${legendState.colors.join(", ")})` }}
                    />
                    <div className="mt-2 flex justify-between text-xs text-slate-500">
                      {legendState.labels.map((lbl, i) => <span key={i}>{lbl}</span>)}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400">{legendState.caption}</p>
                  </>
                ) : (
                  <>
                    <div className="h-3 rounded-full bg-gradient-to-r from-[#1d9e75] via-[#f59e0b] to-[#b91c1c]" />
                    <div className="mt-2 flex justify-between text-xs text-slate-500">
                      <span>Low</span>
                      <span>High</span>
                    </div>
                  </>
                )}
              </div>

              {!isExportMode && (
                <div className="absolute top-[44px] left-6 z-[900] rounded-md border border-[#D8DDE2] bg-white px-4 py-2 text-xs font-bold shadow">
                  {wardsVisible ? "Click any ward or LGA for profile" : "Zoom in to reveal wards"}
                </div>
              )}

              {!isExportMode && variable.key === "annual_lulc" && INTERNAL_LULC_PREVIEW_PARAM && lulcData !== null && !lulcTileUrl && (
                <div className="absolute inset-x-16 top-20 z-[901] rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-center shadow-xl">
                  <p className="text-sm font-black text-amber-900">Dynamic World raster unavailable in this environment.</p>
                  <p className="mt-1.5 text-xs leading-5 text-amber-800">
                    Configure the approved GEE tile service or use a pre-generated raster tile source to enable raster LULC display.
                  </p>
                  <p className="mt-1.5 text-[10px] leading-4 text-amber-700">
                    LGA boundaries remain visible for spatial reference. No land-cover fill is shown — dominant-class LGA attributes are not a raster substitute.
                  </p>
                </div>
              )}

            </>
          )}
          </div>

          {!isExportMode && variable.key === "elevation" && (isElevationPublic || INTERNAL_ELEVATION_PREVIEW_PARAM) && (
            elevationData?.results?.length > 0 ? (
              isElevationPublic ? (
                <div role="status" className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-bold text-slate-700">
                  Elevation LGA Summary — SRTM approximately 2000 · {elevationData.results.length} LGAs · USGS SRTMGL1 v003 · satellite-derived terrain context · not survey-grade
                </div>
              ) : (
                <div role="status" className="flex shrink-0 items-center gap-2 border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-xs font-bold text-amber-800">
                  Elevation internal preview — {elevationData.results.length} LGAs · USGS SRTMGL1 v003 · ~2000 · Static DEM · Not published
                </div>
              )
            ) : elevationData !== null ? (
              <div role="status" className="flex shrink-0 items-center gap-2 border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-xs font-bold text-amber-800">
                No elevation data found. Run sync_elevation first.
              </div>
            ) : null
          )}

          {!isExportMode && variable.key === "flood_occurrence" && (isFloodPublic || INTERNAL_FLOOD_PREVIEW_PARAM) && (
            floodOccurrenceData?.results?.length > 0 ? (
              isFloodPublic ? (
                <div role="status" className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-bold text-slate-700">
                  Historical Surface Water Occurrence — 1984–2021 archive · {floodOccurrenceData.results.length} LGAs · JRC GSW v1.4 · static archive · not real-time
                </div>
              ) : (
                <div role="status" className="flex shrink-0 items-center gap-2 border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-xs font-bold text-amber-800">
                  Flood occurrence internal preview — {floodOccurrenceData.results.length} LGAs · JRC GSW v1.4 · 1984–2021 · Static archive · Not published
                </div>
              )
            ) : floodOccurrenceData !== null ? (
              <div role="status" className="flex shrink-0 items-center gap-2 border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-xs font-bold text-amber-800">
                No flood occurrence data found. Run sync_flood_occurrence first.
              </div>
            ) : null
          )}

          {!isExportMode && variable.key === "annual_lulc" && INTERNAL_LULC_PREVIEW_PARAM && (
            lulcData?.results?.length > 0 ? (
              <div role="status" className="flex shrink-0 items-center gap-2 border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-xs font-bold text-amber-800">
                LULC internal preview — {lulcData.results.length} LGAs · {lulcData.dataset?.year} · Not published · Not validated
              </div>
            ) : lulcData !== null ? (
              <div role="status" className="flex shrink-0 items-center gap-2 border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-xs font-bold text-amber-800">
                No LULC data found for {config.year}. Try year 2024.
              </div>
            ) : null
          )}

          {!isExportMode && variable.source === "remote_sensing" && !remoteStatsLoading && (
            remoteStatsError ? (
              <div role="alert" className="flex shrink-0 items-center gap-2 border-t border-red-200 bg-red-50 px-5 py-2.5 text-xs font-bold text-red-800">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                Could not load {variable.label} data - check your connection or session.
              </div>
            ) : remoteStats.length === 0 ? (
              <div role="status" className="flex shrink-0 items-center gap-2 border-t border-amber-200 bg-amber-50 px-5 py-2.5 text-xs font-bold text-amber-800">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
                {getAtlasStatusBarNoDataMessage(variable.key, { isNdviLandsat })}
              </div>
            ) : remoteStats.length < totalLgaCount ? (
              <div role="status" className="flex shrink-0 items-center gap-2 border-t border-blue-100 bg-[#EEF3FF] px-5 py-2.5 text-xs font-bold text-[#173B91]">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                </svg>
                {variable.label} data available for {remoteStats.length} of {totalLgaCount} LGAs.
              </div>
            ) : null
          )}
        </section>
        {!isExportMode && (selectedLga || selectedWard) && (
          <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-[#E6EAEC] bg-white">
            {selectedLga && (
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#009B35]">LGA profile</p>
                  <button type="button" aria-label="Close LGA profile" onClick={() => setSelectedLgaFeature(null)} className="rounded p-0.5 text-slate-400 hover:text-slate-600"><X size={16} /></button>
                </div>
                <h3 className="mt-1 text-xl font-black">{selectedLga.name}</h3>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  {variable.key === "elevation" ? (
                    selectedLga.elevSnap ? (
                      <>
                        <div className={`col-span-2 rounded-md p-3 text-xs ${isElevationPublic ? "bg-slate-50" : "bg-amber-50"}`}>
                          <p className={`font-black uppercase tracking-wide ${isElevationPublic ? "text-slate-600" : "text-amber-700"}`}>
                            {isElevationPublic ? "Elevation LGA Summary — SRTM approximately 2000" : "Elevation"}
                          </p>
                          <p className={`mt-0.5 ${isElevationPublic ? "text-slate-500" : "text-amber-600"}`}>USGS SRTMGL1 v003 · ~2000 SRTM · 30 m</p>
                        </div>
                        <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3">
                          Mean elevation<br />
                          <strong className="text-lg">{Number(selectedLga.elevSnap.mean_value).toFixed(0)} m</strong>
                          <span className="ml-2 text-xs font-normal text-slate-500">above sea level</span>
                        </div>
                        {selectedLga.elevSnap.metadata?.min_elevation_m != null && (
                          <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                            Minimum elevation<br /><strong>{Number(selectedLga.elevSnap.metadata.min_elevation_m).toFixed(0)} m</strong>
                          </div>
                        )}
                        {selectedLga.elevSnap.metadata?.max_elevation_m != null && (
                          <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                            Maximum elevation<br /><strong>{Number(selectedLga.elevSnap.metadata.max_elevation_m).toFixed(0)} m</strong>
                          </div>
                        )}
                        {selectedLga.elevSnap.metadata?.std_elevation_m != null && (
                          <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs">
                            Elevation variability (std)<br /><strong>± {Number(selectedLga.elevSnap.metadata.std_elevation_m).toFixed(0)} m</strong>
                          </div>
                        )}
                        <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs text-slate-500">
                          Source: {selectedLga.elevSnap.data_source || "USGS SRTMGL1 v003"}
                          {selectedLga.elevSnap.metadata?.method_version && (
                            <><br />Method: SRTM 30 m DEM · LGA zonal statistics</>
                          )}
                          <br />Dataset year: 2000
                        </div>
                        <div className="col-span-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[10px] text-amber-700">
                          This layer shows static terrain elevation. It is not a climate variable, not a hazard forecast, and not an exposure or vulnerability indicator.
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs text-slate-500">
                        No elevation data for {selectedLga.name}.
                      </div>
                    )
                  ) : variable.key === "flood_occurrence" ? (
                    selectedLga.floodSnap ? (
                      <>
                        <div className={`col-span-2 rounded-md p-3 text-xs ${isFloodPublic ? "bg-slate-50" : "bg-amber-50"}`}>
                          <p className={`font-black uppercase tracking-wide ${isFloodPublic ? "text-slate-600" : "text-amber-700"}`}>Historical Surface Water Occurrence — 1984–2021 archive</p>
                          <p className={`mt-0.5 ${isFloodPublic ? "text-slate-500" : "text-amber-600"}`}>JRC GSW v1.4 · 1984–2021 archive</p>
                        </div>
                        <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3">
                          Mean occurrence<br />
                          <strong className="text-lg">{Number(selectedLga.floodSnap.mean_value).toFixed(1)}%</strong>
                          <span className="ml-2 text-xs font-normal text-slate-500">of 1984–2021 period</span>
                        </div>
                        {selectedLga.floodSnap.metadata?.area_pct_occurrence_gt_10 != null && (
                          <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                            Area &gt;10% occurrence<br /><strong>{Number(selectedLga.floodSnap.metadata.area_pct_occurrence_gt_10).toFixed(1)}%</strong>
                          </div>
                        )}
                        {selectedLga.floodSnap.metadata?.area_pct_occurrence_gt_25 != null && (
                          <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                            Area &gt;25% occurrence<br /><strong>{Number(selectedLga.floodSnap.metadata.area_pct_occurrence_gt_25).toFixed(1)}%</strong>
                          </div>
                        )}
                        {selectedLga.floodSnap.metadata?.area_pct_occurrence_gt_50 != null && (
                          <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                            Area &gt;50% occurrence<br /><strong>{Number(selectedLga.floodSnap.metadata.area_pct_occurrence_gt_50).toFixed(1)}%</strong>
                          </div>
                        )}
                        <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs text-slate-500">
                          Source: {selectedLga.floodSnap.data_source || "JRC Global Surface Water v1.4"}
                          {selectedLga.floodSnap.metadata?.method_version && (
                            <><br />Method: {selectedLga.floodSnap.metadata.method_version}</>
                          )}
                        </div>
                        <div className="col-span-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[10px] text-amber-700">
                          {FLOOD_OCCURRENCE_INTERNAL_CONFIG.scientificCaution}
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs text-slate-500">
                        No flood occurrence data for {selectedLga.name}.
                      </div>
                    )
                  ) : variable.key === "annual_lulc" ? (
                    selectedLga.lulcSnap ? (
                      <>
                        <div className="col-span-2 rounded-md bg-amber-50 p-3 text-xs">
                          <p className="font-black uppercase tracking-wide text-amber-700">Annual Land Use / Land Cover</p>
                          <p className="mt-0.5 text-amber-600">Year: {lulcData?.dataset?.year || config.year} · Sep–Oct composite</p>
                        </div>
                        <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3">
                          Dominant class<br />
                          <span className="flex items-center gap-2 mt-1">
                            <span className="inline-block h-3 w-4 rounded-sm border border-slate-200" style={{ backgroundColor: LULC_CLASS_COLORS[selectedLga.lulcSnap.dominant_class] || "#d9dee3" }} />
                            <strong className="text-base">{selectedLga.lulcSnap.dominant_label || selectedLga.lulcSnap.dominant_class}</strong>
                          </span>
                          <span className="text-xs text-slate-500">{Number(selectedLga.lulcSnap.dominant_pct).toFixed(1)}% of LGA area</span>
                        </div>
                        <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                          Quality<br /><strong className="capitalize">{selectedLga.lulcSnap.quality_flag}</strong>
                        </div>
                        <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                          Peak-season scenes<br /><strong>{selectedLga.lulcSnap.peak_scene_count ?? "–"}</strong>
                        </div>
                        <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs">
                          <p className="mb-1.5 font-bold text-slate-600">Class composition</p>
                          <div className="space-y-1">
                            {Object.entries(selectedLga.lulcSnap.class_pct || {})
                              .sort(([, a], [, b]) => b - a)
                              .map(([cls, pct]) => {
                                const clsInfo = lulcClasses[cls];
                                if (!clsInfo || pct < 0.1) return null;
                                return (
                                  <div key={cls} className="flex items-center gap-2">
                                    <span className="h-2.5 w-3.5 shrink-0 rounded-sm border border-slate-200" style={{ backgroundColor: clsInfo.color }} />
                                    <span className="w-28 text-slate-600">{clsInfo.label}</span>
                                    <div className="flex-1 rounded-full bg-slate-100">
                                      <div className="h-1.5 rounded-full bg-[#030454]/40" style={{ width: `${Math.min(pct, 100)}%` }} />
                                    </div>
                                    <span className="w-10 text-right font-bold">{pct.toFixed(1)}%</span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                        <div className="col-span-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[10px] text-amber-700">
                          Caution: Internal preview only. Not published, not validated. Do not use for public reporting.
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs text-slate-500">
                        No LULC data for {selectedLga.name} in {lulcData?.dataset?.year || config.year}.
                      </div>
                    )
                  ) : variable.source === "remote_sensing" ? (
                    selectedLga.metric ? (
                      variable.key === "rainfall" ? (
                        <>
                          <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3">
                            {popupConfig.valueLabel}<br />
                            <strong className="text-lg">{formatRainfall(selectedLga.metric.mean_value)}</strong>
                          </div>
                          <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs text-slate-500">
                            {config.season} · {config.year}
                          </div>
                          <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs text-slate-500">
                            {popupConfig.sourceLabel}: {popupConfig.sourceValue}
                          </div>
                        </>
                      ) : variable.key === "rainfall_anomaly" ? (
                        <>
                          {(() => {
                            const pct = Number(selectedLga.metric.mean_value);
                            const dir = pct > 5 ? popupConfig.directionLabels.above : pct < -5 ? popupConfig.directionLabels.below : popupConfig.directionLabels.near;
                            return <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs font-bold text-slate-600">{dir}</div>;
                          })()}
                          <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3">
                            {popupConfig.valueLabel}<br />
                            <strong className="text-lg">
                              {Number(selectedLga.metric.mean_value) >= 0 ? "+" : ""}
                              {formatNumber(selectedLga.metric.mean_value)}%
                            </strong>
                          </div>
                          {selectedLga.metric.metadata?.observed_total_mm != null && (
                            <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                              {popupConfig.observedLabel}<br /><strong>{Number(selectedLga.metric.metadata.observed_total_mm).toFixed(1)} mm</strong>
                            </div>
                          )}
                          {selectedLga.metric.metadata?.baseline_mean_mm != null && (
                            <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                              {popupConfig.baselineLabel}<br /><strong>{Number(selectedLga.metric.metadata.baseline_mean_mm).toFixed(1)} mm</strong>
                            </div>
                          )}
                          {selectedLga.metric.metadata?.anomaly_mm != null && (
                            <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                              {popupConfig.differenceLabel}<br />
                              <strong>
                                {Number(selectedLga.metric.metadata.anomaly_mm) >= 0 ? "+" : ""}
                                {Number(selectedLga.metric.metadata.anomaly_mm).toFixed(1)} mm
                              </strong>
                            </div>
                          )}
                          {selectedLga.metric.metadata?.baseline_sample_count != null && (
                            <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                              {popupConfig.baselineYearsLabel}<br /><strong>{selectedLga.metric.metadata.baseline_sample_count} of 30</strong>
                            </div>
                          )}
                          <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                            {popupConfig.seasonLabel}<br /><strong>{config.season}</strong>
                          </div>
                          <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                            {popupConfig.yearLabel}<br /><strong>{selectedLga.metric.year || config.year}</strong>
                          </div>
                          <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs text-slate-500">
                            {popupConfig.sourceLabel}: {popupConfig.sourceValue}
                            {popupConfig.methodLabel && <><br />{popupConfig.methodLabel}: {popupConfig.methodValue}</>}
                          </div>
                          {popupConfig.description && (
                            <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-[10px] leading-4 text-slate-400">
                              {popupConfig.description}
                            </div>
                          )}
                        </>
                      ) : variable.key === "drought_index" ? (
                        <>
                          <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3">
                            {popupConfig.valueLabel}<br />
                            <strong className="text-lg">{formatNumber(selectedLga.metric.mean_value)}</strong>
                          </div>
                          <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs font-bold text-slate-600">
                            {selectedLga.metric.metadata?.spi_category || getDroughtSpiCategory(selectedLga.metric.mean_value)}
                          </div>
                          {selectedLga.metric.metadata?.observed_total_mm != null && (
                            <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                              {popupConfig.observedLabel}<br /><strong>{Number(selectedLga.metric.metadata.observed_total_mm).toFixed(1)} mm</strong>
                            </div>
                          )}
                          {selectedLga.metric.metadata?.baseline_sample_count != null && (
                            <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                              {popupConfig.baselineYearsLabel}<br /><strong>{selectedLga.metric.metadata.baseline_sample_count}</strong>
                            </div>
                          )}
                          <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                            {popupConfig.seasonLabel}<br /><strong>{config.season}</strong>
                          </div>
                          <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                            {popupConfig.yearLabel}<br /><strong>{selectedLga.metric.year || config.year}</strong>
                          </div>
                          <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs text-slate-500">
                            {popupConfig.sourceLabel}: {popupConfig.sourceValue}<br />
                            {popupConfig.methodLabel}: {popupConfig.methodValue}
                          </div>
                          {popupConfig.description && (
                            <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-[10px] leading-4 text-slate-400">
                              {popupConfig.description}
                            </div>
                          )}
                        </>
                      ) : variable.key === "lst" ? (
                        <>
                          <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3">
                            {popupConfig.valueLabel}<br />
                            <strong className="text-lg">{formatNumber(selectedLga.metric.mean_value)}°C</strong>
                          </div>
                          <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                            {popupConfig.seasonLabel}<br /><strong>{config.season}</strong>
                          </div>
                          <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                            {popupConfig.yearLabel}<br /><strong>{selectedLga.metric.year || config.year}</strong>
                          </div>
                          {selectedLga.metric.metadata?.coverage_status && (
                            <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                              {popupConfig.coverageLabel}<br />
                              <strong className="capitalize">{selectedLga.metric.metadata.coverage_status.replace(/_/g, " ")}</strong>
                              {selectedLga.metric.metadata.valid_pixel_coverage_pct != null && (
                                <span className="ml-1 text-slate-400">({selectedLga.metric.metadata.valid_pixel_coverage_pct}%)</span>
                              )}
                            </div>
                          )}
                          {selectedLga.metric.metadata?.source_image_count != null && (
                            <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                              {popupConfig.scenesLabel}<br /><strong>{selectedLga.metric.metadata.source_image_count}</strong>
                            </div>
                          )}
                          <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs text-slate-500">
                            {popupConfig.sourceLabel}: {popupConfig.sourceValue} · {popupConfig.bandLabel}: {popupConfig.bandValue}
                          </div>
                        </>
                      ) : isNdviLandsat ? (
                        <>
                          <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3">
                            {popupConfig.landsatTitle}<br />
                            <strong className="text-lg">{formatNumber(selectedLga.metric.mean_value)}</strong>
                            {" "}<span className="text-xs font-normal text-slate-500">{variable.unit}</span>
                          </div>
                          <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                            {popupConfig.seasonLabel}<br /><strong>{config.season}</strong>
                          </div>
                          <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                            {popupConfig.yearLabel}<br /><strong>{selectedLga.metric.year || config.year}</strong>
                          </div>
                          {selectedLga.metric.metadata?.selected_sensor && (
                            <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                              {popupConfig.sensorLabel}<br /><strong>{selectedLga.metric.metadata.selected_sensor}</strong>
                            </div>
                          )}
                          {selectedLga.metric.metadata?.coverage_status && (
                            <div className="rounded-md bg-[#F7F9FA] p-3 text-xs">
                              {popupConfig.coverageLabel}<br />
                              <strong className="capitalize">{selectedLga.metric.metadata.coverage_status.replace(/_/g, " ")}</strong>
                              {selectedLga.metric.metadata.valid_pixel_coverage_pct != null && (
                                <span className="ml-1 text-slate-400">({selectedLga.metric.metadata.valid_pixel_coverage_pct}%)</span>
                              )}
                            </div>
                          )}
                          {selectedLga.metric.metadata?.selection_reason === "archive_fallback_no_primary_scene" && (
                            <div className="col-span-2 rounded-md bg-amber-50 p-3 text-xs text-amber-700">
                              {popupConfig.archiveFallbackMessage}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3">
                            {variable.label}<br />
                            <strong>{formatNumber(selectedLga.metric.mean_value)}</strong>
                            {" "}<span className="text-xs font-normal text-slate-500">{variable.unit}</span>
                          </div>
                          <div className="rounded-md bg-[#F7F9FA] p-3">Min<br /><strong>{formatNumber(selectedLga.metric.min_value)}</strong></div>
                          <div className="rounded-md bg-[#F7F9FA] p-3">Max<br /><strong>{formatNumber(selectedLga.metric.max_value)}</strong></div>
                          <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs text-slate-500">
                            {config.season} · {config.year} · {selectedLga.metric.data_source || "GEE Sentinel-2"}
                          </div>
                        </>
                      )
                    ) : (
                      <div className="col-span-2 rounded-md bg-[#F7F9FA] p-3 text-xs text-slate-500">
                        {getAtlasNoDataMessage(variable.key, { isNdviLandsat })}
                      </div>
                    )
                  ) : (
                    <>
                      <div className="rounded-md bg-[#F7F9FA] p-3">Risk<br /><strong>{formatNumber(selectedLga.profile?.overall_risk_score)}</strong></div>
                      <div className="rounded-md bg-[#F7F9FA] p-3">Heat<br /><strong>{formatNumber(selectedLga.profile?.heat_risk_score)}</strong></div>
                      <div className="rounded-md bg-[#F7F9FA] p-3">Flood<br /><strong>{formatNumber(selectedLga.profile?.flood_risk_score)}</strong></div>
                      <div className="rounded-md bg-[#F7F9FA] p-3">Drought<br /><strong>{formatNumber(selectedLga.profile?.drought_risk_score)}</strong></div>
                    </>
                  )}
                </div>
                {(selectedLgaCiItem || ciLoading) && (
                  <div className="mt-3 border-t border-[#E6EAEC] pt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#173B91]">Climate Intelligence Summary</p>
                      <span className="rounded-full bg-[#F7F9FA] px-2 py-0.5 text-[9px] font-bold text-slate-500">Rule-based</span>
                    </div>
                    <CICardBody ciItem={selectedLgaCiItem} ciLoading={ciLoading} showLulc={INTERNAL_LULC_PREVIEW_PARAM} />
                    {selectedLgaCiItem && ciProfile && !ciProfileLoading && (
                      <button
                        type="button"
                        onClick={() => setCiBriefOpen((v) => !v)}
                        className={`mt-2 w-full rounded-md border px-3 py-1.5 text-left text-[10px] font-bold transition-colors ${
                          ciBriefOpen
                            ? "border-[#173B91] bg-[#173B91] text-white"
                            : "border-[#D8DDE2] bg-white text-[#173B91] hover:border-[#173B91] hover:bg-[#EEF1FD]"
                        }`}
                      >
                        {ciBriefOpen ? "▲ Close Climate Intelligence Brief" : "▼ View Climate Intelligence Brief"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {ciBriefOpen && ciProfile && !ciProfileLoading && (
              <div className="border-t border-[#173B91]/10">
                <LgaClimateBrief
                  lgaName={selectedLga.name}
                  ciProfile={ciProfile}
                  elevSnap={selectedLga.elevSnap}
                  floodSnap={selectedLga.floodSnap}
                  showLulc={INTERNAL_LULC_PREVIEW_PARAM}
                  isFloodAvailable={isFloodPublic || INTERNAL_FLOOD_PREVIEW_PARAM}
                  isElevationAvailable={isElevationPublic || INTERNAL_ELEVATION_PREVIEW_PARAM}
                />
              </div>
            )}
            {selectedWard && (
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#009B35]">Ward profile</p>
                  <button type="button" aria-label="Close ward profile" onClick={() => setSelectedWard(null)} className="rounded p-0.5 text-slate-400 hover:text-slate-600"><X size={16} /></button>
                </div>
                <h3 className="mt-1 text-xl font-black">{selectedWard.wardName}</h3>
                <p className="mt-2 text-sm text-slate-600">{selectedWard.lgaName}</p>
                <p className="mt-4 rounded-md bg-[#F7F9FA] p-3 text-xs leading-5 text-slate-600">
                  Ward-level climate metrics are not imported yet. This drill-down is ready for future ward-level GEE statistics.
                </p>
              </div>
            )}
          </aside>
        )}
      </section>

      <footer className={`flex min-h-[64px] shrink-0 items-center gap-5 border-t border-[#E6EAEC] bg-white px-7 py-2${isExportMode ? " hidden" : ""}`}>
        <div className="w-[450px] min-w-[300px] max-w-[450px] shrink-0">
          {variable.key === "elevation" ? (
            <p className="text-sm text-[#173B91]">
              Static terrain elevation:{" "}
              <strong>SRTM ~2000</strong>
              <span className={`ml-2 text-[10px] font-normal ${isElevationPublic ? "text-slate-400" : "text-amber-600"}`}>
                {isElevationPublic
                  ? "USGS SRTMGL1 v003 · satellite-derived · ~30 m · not survey-grade"
                  : "Internal preview · Not published · USGS SRTMGL1 v003"}
              </span>
            </p>
          ) : variable.key === "annual_lulc" ? (
            <p className="text-sm text-[#173B91]">
              Annual LULC dataset year:{" "}
              <strong>{lulcData?.dataset?.year ?? (config.year > 0 ? config.year : "resolving...")}</strong>
              <span className="ml-2 text-[10px] font-normal text-amber-600">Internal preview · Sep–Oct composite</span>
            </p>
          ) : variable.key === "flood_occurrence" ? (
            <p className="text-sm text-[#173B91]">
              Historical surface-water occurrence:{" "}
              <strong>1984–2021 archive</strong>
              <span className={`ml-2 text-[10px] font-normal ${isFloodPublic ? "text-slate-400" : "text-amber-600"}`}>
                {isFloodPublic
                  ? "JRC GSW v1.4 · static archive · not real-time"
                  : "Internal preview · Static product · JRC GSW v1.4"}
              </span>
            </p>
          ) : isLatest ? (
            <p className="text-sm text-[#173B91]">
              Latest available data:{" "}
              <strong>{config.year > 0 ? String(config.year) : "resolving..."}</strong>
            </p>
          ) : (
            <div>
              <input
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={1}
                value={config.year}
                onChange={(event) => updateConfig("year", Number(event.target.value))}
                className="w-full accent-[#173B91]"
                list="atlas-year-ticks"
                aria-label={`Year: ${config.year}`}
              />
              <datalist id="atlas-year-ticks">
                {tickYears.map((y) => <option key={y} value={y} />)}
              </datalist>
              {tickYears.length > 0 && (
                <div className="relative mt-0.5 h-4 px-2">
                  {tickYears.map((y, i) => {
                    const pct = ((y - sliderMin) / (sliderMax - sliderMin)) * 100;
                    const isFirst = i === 0;
                    const isLast = i === tickYears.length - 1;
                    return (
                      <span
                        key={y}
                        className="absolute text-[10px] text-[#173B91]/50"
                        style={{
                          left: `${pct}%`,
                          transform: isFirst ? "none" : isLast ? "translateX(-100%)" : "translateX(-50%)",
                        }}
                      >
                        {y}
                      </span>
                    );
                  })}
                </div>
              )}
              <p className="mt-0.5 text-center text-[10px] font-bold text-[#173B91]">
                Selected year: {config.year}
              </p>
            </div>
          )}

        </div>

        {/* Reserved centre space â€" future Climate Signals and Recommended Actions */}
        <div className="flex-1" aria-hidden="true" />
        <div className="w-[520px] shrink-0">
          <BriefingPanel
            question={briefingQuestion}
            answer={briefingAnswer}
            onQuestionChange={setBriefingQuestion}
            onAsk={generateClimateBriefing}
          />
        </div>
      </footer>
    </main>
  );
}


