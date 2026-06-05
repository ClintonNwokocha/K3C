import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { getPublicClimateRiskProfiles } from "../services/api";
import "leaflet/dist/leaflet.css";

const KADUNA_CENTER = [10.45, 7.75];
const KADUNA_ZOOM = 7;

const NIGERIA_BOUNDS = [
  [3.5, 2.5],
  [14.5, 15.5],
];

const RISK_LAYER_CONFIG = {
  overall: {
    label: "Overall Risk",
    field: "overall_risk_score",
    reverse: false,
    note: "Higher score means higher overall climate risk.",
  },
  flood: {
    label: "Flood Risk",
    field: "flood_risk_score",
    reverse: false,
    note: "Higher score means higher flood concern.",
  },
  drought: {
    label: "Drought Risk",
    field: "drought_risk_score",
    reverse: false,
    note: "Higher score means higher drought concern.",
  },
  heat: {
    label: "Heat Risk",
    field: "heat_risk_score",
    reverse: false,
    note: "Higher score means higher heat concern.",
  },
  erosion: {
    label: "Erosion Risk",
    field: "erosion_risk_score",
    reverse: false,
    note: "Higher score means higher erosion concern.",
  },
  exposure: {
    label: "Exposure",
    field: "exposure_score",
    reverse: false,
    note: "Higher score means more people, assets or infrastructure are exposed.",
  },
  vulnerability: {
    label: "Vulnerability",
    field: "vulnerability_score",
    reverse: false,
    note: "Higher score means greater vulnerability.",
  },
  adaptive_capacity: {
    label: "Adaptive Capacity",
    field: "adaptive_capacity_score",
    reverse: true,
    note: "Higher score means stronger capacity. Weak capacity is treated as higher concern.",
  },
};

