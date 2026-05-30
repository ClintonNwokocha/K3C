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

const analysisModes = [
  {
    key: "where",
    title: "Where",
    label: "Where are projects concentrated?",
    helper: "Map and rank LGAs by project activity.",
  },
  {
    key: "funders",
    title: "Funders",
    label: "Who funds more?",
    helper: "Rank funding sources by investment and outcomes.",
  },
  {
    key: "agencies",
    title: "Agencies",
    label: "Who implements more?",
    helper: "Rank implementing agencies by delivery footprint.",
  },
];

const measureOptions = [
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
  return `₦${formatNumber(value, 0)}`;
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

function getMeasureLabel(measure) {
  return (
    measureOptions.find((item) => item.value === measure)?.label || "Projects"
  );
}

function getMeasureValue(stats, measure) {
  if (!stats) return 0;

  if (measure === "budget") return stats.totalBudget;
  if (measure === "ghg") return stats.totalGhgReduction;
  if (measure === "beneficiaries") return stats.totalBeneficiaries;

  return stats.projectCount;
}

function formatMeasureValue(value, measure) {
  if (measure === "budget") return formatMoney(value);
  if (measure === "ghg") return `${formatNumber(value, 3)} tCO₂e`;
  if (measure === "beneficiaries") return `${formatNumber(value, 0)} people`;

  return `${formatNumber(value, 0)} project(s)`;
}

function getChoroplethColor(value, maxValue) {
  if (!value || value <= 0) return "#DFE3E4";

  const ratio = maxValue > 0 ? value / maxValue : 0;

  if (ratio >= 0.75) return "#214560";
  if (ratio >= 0.5) return "#4E7492";
  if (ratio >= 0.25) return "#2292A4";
  return "#B9D8DE";
}

function getProjectEntity(project, mode) {
  if (mode === "funders") return project.funding_source || "Not specified";
  if (mode === "agencies") return project.implementing_agency || "Not specified";
  return project.lga_name || "Statewide / Not specified";
}

function buildEntityOptions(projects, mode) {
  if (mode === "where") return [];

  return Array.from(new Set(projects.map((project) => getProjectEntity(project, mode))))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function buildLgaStats(projects) {
  return projects.reduce((lookup, project) => {
    const lgaName = project.lga_name || "Statewide / Not specified";
    const key = normalizeName(lgaName);

    if (!lookup[key]) {
      lookup[key] = {
        label: lgaName,
        lgaName,
        projectCount: 0,
        totalBudget: 0,
        totalGhgReduction: 0,
        totalBeneficiaries: 0,
        fundingSources: {},
        implementingAgencies: {},
        projects: [],
      };
    }

    const fundingSource = project.funding_source || "Not specified";
    const implementingAgency = project.implementing_agency || "Not specified";

    lookup[key].projectCount += 1;
    lookup[key].totalBudget += Number(project.estimated_budget_naira || 0);
    lookup[key].totalGhgReduction += Number(
      project.expected_ghg_reduction_tco2e || 0
    );
    lookup[key].totalBeneficiaries += Number(project.expected_beneficiaries || 0);
    lookup[key].fundingSources[fundingSource] =
      (lookup[key].fundingSources[fundingSource] || 0) + 1;
    lookup[key].implementingAgencies[implementingAgency] =
      (lookup[key].implementingAgencies[implementingAgency] || 0) + 1;
    lookup[key].projects.push(project);

    return lookup;
  }, {});
}

function buildEntityStats(projects, mode) {
  return projects.reduce((lookup, project) => {
    const label = getProjectEntity(project, mode);
    const key = normalizeName(label);

    if (!lookup[key]) {
      lookup[key] = {
        label,
        projectCount: 0,
        totalBudget: 0,
        totalGhgReduction: 0,
        totalBeneficiaries: 0,
        lgas: {},
        projects: [],
      };
    }

    const lgaName = project.lga_name || "Statewide / Not specified";

    lookup[key].projectCount += 1;
    lookup[key].totalBudget += Number(project.estimated_budget_naira || 0);
    lookup[key].totalGhgReduction += Number(
      project.expected_ghg_reduction_tco2e || 0
    );
    lookup[key].totalBeneficiaries += Number(project.expected_beneficiaries || 0);
    lookup[key].lgas[lgaName] = (lookup[key].lgas[lgaName] || 0) + 1;
    lookup[key].projects.push(project);

    return lookup;
  }, {});
}

function summarizeDictionary(dictionary, maxItems = 3) {
  return Object.entries(dictionary || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems)
    .map(([label, count]) => `${label} (${count})`)
    .join(", ");
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
      className="absolute right-4 top-4 z-[650] rounded-md border border-[#CAD2D7] bg-white/95 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#214560] shadow-lg backdrop-blur hover:border-[#2292A4] hover:text-[#2292A4]"
    >
      Reset View
    </button>
  );
}

function MapLegend({ measure, activeEntity }) {
  return (
    <div className="absolute bottom-4 left-4 z-[650] w-72 rounded-xl border border-[#CAD2D7] bg-white/95 p-4 text-xs shadow-lg backdrop-blur">
      <p className="mb-3 font-black text-[#0B1726]">
        {getMeasureLabel(measure)} Legend
      </p>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#DFE3E4]" />
          <span className="text-slate-600">No linked project</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#B9D8DE]" />
          <span className="text-slate-600">Lower concentration</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#2292A4]" />
          <span className="text-slate-600">Moderate concentration</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#214560]" />
          <span className="text-slate-600">Highest concentration</span>
        </div>
      </div>

      <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-5 text-slate-500">
        Map values are relative to the current project view.
        {activeEntity ? ` Focus: ${activeEntity}.` : ""}
      </p>
    </div>
  );
}

function AnalysisModeSelector({ mode, setMode }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {analysisModes.map((item) => {
        const isActive = mode === item.key;

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => setMode(item.key)}
            className={`rounded-xl border p-4 text-left transition ${
              isActive
                ? "border-[#214560] bg-[#214560] text-white shadow-sm"
                : "border-[#CAD2D7] bg-white text-[#0B1726] hover:border-[#2292A4]"
            }`}
          >
            <p
              className={`text-xs font-black uppercase tracking-[0.12em] ${
                isActive ? "text-[#C8A84A]" : "text-[#2292A4]"
              }`}
            >
              {item.title}
            </p>
            <p className="mt-2 font-black">{item.label}</p>
            <p
              className={`mt-2 text-xs leading-5 ${
                isActive ? "text-white/70" : "text-slate-500"
              }`}
            >
              {item.helper}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function SummaryPanel({
  projects,
  lgaStats,
  statewideProjects,
  measure,
  mode,
  activeEntity,
}) {
  const modeLabel =
    analysisModes.find((item) => item.key === mode)?.title || "Where";

  return (
    <div className="rounded-xl border border-[#CAD2D7] bg-[#DFE3E4]/35 p-5">
      <h3 className="font-black text-[#0B1726]">Map Summary</h3>

      <div className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Projects in view</span>
          <span className="font-black text-[#0B1726]">{projects.length}</span>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-slate-500">LGAs with projects</span>
          <span className="font-black text-[#0B1726]">
            {
              Object.values(lgaStats).filter(
                (stats) =>
                  stats.lgaName !== "Statewide / Not specified" &&
                  stats.projectCount > 0
              ).length
            }
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Statewide projects</span>
          <span className="font-black text-[#0B1726]">
            {statewideProjects.length}
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Analysis</span>
          <span className="text-right font-black text-[#0B1726]">
            {modeLabel}
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Measure</span>
          <span className="text-right font-black text-[#0B1726]">
            {getMeasureLabel(measure)}
          </span>
        </div>

        {activeEntity && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Focus</span>
            <span
              title={activeEntity}
              className="max-w-[170px] truncate text-right font-black text-[#0B1726]"
            >
              {activeEntity}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function RankingPanel({ rankedItems, measure, mode }) {
  const title =
    mode === "funders"
      ? "Top Funding Sources"
      : mode === "agencies"
        ? "Top Implementing Agencies"
        : "Top LGAs";

  const description =
    mode === "funders"
      ? `Ranked by ${getMeasureLabel(measure).toLowerCase()} to show who is investing more.`
      : mode === "agencies"
        ? `Ranked by ${getMeasureLabel(measure).toLowerCase()} to show who is implementing more.`
        : `Ranked by ${getMeasureLabel(measure).toLowerCase()}.`;

  return (
    <div className="rounded-xl border border-[#CAD2D7] bg-white p-5">
      <h3 className="font-black text-[#0B1726]">{title}</h3>

      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>

      <div className="mt-4 space-y-3">
        {rankedItems.map((stats, index) => {
          const value = getMeasureValue(stats, measure);

          return (
            <div
              key={stats.label || stats.lgaName}
              className="rounded-xl border border-[#CAD2D7] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    title={stats.label || stats.lgaName}
                    className="truncate font-black text-[#0B1726]"
                  >
                    {index + 1}. {stats.label || stats.lgaName}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {stats.projectCount} project(s)
                  </p>
                </div>

                <p className="shrink-0 text-right text-sm font-black text-[#0B1726]">
                  {formatMeasureValue(value, measure)}
                </p>
              </div>

              {mode !== "where" && (
                <div className="mt-3 grid gap-2 border-t border-[#E6EAEC] pt-3 text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">Budget</span>
                    <span className="font-bold text-[#0B1726]">
                      {formatMoney(stats.totalBudget)}
                    </span>
                  </div>

                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">GHG</span>
                    <span className="font-bold text-[#0B1726]">
                      {formatNumber(stats.totalGhgReduction, 3)} tCO₂e
                    </span>
                  </div>

                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">Beneficiaries</span>
                    <span className="font-bold text-[#0B1726]">
                      {formatNumber(stats.totalBeneficiaries, 0)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {rankedItems.length === 0 && (
          <p className="rounded-xl border border-[#CAD2D7] bg-[#DFE3E4]/35 p-4 text-sm text-slate-500">
            No project data available for this view.
          </p>
        )}
      </div>
    </div>
  );
}

export default function ProjectPortfolioMapView({ projects = [] }) {
  const [geoJsonData, setGeoJsonData] = useState(PLACEHOLDER_LGA_GEOJSON);
  const [isUsingPlaceholder, setIsUsingPlaceholder] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState("where");
  const [measure, setMeasure] = useState("count");
  const [activeEntity, setActiveEntity] = useState("all");

  const entityOptions = useMemo(
    () => buildEntityOptions(projects, mode),
    [projects, mode]
  );

  const focusedProjects = useMemo(() => {
    if (mode === "where" || activeEntity === "all") return projects;

    return projects.filter(
      (project) => getProjectEntity(project, mode) === activeEntity
    );
  }, [projects, mode, activeEntity]);

  const lgaStats = useMemo(() => buildLgaStats(focusedProjects), [focusedProjects]);

  const statewideProjects = useMemo(() => {
    return focusedProjects.filter((project) => !project.lga);
  }, [focusedProjects]);

  const rankedItems = useMemo(() => {
    if (mode === "where") {
      return Object.values(lgaStats)
        .filter((stats) => stats.lgaName !== "Statewide / Not specified")
        .sort((a, b) => getMeasureValue(b, measure) - getMeasureValue(a, measure))
        .slice(0, 8);
    }

    return Object.values(buildEntityStats(projects, mode))
      .sort((a, b) => getMeasureValue(b, measure) - getMeasureValue(a, measure))
      .slice(0, 8);
  }, [projects, lgaStats, mode, measure]);

  const maxMeasureValue = useMemo(() => {
    const values = Object.values(lgaStats).map((stats) =>
      getMeasureValue(stats, measure)
    );

    return Math.max(...values, 0);
  }, [lgaStats, measure]);

  useEffect(() => {
    setActiveEntity("all");
  }, [mode]);

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
    const value = getMeasureValue(stats, measure);

    return {
      color: "#ffffff",
      weight: 1.5,
      fillColor: getChoroplethColor(value, maxMeasureValue),
      fillOpacity: value > 0 ? 0.82 : 0.45,
      opacity: 1,
      dashArray: value > 0 ? "" : "2",
    };
  }

  function buildPopupHtml(feature) {
    const lgaName = getFeatureDisplayName(feature);
    const stats = getFeatureStats(feature);
    const value = getMeasureValue(stats, measure);

    if (!stats) {
      return `
        <div style="min-width: 220px;">
          <strong>${escapeHtml(lgaName)}</strong><br/>
          <span>No linked projects found for this LGA.</span>
        </div>
      `;
    }

    const topFunders = summarizeDictionary(stats.fundingSources);
    const topAgencies = summarizeDictionary(stats.implementingAgencies);

    return `
      <div style="min-width: 270px;">
        <strong>${escapeHtml(lgaName)}</strong><br/>
        <span>${escapeHtml(getMeasureLabel(measure))}: <strong>${escapeHtml(
      formatMeasureValue(value, measure)
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
        )}</span><br/>
        <hr/>
        <span><strong>Top Funders:</strong> ${escapeHtml(
          topFunders || "Not specified"
        )}</span><br/>
        <span><strong>Top Agencies:</strong> ${escapeHtml(
          topAgencies || "Not specified"
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
          color: "#0B1726",
          fillOpacity: 0.94,
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

  const focusLabel = mode !== "where" && activeEntity !== "all" ? activeEntity : "";

  return (
    <div>
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2292A4]">
          Portfolio intelligence map
        </p>

        <h2 className="mt-2 text-2xl font-black text-[#0B1726]">
          Climate project investment and implementation view
        </h2>

        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          Explore where projects are concentrated, who funds more, and which
          agencies are implementing more climate action.
        </p>
      </div>

      <AnalysisModeSelector mode={mode} setMode={setMode} />

      <div className="mt-4 grid gap-3 lg:grid-cols-[280px_1fr]">
        <select
          value={measure}
          onChange={(event) => setMeasure(event.target.value)}
          className="rounded-md border border-[#CAD2D7] bg-white px-4 py-3 text-sm outline-none focus:border-[#2292A4] focus:ring-2 focus:ring-[#2292A4]/10"
        >
          {measureOptions.map((item) => (
            <option key={item.value} value={item.value}>
              Compare by: {item.label}
            </option>
          ))}
        </select>

        {mode !== "where" && (
          <select
            value={activeEntity}
            onChange={(event) => setActiveEntity(event.target.value)}
            className="rounded-md border border-[#CAD2D7] bg-white px-4 py-3 text-sm outline-none focus:border-[#2292A4] focus:ring-2 focus:ring-[#2292A4]/10"
          >
            <option value="all">
              {mode === "funders"
                ? "Show all funding sources on map"
                : "Show all implementing agencies on map"}
            </option>

            {entityOptions.map((item) => (
              <option key={item} value={item}>
                Focus map on: {item}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-3">
        <div className="relative h-fit self-start overflow-hidden rounded-xl border border-[#CAD2D7] xl:col-span-2">
          <MapContainer
            center={KADUNA_CENTER}
            zoom={KADUNA_ZOOM}
            minZoom={6}
            maxZoom={15}
            maxBounds={NIGERIA_BOUNDS}
            maxBoundsViscosity={1.0}
            scrollWheelZoom={false}
            style={{ height: "460px", width: "100%" }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FitGeoJsonBounds geoJsonData={geoJsonData} />
            <ResetMapButton geoJsonData={geoJsonData} />

            <GeoJSON
              key={`${mode}-${measure}-${activeEntity}-${
                isUsingPlaceholder ? "placeholder" : "official"
              }-${focusedProjects.length}`}
              data={geoJsonData}
              style={getFeatureStyle}
              onEachFeature={onEachFeature}
            />
          </MapContainer>

          <MapLegend measure={measure} activeEntity={focusLabel} />

          {loadError && (
            <div className="absolute bottom-4 right-4 z-[650] max-w-xs rounded-xl border border-amber-200 bg-amber-50/95 p-4 text-xs text-amber-800 shadow-lg backdrop-blur">
              <p className="font-black">Boundary Notice</p>
              <p className="mt-1 leading-5">{loadError}</p>
            </div>
          )}
        </div>

        <div className="h-fit self-start space-y-6">
          <SummaryPanel
            projects={focusedProjects}
            lgaStats={lgaStats}
            statewideProjects={statewideProjects}
            measure={measure}
            mode={mode}
            activeEntity={focusLabel}
          />

          <RankingPanel rankedItems={rankedItems} measure={measure} mode={mode} />
        </div>
      </div>
    </div>
  );
}