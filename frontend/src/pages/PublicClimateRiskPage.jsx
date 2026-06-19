import { useEffect, useState } from "react";
import {
  PublicEmptyState,
  PublicPortalFooter,
  PublicPortalHeader,
} from "../components/PublicPortalChrome";
import PublicClimateRiskMapPreview from "../components/PublicClimateRiskMapPreview";
import {
  getPublicPortalSummary,
  getPublicClimateRiskProfiles,
} from "../services/api";

const riskLayerGroups = [
  {
    key: "risk_layers",
    title: "Risk Layers",
    description: "Composite and hazard-specific risk indicators.",
    items: [
      {
        key: "overall",
        label: "Overall Risk",
        field: "overall_risk_score",
        reverse: false,
        description:
          "Composite climate risk score across hazards, exposure, vulnerability and adaptive capacity.",
      },
      {
        key: "flood",
        label: "Flood Risk",
        field: "flood_risk_score",
        reverse: false,
        description: "Relative flood concern by LGA.",
      },
      {
        key: "drought",
        label: "Drought Risk",
        field: "drought_risk_score",
        reverse: false,
        description: "Relative drought and rainfall-stress concern by LGA.",
      },
      {
        key: "heat",
        label: "Heat Risk",
        field: "heat_risk_score",
        reverse: false,
        description: "Relative heat-stress concern by LGA.",
      },
      {
        key: "erosion",
        label: "Erosion Risk",
        field: "erosion_risk_score",
        reverse: false,
        description: "Relative erosion and land-degradation concern by LGA.",
      },
    ],
  },
  {
    key: "risk_drivers",
    title: "Risk Drivers",
    description: "Underlying conditions that influence climate risk.",
    items: [
      {
        key: "exposure",
        label: "Exposure",
        field: "exposure_score",
        reverse: false,
        description: "People, assets and infrastructure exposed to hazards.",
      },
      {
        key: "vulnerability",
        label: "Vulnerability",
        field: "vulnerability_score",
        reverse: false,
        description: "Social and economic sensitivity to climate impacts.",
      },
      {
        key: "adaptive_capacity",
        label: "Adaptive Capacity",
        field: "adaptive_capacity_score",
        reverse: true,
        description:
          "Capacity to prepare for, respond to and recover from climate impacts.",
      },
    ],
  },
];

const allRiskLayers = riskLayerGroups.flatMap((group) => group.items);

const aboutDataItems = [
  {
    title: "How is the climate risk score calculated?",
    body: "The public risk score is an indexed value from 0 to 100. It combines approved climate hazard indicators, exposure information, vulnerability indicators and adaptive capacity evidence available for each LGA.",
  },
  {
    title: "What do the risk layers mean?",
    body: "Risk layers show hazard-specific or composite risk conditions such as flood, drought, heat and erosion. Risk drivers such as exposure, vulnerability and adaptive capacity explain why impacts may be more serious in some locations.",
  },
  {
    title: "How should Adaptive Capacity be interpreted?",
    body: "Adaptive Capacity is different from the other layers. A higher adaptive capacity score is better because it indicates stronger ability to prepare for, respond to and recover from climate impacts. Where ranking is shown, LGAs with weaker capacity are treated as higher planning concern.",
  },
  {
    title: "Limitations of the analysis",
    body: "The public map is a summary-level decision support tool. It should not replace technical flood modelling, engineering design, detailed vulnerability assessment, field validation or official planning approval.",
  },
  {
    title: "Proper use of the data",
    body: "The public data should support awareness, coordination and prioritisation. Technical users should consult approved reports, validated datasets and detailed evidence documents before making operational decisions.",
  },
];

function getLayerConfig(activeLayer) {
  return (
    allRiskLayers.find((item) => item.key === activeLayer) || allRiskLayers[0]
  );
}

function getGroupForLayer(activeLayer) {
  return (
    riskLayerGroups.find((group) =>
      group.items.some((item) => item.key === activeLayer)
    ) || riskLayerGroups[0]
  );
}