function getLayerConfig(activeLayer) {
  return RISK_LAYER_CONFIG[activeLayer] || RISK_LAYER_CONFIG.overall;
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/`/g, "'")
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

function hasValidScore(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

function formatNumber(value) {
  if (!hasValidScore(value)) return "—";

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
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

  const keys = [
    "lganame",
    "lga_name",
    "LGA_NAME",
    "LGA",
    "lga",
    "LGANAME",
    "ADM2_NAME",
    "ADM2_EN",
    "NAME_2",
    "NAME",
    "name",
  ];

  for (const key of keys) {
    if (properties[key]) {
      return String(properties[key]).trim();
    }
  }

  return String(Object.values(properties)[0] || "Unnamed LGA").trim();
}

function getLayerColor(value, layerConfig) {
  if (!hasValidScore(value)) return "#CBD5E1";

  const number = Number(value);

  if (layerConfig.reverse) {
    if (number >= 70) return "#009B35";
    if (number >= 55) return "#030454";
    if (number >= 40) return "#F3F74B";
    return "#B91C1C";
  }

  if (number >= 75) return "#B91C1C";
  if (number >= 60) return "#EA580C";
  if (number >= 40) return "#F3F74B";
  return "#009B35";
}

function getLayerClass(value, layerConfig) {
  if (!hasValidScore(value)) return "No public data";

  const number = Number(value);

  if (layerConfig.reverse) {
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

function buildProfileLookup(profiles) {
  return profiles.reduce((lookup, profile) => {
    lookup[normalizeName(profile.lga_name)] = profile;
    return lookup;
  }, {});
}

function FitGeoJsonBounds({ geoJsonData }) {
  const map = useMap();

  useEffect(() => {
    if (!geoJsonData) return undefined;

    const timer = window.setTimeout(() => {
      try {
        map.invalidateSize();

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
    }, 200);

    return () => window.clearTimeout(timer);
  }, [geoJsonData, map]);

  return null;
}

function ResetMapButton({ geoJsonData }) {
  const map = useMap();

  function handleReset() {
    try {
      map.invalidateSize();

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
      className="absolute right-4 top-4 z-[650] rounded-md bg-[#030454] px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-white shadow-lg transition hover:bg-[#009B35]"
    >
      Reset
    </button>
  );
}

function MapLegend({ layerConfig }) {
  const items = layerConfig.reverse
    ? [
        { label: "Very Weak", color: "#B91C1C", range: "0–39" },
        { label: "Weak", color: "#F3F74B", range: "40–54" },
        { label: "Fair", color: "#030454", range: "55–69" },
        { label: "Strong", color: "#009B35", range: "70–100" },
      ]
    : [
        { label: "Low", color: "#009B35", range: "0–39" },
        { label: "Moderate", color: "#F3F74B", range: "40–59" },
        { label: "High", color: "#EA580C", range: "60–74" },
        { label: "Very High", color: "#B91C1C", range: "75–100" },
      ];

  return (
    <div className="absolute bottom-4 left-4 z-[650] w-72 rounded-lg border border-slate-200 bg-white/95 p-4 text-xs shadow-lg backdrop-blur">
      <p className="mb-1 font-black uppercase tracking-[0.1em] text-[#030454]">
        {layerConfig.label} Legend
      </p>

      <p className="mb-3 text-[11px] leading-5 text-slate-500">
        {layerConfig.note}
      </p>

      <div className="grid gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-6"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-sm border border-white shadow-sm"
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

export default function PublicClimateRiskMapPreview({
  activeLayer = "overall",
  height = "650px",
  onProfilesLoaded,
}) {
  const [profiles, setProfiles] = useState([]);
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const layerConfig = getLayerConfig(activeLayer);
  const profileLookup = useMemo(() => buildProfileLookup(profiles), [profiles]);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const [profileData, geoResponse] = await Promise.all([
          getPublicClimateRiskProfiles(),
          fetch("/data/kaduna_lgas.geojson", {
            cache: "no-cache",
          }),
        ]);

        if (!geoResponse.ok) {
          throw new Error("Kaduna LGA boundary file could not be loaded.");
        }

        const geoJson = await geoResponse.json();

        if (!geoJson?.features?.length) {
          throw new Error("Kaduna LGA boundary file has no features.");
        }

        const loadedProfiles = profileData.results || [];

        if (mounted) {
          setProfiles(loadedProfiles);
          setGeoJsonData(geoJson);

          if (typeof onProfilesLoaded === "function") {
            onProfilesLoaded(loadedProfiles);
          }
        }
      } catch (error) {
        console.error(error);

        if (mounted) {
          setErrorMessage(
            "Could not load the public climate risk map. Check that frontend/public/data/kaduna_lgas.geojson exists and that public risk profiles are available."
          );
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [onProfilesLoaded]);

  function resolveProfile(feature) {
    const featureName = getFeatureDisplayName(feature);
    return profileLookup[normalizeName(featureName)] || null;
  }

  function getLayerScore(profile) {
    return profile?.[layerConfig.field];
  }

  function getFeatureStyle(feature) {
    const profile = resolveProfile(feature);
    const score = getLayerScore(profile);

    return {
      color: "#ffffff",
      weight: 1.4,
      fillColor: getLayerColor(score, layerConfig),
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

    const selectedScore = getLayerScore(profile);

    return `
      <div style="min-width: 260px;">
        <strong>${escapeHtml(profile.lga_name)}</strong><br/>
        <span>${escapeHtml(layerConfig.label)}: <strong>${formatNumber(
          selectedScore
        )} / 100</strong></span><br/>
        <span>Class: ${escapeHtml(
          getLayerClass(selectedScore, layerConfig)
        )}</span><br/>
        <hr style="margin: 8px 0;" />
        <span>Overall Risk: ${formatNumber(profile.overall_risk_score)} / 100</span><br/>
        <span>Flood: ${formatNumber(profile.flood_risk_score)} / 100</span><br/>
        <span>Drought: ${formatNumber(profile.drought_risk_score)} / 100</span><br/>
        <span>Heat: ${formatNumber(profile.heat_risk_score)} / 100</span><br/>
        <span>Erosion: ${formatNumber(profile.erosion_risk_score)} / 100</span><br/>
        <span>Exposure: ${formatNumber(profile.exposure_score)} / 100</span><br/>
        <span>Vulnerability: ${formatNumber(profile.vulnerability_score)} / 100</span><br/>
        <span>Adaptive Capacity: ${formatNumber(profile.adaptive_capacity_score)} / 100</span>
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
          color: "#030454",
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

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-[#DFE3E4] text-sm text-slate-500"
        style={{ height }}
      >
        Loading climate risk map...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-800">
        {errorMessage}
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
        style={{ height, width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitGeoJsonBounds geoJsonData={geoJsonData} />
        <ResetMapButton geoJsonData={geoJsonData} />

        <GeoJSON
          key={`${activeLayer}-${profiles.length}`}
          data={geoJsonData}
          style={getFeatureStyle}
          onEachFeature={onEachFeature}
        />
      </MapContainer>

      <MapLegend layerConfig={layerConfig} />
    </div>
  );
}