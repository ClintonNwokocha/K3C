import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./HomeClimateMapboxPreview.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const NIGERIA_BOUNDS = [
  [2.2, 3.4],
  [15.2, 14.4],
];

const KADUNA_BOUNDARY_URL = "/data/kaduna_boundary.geojson";
const KADUNA_LGAS_URL = "/data/kaduna_lgas.geojson";

const SIGNAL_STYLES = {
  rainfall: {
    fill: "#0EA5E9",
    line: "#7DD3FC",
  },
  flood: {
    fill: "#06B6D4",
    line: "#67E8F9",
  },
  heat: {
    fill: "#F97316",
    line: "#FDBA74",
  },
  projects: {
    fill: "#22C55E",
    line: "#86EFAC",
  },
};

const PREVIEW_SLIDES = [
  {
    key: "rainfall",
    shortLabel: "Rainfall",
    status: "GEE-ready layer",
    title: "Rainfall variability watch",
    description:
      "Preview how rainfall patterns can support flood preparedness, early warning and LGA-level climate planning.",
    href: "/public/climate-risk",
    cta: "Explore Climate Intelligence",
  },
  {
    key: "flood",
    shortLabel: "Flood",
    status: "Risk explorer available",
    title: "Flood-prone corridor awareness",
    description:
      "See how public climate evidence can highlight areas where flood concern may require closer planning attention.",
    href: "/public/climate-risk",
    cta: "Open risk explorer",
  },
  {
    key: "heat",
    shortLabel: "Heat",
    status: "Climate stress lens",
    title: "Heat exposure monitoring",
    description:
      "Introduce surface heat and vegetation stress signals before users move into deeper technical evidence.",
    href: "/public/reports",
    cta: "View evidence reports",
  },
  {
    key: "projects",
    shortLabel: "Projects",
    status: "Portfolio linked",
    title: "Climate action visibility",
    description:
      "Connect Climate Intelligence awareness with adaptation projects, expected beneficiaries and implementation progress.",
    href: "/public/projects",
    cta: "View projects",
  },
];

const FLY_STOPS = [
  {
    label: "Kaduna State Overview",
    center: [7.44, 10.52],
    zoom: 6.35,
    pitch: 62,
    bearing: -18,
  },
  {
    label: "Central Kaduna Corridor",
    center: [7.74, 10.5],
    zoom: 7.1,
    pitch: 68,
    bearing: 24,
  },
  {
    label: "Western Exposure Belt",
    center: [6.86, 10.72],
    zoom: 7.0,
    pitch: 64,
    bearing: -34,
  },
  {
    label: "Northern Monitoring Zone",
    center: [8.05, 11.05],
    zoom: 6.85,
    pitch: 60,
    bearing: 16,
  },
];

const PREVIEW_POINTS = [
  {
    name: "Rainfall watch zone",
    coordinates: [7.72, 10.55],
    type: "Rainfall",
    note: "Rainfall variability signal for public preparedness.",
  },
  {
    name: "Flood concern corridor",
    coordinates: [7.43, 10.38],
    type: "Flood",
    note: "Flood-prone area requiring closer public planning attention.",
  },
  {
    name: "Heat exposure signal",
    coordinates: [7.93, 10.72],
    type: "Heat",
    note: "Surface heat and climate stress awareness point.",
  },
  {
    name: "Project response area",
    coordinates: [7.22, 10.15],
    type: "Projects",
    note: "Climate action and adaptation response visibility.",
  },
];

function navigateTo(href) {
  window.location.href = href;
}

function getSignalStyle(signalKey) {
  return SIGNAL_STYLES[signalKey] || SIGNAL_STYLES.rainfall;
}

