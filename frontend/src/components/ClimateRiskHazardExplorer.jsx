import { useMemo, useState } from "react";
import ClimateRiskMap from "./ClimateRiskMap";

const hazardOptions = [
  {
    key: "overall",
    label: "Overall",
    title: "Overall Climate Intelligence Index",
    description:
      "Composite Climate Intelligence index combining hazard, exposure, vulnerability and adaptive capacity gap.",
    field: "overall_risk_score",
    higherMeaning: "Higher score means higher overall Climate Intelligence.",
  },
  {
    key: "flood",
    label: "Flood",
    title: "Flood Risk Index",
    description:
      "Shows relative flood risk based on flood-related parameter records such as flood occurrence, flood-prone area, exposed population and other flood evidence.",
    field: "flood_risk_score",
    higherMeaning: "Higher score means higher flood concern.",
  },
  {
    key: "drought",
    label: "Drought",
    title: "Drought Risk Index",
    description:
      "Shows relative drought stress based on drought-related indicators such as rainfall anomaly, dry days, SPI/NDVI evidence and vegetation stress.",
    field: "drought_risk_score",
    higherMeaning: "Higher score means higher drought concern.",
  },
  {
    key: "heat",
    label: "Heat",
    title: "Heat Risk Index",
    description:
      "Shows relative heat risk based on heat-related indicators such as land surface temperature, temperature anomaly and urban heat exposure.",
    field: "heat_risk_score",
    higherMeaning: "Higher score means higher heat concern.",
  },
  {
    key: "erosion",
    label: "Erosion",
    title: "Erosion Risk Index",
    description:
      "Shows relative erosion risk based on slope, soil erodibility, rainfall erosivity, land-cover condition and erosion evidence.",
    field: "erosion_risk_score",
    higherMeaning: "Higher score means higher erosion concern.",
  },
  {
    key: "exposure",
    label: "Exposure",
    title: "Exposure Index",
    description:
      "Shows the relative level of people, infrastructure and assets exposed to climate hazards.",
    field: "exposure_score",
    higherMeaning: "Higher score means more people/assets are exposed.",
  },
  {
    key: "vulnerability",
    label: "Vulnerability",
    title: "Vulnerability Index",
    description:
      "Shows social and economic sensitivity, including poverty, livelihood dependency, population density and service-access limitations.",
    field: "vulnerability_score",
    higherMeaning: "Higher score means greater vulnerability.",
  },
  {
    key: "adaptive_capacity",
    label: "Adaptive Capacity",
    title: "Adaptive Capacity Index",
    description:
      "Shows the relative ability of an LGA to prepare for, respond to and recover from climate impacts.",
    field: "adaptive_capacity_score",
    higherMeaning:
      "Higher score is better. Low adaptive capacity increases final risk.",
  },
];

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function getScoreClass(value, metricKey) {
  const number = Number(value || 0);

  if (metricKey === "adaptive_capacity") {
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

function getBadgeClass(value, metricKey) {
  const number = Number(value || 0);

  if (metricKey === "adaptive_capacity") {
    if (number >= 70) return "bg-[#009B35]/10 text-[#009B35]";
    if (number >= 55) return "bg-[#030454]/10 text-[#030454]";
    if (number >= 40) return "bg-[#F3F74B]/45 text-[#030454]";
    return "bg-red-50 text-red-700";
  }

  if (number >= 75) return "bg-red-50 text-red-700";
  if (number >= 60) return "bg-orange-50 text-orange-700";
  if (number >= 40) return "bg-[#F3F74B]/45 text-[#030454]";
  return "bg-[#009B35]/10 text-[#009B35]";
}

function getBarColor(value, metricKey) {
  const number = Number(value || 0);

  if (metricKey === "adaptive_capacity") {
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

export default function ClimateRiskHazardExplorer({
  profiles = [],
  selectedLgaName,
  onSelectLgaName,
}) {
  const [activeMetric, setActiveMetric] = useState("overall");

  const activeHazard = useMemo(() => {
    return (
      hazardOptions.find((item) => item.key === activeMetric) ||
      hazardOptions[0]
    );
  }, [activeMetric]);

  const selectedProfile = useMemo(() => {
    if (!selectedLgaName) return null;

    return (
      profiles.find(
        (profile) =>
          String(profile.lga_name).toLowerCase() ===
          String(selectedLgaName).toLowerCase()
      ) || null
    );
  }, [profiles, selectedLgaName]);

  const rankedProfiles = useMemo(() => {
    return [...profiles]
      .sort((a, b) => {
        const aScore = Number(a[activeHazard.field] || 0);
        const bScore = Number(b[activeHazard.field] || 0);
        return bScore - aScore;
      })
      .slice(0, 10);
  }, [profiles, activeHazard.field]);

  const selectedScore = selectedProfile
    ? Number(selectedProfile[activeHazard.field] || 0)
    : 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
          Hazard Explorer
        </p>

        <h2 className="mt-2 text-2xl font-black text-[#030454]">
          Explore Climate Intelligence by Hazard
        </h2>

        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          Switch between hazard and risk components to see how different LGAs
          compare. All index values are normalized from 0 to 100.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {hazardOptions.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActiveMetric(item.key)}
            className={`rounded-md px-4 py-2 text-xs font-black uppercase tracking-[0.08em] transition ${
              activeMetric === item.key
                ? "bg-[#030454] text-white"
                : "border border-slate-200 bg-white text-slate-500 hover:border-[#009B35] hover:text-[#009B35]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="h-fit self-start xl:col-span-2">
          <div className="mb-4 rounded-xl border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-5 py-4 text-sm leading-6 text-[#030454]">
            <h3 className="font-black">{activeHazard.title}</h3>
            <p className="mt-2">{activeHazard.description}</p>
            <p className="mt-2 font-bold">{activeHazard.higherMeaning}</p>
          </div>

          <ClimateRiskMap
            profiles={profiles}
            metric={activeMetric}
            selectedLgaName={selectedLgaName}
            onSelectLgaName={onSelectLgaName}
          />
        </div>

        <div className="h-fit self-start space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              Selected LGA
            </p>

            <h3 className="mt-2 text-xl font-black text-[#030454]">
              {selectedProfile?.lga_name || "No LGA selected"}
            </h3>

            {selectedProfile ? (
              <>
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-sm text-slate-500">
                    {activeHazard.title}
                  </p>

                  <p className="mt-2 text-4xl font-black text-[#030454]">
                    {formatNumber(selectedScore, 2)}
                    <span className="text-lg font-semibold text-slate-400">
                      {" "}
                      / 100
                    </span>
                  </p>

                  <span
                    className={`mt-3 inline-flex rounded-md px-3 py-1 text-xs font-bold ${getBadgeClass(
                      selectedScore,
                      activeMetric
                    )}`}
                  >
                    {getScoreClass(selectedScore, activeMetric)}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(Math.max(selectedScore, 0), 100)}%`,
                        backgroundColor: getBarColor(
                          selectedScore,
                          activeMetric
                        ),
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Click a polygon on the map or a ranking row to inspect an LGA.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-xl font-black text-[#030454]">Top 10 LGAs</h3>

            <p className="mt-1 text-sm leading-6 text-slate-500">
              Ranked by {activeHazard.title.toLowerCase()}.
            </p>

            <div className="mt-4 space-y-3">
              {rankedProfiles.map((profile, index) => {
                const score = Number(profile[activeHazard.field] || 0);
                const isSelected =
                  selectedProfile?.lga_name === profile.lga_name;

                return (
                  <button
                    key={`${activeMetric}-${profile.id}`}
                    type="button"
                    onClick={() => onSelectLgaName(profile.lga_name)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      isSelected
                        ? "border-[#009B35]/50 bg-[#009B35]/8"
                        : "border-slate-200 hover:border-[#009B35]/50 hover:bg-[#009B35]/5"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-black text-[#030454]">
                          {index + 1}. {profile.lga_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {getScoreClass(score, activeMetric)}
                        </p>
                      </div>

                      <span className="font-black text-[#030454]">
                        {formatNumber(score, 2)}
                      </span>
                    </div>

                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(Math.max(score, 0), 100)}%`,
                          backgroundColor: getBarColor(score, activeMetric),
                        }}
                      />
                    </div>
                  </button>
                );
              })}

              {rankedProfiles.length === 0 && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No LGA risk profiles available yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}