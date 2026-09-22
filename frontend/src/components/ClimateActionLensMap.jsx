import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { derivePathwaysFromIndicators, getLensStatus } from "../utils/climatePathways";
import { CommandNotice } from "./CommandUI";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const KADUNA_CENTER = [10.45, 7.75];
const KADUNA_ZOOM = 7;
const NIGERIA_BOUNDS = [
  [3.5, 2.5],
  [14.5, 15.5],
];

const PLACEHOLDER_LGA_GEOJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { lganame: "Birnin Gwari" },
      geometry: {
        type: "Polygon",
        coordinates: [[[6.7, 10.9], [7.0, 10.9], [7.0, 11.2], [6.7, 11.2], [6.7, 10.9]]],
      },
    },
    {
      type: "Feature",
      properties: { lganame: "Chikun" },
      geometry: {
        type: "Polygon",
        coordinates: [[[7.2, 10.3], [7.6, 10.3], [7.6, 10.6], [7.2, 10.6], [7.2, 10.3]]],
      },
    },
    {
      type: "Feature",
      properties: { lganame: "Kaduna South" },
      geometry: {
        type: "Polygon",
        coordinates: [[[7.35, 10.45], [7.7, 10.45], [7.7, 10.75], [7.35, 10.75], [7.35, 10.45]]],
      },
    },
  ],
};

// Pathway selector options — exactly 4 lenses (water/drainage is not assessed)
const LENS_PATHWAYS = [
  { id: "ecosystem", label: "Restoration / Afforestation" },
  { id: "drought_ag", label: "Drought / Ag-Adaptation" },
  { id: "heat_green", label: "Heat / Urban Greening" },
  { id: "water_drainage", label: "Water / Drainage Review" },
];

// Fill colours — government-grade, no alarm/severity coding, accessible contrast
const LENS_FILL = {
  ready_for_planning_discussion: "#1E3A8A",
  requires_field_verification: "#92400E",
  insufficient_evidence: "#64748B",
  no_signal: "#CBD5E1",
  not_assessed: "#E2E8F0",
};

