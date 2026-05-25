import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { getPublicClimateRiskProfiles } from "../services/api";

const KADUNA_CENTER = [10.45, 7.75];
const KADUNA_ZOOM = 7;

const NIGERIA_BOUNDS = [
  [3.5, 2.5],
  [14.5, 15.5],
];

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
    "ADM2_NAME",
    "ADM2_EN",
    "NAME_2",
    "NAME",
    "name",
    "shapeName",
    "shape_name",
  ];

  for (const key of preferredKeys) {
    if (properties[key]) {
      return String(properties[key]).trim();
    }
  }

  return String(Object.values(properties)[0] || "Unnamed LGA").trim();
}

function getRiskColor(value) {
  const number = Number(value || 0);

  if (number >= 75) return "#ef4444";
  if (number >= 60) return "#f97316";
  if (number >= 40) return "#f59e0b";
  if (number > 0) return "#22c55e";

  return "#cbd5e1";
}

function getRiskLabel(value) {
  const number = Number(value || 0);

  if (number >= 75) return "Very High";
  if (number >= 60) return "High";
  if (number >= 40) return "Moderate";
  if (number > 0) return "Low";

  return "No Data";
}

function buildProfileLookup(profiles) {
  return profiles.reduce((lookup, profile) => {
    lookup[normalizeName(profile.lga_name)] = profile;
    return lookup;
  }, {});
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
      className="absolute right-4 top-4 z-[650] rounded-xl border border-slate-200 bg-white/95 px-4 py-2 text-xs font-semibold text-slate-700 shadow-lg backdrop-blur hover:bg-slate-50"
    >
      Reset View
    </button>
  );
}

function MapLegend() {
  const items = [
    { label: "Low", color: "#22c55e", range: "0–39" },
    { label: "Moderate", color: "#f59e0b", range: "40–59" },
    { label: "High", color: "#f97316", range: "60–74" },
    { label: "Very High", color: "#ef4444", range: "75–100" },
    { label: "No Data", color: "#cbd5e1", range: "—" },
  ];

  return (
    <div className="absolute bottom-4 left-4 z-[650] w-64 rounded-2xl border border-slate-200 bg-white/95 p-4 text-xs shadow-lg backdrop-blur">
      <p className="mb-3 font-bold text-slate-800">Climate Risk Legend</p>

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
        Risk indexes are normalized from 0 to 100.
      </p>
    </div>
  );
}

export default function PublicClimateRiskMapPreview() {
  const [riskData, setRiskData] = useState(null);
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const [dataError, setDataError] = useState("");

  async function loadRiskProfiles() {
    setIsLoading(true);
    setDataError("");

    try {
      const data = await getPublicClimateRiskProfiles();
      setRiskData(data);
    } catch (error) {
      console.error(error);
      setDataError("Could not load public climate risk profiles.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRiskProfiles();
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadGeoJson() {
      try {
        const response = await fetch("/data/kaduna_lgas.geojson", {
          cache: "no-cache",
        });

        if (!response.ok) {
          throw new Error("Kaduna LGA boundary file could not be loaded.");
        }

        const data = await response.json();

        if (!data?.features?.length) {
          throw new Error("Kaduna LGA boundary file has no features.");
        }

        if (isMounted) {
          setGeoJsonData(data);
          setMapError("");
        }
      } catch (error) {
        console.error(error);

        if (isMounted) {
          setGeoJsonData(null);
          setMapError(
            "Kaduna LGA boundary file is not available. Add public/data/kaduna_lgas.geojson to show the public map."
          );
        }
      }
    }

    loadGeoJson();

    return () => {
      isMounted = false;
    };
  }, []);

  const profiles = riskData?.results || [];
  const summary = riskData?.summary || {};
  const profileLookup = useMemo(() => buildProfileLookup(profiles), [profiles]);

  function resolveProfile(feature) {
    const featureName = getFeatureDisplayName(feature);
    return profileLookup[normalizeName(featureName)] || null;
  }

  function getFeatureStyle(feature) {
    const profile = resolveProfile(feature);
    const score = profile?.overall_risk_score || 0;

    return {
      color: "#ffffff",
      weight: 1.5,
      fillColor: getRiskColor(score),
      fillOpacity: profile ? 0.78 : 0.45,
      opacity: 1,
      dashArray: profile ? "" : "2",
    };
  }

  function buildPopupHtml(feature) {
    const featureName = getFeatureDisplayName(feature);
    const profile = resolveProfile(feature);

    if (!profile) {
      return `
        <div style="min-width: 220px;">
          <strong>${escapeHtml(featureName)}</strong><br/>
          <span>No public climate risk profile available.</span>
        </div>
      `;
    }

    return `
      <div style="min-width: 240px;">
        <strong>${escapeHtml(profile.lga_name)}</strong><br/>
        <span>Overall Risk: <strong>${formatNumber(
          profile.overall_risk_score,
          2
        )} / 100</strong></span><br/>
        <span>Risk Class: ${escapeHtml(
          profile.risk_level_display || getRiskLabel(profile.overall_risk_score)
        )}</span><br/>
        <span>Flood: ${formatNumber(profile.flood_risk_score, 2)} / 100</span><br/>
        <span>Drought: ${formatNumber(profile.drought_risk_score, 2)} / 100</span><br/>
        <span>Heat: ${formatNumber(profile.heat_risk_score, 2)} / 100</span><br/>
        <span>Year: ${escapeHtml(profile.year || "—")}</span>
      </div>
    `;
  }

  function onEachFeature(feature, layer) {
    const profile = resolveProfile(feature);
    const name = profile?.lga_name || getFeatureDisplayName(feature);

    layer.bindPopup(buildPopupHtml(feature));
    layer.bindTooltip(name, {
      sticky: true,
      direction: "top",
    });

    layer.on({
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
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            Public Climate Risk Map
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            Kaduna LGA Risk Preview
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Public map preview of LGA-level climate risk. Click an LGA to view
            its public risk summary.
          </p>
        </div>

        <button
          type="button"
          onClick={loadRiskProfiles}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh Map Data
        </button>
      </div>

      {dataError && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {dataError}
        </div>
      )}

      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">Map Year</p>
          <p className="mt-2 text-2xl font-bold">{summary.year || "—"}</p>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">LGAs Mapped</p>
          <p className="mt-2 text-2xl font-bold">{summary.total_lgas || 0}</p>
        </div>

        <div className="rounded-2xl bg-orange-50 p-4">
          <p className="text-sm text-orange-700">High Risk</p>
          <p className="mt-2 text-2xl font-bold text-orange-700">
            {summary.risk_counts?.high || 0}
          </p>
        </div>

        <div className="rounded-2xl bg-red-50 p-4">
          <p className="text-sm text-red-700">Very High Risk</p>
          <p className="mt-2 text-2xl font-bold text-red-700">
            {summary.risk_counts?.very_high || 0}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
          Loading public climate risk map...
        </div>
      ) : mapError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          {mapError}
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-slate-200">
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
              key={`${summary.year || "latest"}-${profiles.length}`}
              data={geoJsonData}
              style={getFeatureStyle}
              onEachFeature={onEachFeature}
            />
          </MapContainer>

          <MapLegend />
        </div>
      )}
    </section>
  );
}