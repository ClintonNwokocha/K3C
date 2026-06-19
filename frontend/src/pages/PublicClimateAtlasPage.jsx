import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
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
  getGeeStatus,
  getPublicClimateRiskProfiles,
  getRemoteSensingDashboardKpis,
  getRemoteSensingLgaStats,
} from "../services/api";

const KADUNA_CENTER = [10.45, 7.75];
const KADUNA_ZOOM = 7;
const WARD_VISIBLE_ZOOM = 10;
const LGA_LABEL_ZOOM = 8;
const WARD_LABEL_ZOOM = 13;

const VARIABLES = [
  { key: "overall", label: "Overall Climate Risk", source: "risk", field: "overall_risk_score", unit: "/100" },
  { key: "heat", label: "Mean Temperature / Heat Risk", source: "risk", field: "heat_risk_score", unit: "/100" },
  { key: "rainfall_anomaly", label: "Rainfall Anomaly", source: "remote_sensing", unit: "mm" },
  { key: "flood_hazard", label: "Flood Hazard", source: "remote_sensing", unit: "index" },
  { key: "drought_index", label: "Drought Index", source: "remote_sensing", unit: "index" },
  { key: "ndvi", label: "Vegetation / NDVI", source: "remote_sensing", unit: "NDVI" },
  { key: "lulc", label: "Land Use / Land Cover", source: "remote_sensing", unit: "class" },
];

const DATASETS = ["KCCC Risk Database", "CHIRPS", "MODIS", "ERA5", "Sentinel-2"];
const SEASONS = ["Annual", "Dry Season", "Wet Season"];
const PERIODS = ["Latest", "1981–2010", "1991–2020", "2021–2025"];
const QUANTITIES = ["Mean", "Change rel. to baseline", "P10", "P90"];

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

function getFeatureCenter(feature) {
  try {
    return L.geoJSON(feature).getBounds().getCenter();
  } catch {
    return null;
  }
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
      {zoom >= 6 && <LabelMarker position={stateCenter} text="Kaduna State" type="state" />}

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

function AtlasToolButton({ label, symbol, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`group relative flex h-11 w-11 items-center justify-center border-b border-[#173B91]/25 text-lg font-black transition ${
        active ? "bg-[#173B91] text-white" : "bg-white text-[#173B91] hover:bg-[#F3F7FF]"
      }`}
    >
      {symbol}
      <span className="pointer-events-none absolute right-12 top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-[#030454] px-2 py-1 text-[11px] font-black text-white shadow-lg group-hover:block">
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
    <div className="absolute right-4 top-24 z-[900] flex flex-col overflow-visible rounded-md border border-[#173B91] bg-white shadow-sm">
      <AtlasToolButton label={isFullscreen ? "Normal" : "Full"} symbol="⛶" onClick={toggleFullscreen} />
      <AtlasToolButton label="Zoom" symbol="+" onClick={() => map.zoomIn()} />
      <AtlasToolButton label="Select" symbol="▣" onClick={() => showMessage("Click any LGA or ward polygon to select.")} />
      <AtlasToolButton label="Out" symbol="−" onClick={() => map.zoomOut()} />
      <AtlasToolButton label="Reset" symbol="↔" onClick={resetView} />
      <AtlasToolButton label="Locate" symbol="⌖" onClick={locateUser} />
      <AtlasToolButton label="Grid" symbol="▧" active={showGrid} onClick={() => setShowGrid((v) => !v)} />
      <AtlasToolButton label="Wards" symbol="▤" active={showWards} onClick={() => setShowWards((v) => !v)} />
      <AtlasToolButton label="Capture" symbol="📷" onClick={onCapture} />
      <AtlasToolButton label="Share" symbol="🔗" onClick={copyShareLink} />
    </div>
  );
}

