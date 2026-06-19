import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const KADUNA_CENTER = [10.45, 7.75];
const KADUNA_ZOOM = 7;

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

function hasValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function formatNumber(value) {
  if (!hasValue(value)) return "No data";
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getFeatureName(feature) {
  const p = feature?.properties || {};
  return (
    p.lganame ||
    p.lga_name ||
    p.LGA_NAME ||
    p.LGANAME ||
    p.ADM2_NAME ||
    p.NAME_2 ||
    p.NAME ||
    p.name ||
    "Unnamed LGA"
  );
}

function profileLookup(profiles) {
  return profiles.reduce((acc, item) => {
    acc[normalizeName(item.lga_name)] = item;
    return acc;
  }, {});
}

function metricLookup(metrics) {
  return metrics.reduce((acc, item) => {
    acc[normalizeName(item.lga_name)] = item;
    return acc;
  }, {});
}

function getValue(activeLayer, profile, metric) {
  if (activeLayer?.source === "remote_sensing") return metric?.mean_value;
  return profile?.[activeLayer?.field];
}

function getColor(value, activeLayer) {
  if (!hasValue(value)) return "#DFE3E4";

  const n = Number(value);

  if (activeLayer?.key === "adaptive_capacity") {
    if (n >= 70) return "#009B35";
    if (n >= 55) return "#3B82F6";
    if (n >= 40) return "#F3F74B";
    return "#B91C1C";
  }

  if (n >= 75) return "#B91C1C";
  if (n >= 60) return "#EA580C";
  if (n >= 40) return "#F3F74B";
  return "#009B35";
}

function getClass(value, activeLayer) {
  if (!hasValue(value)) return "No data";

  const n = Number(value);

  if (activeLayer?.source === "remote_sensing") return "Imported metric";

  if (activeLayer?.key === "adaptive_capacity") {
    if (n >= 70) return "Strong";
    if (n >= 55) return "Fair";
    if (n >= 40) return "Weak";
    return "Very Weak";
  }

  if (n >= 75) return "Very High";
  if (n >= 60) return "High";
  if (n >= 40) return "Moderate";
  return "Low";
}

function getLgaId(feature, profile) {
  const p = feature?.properties || {};
  const raw = p.lga_id || p.LGA_ID || p.lga || p.LGA || p.id || p.ID;

  if (raw !== undefined && raw !== null && Number.isFinite(Number(raw))) {
    return Number(raw);
  }

  return profile?.lga || null;
}

function FitBounds({ geoJson }) {
  const map = useMap();

  useEffect(() => {
    if (!geoJson) return;

    setTimeout(() => {
      map.invalidateSize();
      const bounds = L.geoJSON(geoJson).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 });
    }, 200);
  }, [geoJson, map]);

  return null;
}