function addKadunaOverlay(map, activeSignalKey) {
  const signalStyle = getSignalStyle(activeSignalKey);

  if (!map.getSource("kaduna-boundary-source")) {
    map.addSource("kaduna-boundary-source", {
      type: "geojson",
      data: KADUNA_BOUNDARY_URL,
    });
  }

  if (!map.getSource("kaduna-lga-source")) {
    map.addSource("kaduna-lga-source", {
      type: "geojson",
      data: KADUNA_LGAS_URL,
    });
  }

  if (!map.getLayer("kaduna-preview-fill")) {
    map.addLayer({
      id: "kaduna-preview-fill",
      type: "fill",
      source: "kaduna-boundary-source",
      paint: {
        "fill-color": signalStyle.fill,
        "fill-opacity": 0.18,
      },
    });
  }

  if (!map.getLayer("kaduna-preview-boundary")) {
    map.addLayer({
      id: "kaduna-preview-boundary",
      type: "line",
      source: "kaduna-boundary-source",
      paint: {
        "line-color": signalStyle.line,
        "line-width": 3,
        "line-opacity": 0.95,
      },
    });
  }

  if (!map.getLayer("kaduna-preview-lga-lines")) {
    map.addLayer({
      id: "kaduna-preview-lga-lines",
      type: "line",
      source: "kaduna-lga-source",
      paint: {
        "line-color": "#FFFFFF",
        "line-width": 1,
        "line-opacity": 0.42,
      },
    });
  }
}

function updateKadunaOverlayStyle(map, activeSignalKey) {
  const signalStyle = getSignalStyle(activeSignalKey);

  if (map.getLayer("kaduna-preview-fill")) {
    map.setPaintProperty("kaduna-preview-fill", "fill-color", signalStyle.fill);
  }

  if (map.getLayer("kaduna-preview-boundary")) {
    map.setPaintProperty(
      "kaduna-preview-boundary",
      "line-color",
      signalStyle.line
    );
  }
}

