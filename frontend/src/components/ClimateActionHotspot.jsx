import { useMemo } from "react";
import L from "leaflet";
import { GeoJSON, Marker, Tooltip } from "react-leaflet";
import { SIGNAL_LEVEL, SIGNAL_LABEL } from "../decision-support/climateActionSignal";

// Reusable Urgent Climate Action Signal map overlay — purely presentational.
// Consumes the signal already computed by climateActionSignal.js; does not
// reimplement or alter any classification logic.
//
// Renders, on top of the existing environmental choropleth (never replacing
// it):
//   - a centroid hotspot/beacon marker for every flagged LGA (primary cue)
//   - a translucent signal-coloured outline/fill ONLY for Urgent Action LGAs
//     or the currently-selected LGA — normal LGA boundaries stay neutral
//     everywhere else so the environmental choropleth remains legible.

const HOTSPOT_COLOR = {
  [SIGNAL_LEVEL.URGENT_ACTION]: "#dc2626",
  [SIGNAL_LEVEL.ELEVATED_ATTENTION]: "#f97316",
  [SIGNAL_LEVEL.MONITOR]: "#eab308",
  [SIGNAL_LEVEL.NO_CURRENT_SIGNAL]: "#94a3b8",
};

const OVERLAY_FILL_OPACITY = {
  [SIGNAL_LEVEL.URGENT_ACTION]: 0.16,
};

// Polygon outline/fill accents are reserved for Urgent Action LGAs (always)
// and the currently-selected LGA (whatever its signal, for orientation) —
// everything else relies on the centroid beacon as the primary attention cue.
function styleSignalOverlayFeature(feature, getSignalForFeature, selectedAdminName) {
  const signal = getSignalForFeature(feature);
  const level = signal?.signal_level;
  const isSelected = Boolean(selectedAdminName) && signal?.admin_name === selectedAdminName;
  const isUrgent = level === SIGNAL_LEVEL.URGENT_ACTION;

  if (!isUrgent && !isSelected) {
    return { fillOpacity: 0, opacity: 0, weight: 0 };
  }

  const color = isUrgent ? HOTSPOT_COLOR[SIGNAL_LEVEL.URGENT_ACTION] : HOTSPOT_COLOR[level] || "#173B91";
  return {
    color,
    weight: isUrgent ? 3 : 2.5,
    opacity: 0.9,
    fillColor: color,
    fillOpacity: isUrgent ? OVERLAY_FILL_OPACITY[SIGNAL_LEVEL.URGENT_ACTION] : 0.08,
    dashArray: isSelected && !isUrgent ? "5 4" : "",
    interactive: false,
  };
}