export default function PublicClimateRiskMapPreview({
  activeLayer,
  profiles = [],
  remoteStats = [],
  opacity = 0.72,
  baseMap = "satellite",
  height = "100%",
  onLgaSelect,
}) {
  const [geoJson, setGeoJson] = useState(null);

  const profilesByName = useMemo(() => profileLookup(profiles), [profiles]);
  const metricsByName = useMemo(() => metricLookup(remoteStats), [remoteStats]);

  useEffect(() => {
    fetch("/data/kaduna_lgas.geojson", { cache: "no-cache" })
      .then((res) => res.json())
      .then(setGeoJson)
      .catch(console.error);
  }, []);

  function resolve(feature) {
    const name = String(getFeatureName(feature)).trim();
    const key = normalizeName(name);
    const profile = profilesByName[key] || null;
    const metric = metricsByName[key] || null;
    const value = getValue(activeLayer, profile, metric);

    return {
      name: profile?.lga_name || metric?.lga_name || name,
      profile,
      metric,
      value,
      color: getColor(value, activeLayer),
      classText: getClass(value, activeLayer),
      lgaId: getLgaId(feature, profile),
    };
  }

  function styleFeature(feature) {
    const info = resolve(feature);

    return {
      color: "rgba(255,255,255,0.65)",
      weight: 1.2,
      fillColor: info.color,
      fillOpacity: hasValue(info.value) ? opacity : 0.28,
      opacity: 0.95,
      dashArray: hasValue(info.value) ? "" : "3",
    };
  }

  function tooltip(feature) {
    const info = resolve(feature);

    return `
      <div style="min-width:190px">
        <strong style="color:#030454">${escapeHtml(info.name)}</strong><br/>
        <span style="font-size:11px;color:#475569">${escapeHtml(activeLayer?.label)}: <b>${escapeHtml(formatNumber(info.value))}</b></span><br/>
        <span style="font-size:11px;color:#475569">Status: <b>${escapeHtml(info.classText)}</b></span>
      </div>
    `;
  }

  function popup(feature) {
    const info = resolve(feature);
    const missing =
      activeLayer?.source === "remote_sensing" && !info.metric
        ? "No remote sensing metric has been imported yet for this LGA."
        : activeLayer?.source === "risk" && !info.profile
        ? "No climate risk profile is available for this LGA."
        : "";

    return `
      <div style="min-width:290px;font-family:Arial,sans-serif">
        <h3 style="margin:0 0 10px;color:#030454">${escapeHtml(info.name)}</h3>
        <div style="border-left:5px solid ${escapeHtml(info.color)};background:#F7F9FA;padding:12px;border-radius:8px">
          <div style="font-size:11px;color:#64748B;text-transform:uppercase;font-weight:900">${escapeHtml(activeLayer?.label)}</div>
          <div style="font-size:24px;font-weight:900;color:#030454">${escapeHtml(formatNumber(info.value))}</div>
          <div style="font-size:11px;font-weight:900;color:#475569;text-transform:uppercase">${escapeHtml(info.classText)}</div>
        </div>
        ${
          missing
            ? `<p style="margin-top:12px;background:#FFFBEB;color:#92400E;padding:10px;border-radius:8px;font-size:12px;line-height:1.5">${escapeHtml(missing)}</p>`
            : ""
        }
      </div>
    `;
  }

  function onEachFeature(feature, layer) {
    layer.bindTooltip(tooltip(feature), {
      sticky: true,
      direction: "top",
      className: "kccc-dark-tooltip",
    });

    layer.bindPopup(popup(feature), {
      maxWidth: 360,
      className: "kccc-dark-popup",
    });

    layer.on({
      mouseover: (event) => {
        event.target.setStyle({
          weight: 3,
          color: "#F3F74B",
          fillOpacity: 0.88,
        });
        event.target.bringToFront?.();
      },
      mouseout: (event) => {
        event.target.setStyle(styleFeature(feature));
      },
      click: () => {
        const info = resolve(feature);
        if (info.lgaId && typeof onLgaSelect === "function") onLgaSelect(info.lgaId);
      },
    });
  }

  if (!geoJson) {
    return <div className="flex h-full items-center justify-center bg-[#071014] text-white/60">Loading Kaduna LGA boundary...</div>;
  }

  return (
    <div className="h-full w-full">
      <style>{`
        .kccc-dark-tooltip {
          background: rgba(255,255,255,.96);
          border: 1px solid rgba(3,4,84,.2);
          border-radius: 8px;
          box-shadow: 0 16px 40px rgba(0,0,0,.35);
          padding: 10px 12px;
        }
        .kccc-dark-tooltip::before { display:none; }
        .kccc-dark-popup .leaflet-popup-content-wrapper {
          border-radius: 14px;
          box-shadow: 0 24px 60px rgba(0,0,0,.4);
        }
        .leaflet-control-attribution { font-size:9px; }
      `}</style>

      <MapContainer center={KADUNA_CENTER} zoom={KADUNA_ZOOM} minZoom={6} maxZoom={15} scrollWheelZoom style={{ height, width: "100%" }}>
        {baseMap === "satellite" && (
          <>
            <TileLayer
              attribution="Esri World Imagery"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
            <TileLayer
              attribution="Esri labels"
              url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            />
          </>
        )}

        {baseMap === "streets" && (
          <TileLayer attribution="OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        )}

        {baseMap === "dark" && (
          <TileLayer
            attribution="CartoDB"
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
        )}

        <FitBounds geoJson={geoJson} />

        <GeoJSON
          key={`${activeLayer?.key}-${profiles.length}-${remoteStats.length}-${opacity}`}
          data={geoJson}
          style={styleFeature}
          onEachFeature={onEachFeature}
        />
      </MapContainer>
    </div>
  );
}