export default function HomeClimateMapboxPreview({ height = "610px" }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const flyIndexRef = useRef(0);

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [activeLocation, setActiveLocation] = useState(FLY_STOPS[0].label);
  const [mapStatus, setMapStatus] = useState("Starting");

  const activeSlide = useMemo(
    () => PREVIEW_SLIDES[activeSlideIndex] || PREVIEW_SLIDES[0],
    [activeSlideIndex]
  );

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (
      !MAPBOX_TOKEN ||
      MAPBOX_TOKEN === "pk.your_real_mapbox_token_here" ||
      MAPBOX_TOKEN === "your_mapbox_public_token_here"
    ) {
      setMapStatus("Token required");
      return;
    }

    if (mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: FLY_STOPS[0].center,
      zoom: FLY_STOPS[0].zoom,
      minZoom: 5.35,
      maxZoom: 14,
      maxBounds: NIGERIA_BOUNDS,
      pitch: FLY_STOPS[0].pitch,
      bearing: FLY_STOPS[0].bearing,
      antialias: true,
      attributionControl: false,
    });

    mapRef.current = map;

    map.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
      }),
      "bottom-right"
    );

    map.addControl(
      new mapboxgl.AttributionControl({
        compact: true,
      }),
      "bottom-left"
    );

    map.on("load", () => {
      setMapStatus("Live preview");

      map.setMaxBounds(NIGERIA_BOUNDS);
      map.setMinZoom(5.35);
      map.setMaxZoom(14);

      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }

      map.setTerrain({
        source: "mapbox-dem",
        exaggeration: 1.28,
      });

      map.setFog({
        color: "rgb(220, 235, 245)",
        "high-color": "rgb(36, 92, 145)",
        "horizon-blend": 0.18,
        "space-color": "rgb(8, 20, 35)",
        "star-intensity": 0.08,
      });

      addKadunaOverlay(map, activeSlide.key);

      markersRef.current = PREVIEW_POINTS.map((point) => {
        const markerElement = document.createElement("button");
        markerElement.type = "button";
        markerElement.className = "home-mapbox-marker";
        markerElement.setAttribute("aria-label", point.name);

        const popup = new mapboxgl.Popup({
          offset: 22,
          closeButton: false,
          closeOnClick: false,
          className: "home-mapbox-popup",
        }).setHTML(`
          <div class="home-mapbox-popup-card">
            <span>${point.type} Signal</span>
            <strong>${point.name}</strong>
            <p>${point.note}</p>
            <small>Click to open the Climate Intelligence Explorer</small>
          </div>
        `);

        const marker = new mapboxgl.Marker(markerElement)
          .setLngLat(point.coordinates)
          .setPopup(popup)
          .addTo(map);

        markerElement.addEventListener("mouseenter", () => {
          marker.togglePopup();
        });

        markerElement.addEventListener("mouseleave", () => {
          popup.remove();
        });

        markerElement.addEventListener("click", () => {
          navigateTo("/public/climate-risk");
        });

        return marker;
      });
    });

    map.on("error", () => {
      setMapStatus("Map error");
    });

    const slideTimer = window.setInterval(() => {
      setActiveSlideIndex((current) => (current + 1) % PREVIEW_SLIDES.length);
    }, 5600);

    const flyTimer = window.setInterval(() => {
      if (!mapRef.current) return;

      flyIndexRef.current = (flyIndexRef.current + 1) % FLY_STOPS.length;
      const nextStop = FLY_STOPS[flyIndexRef.current];

      setActiveLocation(nextStop.label);

      mapRef.current.flyTo({
        center: nextStop.center,
        zoom: nextStop.zoom,
        pitch: nextStop.pitch,
        bearing: nextStop.bearing,
        duration: 5200,
        essential: true,
      });
    }, 8800);

    return () => {
      window.clearInterval(slideTimer);
      window.clearInterval(flyTimer);

      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    if (!map.loaded()) return;

    updateKadunaOverlayStyle(map, activeSlide.key);
  }, [activeSlide.key]);

  return (
    <section className="home-mapbox-preview">
      <div className="home-mapbox-preview-card" style={{ minHeight: height }}>
        <div ref={mapContainerRef} className="home-mapbox-preview-map" />

        {(!MAPBOX_TOKEN ||
          MAPBOX_TOKEN === "pk.your_real_mapbox_token_here" ||
          MAPBOX_TOKEN === "your_mapbox_public_token_here") && (
          <div className="home-mapbox-token-warning">
            <strong>Mapbox token required</strong>
            <span>
              Add your public Mapbox token in <code>frontend/.env</code>, then
              restart <code>npm run dev</code>.
            </span>
          </div>
        )}

        <div className="home-mapbox-signal-panel">
          <p>Preview signal</p>

          <div>
            {PREVIEW_SLIDES.map((slide, index) => (
              <button
                key={slide.key}
                type="button"
                className={activeSlideIndex === index ? "active" : ""}
                onClick={() => setActiveSlideIndex(index)}
              >
                {slide.shortLabel}
              </button>
            ))}
          </div>
        </div>

        <div className="home-mapbox-status-panel">
          <div>
            <span>Status</span>
            <strong>{mapStatus}</strong>
          </div>

          <div>
            <span>Current view</span>
            <strong>{activeLocation}</strong>
          </div>

          <div>
            <span>Signal</span>
            <strong>{activeSlide.shortLabel}</strong>
          </div>
        </div>

        <div className="home-mapbox-overlay-legend">
          <span>Kaduna boundary overlay</span>
          <strong>Restricted to Nigeria view</strong>
        </div>

        <div className="home-mapbox-insight">
          <span>{activeSlide.status}</span>
          <strong>{activeSlide.title}</strong>
          <p>{activeSlide.description}</p>

          <div className="home-mapbox-insight-actions">
            <button type="button" onClick={() => navigateTo(activeSlide.href)}>
              {activeSlide.cta}
            </button>

            <button type="button" onClick={() => navigateTo("/public/reports")}>
              View evidence
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}