import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";

const NIGERIA_BOUNDS = [
  [3.5, 2.5],   // southwest: latitude, longitude
  [14.5, 15.5], // northeast: latitude, longitude
];

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
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

function getMetricValue(profile, metric) {
  if (!profile) return 0;
  return Number(profile[getMetricField(metric)] || 0);
}

function getColor(value, metric, hasProfile) {
  if (!hasProfile) return "#94a3b8";

  if (metric === "adaptive_capacity") {
    if (value >= 70) return "#16a34a";
    if (value >= 55) return "#84cc16";
    if (value >= 40) return "#f59e0b";
    return "#dc2626";
  }

  if (value >= 75) return "#dc2626";
  if (value >= 60) return "#f97316";
  if (value >= 40) return "#f59e0b";
  return "#16a34a";
}

function FitBounds({ geojson }) {
  const map = useMap();

  useEffect(() => {
    if (!geojson) return;

    const layer = L.geoJSON(geojson);
    const bounds = layer.getBounds();

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [20, 20],
      });
    }
  }, [geojson, map]);

  return null;
}

function getStringPropertyEntries(feature) {
  const properties = feature?.properties || {};

  return Object.entries(properties)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => [key, String(value).trim()])
    .filter(([, value]) => value.length > 0);
}

function resolveFeatureProfile(feature, profileByName, profiles) {
  const entries = getStringPropertyEntries(feature);

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
    const found = entries.find(([entryKey]) => entryKey === key);

    if (found) {
      const candidate = found[1];
      const exactProfile = profileByName[normalizeName(candidate)];

      if (exactProfile) {
        return {
          displayName: candidate,
          matchedName: exactProfile.lga_name,
          profile: exactProfile,
          matchedBy: key,
        };
      }
    }
  }

  for (const [key, value] of entries) {
    const exactProfile = profileByName[normalizeName(value)];

    if (exactProfile) {
      return {
        displayName: value,
        matchedName: exactProfile.lga_name,
        profile: exactProfile,
        matchedBy: key,
      };
    }
  }

  for (const [key, value] of entries) {
    const normalizedValue = normalizeName(value);

    const partialProfile = profiles.find((profile) => {
      const normalizedProfileName = normalizeName(profile.lga_name);

      if (!normalizedValue || !normalizedProfileName) return false;

      return (
        normalizedValue.includes(normalizedProfileName) ||
        normalizedProfileName.includes(normalizedValue)
      );
    });

    if (partialProfile) {
      return {
        displayName: value,
        matchedName: partialProfile.lga_name,
        profile: partialProfile,
        matchedBy: key,
      };
    }
  }

  const fallbackName =
  entries.find(([key]) =>
    [
      "lganame",
      "lga_name",
      "LGA_NAME",
      "LGANAME",
      "shapeName",
      "shape_name",
      "name",
      "NAME",
      "LGA",
      "ADM2_NAME",
    ].includes(key)
  )?.[1] ||
  entries[0]?.[1] ||
  "Unnamed LGA";

  return {
    displayName: fallbackName,
    matchedName: "",
    profile: null,
    matchedBy: "",
  };
}

export default function ClimateRiskMap({
  profiles = [],
  metric = "overall",
  selectedLgaName = "",
  onSelectLgaName,
}) {
  const [geojson, setGeojson] = useState(null);
  const [geojsonSource, setGeojsonSource] = useState("");
  const [geojsonError, setGeojsonError] = useState("");

  useEffect(() => {
    async function loadGeojson() {
      setGeojsonError("");

      const sources = [
        {
          url: "/data/kaduna_lgas.geojson",
          label: "Official Kaduna LGA boundary",
        },
        {
          url: "/data/kaduna_lgas_dev.geojson",
          label: "Development placeholder boundary",
        },
      ];

      for (const source of sources) {
        try {
          const response = await fetch(source.url);

          if (!response.ok) {
            throw new Error(`Could not load ${source.url}`);
          }

          const data = await response.json();

          setGeojson(data);
          setGeojsonSource(source.label);

          console.log("Loaded GeoJSON source:", source.label);
          console.log("First GeoJSON feature properties:", data?.features?.[0]?.properties);

          return;
        } catch (error) {
          console.warn(error);
        }
      }

      setGeojsonError("Could not load any Kaduna LGA GeoJSON boundary file.");
    }

    loadGeojson();
  }, []);

  const profileByName = useMemo(() => {
    const lookup = {};

    profiles.forEach((profile) => {
      lookup[normalizeName(profile.lga_name)] = profile;
    });

    return lookup;
  }, [profiles]);

  function getResolved(feature) {
    return resolveFeatureProfile(feature, profileByName, profiles);
  }

  function styleFeature(feature) {
    const resolved = getResolved(feature);
    const value = getMetricValue(resolved.profile, metric);
    const isSelected =
      normalizeName(resolved.matchedName || resolved.displayName) ===
      normalizeName(selectedLgaName);

    return {
      fillColor: getColor(value, metric, Boolean(resolved.profile)),
      weight: isSelected ? 4 : 1.5,
      opacity: 1,
      color: isSelected ? "#0f172a" : "#ffffff",
      fillOpacity: isSelected ? 0.92 : 0.75,
    };
  }

  function onEachFeature(feature, layer) {
    const resolved = getResolved(feature);
    const value = getMetricValue(resolved.profile, metric);

    layer.bindPopup(`
      <div style="font-family: system-ui, sans-serif; min-width: 210px;">
        <strong>${resolved.matchedName || resolved.displayName}</strong><br/>
        <span>${getMetricLabel(metric)}: <strong>${formatNumber(value, 2)} / 100</strong></span><br/>
        ${
          resolved.profile
            ? `<span>Risk Level: <strong>${resolved.profile.risk_level_display}</strong></span><br/>
               <span>Year: ${resolved.profile.year}</span><br/>
               <span style="font-size: 11px; color: #64748b;">Matched by: ${resolved.matchedBy}</span>`
            : `<span>No matching risk profile found</span>`
        }
      </div>
    `);

    layer.on({
      click: () => {
        const nameToSelect = resolved.matchedName || resolved.displayName;

        if (onSelectLgaName && nameToSelect) {
          onSelectLgaName(nameToSelect);
        }
      },
      mouseover: (event) => {
        event.target.setStyle({
          weight: 3,
          color: "#0f172a",
          fillOpacity: 0.9,
        });
      },
      mouseout: (event) => {
        event.target.setStyle(styleFeature(feature));
      },
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative">
        <MapContainer
          center={[10.45, 7.75]}
          zoom={7}
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

          {geojson && <FitBounds geojson={geojson} />}

          {geojson && (
            <GeoJSON
              key={`${metric}-${selectedLgaName}-${profiles.length}-${geojsonSource}`}
              data={geojson}
              style={styleFeature}
              onEachFeature={onEachFeature}
            />
          )}
        </MapContainer>

        <div className="absolute bottom-4 left-4 z-[500] rounded-xl bg-white/95 px-4 py-2 text-xs text-slate-600 shadow">
          Boundary source: {geojsonSource || "Loading..."}
        </div>
      </div>

      {geojsonError && (
        <div className="border-t border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {geojsonError}
        </div>
      )}
    </div>
  );
}