function buildHotspotIcon(level, selected) {
  const selectedClass = selected ? " kccc-signal-hotspot-selected" : "";
  const emphasisRing = selected ? '<span class="kccc-signal-hotspot-emphasis-ring"></span>' : "";
  let html;
  if (level === SIGNAL_LEVEL.URGENT_ACTION) {
    html = `<div class="kccc-signal-hotspot kccc-signal-hotspot-urgent${selectedClass}">
           ${emphasisRing}
           <span class="kccc-signal-hotspot-ring ring-1"></span>
           <span class="kccc-signal-hotspot-ring ring-2"></span>
           <span class="kccc-signal-hotspot-ring ring-3"></span>
           <span class="kccc-signal-hotspot-core"></span>
         </div>`;
  } else if (level === SIGNAL_LEVEL.ELEVATED_ATTENTION) {
    html = `<div class="kccc-signal-hotspot kccc-signal-hotspot-elevated${selectedClass}">
           ${emphasisRing}
           <span class="kccc-signal-hotspot-ring-elevated ring-e1"></span>
           <span class="kccc-signal-hotspot-ring-elevated ring-e2"></span>
           <span class="kccc-signal-hotspot-core kccc-signal-hotspot-core-elevated"></span>
         </div>`;
  } else if (level === SIGNAL_LEVEL.MONITOR) {
    html = `<div class="kccc-signal-hotspot kccc-signal-hotspot-monitor${selectedClass}">
           ${emphasisRing}
           <span class="kccc-signal-hotspot-halo-monitor"></span>
           <span class="kccc-signal-hotspot-core kccc-signal-hotspot-core-monitor"></span>
         </div>`;
  } else {
    html = `<div class="kccc-signal-hotspot kccc-signal-hotspot-insufficient${selectedClass}">
           ${emphasisRing}
           <span class="kccc-signal-hotspot-core kccc-signal-hotspot-core-insufficient"></span>
         </div>`;
  }
  return L.divIcon({
    className: "",
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

const URGENT_ICON = buildHotspotIcon(SIGNAL_LEVEL.URGENT_ACTION, false);
const URGENT_ICON_SELECTED = buildHotspotIcon(SIGNAL_LEVEL.URGENT_ACTION, true);
const ELEVATED_ICON = buildHotspotIcon(SIGNAL_LEVEL.ELEVATED_ATTENTION, false);
const ELEVATED_ICON_SELECTED = buildHotspotIcon(SIGNAL_LEVEL.ELEVATED_ATTENTION, true);
const MONITOR_ICON = buildHotspotIcon(SIGNAL_LEVEL.MONITOR, false);
const MONITOR_ICON_SELECTED = buildHotspotIcon(SIGNAL_LEVEL.MONITOR, true);
const INSUFFICIENT_ICON = buildHotspotIcon(SIGNAL_LEVEL.NO_CURRENT_SIGNAL, false);
const INSUFFICIENT_ICON_SELECTED = buildHotspotIcon(SIGNAL_LEVEL.NO_CURRENT_SIGNAL, true);

function getFeatureCentroid(feature) {
  try {
    const bounds = L.geoJSON(feature).getBounds();
    if (!bounds.isValid()) return null;
    const center = bounds.getCenter();
    return [center.lat, center.lng];
  } catch {
    return null;
  }
}

export function ClimateActionHotspotStyles() {
  return (
    <style>{`
      .kccc-signal-hotspot { position: relative; width: 0; height: 0; pointer-events: none; }

      /* --- core dots (all levels) --- */
      .kccc-signal-hotspot-core {
        position: absolute; top: 50%; left: 50%;
        width: 13px; height: 13px; margin-top: -6.5px; margin-left: -6.5px;
        border-radius: 50%;
        background: #dc2626;
        border: 1.5px solid rgba(255,255,255,0.9);
        box-shadow: 0 0 6px rgba(220,38,38,0.9);
        pointer-events: auto;
        cursor: pointer;
        z-index: 2;
      }
      .kccc-signal-hotspot-core-elevated {
        width: 12px; height: 12px; margin-top: -6px; margin-left: -6px;
        background: #f97316;
        box-shadow: 0 0 6px rgba(249,115,22,0.9);
      }
      .kccc-signal-hotspot-core-monitor {
        width: 7px; height: 7px; margin-top: -3.5px; margin-left: -3.5px;
        background: #eab308;
        border-width: 1px;
        box-shadow: 0 0 3px rgba(234,179,8,0.8);
      }
      .kccc-signal-hotspot-core-insufficient {
        width: 6px; height: 6px; margin-top: -3px; margin-left: -3px;
        background: #94a3b8;
        border-width: 1px;
        box-shadow: none;
        cursor: default;
      }

      /* --- Urgent Action: 3 expanding red rings, ~2.2s cycle --- */
      .kccc-signal-hotspot-ring {
        position: absolute; top: 50%; left: 50%;
        width: 24px; height: 24px; margin-top: -12px; margin-left: -12px;
        border-radius: 50%;
        border: 2px solid #dc2626;
        opacity: 0.75;
        transform: scale(0.35);
        animation: kccc-hotspot-ring 2.2s ease-out infinite;
        pointer-events: none;
      }
      .kccc-signal-hotspot-ring.ring-1 { animation-delay: 0s; }
      .kccc-signal-hotspot-ring.ring-2 { animation-delay: 0.6s; }
      .kccc-signal-hotspot-ring.ring-3 { animation-delay: 1.2s; }
      @keyframes kccc-hotspot-ring {
        0% { transform: scale(0.35); opacity: 0.75; }
        100% { transform: scale(3.75); opacity: 0; }
      }

      /* --- Elevated Attention: 2 expanding orange rings, ~2.6s cycle,
             clearly observable scale + opacity change (not a subtle halo) --- */
      .kccc-signal-hotspot-ring-elevated {
        position: absolute; top: 50%; left: 50%;
        width: 22px; height: 22px; margin-top: -11px; margin-left: -11px;
        border-radius: 50%;
        border: 2px solid #f97316;
        opacity: 0.7;
        transform: scale(0.4);
        animation: kccc-hotspot-ring-elevated 2.6s ease-out infinite;
        pointer-events: none;
      }
      .kccc-signal-hotspot-ring-elevated.ring-e1 { animation-delay: 0s; }
      .kccc-signal-hotspot-ring-elevated.ring-e2 { animation-delay: 0.8s; }
      @keyframes kccc-hotspot-ring-elevated {
        0% { transform: scale(0.4); opacity: 0.7; }
        100% { transform: scale(3.6); opacity: 0; }
      }

      /* --- Monitor: small static beacon, very slow subtle breathe —
             explicitly NOT the expanding-ring treatment above --- */
      .kccc-signal-hotspot-halo-monitor {
        position: absolute; top: 50%; left: 50%;
        width: 17px; height: 17px; margin-top: -8.5px; margin-left: -8.5px;
        border-radius: 50%;
        background: rgba(234,179,8,0.28);
        border: 1px solid rgba(234,179,8,0.6);
        animation: kccc-hotspot-monitor-breathe 6s ease-in-out infinite;
        pointer-events: none;
      }
      @keyframes kccc-hotspot-monitor-breathe {
        0%, 100% { opacity: 0.45; transform: scale(1); }
        50% { opacity: 0.65; transform: scale(1.1); }
      }

      /* --- Insufficient Data: neutral grey dot, no animation --- */
      .kccc-signal-hotspot-insufficient .kccc-signal-hotspot-core { pointer-events: auto; }

      /* --- selection emphasis: a brief double-ping ring, any level --- */
      .kccc-signal-hotspot-emphasis-ring {
        position: absolute; top: 50%; left: 50%;
        width: 20px; height: 20px; margin-top: -10px; margin-left: -10px;
        border-radius: 50%;
        border: 2px solid #173B91;
        opacity: 0.8;
        transform: scale(0.6);
        animation: kccc-hotspot-emphasis 1.1s ease-out 2;
        pointer-events: none;
      }
      @keyframes kccc-hotspot-emphasis {
        0% { transform: scale(0.6); opacity: 0.85; }
        100% { transform: scale(4.2); opacity: 0; }
      }

      @media (max-width: 640px) {
        .kccc-signal-hotspot-ring { width: 18px; height: 18px; margin-top: -9px; margin-left: -9px; }
        .kccc-signal-hotspot-ring-elevated { width: 16px; height: 16px; margin-top: -8px; margin-left: -8px; }
        .kccc-signal-hotspot-halo-monitor { width: 14px; height: 14px; margin-top: -7px; margin-left: -7px; }
      }

      @media (prefers-reduced-motion: reduce) {
        /* Urgent → static red double ring (no expansion). */
        .kccc-signal-hotspot-ring { animation: none; transform: scale(1); opacity: 0; }
        .kccc-signal-hotspot-urgent .kccc-signal-hotspot-ring.ring-1 { opacity: 0.6; transform: scale(1); }
        .kccc-signal-hotspot-urgent .kccc-signal-hotspot-ring.ring-2 { opacity: 0.35; transform: scale(1.6); }
        /* Elevated → static single orange ring. */
        .kccc-signal-hotspot-ring-elevated { animation: none; transform: scale(1); opacity: 0; }
        .kccc-signal-hotspot-elevated .kccc-signal-hotspot-ring-elevated.ring-e1 { opacity: 0.55; transform: scale(1); }
        /* Monitor → static amber beacon, no breathing. */
        .kccc-signal-hotspot-halo-monitor { animation: none; opacity: 0.5; transform: scale(1); }
        .kccc-signal-hotspot-emphasis-ring { animation: none; opacity: 0.6; transform: scale(1.4); }
      }
    `}</style>
  );
}

const MARKER_ICON = {
  [SIGNAL_LEVEL.URGENT_ACTION]: [URGENT_ICON, URGENT_ICON_SELECTED],
  [SIGNAL_LEVEL.ELEVATED_ATTENTION]: [ELEVATED_ICON, ELEVATED_ICON_SELECTED],
  [SIGNAL_LEVEL.MONITOR]: [MONITOR_ICON, MONITOR_ICON_SELECTED],
  [SIGNAL_LEVEL.NO_CURRENT_SIGNAL]: [INSUFFICIENT_ICON, INSUFFICIENT_ICON_SELECTED],
};

/**
 * @param {object} props
 * @param {object} props.lgaGeoJson - LGA FeatureCollection (already loaded by the page)
 * @param {(feature: object) => object|null} props.getSignalForFeature - returns
 *   the climateActionSignal.js result for a GeoJSON feature, or null
 * @param {(feature: object) => void} props.onSelectFeature - called when a
 *   hotspot marker is clicked; the page decides what "select" means
 * @param {number} props.dataVersion - bump to force the overlay to re-key when
 *   underlying signal data changes (mirrors the base LGA layer's key pattern)
 * @param {string|null} [props.selectedAdminName] - admin_name of the
 *   currently-selected LGA (if any), used to emphasize its hotspot/beacon and
 *   to allow a selected LGA's polygon outline to show regardless of signal
 * @param {boolean} [props.showInsufficientMarkers] - render a small neutral
 *   grey dot for "No Current Signal" / insufficient-data LGAs (optional)
 */
export function ClimateActionSignalOverlay({
  lgaGeoJson,
  getSignalForFeature,
  onSelectFeature,
  dataVersion,
  selectedAdminName = null,
  showInsufficientMarkers = true,
}) {
  const flaggedFeatures = useMemo(() => {
    if (!lgaGeoJson?.features?.length) return { urgent: [], elevated: [], monitor: [], insufficient: [] };
    const urgent = [];
    const elevated = [];
    const monitor = [];
    const insufficient = [];
    for (const feature of lgaGeoJson.features) {
      const signal = getSignalForFeature(feature);
      const level = signal?.signal_level;
      if (!level) continue;
      const centroid = getFeatureCentroid(feature);
      if (!centroid) continue;
      const entry = { feature, signal, centroid };
      if (level === SIGNAL_LEVEL.URGENT_ACTION) urgent.push(entry);
      else if (level === SIGNAL_LEVEL.ELEVATED_ATTENTION) elevated.push(entry);
      else if (level === SIGNAL_LEVEL.MONITOR) monitor.push(entry);
      else insufficient.push(entry);
    }
    return { urgent, elevated, monitor, insufficient };
  }, [lgaGeoJson, getSignalForFeature]);

  if (!lgaGeoJson?.features?.length) return null;

  const renderMarkers = (entries, level, prefix) =>
    entries.map(({ feature, signal, centroid }) => {
      const isSelected = Boolean(selectedAdminName) && signal.admin_name === selectedAdminName;
      const [icon, iconSelected] = MARKER_ICON[level];
      return (
        <Marker
          key={`${prefix}-${signal.admin_code || signal.admin_name}`}
          position={centroid}
          icon={isSelected ? iconSelected : icon}
          interactive
          eventHandlers={{ click: () => onSelectFeature(feature) }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            {signal.admin_name} — {SIGNAL_LABEL[signal.signal_level]}
          </Tooltip>
        </Marker>
      );
    });

  return (
    <>
      <GeoJSON
        key={`signal-overlay-${dataVersion}-${selectedAdminName || "none"}`}
        data={lgaGeoJson}
        style={(feature) => styleSignalOverlayFeature(feature, getSignalForFeature, selectedAdminName)}
        interactive={false}
      />
      {showInsufficientMarkers && renderMarkers(flaggedFeatures.insufficient, SIGNAL_LEVEL.NO_CURRENT_SIGNAL, "hotspot-insufficient")}
      {renderMarkers(flaggedFeatures.monitor, SIGNAL_LEVEL.MONITOR, "hotspot-monitor")}
      {renderMarkers(flaggedFeatures.elevated, SIGNAL_LEVEL.ELEVATED_ATTENTION, "hotspot-elevated")}
      {renderMarkers(flaggedFeatures.urgent, SIGNAL_LEVEL.URGENT_ACTION, "hotspot-urgent")}
    </>
  );
}
