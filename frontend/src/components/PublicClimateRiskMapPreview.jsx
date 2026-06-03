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

const COLORS = {
  green: "#009B35",
  blue: "#030454",
  yellow: "#F3F74B",
  white: "#FFFFFF",
  border: "#D8DDE2",
  muted: "#F5F7F8",
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

  if (number >= 75) return COLORS.blue;
  if (number >= 60) return "#1E2378";
  if (number >= 40) return COLORS.yellow;
  if (number > 0) return COLORS.green;

  return "#E6EAEC";
}

function getRiskOpacity(value) {
  const number = Number(value || 0);

  if (number >= 75) return 0.9;
  if (number >= 60) return 0.78;
  if (number >= 40) return 0.72;
  if (number > 0) return 0.72;

  return 0.2;
}

function buildProfileLookup(profiles) {
  return profiles.reduce((lookup, profile) => {
    lookup[normalizeName(profile.lga_name)] = profile;
    return lookup;
  }, {});
}

function MapResizeAndFitHandler({ geoJsonData }) {
  const map = useMap();

  useEffect(() => {
    if (!geoJsonData?.features?.length) return undefined;

    const runResizeAndFit = () => {
      try {
        map.invalidateSize();

        const layer = L.geoJSON(geoJsonData);
        const bounds = layer.getBounds();

        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            padding: [28, 28],
            maxZoom: 9,
          });
        }
      } catch (error) {
        console.error(error);
      }
    };

    const firstTimer = window.setTimeout(runResizeAndFit, 150);
    const secondTimer = window.setTimeout(runResizeAndFit, 600);

    return () => {
      window.clearTimeout(firstTimer);
      window.clearTimeout(secondTimer);
    };
  }, [geoJsonData, map]);

  return null;
}

function ResetMapButton({ geoJsonData }) {
  const map = useMap();

  function handleReset() {
    try {
      map.invalidateSize();

      if (geoJsonData?.features?.length) {
        const bounds = L.geoJSON(geoJsonData).getBounds();

        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            padding: [28, 28],
            maxZoom: 9,
          });
          return;
        }
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
      className="absolute right-4 top-4 z-[650] rounded-sm bg-[#030454] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-white shadow-lg transition hover:bg-[#009B35]"
    >
      Reset
    </button>
  );
}

function MapLegend() {
  const items = [
    { label: "Low", color: COLORS.green },
    { label: "Moderate", color: COLORS.yellow },
    { label: "High", color: "#1E2378" },
    { label: "Very High", color: COLORS.blue },
  ];

  return (
    <div className="absolute bottom-4 left-4 z-[650] rounded-sm border border-slate-200 bg-white/95 p-4 text-xs shadow-lg backdrop-blur">
      <p className="mb-3 font-black uppercase tracking-[0.1em] text-[#030454]">
        Risk Legend
      </p>

      <div className="grid gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="font-medium text-slate-600">{item.label}</span>
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
      color: COLORS.white,
      weight: 1.6,
      fillColor: getRiskColor(score),
      fillOpacity: profile ? getRiskOpacity(score) : 0.2,
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
      <div style="min-width: 220px;">
        <strong>${escapeHtml(profile.lga_name)}</strong><br/>
        <span>Risk Class: ${escapeHtml(profile.risk_level_display)}</span><br/>
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
          color: COLORS.blue,
          fillOpacity: 0.96,
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
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-sm border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {dataError}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-sm bg-slate-50 text-sm text-slate-500">
        Loading climate risk map...
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-sm border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        {mapError}
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-sm border border-slate-200 bg-white">
      <MapContainer
        center={KADUNA_CENTER}
        zoom={KADUNA_ZOOM}
        minZoom={6}
        maxZoom={15}
        maxBounds={NIGERIA_BOUNDS}
        maxBoundsViscosity={1.0}
        scrollWheelZoom={false}
        className="h-full min-h-[420px] w-full"
        style={{ height: "100%", minHeight: "420px", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapResizeAndFitHandler geoJsonData={geoJsonData} />

        {geoJsonData?.features?.length ? (
          <GeoJSON
            key={`${summary.year || "latest"}-${profiles.length}-${
              geoJsonData.features.length
            }`}
            data={geoJsonData}
            style={getFeatureStyle}
            onEachFeature={onEachFeature}
          />
        ) : null}

        <ResetMapButton geoJsonData={geoJsonData} />
      </MapContainer>

      <MapLegend />
    </div>
  );
}