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
  if (level === "moderate") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

function getRiskBarClass(level) {
  if (level === "very_high") return "bg-red-500";
  if (level === "high") return "bg-orange-500";
  if (level === "moderate") return "bg-amber-500";
  return "bg-emerald-500";
}

function scoreLabel(value) {
  const number = Number(value || 0);

  if (number >= 75) return "Very High";
  if (number >= 60) return "High";
  if (number >= 40) return "Moderate";
  return "Low";
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
          <p className="text-sm font-medium text-emerald-700">
            Climate Risk Intelligence
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            Kaduna Climate Risk Executive Summary
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Live summary from the Climate Risk module, including LGA risk
            profiles, high-priority LGAs, weak adaptive capacity and
            infrastructure-at-risk indicators.
          </p>
        </div>

        <button
          type="button"
          onClick={loadDashboardClimateRisk}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh Climate Risk
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">LGAs Assessed</p>
          <h3 className="mt-3 text-3xl font-bold">
            {summary.total_lgas || 0}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Active climate risk profiles.
          </p>
        </div>

        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
          <p className="text-sm text-orange-700">High / Very High LGAs</p>
          <h3 className="mt-3 text-3xl font-bold text-orange-700">
            {summary.high_or_very_high_count || 0}
          </h3>
          <p className="mt-2 text-sm text-orange-700">
            Priority LGAs for adaptation planning.
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <p className="text-sm text-blue-700">Average Risk Index</p>
          <h3 className="mt-3 text-3xl font-bold text-blue-700">
            {formatNumber(summary.average_overall_risk, 2)}
          </h3>
          <p className="mt-2 text-sm text-blue-700">
            Statewide average across assessed LGAs.
          </p>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-sm text-red-700">Highest Risk Index</p>
          <h3 className="mt-3 text-3xl font-bold text-red-700">
            {formatNumber(summary.highest_overall_risk, 2)}
          </h3>
          <p className="mt-2 text-sm text-red-700">
            {dashboardStats.highestRiskProfile?.lga_name || "No LGA available"}
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Weak Adaptive Capacity LGAs</p>
          <h3 className="mt-3 text-3xl font-bold">
            {dashboardStats.weakAdaptiveCapacityCount}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            LGAs with adaptive capacity below 40 / 100.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Infrastructure Assets Recorded</p>
          <h3 className="mt-3 text-3xl font-bold">
            {dashboardStats.totalAssets}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Assets currently stored in the infrastructure-at-risk layer.
          </p>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-sm text-red-700">High-Risk Assets</p>
          <h3 className="mt-3 text-3xl font-bold text-red-700">
            {dashboardStats.highOrVeryHighAssets}
          </h3>
          <p className="mt-2 text-sm text-red-700">
            Assets marked High or Very High risk.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h3 className="text-lg font-bold">Top Priority LGAs</h3>
          <p className="mt-1 text-sm text-slate-500">
            Highest LGAs by overall climate risk index.
          </p>

          <div className="mt-5 space-y-4">
            {topLgas.slice(0, 5).map((profile, index) => {
              const score = Number(profile.overall_risk_score || 0);

              return (
                <div
                  key={profile.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold">
                        {index + 1}. {profile.lga_name}
                      </p>
                      <span
                        className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getRiskClass(
                          profile.risk_level
                        )}`}
                      >
                        {profile.risk_level_display ||
                          scoreLabel(profile.overall_risk_score)}
                      </span>
                    </div>

                    <p className="text-2xl font-bold">
                      {formatNumber(profile.overall_risk_score, 2)}
                      <span className="text-sm font-semibold text-slate-400">
                        {" "}
                        / 100
                      </span>
                    </p>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${getRiskBarClass(
                        profile.risk_level
                      )}`}
                      style={{
                        width: `${Math.min(Math.max(score, 0), 100)}%`,
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
          <h3 className="text-lg font-bold">Risk Level Distribution</h3>
          <p className="mt-1 text-sm text-slate-500">
            Count of LGAs by current risk class.
          </p>

          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Low</span>
              <span className="font-bold">
                {summary.risk_counts?.low || 0}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Moderate</span>
              <span className="font-bold">
                {summary.risk_counts?.moderate || 0}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">High</span>
              <span className="font-bold">
                {summary.risk_counts?.high || 0}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">Very High</span>
              <span className="font-bold">
                {summary.risk_counts?.very_high || 0}
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-bold">Decision Note</p>
            <p className="mt-2">
              LGAs with high overall risk, weak adaptive capacity, and exposed
              infrastructure should be prioritized for adaptation investment.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}