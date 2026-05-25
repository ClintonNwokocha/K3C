import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";

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
      properties: {
        lganame: "Birnin Gwari",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [6.1, 10.7],
            [6.8, 10.7],
            [6.8, 11.4],
            [6.1, 11.4],
            [6.1, 10.7],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        lganame: "Chikun",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.0, 10.1],
            [7.6, 10.1],
            [7.6, 10.7],
            [7.0, 10.7],
            [7.0, 10.1],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        lganame: "Kaduna South",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.35, 10.35],
            [7.55, 10.35],
            [7.55, 10.55],
            [7.35, 10.55],
            [7.35, 10.35],
          ],
        ],
      },
    },
  ],
};

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/`/g, "'")
    .replace(/ʻ/g, "'")
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

function formatNumber(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || value === "") return "—";

  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getMetricField(metric) {
  const metricMap = {
    overall: "overall_risk_score",
    flood: "flood_risk_score",
    drought: "drought_risk_score",
    heat: "heat_risk_score",
    erosion: "erosion_risk_score",
    exposure: "exposure_score",
    vulnerability: "vulnerability_score",
    adaptive_capacity: "adaptive_capacity_score",
  };

  return metricMap[metric] || "overall_risk_score";
}

function getMetricLabel(metric) {
  const labels = {
    overall: "Overall Climate Risk Index",
    flood: "Flood Risk Index",
    drought: "Drought Risk Index",
    heat: "Heat Risk Index",
    erosion: "Erosion Risk Index",
    exposure: "Exposure Index",
    vulnerability: "Vulnerability Index",
    adaptive_capacity: "Adaptive Capacity Index",
  };

  return labels[metric] || "Overall Climate Risk Index";
}

function getScoreClass(value, metric) {
  const number = Number(value || 0);

  if (metric === "adaptive_capacity") {
    if (number >= 70) return "Strong";
    if (number >= 55) return "Fair";
    if (number >= 40) return "Weak";
    return "Very Weak";
  }

  if (number >= 75) return "Very High";
  if (number >= 60) return "High";
  if (number >= 40) return "Moderate";
  return "Low";
}

function getMetricColor(value, metric) {
  if (value === null || value === undefined || value === "") {
    return "#cbd5e1";
  }

  const number = Number(value || 0);

  if (metric === "adaptive_capacity") {
    if (number >= 70) return "#22c55e";
    if (number >= 55) return "#84cc16";
    if (number >= 40) return "#f59e0b";
    return "#ef4444";
  }

  if (number >= 75) return "#ef4444";
  if (number >= 60) return "#f97316";
  if (number >= 40) return "#f59e0b";
  return "#22c55e";
}

function getLegendItems(metric) {
  if (metric === "adaptive_capacity") {
    return [
      { label: "Very Weak Capacity", color: "#ef4444", range: "0–39" },
      { label: "Weak Capacity", color: "#f59e0b", range: "40–54" },
      { label: "Fair Capacity", color: "#84cc16", range: "55–69" },
      { label: "Strong Capacity", color: "#22c55e", range: "70–100" },
    ];
  }

  return [
    { label: "Low", color: "#22c55e", range: "0–39" },
    { label: "Moderate", color: "#f59e0b", range: "40–59" },
    { label: "High", color: "#f97316", range: "60–74" },
    { label: "Very High", color: "#ef4444", range: "75–100" },
  ];
}

function getFeatureDisplayName(feature) {
  const properties = feature?.properties || {};
  const preferredKeys = [
    "lganame",
    "lga_name",
    "LGA_NAME",
    "lgaName",
    "LGA",
    "lga",
    "LGANAME",
    "LGAName",
    "ADM2_NAME",
    "ADM2_EN",
    "NAME_2",
    "NAME",
    "name",
    "shapeName",
    "shape_name",
    "admin2Name",
    "admin2_name",
    "district",
    "District",
  ];

  for (const key of preferredKeys) {
    if (properties[key]) {
      return String(properties[key]).trim();
    }
  }

  const entries = Object.entries(properties);
  return String(entries[0]?.[1] || "Unnamed LGA").trim();
}

function buildProfileLookup(profiles) {
  return profiles.reduce((lookup, profile) => {
    lookup[normalizeName(profile.lga_name)] = profile;
    return lookup;
  }, {});
}

function MapLegend({ metric }) {
  const items = getLegendItems(metric);

  return (
    <div className="absolute bottom-4 left-4 z-[500] w-64 rounded-2xl border border-slate-200 bg-white/95 p-4 text-xs shadow-lg backdrop-blur">
      <p className="mb-3 font-bold text-slate-800">Map Legend</p>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-slate-600">{item.label}</span>
            </div>

            <span className="font-semibold text-slate-500">{item.range}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        Scores are normalized indexes from 0 to 100.
      </p>
    </div>
  );
}

function ResetMapButton({ geoJsonData }) {
  const map = useMap();

  function handleReset() {
    try {
      const bounds = L.geoJSON(geoJsonData).getBounds();

      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [30, 30],
          maxZoom: 9,
        });
        return;
      }
    } catch (error) {
      console.error(error);
    }

    map.setView(KADUNA_CENTER, KADUNA_ZOOM);
  }

  return (
    <button
      type="button"
      onClick={handleReset}
      className="absolute right-4 top-4 z-[500] rounded-xl border border-slate-200 bg-white/95 px-4 py-2 text-xs font-semibold text-slate-700 shadow-lg backdrop-blur hover:bg-slate-50"
    >
      Reset View
    </button>
  );
}

function SelectedLgaNotice({ selectedLgaName }) {
  if (!selectedLgaName) return null;

  return (
    <div className="absolute left-20 top-4 z-[650] max-w-xs rounded-2xl border border-emerald-200 bg-emerald-50/95 px-4 py-3 text-xs text-emerald-800 shadow-lg backdrop-blur">
      <p className="font-bold">Selected LGA</p>
      <p className="mt-1">{selectedLgaName}</p>
    </div>
  );
}

function FitGeoJsonBounds({ geoJsonData }) {
  const map = useMap();

  useEffect(() => {
    if (!geoJsonData) return;

    try {
      const bounds = L.geoJSON(geoJsonData).getBounds();

      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [30, 30],
          maxZoom: 9,
        });
      }
    } catch (error) {
      console.error(error);
    }
  }, [geoJsonData, map]);

  return null;
}

export default function ClimateRiskMap({
  profiles = [],
  metric = "overall",
  selectedLgaName = "",
  onSelectLgaName,
}) {
  const [geoJsonData, setGeoJsonData] = useState(PLACEHOLDER_LGA_GEOJSON);
  const [isUsingPlaceholder, setIsUsingPlaceholder] = useState(true);
  const [loadError, setLoadError] = useState("");

  const profileLookup = useMemo(() => buildProfileLookup(profiles), [profiles]);
  const metricField = getMetricField(metric);
  const metricLabel = getMetricLabel(metric);

  useEffect(() => {
    let isMounted = true;

    async function loadGeoJson() {
      try {
        const response = await fetch("/data/kaduna_lgas.geojson", {
          cache: "no-cache",
        });

        if (!response.ok) {
          throw new Error("Official Kaduna LGA GeoJSON was not found.");
        }

        const data = await response.json();

        if (!data?.features?.length) {
          throw new Error("GeoJSON file has no features.");
        }

        if (isMounted) {
          setGeoJsonData(data);
          setIsUsingPlaceholder(false);
          setLoadError("");
        }
      } catch (error) {
        console.error(error);

        if (isMounted) {
          setGeoJsonData(PLACEHOLDER_LGA_GEOJSON);
          setIsUsingPlaceholder(true);
          setLoadError(
            "Official Kaduna LGA GeoJSON could not be loaded. Showing development placeholder boundaries."
          );
        }
      }
    }

    loadGeoJson();

    return () => {
      isMounted = false;
    };
  }, []);

  function resolveFeatureProfile(feature) {
    const featureName = getFeatureDisplayName(feature);
    return profileLookup[normalizeName(featureName)] || null;
  }

  function getFeatureStyle(feature) {
    const featureName = getFeatureDisplayName(feature);
    const profile = resolveFeatureProfile(feature);
    const value = profile ? profile[metricField] : null;
    const isSelected =
      normalizeName(featureName) === normalizeName(selectedLgaName) ||
      normalizeName(profile?.lga_name) === normalizeName(selectedLgaName);

    return {
      color: isSelected ? "#064e3b" : "#ffffff",
      weight: isSelected ? 4 : 1.5,
      fillColor: getMetricColor(value, metric),
      fillOpacity: isSelected ? 0.9 : 0.72,
      opacity: 1,
      dashArray: isSelected ? "" : "2",
    };
  }

  function buildPopupHtml(feature) {
    const featureName = getFeatureDisplayName(feature);
    const profile = resolveFeatureProfile(feature);
    const lgaName = profile?.lga_name || featureName;
    const value = profile ? profile[metricField] : null;

    if (!profile) {
      return `
        <div style="min-width: 220px;">
          <strong>${escapeHtml(lgaName)}</strong><br/>
          <span>No matching climate risk profile found.</span><br/>
          <span>Check GeoJSON LGA name and database LGA name.</span>
        </div>
      `;
    }

    return `
      <div style="min-width: 230px;">
        <strong>${escapeHtml(lgaName)}</strong><br/>
        <span>${escapeHtml(metricLabel)}: <strong>${formatNumber(
      value,
      2
    )} / 100</strong></span><br/>
        <span>Class: ${escapeHtml(getScoreClass(value, metric))}</span><br/>
        <span>Overall Risk: ${formatNumber(
          profile.overall_risk_score,
          2
        )} / 100</span><br/>
        <span>Risk Level: ${escapeHtml(
          profile.risk_level_display || profile.risk_level || "—"
        )}</span><br/>
        <span>Year: ${escapeHtml(profile.year || "—")}</span>
      </div>
    `;
  }

  function onEachFeature(feature, layer) {
    const featureName = getFeatureDisplayName(feature);
    const profile = resolveFeatureProfile(feature);
    const lgaName = profile?.lga_name || featureName;

    layer.bindPopup(buildPopupHtml(feature));
    layer.bindTooltip(lgaName, {
      sticky: true,
      direction: "top",
    });

    layer.on({
      click: () => {
        if (onSelectLgaName) {
          onSelectLgaName(lgaName);
        }
      },
      mouseover: (event) => {
        event.target.setStyle({
          weight: 4,
          color: "#0f172a",
          fillOpacity: 0.9,
        });

        if (event.target.bringToFront) {
          event.target.bringToFront();
        }
      },
      mouseout: (event) => {
        event.target.setStyle(getFeatureStyle(feature));
      },
    });
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200">
      <MapContainer
        center={KADUNA_CENTER}
        zoom={KADUNA_ZOOM}
        minZoom={6}
        maxZoom={15}
        maxBounds={NIGERIA_BOUNDS}
        maxBoundsViscosity={1.0}
        scrollWheelZoom={false}
        style={{ height: "420px", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitGeoJsonBounds geoJsonData={geoJsonData} />

        <ResetMapButton geoJsonData={geoJsonData} />

        <GeoJSON
          key={`${metric}-${selectedLgaName}-${isUsingPlaceholder ? "placeholder" : "official"}`}
          data={geoJsonData}
          style={getFeatureStyle}
          onEachFeature={onEachFeature}
        />
      </MapContainer>

      <SelectedLgaNotice selectedLgaName={selectedLgaName} />

      <MapLegend metric={metric} />

      {loadError && (
        <div className="absolute bottom-4 right-4 z-[500] max-w-xs rounded-2xl border border-amber-200 bg-amber-50/95 p-4 text-xs text-amber-800 shadow-lg backdrop-blur">
          <p className="font-bold">Boundary Notice</p>
          <p className="mt-1">{loadError}</p>
        </div>
      )}
    </div>
  );
}