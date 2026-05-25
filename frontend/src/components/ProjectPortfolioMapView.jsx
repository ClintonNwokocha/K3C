import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";

const KADUNA_CENTER = [10.45, 7.75];
const KADUNA_ZOOM = 7;

const NIGERIA_BOUNDS = [
  [3.5, 2.5],
  [14.5, 15.5],
];

const PLACEHOLDER_LGA_GEOJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { lganame: "Birnin Gwari" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [6.1, 10.7],
            [6.8, 10.7],
            [6.8, 11.4],
            [6.1, 11.4],
            [6.1, 10.7],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { lganame: "Chikun" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.0, 10.1],
            [7.6, 10.1],
            [7.6, 10.7],
            [7.0, 10.7],
            [7.0, 10.1],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { lganame: "Kaduna South" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.35, 10.35],
            [7.55, 10.35],
            [7.55, 10.55],
            [7.35, 10.55],
            [7.35, 10.35],
          ],
        ],
      },
    },
  ],
};

const metricOptions = [
  { value: "count", label: "Project Count" },
  { value: "budget", label: "Budget" },
  { value: "ghg", label: "Expected GHG Reduction" },
  { value: "beneficiaries", label: "Expected Beneficiaries" },
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

function formatMoney(value) {
  return `₦${formatNumber(value, 2)}`;
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

function getMetricValue(stats, metric) {
  if (!stats) return 0;

  if (metric === "budget") return stats.totalBudget;
  if (metric === "ghg") return stats.totalGhgReduction;
  if (metric === "beneficiaries") return stats.totalBeneficiaries;

  return stats.projectCount;
}

function getMetricLabel(metric) {
  return metricOptions.find((item) => item.value === metric)?.label || "Projects";
}

function formatMetricValue(value, metric) {
  if (metric === "budget") return formatMoney(value);
  if (metric === "ghg") return `${formatNumber(value, 3)} tCO₂e`;
  if (metric === "beneficiaries") return `${formatNumber(value, 0)} people`;

  return `${formatNumber(value, 0)} project(s)`;
}

function getChoroplethColor(value, maxValue) {
  if (!value || value <= 0) return "#e2e8f0";

  const ratio = maxValue > 0 ? value / maxValue : 0;

  if (ratio >= 0.75) return "#16a34a";
  if (ratio >= 0.5) return "#22c55e";
  if (ratio >= 0.25) return "#86efac";
  return "#dcfce7";
}

function buildLgaStats(projects) {
  return projects.reduce((lookup, project) => {
    const lgaName = project.lga_name || "Statewide / Not specified";
    const key = normalizeName(lgaName);

    if (!lookup[key]) {
      lookup[key] = {
        lgaName,
        projectCount: 0,
        totalBudget: 0,
        totalGhgReduction: 0,
        totalBeneficiaries: 0,
        projects: [],
      };
    }

    lookup[key].projectCount += 1;
    lookup[key].totalBudget += Number(project.estimated_budget_naira || 0);
    lookup[key].totalGhgReduction += Number(
      project.expected_ghg_reduction_tco2e || 0
    );
    lookup[key].totalBeneficiaries += Number(project.expected_beneficiaries || 0);
    lookup[key].projects.push(project);

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

function MapLegend({ metric }) {
  return (
    <div className="absolute bottom-4 left-4 z-[650] w-64 rounded-2xl border border-slate-200 bg-white/95 p-4 text-xs shadow-lg backdrop-blur">
      <p className="mb-3 font-bold text-slate-800">
        {getMetricLabel(metric)} Legend
      </p>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-slate-200" />
          <span className="text-slate-600">No linked project</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-green-100" />
          <span className="text-slate-600">Lower concentration</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-green-300" />
          <span className="text-slate-600">Moderate concentration</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-green-600" />
          <span className="text-slate-600">Highest concentration</span>
        </div>
      </div>

      <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        Map values are relative to the projects in the current filtered view.
      </p>
    </div>
  );
}

export default function ProjectPortfolioMapView({ projects = [] }) {
  const [geoJsonData, setGeoJsonData] = useState(PLACEHOLDER_LGA_GEOJSON);
  const [isUsingPlaceholder, setIsUsingPlaceholder] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [metric, setMetric] = useState("count");

  const lgaStats = useMemo(() => buildLgaStats(projects), [projects]);

  const statewideProjects = useMemo(() => {
    return projects.filter((project) => !project.lga);
  }, [projects]);

  const maxMetricValue = useMemo(() => {
    const values = Object.values(lgaStats).map((stats) =>
      getMetricValue(stats, metric)
    );

    return Math.max(...values, 0);
  }, [lgaStats, metric]);

  const rankedLgas = useMemo(() => {
    return Object.values(lgaStats)
      .filter((stats) => stats.lgaName !== "Statewide / Not specified")
      .sort(
        (a, b) => getMetricValue(b, metric) - getMetricValue(a, metric)
      )
      .slice(0, 8);
  }, [lgaStats, metric]);

  useEffect(() => {
    let isMounted = true;

    async function loadGeoJson() {
      try {
        const response = await fetch("/data/kaduna_lgas.geojson", {
          cache: "no-cache",
        });

        if (!response.ok) {
          throw new Error("Official Kaduna LGA GeoJSON was not found.");
        }

        const data = await response.json();

        if (!data?.features?.length) {
          throw new Error("GeoJSON file has no features.");
        }

        if (isMounted) {
          setGeoJsonData(data);
          setIsUsingPlaceholder(false);
          setLoadError("");
        }
      } catch (error) {
        console.error(error);

        if (isMounted) {
          setGeoJsonData(PLACEHOLDER_LGA_GEOJSON);
          setIsUsingPlaceholder(true);
          setLoadError(
            "Official Kaduna LGA GeoJSON could not be loaded. Showing development placeholder boundaries."
          );
        }
      }
    }

    loadGeoJson();

    return () => {
      isMounted = false;
    };
  }, []);

  function getFeatureStats(feature) {
    const featureName = getFeatureDisplayName(feature);
    return lgaStats[normalizeName(featureName)] || null;
  }

  function getFeatureStyle(feature) {
    const stats = getFeatureStats(feature);
    const value = getMetricValue(stats, metric);

    return {
      color: "#ffffff",
      weight: 1.5,
      fillColor: getChoroplethColor(value, maxMetricValue),
      fillOpacity: value > 0 ? 0.78 : 0.45,
      opacity: 1,
      dashArray: value > 0 ? "" : "2",
    };
  }

  function buildPopupHtml(feature) {
    const lgaName = getFeatureDisplayName(feature);
    const stats = getFeatureStats(feature);
    const value = getMetricValue(stats, metric);

    if (!stats) {
      return `
        <div style="min-width: 220px;">
          <strong>${escapeHtml(lgaName)}</strong><br/>
          <span>No linked projects found for this LGA.</span>
        </div>
      `;
    }

    return `
      <div style="min-width: 240px;">
        <strong>${escapeHtml(lgaName)}</strong><br/>
        <span>${escapeHtml(getMetricLabel(metric))}: <strong>${escapeHtml(
      formatMetricValue(value, metric)
    )}</strong></span><br/>
        <span>Projects: ${formatNumber(stats.projectCount, 0)}</span><br/>
        <span>Budget: ${escapeHtml(formatMoney(stats.totalBudget))}</span><br/>
        <span>GHG Reduction: ${formatNumber(
          stats.totalGhgReduction,
          3
        )} tCO₂e</span><br/>
        <span>Beneficiaries: ${formatNumber(
          stats.totalBeneficiaries,
          0
        )}</span>
      </div>
    `;
  }

  function onEachFeature(feature, layer) {
    const lgaName = getFeatureDisplayName(feature);
    const stats = getFeatureStats(feature);

    layer.bindPopup(buildPopupHtml(feature));
    layer.bindTooltip(
      stats
        ? `${lgaName}: ${stats.projectCount} project(s)`
        : `${lgaName}: no linked project`,
      {
        sticky: true,
        direction: "top",
      }
    );

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
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            Portfolio Map View
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            Climate Projects by LGA
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Spatial view of project concentration across Kaduna LGAs. The map
            uses the same official LGA boundary file used by the Climate Risk
            module where available.
          </p>
        </div>

        <select
          value={metric}
          onChange={(event) => setMetric(event.target.value)}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        >
          {metricOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="relative h-fit self-start overflow-hidden rounded-2xl border border-slate-200 xl:col-span-2">
          <MapContainer
            center={KADUNA_CENTER}
            zoom={KADUNA_ZOOM}
            minZoom={6}
            maxZoom={15}
            maxBounds={NIGERIA_BOUNDS}
            maxBoundsViscosity={1.0}
            scrollWheelZoom={false}
            style={{ height: "440px", width: "100%" }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FitGeoJsonBounds geoJsonData={geoJsonData} />
            <ResetMapButton geoJsonData={geoJsonData} />

            <GeoJSON
              key={`${metric}-${isUsingPlaceholder ? "placeholder" : "official"}-${projects.length}`}
              data={geoJsonData}
              style={getFeatureStyle}
              onEachFeature={onEachFeature}
            />
          </MapContainer>

          <MapLegend metric={metric} />

          {loadError && (
            <div className="absolute bottom-4 right-4 z-[650] max-w-xs rounded-2xl border border-amber-200 bg-amber-50/95 p-4 text-xs text-amber-800 shadow-lg backdrop-blur">
              <p className="font-bold">Boundary Notice</p>
              <p className="mt-1">{loadError}</p>
            </div>
          )}
        </div>

        <div className="h-fit self-start space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="font-bold">Map Summary</h3>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Projects in view</span>
                <span className="font-semibold">{projects.length}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">LGAs with projects</span>
                <span className="font-semibold">
                  {
                    Object.values(lgaStats).filter(
                      (stats) =>
                        stats.lgaName !== "Statewide / Not specified" &&
                        stats.projectCount > 0
                    ).length
                  }
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Statewide projects</span>
                <span className="font-semibold">{statewideProjects.length}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Current metric</span>
                <span className="font-semibold">{getMetricLabel(metric)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="font-bold">Top LGAs</h3>
            <p className="mt-1 text-sm text-slate-500">
              Ranked by {getMetricLabel(metric).toLowerCase()}.
            </p>

            <div className="mt-4 space-y-3">
              {rankedLgas.map((stats, index) => {
                const value = getMetricValue(stats, metric);

                return (
                  <div
                    key={stats.lgaName}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {index + 1}. {stats.lgaName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {stats.projectCount} project(s)
                        </p>
                      </div>

                      <p className="text-right text-sm font-bold">
                        {formatMetricValue(value, metric)}
                      </p>
                    </div>
                  </div>
                );
              })}

              {rankedLgas.length === 0 && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No LGA-linked projects available yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}