function BasemapSwitcher({ baseMap, setBaseMap }) {
  const [open, setOpen] = useState(false);

  const options = [
    { key: "satellite", label: "Satellite" },
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
        <span>{open ? "▲" : "▼"}</span>
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
          placeholder="Ask about rainfall, drought, NDVI, flood risk..."
          className="h-9 flex-1 rounded-md border border-[#CAD2D7] px-3 text-xs outline-none focus:border-[#009B35]"
        />
        <button type="button" onClick={onAsk} className="rounded-md bg-[#030454] px-4 text-xs font-black text-white hover:bg-[#009B35]">
          Ask
        </button>
      </div>
    </div>
  );
}

export default function PublicClimateAtlasPage() {
  const captureRef = useRef(null);

  const [stateGeoJson, setStateGeoJson] = useState(null);
  const [lgaGeoJson, setLgaGeoJson] = useState(null);
  const [wardGeoJson, setWardGeoJson] = useState(null);

  const [profiles, setProfiles] = useState([]);
  const [remoteStats, setRemoteStats] = useState([]);
  const [geeStatus, setGeeStatus] = useState(null);

  const [briefingQuestion, setBriefingQuestion] = useState("");
  const [briefingAnswer, setBriefingAnswer] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [baseMap, setBaseMap] = useState("satellite");
  const [showGrid, setShowGrid] = useState(false);
  const [showWards, setShowWards] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(KADUNA_ZOOM);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toolMessage, setToolMessage] = useState("");

  const [selectedLga, setSelectedLga] = useState(null);
  const [selectedWard, setSelectedWard] = useState(null);
  const [error, setError] = useState("");

  const [config, setConfig] = useState({
    variableKey: "overall",
    dataset: "KCCC Risk Database",
    season: "Annual",
    period: "Latest",
    quantity: "Mean",
    opacity: 0.68,
    year: 2025,
  });

  const variable = VARIABLES.find((item) => item.key === config.variableKey) || VARIABLES[0];
  const profilesByName = useMemo(() => buildLookup(profiles), [profiles]);
  const metricsByName = useMemo(() => buildLookup(remoteStats), [remoteStats]);
  const wardsVisible = showWards && currentZoom >= WARD_VISIBLE_ZOOM;

  async function captureAtlasLayout() {
    try {
        setToolMessage("Select this browser tab to capture the atlas...");

        const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
            displaySurface: "browser",
        },
        audio: false,
        });

        const video = document.createElement("video");
        video.srcObject = stream;

        await video.play();

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext("2d");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        stream.getTracks().forEach((track) => track.stop());

        const link = document.createElement("a");
        link.href = canvas.toDataURL("image/png");
        link.download = `kccc-climate-atlas-${config.variableKey}-${config.year}.png`;
        link.click();

        setToolMessage("Atlas screenshot saved.");
        window.setTimeout(() => setToolMessage(""), 2200);
    } catch (err) {
        console.error(err);
        setToolMessage("Screenshot cancelled or failed.");
        window.setTimeout(() => setToolMessage(""), 2200);
    }
    }

  function updateConfig(key, value) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function generateClimateBriefing() {
    const q = briefingQuestion.trim().toLowerCase();

    if (!q) {
      setBriefingAnswer("Ask about rainfall, drought, heat, vegetation, flood risk, LULC, LGA or ward-level climate conditions.");
      return;
    }

    if (q.includes("ward")) {
      setBriefingAnswer("Ward boundaries appear from zoom level 10 upward. Ward labels appear from zoom level 13 upward.");
      return;
    }

    if (q.includes("rain")) {
      setBriefingAnswer("Rainfall analysis will use CHIRPS/GEE rainfall records once imported into the backend.");
      return;
    }

    if (q.includes("drought")) {
      setBriefingAnswer("Drought interpretation will combine rainfall deficit, vegetation condition and drought index indicators.");
      return;
    }

    if (q.includes("ndvi") || q.includes("vegetation")) {
      setBriefingAnswer("Vegetation/NDVI will come from Sentinel-2 or Landsat-derived GEE zonal statistics.");
      return;
    }

    if (q.includes("flood")) {
      setBriefingAnswer("Flood signals can combine KCCC risk records, JRC surface water, Sentinel-1 flood occurrence and terrain exposure.");
      return;
    }

    setBriefingAnswer(`${variable.label} is selected for ${config.season}. Dataset: ${config.dataset}. Period: ${config.period}.`);
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
      ]);

      if (results[0].status === "fulfilled") setProfiles(results[0].value.results || []);
      if (results[2].status === "fulfilled") setGeeStatus(results[2].value || null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not load Kaduna Climate Atlas.");
    }
  }

  async function loadRemoteStats() {
    if (variable.source !== "remote_sensing") {
      setRemoteStats([]);
      return;
    }

    try {
      const data = await getRemoteSensingLgaStats({ layer: variable.key });
      setRemoteStats(data.results || []);
    } catch {
      setRemoteStats([]);
    }
  }

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadRemoteStats();
  }, [config.variableKey]);

  function resolveFeature(feature) {
    const name = String(getFeatureName(feature)).trim();
    const key = normalizeName(name);
    const profile = profilesByName[key] || null;
    const metric = metricsByName[key] || null;
    const value = variable.source === "remote_sensing" ? metric?.mean_value : profile?.[variable.field];

    return {
      name: profile?.lga_name || metric?.lga_name || name,
      profile,
      metric,
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

    return {
      color: "#ffffff",
      weight: 2,
      fillColor: info.color,
      fillOpacity: hasValue(info.value) ? config.opacity : 0.18,
      opacity: 0.95,
      dashArray: "",
    };
  }

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
    layer.on({
      mouseover: (event) => {
        event.target.setStyle({ weight: 3, color: "#030454", fillOpacity: 0.82 });
        event.target.bringToFront?.();
      },
      mouseout: (event) => event.target.setStyle(styleLgaFeature(feature)),
      click: () => {
        setSelectedWard(null);
        setSelectedLga(resolveFeature(feature));
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
        setSelectedLga(null);
        setSelectedWard({ wardName, lgaName });
      },
    });
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-white font-['DM_Sans'] text-[#030454]">
      <style>{`
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

      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#E6EAEC] bg-white px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[#030454] text-xs font-black text-white">KS</div>
          <h1 className="text-sm font-black">Kaduna Interactive Climate Atlas · KCCC</h1>
        </div>

        <div className="hidden text-center text-sm font-black text-[#030454] lg:block">{variable.label}</div>

        <div className="flex items-center gap-2">
          <a href="/public/climate-risk" className="rounded-full bg-[#F7F9FA] px-3 py-1 text-xs font-black hover:bg-[#DFE3E4]">Back to Climate Risk</a>
          <a href="/public/reports" className="rounded-full bg-[#F7F9FA] px-3 py-1 text-xs font-black hover:bg-[#DFE3E4]">Reports</a>
          <a href="/public/projects" className="rounded-full bg-[#F7F9FA] px-3 py-1 text-xs font-black hover:bg-[#DFE3E4]">Projects</a>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${geeStatus?.status === "ok" ? "bg-[#009B35]/10 text-[#009B35]" : "bg-amber-100 text-amber-700"}`}>
            GEE {geeStatus?.status === "ok" ? "live" : "unavailable"}
          </span>
        </div>
      </header>

      <section className="flex min-h-0 flex-1">
        <aside className={`relative flex h-full shrink-0 flex-col border-r border-[#E6EAEC] bg-white transition-all duration-300 ${sidebarOpen ? "w-[300px]" : "w-[42px]"}`}>
          <button
            type="button"
            title={sidebarOpen ? "Collapse" : "Expand"}
            onClick={() => setSidebarOpen((v) => !v)}
            className="absolute -right-5 top-7 z-[950] flex h-11 w-11 items-center justify-center rounded-full border border-[#D8DDE2] bg-white text-2xl font-black text-[#030454] shadow hover:bg-[#F7F9FA]"
          >
            {sidebarOpen ? "‹" : "›"}
          </button>

          {sidebarOpen && (
            <>
              <div className="shrink-0 border-b border-[#E6EAEC] px-5 py-5">
                <h2 className="text-lg font-black text-[#8A0028]">KCCC Climate Atlas</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Select climate variables and view Kaduna LGA-level map intelligence.</p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pb-6">
                <SelectField label="Select a variable" value={config.variableKey} onChange={(value) => updateConfig("variableKey", value)}>
                  {VARIABLES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </SelectField>

                <SelectField label="Dataset" value={config.dataset} onChange={(value) => updateConfig("dataset", value)}>
                  {DATASETS.map((item) => <option key={item}>{item}</option>)}
                </SelectField>

                <SelectField label="Season or month" value={config.season} onChange={(value) => updateConfig("season", value)}>
                  {SEASONS.map((item) => <option key={item}>{item}</option>)}
                </SelectField>

                <SelectField label="Period" value={config.period} onChange={(value) => updateConfig("period", value)}>
                  {PERIODS.map((item) => <option key={item}>{item}</option>)}
                </SelectField>

                <SelectField label="Quantity" value={config.quantity} onChange={(value) => updateConfig("quantity", value)}>
                  {QUANTITIES.map((item) => <option key={item}>{item}</option>)}
                </SelectField>

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
            </>
          )}
        </aside>

        <section ref={captureRef} className="relative min-w-0 flex-1">
          <div className="absolute left-0 right-0 top-0 z-[800] border-b border-[#E6EAEC] bg-white/95 px-5 py-2 text-center text-sm backdrop-blur">
            <strong>{variable.label}</strong>
            <span className="mx-2 text-slate-400">|</span>
            Dataset: <strong>{config.dataset}</strong>
            <span className="mx-2 text-slate-400">|</span>
            Period: <strong>{config.period}</strong>
            <span className="mx-2 text-slate-400">|</span>
            Quantity: <strong>{config.quantity}</strong>
            <span className="mx-2 text-slate-400">|</span>
            Zoom: <strong>{currentZoom}</strong>
          </div>

          {error ? (
            <div className="flex h-full items-center justify-center text-red-700">{error}</div>
          ) : !lgaGeoJson ? (
            <div className="flex h-full items-center justify-center text-slate-500">Loading Kaduna atlas...</div>
          ) : (
            <>
              <MapContainer center={KADUNA_CENTER} zoom={KADUNA_ZOOM} minZoom={6} maxZoom={15} zoomControl={false} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
                <ZoomWatcher onZoomChange={setCurrentZoom} />

                {baseMap === "satellite" && (
                  <TileLayer
                    attribution="Esri World Imagery"
                    crossOrigin="anonymous"
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  />
                )}

                {baseMap === "dark" && (
                  <TileLayer
                    attribution="CartoDB Dark"
                    crossOrigin="anonymous"
                    url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                  />
                )}

                {baseMap === "streets" && (
                  <TileLayer
                    attribution="OpenStreetMap"
                    crossOrigin="anonymous"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                )}

                {baseMap === "terrain" && (
                  <TileLayer
                    attribution="OpenTopoMap"
                    crossOrigin="anonymous"
                    url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                  />
                )}

                <FitBounds geoJson={stateGeoJson || lgaGeoJson} />

                <GeoJSON
                  key={`lga-${config.variableKey}-${config.opacity}-${profiles.length}-${remoteStats.length}`}
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
              </MapContainer>

              <BasemapSwitcher baseMap={baseMap} setBaseMap={setBaseMap} />

              {showGrid && (
                <div className="pointer-events-none absolute inset-0 z-[850] bg-[linear-gradient(rgba(3,4,84,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(3,4,84,0.16)_1px,transparent_1px)] bg-[size:64px_64px]" />
              )}

              {toolMessage && (
                <div className="absolute bottom-32 left-1/2 z-[930] -translate-x-1/2 rounded-md bg-[#030454] px-4 py-2 text-xs font-bold text-white shadow-lg">
                  {toolMessage}
                </div>
              )}

              <div className="absolute bottom-24 left-6 z-[900] w-[300px] rounded-md border border-[#D8DDE2] bg-white p-3 shadow-lg">
                <div className="mb-2 flex justify-between text-xs font-bold text-slate-600">
                  <span>{variable.label}</span>
                  <span>{variable.unit}</span>
                </div>
                <div className="h-3 rounded-full bg-gradient-to-r from-[#1d9e75] via-[#f59e0b] to-[#b91c1c]" />
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>

              <div className="absolute bottom-[160px] left-6 z-[900] rounded-md border border-[#D8DDE2] bg-white px-4 py-2 text-xs font-bold shadow">
                {wardsVisible ? "Click any ward or LGA for profile" : "Zoom in to reveal wards"}
              </div>

              {selectedLga && (
                <div className="absolute bottom-[116px] right-[60px] z-[900] w-[300px] rounded-xl border border-[#D8DDE2] bg-white p-4 shadow-xl">
                  <button type="button" onClick={() => setSelectedLga(null)} className="float-right font-black">×</button>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#009B35]">LGA profile</p>
                  <h3 className="mt-1 text-xl font-black">{selectedLga.name}</h3>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md bg-[#F7F9FA] p-3">Risk<br /><strong>{formatNumber(selectedLga.profile?.overall_risk_score)}</strong></div>
                    <div className="rounded-md bg-[#F7F9FA] p-3">Heat<br /><strong>{formatNumber(selectedLga.profile?.heat_risk_score)}</strong></div>
                    <div className="rounded-md bg-[#F7F9FA] p-3">Flood<br /><strong>{formatNumber(selectedLga.profile?.flood_risk_score)}</strong></div>
                    <div className="rounded-md bg-[#F7F9FA] p-3">Drought<br /><strong>{formatNumber(selectedLga.profile?.drought_risk_score)}</strong></div>
                  </div>
                </div>
              )}

              {selectedWard && (
                <div className="absolute bottom-[116px] right-[60px] z-[900] w-[300px] rounded-xl border border-[#D8DDE2] bg-white p-4 shadow-xl">
                  <button type="button" onClick={() => setSelectedWard(null)} className="float-right font-black">×</button>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#009B35]">Ward profile</p>
                  <h3 className="mt-1 text-xl font-black">{selectedWard.wardName}</h3>
                  <p className="mt-2 text-sm text-slate-600">{selectedWard.lgaName}</p>
                  <p className="mt-4 rounded-md bg-[#F7F9FA] p-3 text-xs leading-5 text-slate-600">
                    Ward-level climate metrics are not imported yet. This drill-down is ready for future ward-level GEE statistics.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </section>

      <footer className="grid h-[98px] shrink-0 grid-cols-[1fr_520px] gap-5 border-t border-[#E6EAEC] bg-white px-7 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-5">
            <span className="text-xs text-[#173B91]">1990</span>
            <input
              type="range"
              min="1990"
              max="2025"
              value={config.year}
              onChange={(event) => updateConfig("year", Number(event.target.value))}
              className="flex-1 accent-[#173B91]"
            />
            <span className="text-xs text-[#173B91]">2025</span>
            <strong className="w-12 text-center text-sm">{config.year}</strong>
          </div>

          <div className="mt-3 hidden gap-3 lg:flex">
            <span className="rounded-md bg-[#F7F9FA] px-3 py-2 text-xs font-bold">Warming trend: <strong className="text-red-600">Pending GEE</strong></span>
            <span className="rounded-md bg-[#F7F9FA] px-3 py-2 text-xs font-bold">Veg. change: <strong className="text-[#009B35]">Pending GEE</strong></span>
            <span className="rounded-md bg-[#F7F9FA] px-3 py-2 text-xs font-bold">Extreme rain: <strong className="text-red-600">Pending GEE</strong></span>
            <span className="rounded-md bg-[#F7F9FA] px-3 py-2 text-xs font-bold">Flood freq.: <strong className="text-red-600">Pending GEE</strong></span>
          </div>
        </div>

        <BriefingPanel
          question={briefingQuestion}
          answer={briefingAnswer}
          onQuestionChange={setBriefingQuestion}
          onAsk={generateClimateBriefing}
        />
      </footer>
    </main>
  );
}