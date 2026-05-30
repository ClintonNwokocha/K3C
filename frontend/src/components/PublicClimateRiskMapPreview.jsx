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

  if (number >= 75) return "#B91C1C";
  if (number >= 60) return "#EA580C";
  if (number >= 40) return "#C8A84A";
  if (number > 0) return "#4E7492";

  return "#DFE3E4";
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
          padding: [24, 24],
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
          padding: [24, 24],
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
      className="absolute right-4 top-4 z-[650] rounded-md bg-[#0B1726] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-white shadow-lg hover:bg-[#214560]"
    >
      Reset
    </button>
  );
}

function MapLegend() {
  const items = [
    { label: "Low", color: "#4E7492", range: "0–39" },
    { label: "Moderate", color: "#C8A84A", range: "40–59" },
    { label: "High", color: "#EA580C", range: "60–74" },
    { label: "Very High", color: "#B91C1C", range: "75–100" },
    { label: "No Data", color: "#DFE3E4", range: "—" },
  ];

  return (
    <div className="absolute bottom-4 left-4 z-[650] rounded-lg border border-slate-200 bg-white/95 p-4 text-xs shadow-lg backdrop-blur">
      <p className="mb-3 font-bold uppercase tracking-[0.1em] text-[#0B1726]">
        Risk Legend
      </p>

      <div className="grid gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-6"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-slate-600">{item.label}</span>
            </div>

            <span className="font-bold text-slate-400">{item.range}</span>
          </div>
        ))}
      </div>
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
      weight: 1.4,
      fillColor: getRiskColor(score),
      fillOpacity: profile ? 0.82 : 0.45,
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
        <span>Risk Class: ${escapeHtml(profile.risk_level_display)}</span><br/>
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
          color: "#0B1726",
          fillOpacity: 0.95,
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

  if (dataError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {dataError}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-lg bg-[#DFE3E4] text-sm text-slate-500">
        Loading climate risk map...
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        {mapError}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-[#D0D7DB] bg-[#DFE3E4]">
      <MapContainer
        center={KADUNA_CENTER}
        zoom={KADUNA_ZOOM}
        minZoom={6}
        maxZoom={15}
        maxBounds={NIGERIA_BOUNDS}
        maxBoundsViscosity={1.0}
        scrollWheelZoom={false}
        style={{ height: "360px", width: "100%" }}
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
  );
}