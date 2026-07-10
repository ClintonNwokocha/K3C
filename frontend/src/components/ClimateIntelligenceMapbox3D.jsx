import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./ClimateIntelligenceMapbox3D.css";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const CLIMATE_SLIDES = [
  {
    key: "rainfall",
    title: "Rainfall Intelligence",
    value: "Rainfall variability signal",
    description:
      "Monitor rainfall concentration patterns that may increase flood exposure across climate-sensitive LGAs.",
    color: "blue",
    href: "/public/climate-risk",
    cta: "Explore risk",
  },
  {
    key: "heat",
    title: "Heat Exposure",
    value: "Surface heat signal",
    description:
      "Track heat-prone zones where urban surfaces, vegetation loss, or dry land conditions may increase exposure.",
    color: "orange",
    href: "/public/reports",
    cta: "View reports",
  },
  {
    key: "flood",
    title: "Flood Watch",
    value: "Flood-prone corridors",
    description:
      "Identify vulnerable low-lying areas, drainage corridors and settlements requiring preparedness action.",
    color: "cyan",
    href: "/public/climate-risk",
    cta: "Open map",
  },
  {
    key: "projects",
    title: "Project Activity",
    value: "Adaptation response",
    description:
      "Connect Climate Intelligences with active and planned interventions across sectors and local government areas.",
    color: "green",
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
    label: "Central Kaduna Risk Belt",
    center: [7.75, 10.45],
    zoom: 7.15,
    pitch: 68,
    bearing: 22,
  },
  {
    label: "Western Exposure Zone",
    center: [6.85, 10.72],
    zoom: 7.0,
    pitch: 64,
    bearing: -36,
  },
  {
    label: "Northern Monitoring Zone",
    center: [8.05, 11.05],
    zoom: 6.85,
    pitch: 60,
    bearing: 16,
  },
];

function navigateTo(href) {
  window.location.href = href;
}

export default function ClimateIntelligenceMapbox3D({ height = "560px" }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const flyIndexRef = useRef(0);

  const [activeSlide, setActiveSlide] = useState(0);
  const [currentLocation, setCurrentLocation] = useState(FLY_STOPS[0].label);
  const [mapStatus, setMapStatus] = useState("Starting");

  const currentSlide = useMemo(
    () => CLIMATE_SLIDES[activeSlide] || CLIMATE_SLIDES[0],
    [activeSlide]
  );

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!MAPBOX_TOKEN || MAPBOX_TOKEN === "pk.your_real_mapbox_token_here") {
      setMapStatus("Missing token");
      return;
    }

    if (mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: FLY_STOPS[0].center,
      zoom: FLY_STOPS[0].zoom,
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
      setMapStatus("Live 3D");

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
        exaggeration: 1.35,
      });

      map.setFog({
        color: "rgb(222, 238, 246)",
        "high-color": "rgb(36, 92, 145)",
        "horizon-blend": 0.18,
        "space-color": "rgb(8, 20, 35)",
        "star-intensity": 0.08,
      });
    });

    map.on("error", () => {
      setMapStatus("Map error");
    });

    const slideTimer = window.setInterval(() => {
      setActiveSlide((previous) => (previous + 1) % CLIMATE_SLIDES.length);
    }, 5200);

    const flyTimer = window.setInterval(() => {
      if (!mapRef.current) return;

      flyIndexRef.current = (flyIndexRef.current + 1) % FLY_STOPS.length;
      const nextStop = FLY_STOPS[flyIndexRef.current];

      setCurrentLocation(nextStop.label);

      mapRef.current.flyTo({
        center: nextStop.center,
        zoom: nextStop.zoom,
        pitch: nextStop.pitch,
        bearing: nextStop.bearing,
        duration: 5200,
        essential: true,
      });
    }, 8500);

    return () => {
      window.clearInterval(slideTimer);
      window.clearInterval(flyTimer);

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <section className="climate-mapbox-section">
      <div className="climate-mapbox-header">
        <div>
          <p className="climate-mapbox-kicker">
            Mapbox 3D Climate Intelligence
          </p>

          <h2>Live-looking climate command map</h2>

          <p>
            A 3D flythrough map experience for rainfall, heat, flood exposure
            and project response intelligence across Kaduna State.
          </p>
        </div>

        <div className="climate-mapbox-ribbon">
          <div>
            <span>Status</span>
            <strong>{mapStatus}</strong>
          </div>

          <div>
            <span>View</span>
            <strong>{currentLocation}</strong>
          </div>

          <div>
            <span>Mode</span>
            <strong>Auto Flythrough</strong>
          </div>
        </div>
      </div>

      <div className="climate-mapbox-card" style={{ minHeight: height }}>
        <div ref={mapContainerRef} className="climate-mapbox-map" />

        {(!MAPBOX_TOKEN ||
          MAPBOX_TOKEN === "pk.your_real_mapbox_token_here") && (
          <div className="climate-mapbox-token-warning">
            <strong>Mapbox token required</strong>

            <span>
              Replace <code>pk.your_real_mapbox_token_here</code> in{" "}
              <code>frontend/.env</code> with your real Mapbox public token,
              then restart <code>npm run dev</code>.
            </span>
          </div>
        )}

        <div className="climate-mapbox-layer-panel">
          <p>Climate Signal</p>

          <div>
            {CLIMATE_SLIDES.map((slide, index) => (
              <button
                key={slide.key}
                type="button"
                className={activeSlide === index ? "active" : ""}
                onClick={() => setActiveSlide(index)}
              >
                {slide.title}
              </button>
            ))}
          </div>
        </div>

        <div className={`climate-mapbox-insight ${currentSlide.color}`}>
          <span>{currentSlide.title}</span>
          <strong>{currentSlide.value}</strong>
          <p>{currentSlide.description}</p>

          <div className="climate-mapbox-insight-actions">
            <button type="button" onClick={() => navigateTo(currentSlide.href)}>
              {currentSlide.cta}
            </button>

            <button type="button" onClick={() => navigateTo("/public/reports")}>
              View evidence
            </button>
          </div>

          <small>
            This is the Mapbox 3D visual layer. GEE raster intelligence will be
            connected after this map is stable.
          </small>
        </div>
      </div>
    </section>
  );
}