function hasValidScore(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

function formatRiskScore(value) {
  if (!hasValidScore(value)) return "—";

  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatAverageScore(value) {
  if (!hasValidScore(value)) return "—";

  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function getScoreClass(value, layerConfig) {
  if (!hasValidScore(value)) return "No Data";

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

function getScoreBadgeClass(value, layerConfig) {
  if (!hasValidScore(value)) return "bg-slate-100 text-slate-500";

  const number = Number(value);

  if (layerConfig.reverse) {
    if (number >= 70) return "bg-[#009B35]/10 text-[#009B35]";
    if (number >= 55) return "bg-[#030454]/10 text-[#030454]";
    if (number >= 40) return "bg-[#F3F74B]/25 text-[#030454]";
    return "bg-red-50 text-red-700";
  }

  if (number >= 75) return "bg-red-50 text-red-700";
  if (number >= 60) return "bg-orange-50 text-orange-700";
  if (number >= 40) return "bg-[#F3F74B]/25 text-[#030454]";
  return "bg-[#009B35]/10 text-[#009B35]";
}

function getScoreBarColor(value, layerConfig) {
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

function getLayerStats(profiles, layerConfig) {
  const validProfiles = profiles.filter((profile) =>
    hasValidScore(profile?.[layerConfig.field])
  );

  if (!validProfiles.length) {
    return {
      averageScore: null,
      concernCount: 0,
      topProfile: null,
    };
  }

  const scores = validProfiles.map((profile) =>
    Number(profile[layerConfig.field])
  );

  const averageScore =
    scores.reduce((total, score) => total + score, 0) / scores.length;

  const concernCount = validProfiles.filter((profile) => {
    const score = Number(profile[layerConfig.field]);

    if (layerConfig.reverse) {
      return score < 55;
    }

    return score >= 60;
  }).length;

  const sorted = [...validProfiles].sort((a, b) => {
    const aScore = Number(a[layerConfig.field]);
    const bScore = Number(b[layerConfig.field]);

    if (layerConfig.reverse) {
      return aScore - bScore;
    }

    return bScore - aScore;
  });

  return {
    averageScore,
    concernCount,
    topProfile: sorted[0],
  };
}

function getRankedProfiles(climateRisk, profiles, layerConfig) {
  const usableProfiles = profiles.length ? profiles : climateRisk.top_lgas || [];

  const withLayerScores = usableProfiles.filter((profile) =>
    hasValidScore(profile[layerConfig.field])
  );

  const source = withLayerScores.length ? withLayerScores : usableProfiles;

  return [...source]
    .sort((a, b) => {
      const aScore = Number(a[layerConfig.field] || 0);
      const bScore = Number(b[layerConfig.field] || 0);

      if (layerConfig.reverse) {
        return aScore - bScore;
      }

      return bScore - aScore;
    })
    .slice(0, 8);
}

function ClimateRiskSummaryTiles({ activeLayer, profiles }) {
  const layerConfig = getLayerConfig(activeLayer);
  const layerStats = getLayerStats(profiles, layerConfig);

  const concernLabel = layerConfig.reverse
    ? "Weak Capacity LGAs"
    : "High Concern LGAs";

  return (
    <section className="bg-[#F7F9FA] px-4 py-4 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1536px]">
        <div className="grid gap-3 md:grid-cols-3">
          <article className="rounded-xl border border-[#D8DDE2] bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              Average Score
            </p>

            <strong className="mt-2 block text-2xl font-black text-[#030454]">
              {formatAverageScore(layerStats.averageScore)}
            </strong>
          </article>

          <article className="rounded-xl border border-[#D8DDE2] bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              {concernLabel}
            </p>

            <strong className="mt-2 block text-2xl font-black text-[#030454]">
              {layerStats.concernCount}
            </strong>
          </article>

          <article className="rounded-xl border border-[#D8DDE2] bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              Priority LGA
            </p>

            <strong className="mt-2 block truncate text-2xl font-black text-[#030454]">
              {layerStats.topProfile?.lga_name || "—"}
            </strong>
          </article>
        </div>
      </div>
    </section>
  );
}

function ControlField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </span>

      {children}
    </label>
  );
}

function ExplorerControlBar({
  activeLayer,
  onLayerChange,
  latestYear,
  climateRisk,
}) {
  const activeGroup = getGroupForLayer(activeLayer);
  const activeLayerConfig = getLayerConfig(activeLayer);

  function handleGroupChange(event) {
    const nextGroup =
      riskLayerGroups.find((group) => group.key === event.target.value) ||
      riskLayerGroups[0];

    onLayerChange(nextGroup.items[0].key);
  }

  return (
    <div className="rounded-xl border border-[#D8DDE2] bg-white p-4 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[240px_260px_1fr_auto] lg:items-end">
        <ControlField label="Risk category">
          <select
            value={activeGroup.key}
            onChange={handleGroupChange}
            className="h-11 w-full rounded-md border border-[#D8DDE2] bg-[#F7F9FA] px-4 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
          >
            {riskLayerGroups.map((group) => (
              <option key={group.key} value={group.key}>
                {group.title}
              </option>
            ))}
          </select>
        </ControlField>

        <ControlField label="Indicator">
          <select
            value={activeLayer}
            onChange={(event) => onLayerChange(event.target.value)}
            className="h-11 w-full rounded-md border border-[#D8DDE2] bg-[#F7F9FA] px-4 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
          >
            {activeGroup.items.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </ControlField>

        <div className="rounded-md border border-[#E6EAEC] bg-[#F7F9FA] px-4 py-3 text-sm leading-6 text-slate-600">
          <span className="font-black text-[#030454]">
            {activeLayerConfig.label}:
          </span>{" "}
          {activeLayerConfig.description}
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-slate-500 lg:justify-end">
          <span className="rounded-full bg-[#F7F9FA] px-3 py-2">
            Year:{" "}
            <strong className="text-[#030454]">
              {latestYear || "Latest"}
            </strong>
          </span>

          <span className="rounded-full bg-[#F7F9FA] px-3 py-2">
            LGAs:{" "}
            <strong className="text-[#030454]">
              {climateRisk.total_lgas || 0}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
}

function LgaRankingChart({ climateRisk, profiles, activeLayer }) {
  const layerConfig = getLayerConfig(activeLayer);
  const rankedProfiles = getRankedProfiles(climateRisk, profiles, layerConfig);

  if (rankedProfiles.length === 0) {
    return (
      <PublicEmptyState
        title="No LGA ranking available"
        message="No public climate risk summary records are available for the selected indicator."
      />
    );
  }

  return (
    <div className="rounded-xl border border-[#D8DDE2] bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#009B35]">
            LGA ranking
          </p>

          <h3 className="mt-2 text-xl font-black text-[#030454]">
            Top LGAs for {layerConfig.label}
          </h3>
        </div>

        <p className="max-w-md text-sm leading-6 text-slate-500">
          {layerConfig.reverse
            ? "LGAs with weaker adaptive capacity appear first."
            : "LGAs with higher scores appear first."}
        </p>
      </div>

      <div className="space-y-4">
        {rankedProfiles.map((profile, index) => {
          const score = profile[layerConfig.field];
          const numericScore = hasValidScore(score) ? Number(score) : 0;

          return (
            <div
              key={profile.id || `${profile.lga_name}-${index}`}
              className="grid gap-3 md:grid-cols-[240px_1fr_90px] md:items-center"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-8 shrink-0 font-mono text-xs font-black text-slate-400">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <span className="truncate text-sm font-black text-[#030454]">
                  {profile.lga_name}
                </span>
              </div>

              <div className="group relative">
                <div
                  className="h-3 overflow-hidden rounded-full bg-slate-100"
                  title={`${layerConfig.label}: ${formatRiskScore(score)} / 100`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(Math.max(numericScore, 0), 100)}%`,
                      backgroundColor: getScoreBarColor(score, layerConfig),
                    }}
                  />
                </div>

                <div className="pointer-events-none absolute left-1/2 top-5 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[#030454] px-2 py-1 text-[11px] font-black text-white shadow-lg group-hover:block">
                  {formatRiskScore(score)} / 100
                </div>
              </div>

              <span
                className={`w-fit rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${getScoreBadgeClass(
                  score,
                  layerConfig
                )}`}
              >
                {getScoreClass(score, layerConfig)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MapAnalysisPanel({
  activeLayer,
  climateRisk,
  publicProfiles,
  onProfilesLoaded,
  onLayerChange,
}) {
  return (
    <section className="bg-[#F7F9FA] px-4 pb-5 pt-0 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1536px]">
        <div className="space-y-4">
          <ExplorerControlBar
            activeLayer={activeLayer}
            onLayerChange={onLayerChange}
            latestYear={climateRisk.latest_year}
            climateRisk={climateRisk}
          />

          <div className="relative overflow-hidden rounded-2xl border border-[#030454]/10 bg-[#030454] p-5 shadow-sm">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[#009B35]/35 to-transparent" />

            <div className="relative grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#F3F74B]">
                  Satellite Intelligence Workspace
                </p>

                <h3 className="mt-2 text-2xl font-black text-white">
                  Launch the Kaduna Interactive Climate Atlas
                </h3>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
                  Move from LGA risk summaries into an atlas-style workspace for NDVI,
                  rainfall, heat, flood hazard, drought, LULC and terrain layers powered
                  by the remote sensing backend.
                </p>
              </div>

              <a
                href="/public/climate-atlas"
                className="inline-flex items-center justify-center rounded-md bg-[#F3F74B] px-5 py-3 text-sm font-black text-[#030454] transition hover:bg-white"
              >
                Open Climate Atlas
              </a>
            </div>
          </div>

          <PublicClimateRiskMapPreview
            activeLayer={activeLayer}
            height="540px"
            onProfilesLoaded={onProfilesLoaded}
          />

          <LgaRankingChart
            climateRisk={climateRisk}
            profiles={publicProfiles}
            activeLayer={activeLayer}
          />
        </div>
      </div>
    </section>
  );
}

function AboutDataAccordion() {
  const [openItems, setOpenItems] = useState([]);

  function toggleItem(title) {
    setOpenItems((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : [...current, title]
    );
  }

  return (
    <section className="bg-[#F7F9FA] px-4 pb-14 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-['Playfair_Display'] text-3xl font-bold text-[#030454]">
          About the data
        </h2>

        <div className="mt-6 divide-y divide-[#D8DDE2] rounded-md border border-[#D8DDE2] bg-white">
          {aboutDataItems.map((item) => {
            const isOpen = openItems.includes(item.title);

            return (
              <div key={item.title}>
                <button
                  type="button"
                  onClick={() => toggleItem(item.title)}
                  className="flex w-full items-center justify-between gap-6 px-5 py-5 text-left"
                >
                  <span className="font-bold text-[#030454]">{item.title}</span>

                  <span className="text-xl font-black text-[#009B35]">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 text-sm leading-7 text-slate-600">
                    {item.body}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function PublicClimateRiskPage() {
  const [summaryData, setSummaryData] = useState(null);
  const [publicProfiles, setPublicProfiles] = useState([]);
  const [activeRiskLayer, setActiveRiskLayer] = useState("overall");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSummary() {
    setIsLoading(true);
    setError("");

    try {
      const [data, profileData] = await Promise.all([
        getPublicPortalSummary(),
        getPublicClimateRiskProfiles(),
      ]);

      setSummaryData(data.summary || {});
      setPublicProfiles(profileData.results || []);
    } catch (err) {
      console.error(err);
      setError("Could not load public climate risk summary.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const climateRisk = summaryData?.climate_risk || {};

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <PublicPortalHeader
        activePage="climate-risk"
        compact
        title={<>Climate risk explorer</>}
        description="Explore climate risk layers and drivers across Kaduna State using public LGA-level summary indicators."
        showActions={false}
      />

      {error && (
        <section className="px-4 py-4 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1536px] rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        </section>
      )}

      {!isLoading && !error && (
        <ClimateRiskSummaryTiles
          activeLayer={activeRiskLayer}
          profiles={publicProfiles}
        />
      )}

      {isLoading ? (
        <section className="px-4 py-16 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1536px] rounded-sm border border-[#CAD2D7] bg-white p-8 text-sm text-slate-500 shadow-sm">
            Loading public climate risk information...
          </div>
        </section>
      ) : (
        <>
          <MapAnalysisPanel
            activeLayer={activeRiskLayer}
            climateRisk={climateRisk}
            publicProfiles={publicProfiles}
            onProfilesLoaded={setPublicProfiles}
            onLayerChange={setActiveRiskLayer}
          />

          <AboutDataAccordion />
        </>
      )}

      <PublicPortalFooter />
    </main>
  );
}