import { useEffect, useMemo, useState } from "react";
import {
  getClimateInfrastructureAssets,
  getClimateRiskProfiles,
} from "../services/api";

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function getRiskClass(level) {
  if (level === "very_high") return "bg-red-50 text-red-700";
  if (level === "high") return "bg-orange-50 text-orange-700";
  if (level === "moderate") return "bg-[#F3F74B]/45 text-[#030454]";
  return "bg-[#009B35]/10 text-[#009B35]";
}

function getRiskBarColor(level) {
  if (level === "very_high") return "#B91C1C";
  if (level === "high") return "#EA580C";
  if (level === "moderate") return "#F3F74B";
  return "#009B35";
}

function scoreLabel(value) {
  const number = Number(value || 0);

  if (number >= 75) return "Very High";
  if (number >= 60) return "High";
  if (number >= 40) return "Moderate";
  return "Low";
}

function StatCard({ label, value, helper, tone = "blue" }) {
  const toneClasses = {
    blue: "border-[#030454]/15 bg-[#030454]/5",
    green: "border-[#009B35]/20 bg-[#009B35]/8",
    yellow: "border-[#F3F74B]/70 bg-[#F3F74B]/25",
    red: "border-red-200 bg-red-50",
    orange: "border-orange-200 bg-orange-50",
    white: "border-slate-200 bg-white",
  };

  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm ${
        toneClasses[tone] || toneClasses.white
      }`}
    >
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <h3 className="mt-3 text-3xl font-black text-[#030454]">{value}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

function DistributionRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span
          className="h-3 w-3 rounded-sm"
          style={{ backgroundColor: color }}
        />
        <span className="text-slate-500">{label}</span>
      </div>

      <span className="font-black text-[#030454]">{value}</span>
    </div>
  );
}

export default function ExecutiveClimateRiskSummary() {
  const [riskData, setRiskData] = useState(null);
  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboardClimateRisk() {
    setIsLoading(true);
    setError("");

    try {
      const [riskResponse, assetResponse] = await Promise.all([
        getClimateRiskProfiles({}),
        getClimateInfrastructureAssets({}),
      ]);

      setRiskData(riskResponse);
      setAssets(assetResponse.results || []);
    } catch (err) {
      console.error(err);
      setError("Could not load climate risk dashboard summary.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboardClimateRisk();
  }, []);

  const profiles = riskData?.results || [];
  const summary = riskData?.summary || {};
  const topLgas = riskData?.top_lgas || [];

  const dashboardStats = useMemo(() => {
    const weakAdaptiveCapacity = profiles.filter(
      (profile) => Number(profile.adaptive_capacity_score || 0) < 40
    );

    const veryHighRiskAssets = assets.filter(
      (asset) => asset.risk_status === "very_high"
    );

    const highRiskAssets = assets.filter(
      (asset) => asset.risk_status === "high"
    );

    const highestRiskProfile = [...profiles].sort(
      (a, b) =>
        Number(b.overall_risk_score || 0) -
        Number(a.overall_risk_score || 0)
    )[0];

    return {
      weakAdaptiveCapacityCount: weakAdaptiveCapacity.length,
      totalAssets: assets.length,
      highOrVeryHighAssets: highRiskAssets.length + veryHighRiskAssets.length,
      highestRiskProfile,
    };
  }, [profiles, assets]);

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          Loading climate risk dashboard summary...
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        {error}
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
            Climate Risk Intelligence
          </p>

          <h2 className="mt-2 text-2xl font-black text-[#030454]">
            Kaduna Climate Risk Executive Summary
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Live summary from the Climate Risk module, including LGA risk
            profiles, priority LGAs, weak adaptive capacity and
            infrastructure-at-risk indicators.
          </p>
        </div>

        <button
          type="button"
          onClick={loadDashboardClimateRisk}
          className="rounded-md border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
        >
          Refresh Climate Risk
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="LGAs Assessed"
          value={summary.total_lgas || 0}
          helper="Active climate risk profiles."
          tone="blue"
        />

        <StatCard
          label="High / Very High LGAs"
          value={summary.high_or_very_high_count || 0}
          helper="Priority LGAs for adaptation planning."
          tone="orange"
        />

        <StatCard
          label="Average Risk Index"
          value={formatNumber(summary.average_overall_risk, 2)}
          helper="Statewide average across assessed LGAs."
          tone="green"
        />

        <StatCard
          label="Highest Risk Index"
          value={formatNumber(summary.highest_overall_risk, 2)}
          helper={
            dashboardStats.highestRiskProfile?.lga_name || "No LGA available"
          }
          tone="red"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <StatCard
          label="Weak Adaptive Capacity LGAs"
          value={dashboardStats.weakAdaptiveCapacityCount}
          helper="LGAs with adaptive capacity below 40 / 100."
          tone="yellow"
        />

        <StatCard
          label="Infrastructure Assets Recorded"
          value={dashboardStats.totalAssets}
          helper="Assets stored in the infrastructure-at-risk layer."
          tone="white"
        />

        <StatCard
          label="High-Risk Assets"
          value={dashboardStats.highOrVeryHighAssets}
          helper="Assets marked High or Very High risk."
          tone="red"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h3 className="text-xl font-black text-[#030454]">
            Top Priority LGAs
          </h3>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            Highest LGAs by overall climate risk index.
          </p>

          <div className="mt-5 space-y-4">
            {topLgas.slice(0, 5).map((profile, index) => {
              const score = Number(profile.overall_risk_score || 0);

              return (
                <div
                  key={profile.id}
                  className="rounded-2xl border border-slate-200 p-4 transition hover:border-[#009B35]/60 hover:bg-[#009B35]/5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-[#030454]">
                        {index + 1}. {profile.lga_name}
                      </p>

                      <span
                        className={`mt-2 inline-flex rounded-md px-3 py-1 text-xs font-bold ${getRiskClass(
                          profile.risk_level
                        )}`}
                      >
                        {profile.risk_level_display ||
                          scoreLabel(profile.overall_risk_score)}
                      </span>
                    </div>

                    <p className="text-2xl font-black text-[#030454]">
                      {formatNumber(profile.overall_risk_score, 2)}
                      <span className="text-sm font-semibold text-slate-400">
                        {" "}
                        / 100
                      </span>
                    </p>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(Math.max(score, 0), 100)}%`,
                        backgroundColor: getRiskBarColor(profile.risk_level),
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {topLgas.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                No priority LGA records available yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-black text-[#030454]">
            Risk Level Distribution
          </h3>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            Count of LGAs by current risk class.
          </p>

          <div className="mt-5 space-y-4 text-sm">
            <DistributionRow
              label="Low"
              value={summary.risk_counts?.low || 0}
              color="#009B35"
            />

            <DistributionRow
              label="Moderate"
              value={summary.risk_counts?.moderate || 0}
              color="#F3F74B"
            />

            <DistributionRow
              label="High"
              value={summary.risk_counts?.high || 0}
              color="#EA580C"
            />

            <DistributionRow
              label="Very High"
              value={summary.risk_counts?.very_high || 0}
              color="#B91C1C"
            />
          </div>

          <div className="mt-6 rounded-xl border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-5 py-4 text-sm leading-6 text-[#030454]">
            <p className="font-black">Decision Note</p>
            <p className="mt-1">
              LGAs with high overall risk, weak adaptive capacity and exposed
              infrastructure should be prioritised for adaptation investment.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}