// Status display labels — exactly the 5 approved terms
const LENS_STATUS_DISPLAY = {
  ready_for_planning_discussion: {
    label: "Ready for planning discussion",
    cls: "text-[#1E3A8A] bg-[#EEF2FF] border border-[#C7D2FE]",
  },
  requires_field_verification: {
    label: "Requires field verification",
    cls: "text-amber-800 bg-amber-50 border border-amber-200",
  },
  insufficient_evidence: {
    label: "Insufficient evidence",
    cls: "text-slate-500 bg-slate-50 border border-slate-200",
  },
  no_signal: {
    label: "No current screening signal",
    cls: "text-slate-400 bg-white border border-slate-200",
  },
  not_assessed: {
    label: "Not assessed",
    cls: "text-slate-400 bg-white border border-slate-200 italic",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function getFeatureDisplayName(feature) {
  const props = feature?.properties || {};
  const keys = [
    "lganame", "lga_name", "LGA_NAME", "lgaName", "LGA", "lga", "LGANAME",
    "ADM2_NAME", "ADM2_EN", "NAME_2", "NAME", "name",
  ];
  for (const k of keys) {
    if (props[k]) return String(props[k]).trim();
  }
  const entries = Object.entries(props);
  return String(entries[0]?.[1] || "Unknown LGA").trim();
}

function buildCiLookup(ciData, selectedPathway) {
  if (!ciData?.results) return {};
  return ciData.results.reduce((acc, item) => {
    const pathways = derivePathwaysFromIndicators(item.indicators);
    const lensStatus = getLensStatus(pathways, selectedPathway);
    acc[normalizeName(item.admin_name)] = {
      admin_code: item.admin_code,
      admin_name: item.admin_name,
      indicators: item.indicators,
      pathways,
      lensStatus,
    };
    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// Map sub-components
// ---------------------------------------------------------------------------
function FitGeoJsonBounds({ geoJsonData }) {
  const map = useMap();
  useEffect(() => {
    if (!geoJsonData?.features?.length) return;
    try {
      const layer = L.geoJSON(geoJsonData);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    } catch {
      // Best-effort bounds fit; ignore invalid/degenerate geometry.
    }
  }, [geoJsonData, map]);
  return null;
}

function ResetMapButton({ geoJsonData }) {
  const map = useMap();
  function reset() {
    try {
      const layer = L.geoJSON(geoJsonData);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] });
      } else {
        map.setView(KADUNA_CENTER, KADUNA_ZOOM);
      }
    } catch {
      map.setView(KADUNA_CENTER, KADUNA_ZOOM);
    }
  }
  return (
    <div className="leaflet-top leaflet-right" style={{ zIndex: 640 }}>
      <div className="leaflet-control leaflet-bar">
        <button
          type="button"
          onClick={reset}
          style={{
            background: "#fff",
            border: "none",
            cursor: "pointer",
            fontSize: "11px",
            fontWeight: "bold",
            padding: "5px 9px",
            color: "#030454",
            display: "block",
            lineHeight: "1.4",
          }}
          title="Reset map view"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function LensLegend({ selectedPathway }) {
  const items =
    selectedPathway === "water_drainage"
      ? [{ status: "not_assessed", label: "Not assessed", color: LENS_FILL.not_assessed }]
      : [
          { status: "ready_for_planning_discussion", label: "Ready for planning discussion", color: LENS_FILL.ready_for_planning_discussion },
          { status: "requires_field_verification", label: "Requires field verification", color: LENS_FILL.requires_field_verification },
          { status: "insufficient_evidence", label: "Insufficient evidence", color: LENS_FILL.insufficient_evidence },
          { status: "no_signal", label: "No current screening signal", color: LENS_FILL.no_signal },
          { status: "not_assessed", label: "Not assessed", color: LENS_FILL.not_assessed },
        ];
  return (
    <div
      className="absolute bottom-4 left-4 z-[640] w-64 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur"
      style={{ pointerEvents: "auto" }}
    >
      <p className="mb-2 font-black uppercase tracking-[0.1em] text-[#030454]">Screening Status</p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.status} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-sm border border-white shadow-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="leading-tight text-slate-600">{item.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] leading-4 text-slate-400">
        Not a severity or priority ranking. All screening considerations require field
        verification before planning action.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side panel sub-components
// ---------------------------------------------------------------------------
function WaterDrainagePanel() {
  return (
    <div className="rounded-xl border border-[#F3F74B]/70 bg-[#F3F74B]/10 p-4 space-y-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.1em] text-[#030454]">
          Water / Drainage Review
        </p>
        <p className="mt-1 text-sm font-bold text-[#030454]">Not assessed in this release</p>
      </div>
      <p className="text-xs leading-5 text-slate-700">
        Historical water and drainage screening is not assessed in this release because an
        approved methodology and required supporting data are not yet available.
      </p>
      <p className="text-xs leading-5 text-slate-500">
        Individual LGA Climate Intelligence Briefs in the Public Climate Atlas include the
        JRC Global Surface Water indicator where the data layer has been loaded.
      </p>
    </div>
  );
}

function LensEvidencePanel({ lgaRow, selectedPathway, evidencePeriod, onOpenEvidence }) {
  if (selectedPathway === "water_drainage") {
    return <WaterDrainagePanel />;
  }

  if (!lgaRow) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
          Screening Evidence
        </p>
        <p className="mt-3 text-sm text-slate-500">
          Click an LGA on the map to view its screening evidence for the selected pathway.
        </p>
      </div>
    );
  }

  const pathway = lgaRow.pathways.find((p) => p.id === selectedPathway);
  const status = lgaRow.lensStatus;
  const statusDisplay = LENS_STATUS_DISPLAY[status] || LENS_STATUS_DISPLAY.not_assessed;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
          Selected LGA
        </p>
        <p className="mt-1 text-lg font-black text-[#030454]">{lgaRow.admin_name}</p>
        <p className="mt-0.5 text-xs text-slate-400">
          {evidencePeriod} · LGA administrative boundary (aggregated)
        </p>
      </div>

      <div>
        <p className="mb-1 text-xs font-bold text-slate-500">Action-readiness</p>
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${statusDisplay.cls}`}>
          {statusDisplay.label}
        </span>
      </div>

      {pathway && pathway.id !== "no_signal" ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-bold text-slate-500">Pathway</p>
            <p className="mt-0.5 text-xs text-slate-700">{pathway.theme}</p>
          </div>

          {pathway.triggers?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500">Evidence used</p>
              {pathway.triggers.map((t, i) => (
                <p key={i} className="mt-0.5 text-xs text-slate-700">· {t}</p>
              ))}
            </div>
          )}

          <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5">
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">
              Limitation
            </p>
            <p className="mt-0.5 text-[10px] leading-[1.5] text-amber-700">
              {pathway.scientificCaution}
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500">Required next validation</p>
            <ul className="mt-1 list-disc pl-4 text-xs leading-[1.6] text-slate-500">
              {pathway.validationSteps?.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="text-xs italic text-slate-400">
          No current screening signal in available indicators for this pathway.
        </p>
      )}

      <button
        type="button"
        onClick={onOpenEvidence}
        className="w-full rounded-md bg-[#030454] px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#02033d] focus:outline-none focus:ring-2 focus:ring-[#030454]/40"
      >
        Open LGA Evidence
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ClimateActionLensMap({ ciData, ciLoading, setSelectedLgaName, setActiveTab }) {
  const [geoJsonData, setGeoJsonData] = useState(PLACEHOLDER_LGA_GEOJSON);
  const [isUsingPlaceholder, setIsUsingPlaceholder] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedPathway, setSelectedPathway] = useState("ecosystem");
  const [selectedLgaKey, setSelectedLgaKey] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let isMounted = true;
    fetch("/data/kaduna_lgas.geojson", { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data?.features?.length && isMounted) {
          setGeoJsonData(data);
          setIsUsingPlaceholder(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoadError(
            "Official Kaduna LGA boundary file could not be loaded. Showing development placeholder."
          );
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const evidencePeriod = useMemo(() => {
    if (!ciData?.filters) return "—";
    const season = ciData.filters.season === "annual" ? "Annual" : ciData.filters.season;
    return `${ciData.filters.year} · ${season}`;
  }, [ciData?.filters]);

  const ciLookup = useMemo(
    () => buildCiLookup(ciData, selectedPathway),
    [ciData, selectedPathway]
  );

  const selectedRow = selectedLgaKey ? ciLookup[selectedLgaKey] || null : null;

  function getFeatureStyle(feature) {
    const name = getFeatureDisplayName(feature);
    const key = normalizeName(name);
    const row = ciLookup[key];
    const isSelected = key === selectedLgaKey;
    const status = row?.lensStatus || "no_signal";

    let fillOpacity = 0.78;
    if (filterStatus !== "all" && row?.lensStatus !== filterStatus) {
      fillOpacity = 0.1;
    }
    if (search.trim() && !name.toLowerCase().includes(search.toLowerCase())) {
      fillOpacity = Math.min(fillOpacity, 0.12);
    }
    if (isSelected) fillOpacity = Math.max(fillOpacity, 0.92);

    return {
      color: isSelected ? "#030454" : "#FFFFFF",
      weight: isSelected ? 3.5 : 1.2,
      fillColor: LENS_FILL[status] || LENS_FILL.no_signal,
      fillOpacity,
      opacity: 1,
    };
  }

  function onEachFeature(feature, layer) {
    const name = getFeatureDisplayName(feature);
    const key = normalizeName(name);
    const row = ciLookup[key];
    const statusLabel =
      LENS_STATUS_DISPLAY[row?.lensStatus || "no_signal"]?.label || "No current screening signal";

    layer.bindTooltip(
      `<strong style="color:#030454">${name}</strong><br/><span style="font-size:11px;color:#475569">${statusLabel}</span>`,
      { sticky: true, direction: "top", className: "leaflet-tooltip" }
    );

    layer.on({
      click: () => setSelectedLgaKey(key),
      mouseover: (e) => {
        e.target.setStyle({ weight: 3, color: "#030454", fillOpacity: 0.92 });
        try {
          e.target.bringToFront();
        } catch {
          // Visual nicety only; ignore if the layer is already detached.
        }
      },
      mouseout: (e) => {
        e.target.setStyle(getFeatureStyle(feature));
      },
    });
  }

  // Key forces Leaflet layer re-render when styling inputs change
  const mapKey = [
    selectedPathway,
    selectedLgaKey || "none",
    filterStatus,
    search,
    isUsingPlaceholder ? "p" : "o",
    ciData?.results?.length || 0,
  ].join("-");

  function handlePathwayChange(id) {
    setSelectedPathway(id);
    setSelectedLgaKey(null);
  }

  function handleOpenEvidence() {
    if (selectedRow) {
      setSelectedLgaName(selectedRow.admin_name);
      setActiveTab("evidence");
    }
  }

  return (
    <div className="space-y-4">
      {/* Pathway selector */}
      <div className="flex flex-wrap gap-2">
        {LENS_PATHWAYS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handlePathwayChange(p.id)}
            className={`rounded-md px-4 py-2 text-xs font-black uppercase tracking-[0.08em] transition ${
              selectedPathway === p.id
                ? "bg-[#030454] text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-500 hover:border-[#030454] hover:text-[#030454]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Water/drainage governance message */}
      {selectedPathway === "water_drainage" && (
        <CommandNotice
          title="Water / drainage screening — not assessed in this release"
          tone="yellow"
        >
          Historical water and drainage screening is not assessed in this release because
          an approved methodology and required supporting data are not yet available. All
          LGAs are shown with a neutral fill only.
        </CommandNotice>
      )}

      {/* Persistent governance notice */}
      <CommandNotice tone="blue">
        Rule-based LGA screening for planning discussion and field validation. Not a hazard
        model, prediction, investment ranking, or regulatory determination.
      </CommandNotice>

      {/* LGA search and filter controls */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search LGA..."
          className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-[#030454] outline-none focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
        />
        {selectedPathway !== "water_drainage" && (
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-[#030454] outline-none focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
          >
            <option value="all">All statuses</option>
            <option value="ready_for_planning_discussion">Ready for planning discussion</option>
            <option value="requires_field_verification">Requires field verification</option>
            <option value="insufficient_evidence">Insufficient evidence</option>
            <option value="no_signal">No current screening signal</option>
          </select>
        )}
        {selectedLgaKey && (
          <button
            type="button"
            onClick={() => setSelectedLgaKey(null)}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.06em] text-slate-500 hover:border-[#030454] hover:text-[#030454]"
          >
            Clear selection
          </button>
        )}
      </div>

      {/* Map + side panel */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Map — spans 2 of 3 columns */}
        <div className="relative xl:col-span-2">
          {ciLoading ? (
            <div className="flex h-[460px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-sm text-slate-500">Loading climate intelligence data…</p>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-xl border border-slate-200">
              <MapContainer
                center={KADUNA_CENTER}
                zoom={KADUNA_ZOOM}
                minZoom={6}
                maxZoom={15}
                maxBounds={NIGERIA_BOUNDS}
                maxBoundsViscosity={1.0}
                scrollWheelZoom={false}
                style={{ height: "460px", width: "100%" }}
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitGeoJsonBounds geoJsonData={geoJsonData} />
                <ResetMapButton geoJsonData={geoJsonData} />
                <GeoJSON
                  key={mapKey}
                  data={geoJsonData}
                  style={getFeatureStyle}
                  onEachFeature={onEachFeature}
                />
              </MapContainer>
              <LensLegend selectedPathway={selectedPathway} />
              {loadError && (
                <div className="absolute bottom-20 right-4 z-[650] max-w-[200px] rounded-lg border border-[#F3F74B] bg-[#F3F74B]/90 p-3 text-xs text-[#030454] shadow-lg">
                  {loadError}
                </div>
              )}
            </div>
          )}
          <p className="mt-2 text-[11px] leading-4 text-slate-400">
            Scroll to zoom is disabled — use the map controls or pinch to zoom. Colours represent
            screening status for the selected pathway only.
          </p>
        </div>

        {/* Side panel — 1 column */}
        <div className="xl:col-span-1">
          <LensEvidencePanel
            lgaRow={selectedRow}
            selectedPathway={selectedPathway}
            evidencePeriod={evidencePeriod}
            onOpenEvidence={handleOpenEvidence}
          />
        </div>
      </div>
    </div>
  );
}
