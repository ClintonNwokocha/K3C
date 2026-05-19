import { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function getMetricValue(profile, metric) {
  if (!profile) return 0;

  const metricMap = {
    overall: "overall_risk_score",
    flood: "flood_risk_score",
    drought: "drought_risk_score",
    heat: "heat_risk_score",
    erosion: "erosion_risk_score",
    vulnerability: "vulnerability_score",
    adaptive_capacity: "adaptive_capacity_score",
  };

  return Number(profile[metricMap[metric] || "overall_risk_score"] || 0);
}

function getMetricLabel(metric) {
  const labels = {
    overall: "Overall Risk",
    flood: "Flood Risk",
    drought: "Drought Risk",
    heat: "Heat Risk",
    erosion: "Erosion Risk",
    vulnerability: "Vulnerability",
    adaptive_capacity: "Adaptive Capacity",
  };

  return labels[metric] || "Overall Risk";
}

function getColor(value, metric) {
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

export default function ClimateRiskMap({ profiles = [], metric = "overall" }) {
  const [geojson, setGeojson] = useState(null);

  useEffect(() => {
    fetch("/data/kaduna_lgas_dev.geojson")
      .then((response) => response.json())
      .then((data) => setGeojson(data))
      .catch((error) => {
        console.error("Could not load Kaduna LGA GeoJSON", error);
      });
  }, []);

  const profileByName = useMemo(() => {
    const lookup = {};

    profiles.forEach((profile) => {
      lookup[normalizeName(profile.lga_name)] = profile;
    });

    return lookup;
  }, [profiles]);

  function styleFeature(feature) {
    const lgaName = feature?.properties?.lga_name;
    const profile = profileByName[normalizeName(lgaName)];
    const value = getMetricValue(profile, metric);

    return {
      fillColor: getColor(value, metric),
      weight: 1.5,
      opacity: 1,
      color: "#ffffff",
      fillOpacity: 0.75,
    };
  }

  function onEachFeature(feature, layer) {
    const lgaName = feature?.properties?.lga_name;
    const profile = profileByName[normalizeName(lgaName)];
    const value = getMetricValue(profile, metric);

    layer.bindPopup(`
      <div style="font-family: system-ui, sans-serif; min-width: 180px;">
        <strong>${lgaName}</strong><br/>
        <span>${getMetricLabel(metric)}: <strong>${formatNumber(value, 2)}</strong></span><br/>
        ${
          profile
            ? `<span>Risk Level: <strong>${profile.risk_level_display}</strong></span><br/>
               <span>Year: ${profile.year}</span>`
            : `<span>No risk profile found</span>`
        }
      </div>
    `);

    layer.on({
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
      <MapContainer
        center={[10.45, 7.75]}
        zoom={7}
        scrollWheelZoom={false}
        style={{ height: "520px", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {geojson && (
          <GeoJSON
            key={`${metric}-${profiles.length}`}
            data={geojson}
            style={styleFeature}
            onEachFeature={onEachFeature}
          />
        )}
      </MapContainer>
    </div>
  );
}