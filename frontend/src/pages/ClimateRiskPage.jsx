import { useEffect, useMemo, useState } from "react";
import { getClimateRiskProfiles } from "../services/api";
import ClimateRiskMap from "../components/ClimateRiskMap";

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

export default function ClimateRiskPage() {
  const [riskData, setRiskData] = useState(null);
  const [selectedYear, setSelectedYear] = useState("");
  const [riskLevel, setRiskLevel] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [mapMetric, setMapMetric] = useState("overall");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadRiskProfiles() {
    setIsLoading(true);
    setError("");

    try {
      const params = {};

      if (selectedYear) {
        params.year = selectedYear;
      }

      if (riskLevel !== "all") {
        params.risk_level = riskLevel;
      }

      const data = await getClimateRiskProfiles(params);
      setRiskData(data);

      if (!selectedYear && data.available_years?.length) {
        setSelectedYear(String(data.available_years[0]));
      }
    } catch (err) {
      console.error(err);
      setError("Could not load climate risk profiles.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRiskProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, riskLevel]);

  const profiles = riskData?.results || [];
  const summary = riskData?.summary;
  const topLgas = riskData?.top_lgas || [];

  const filteredProfiles = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    if (!search) return profiles;

    return profiles.filter((profile) =>
      profile.lga_name.toLowerCase().includes(search)
    );
  }, [profiles, searchText]);

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            Climate Risk Map
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Kaduna LGA Climate Risk Profiles
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Development risk dashboard showing flood, drought, heat, erosion,
            vulnerability and adaptive capacity scores for Kaduna’s LGAs. The map below uses development placeholder polygons and will later be replaced with official Kaduna LGA boundaries.
          </p>
        </div>

        <button
          onClick={loadRiskProfiles}
          className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Refresh risk data
        </button>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">LGAs Assessed</p>
          <h2 className="mt-3 text-2xl font-bold">
            {summary?.total_lgas || 0}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Active risk profiles in current view.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Average Risk Score</p>
          <h2 className="mt-3 text-2xl font-bold">
            {formatNumber(summary?.average_overall_risk, 2)}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Weighted average across selected LGAs.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Highest Risk Score</p>
          <h2 className="mt-3 text-2xl font-bold text-red-600">
            {formatNumber(summary?.highest_overall_risk, 2)}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Highest overall score in current view.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">High / Very High LGAs</p>
          <h2 className="mt-3 text-2xl font-bold text-orange-600">
            {summary?.high_or_very_high_count || 0}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Priority LGAs for adaptation planning.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
                <h2 className="text-lg font-bold">LGA Risk Choropleth Map</h2>
                <p className="text-sm text-slate-500">
                    Development map joining LGA polygons with climate risk scores.
                </p>
            </div>

            <select
                value={mapMetric}
                onChange={(event) => setMapMetric(event.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
                <option value="overall">Overall Risk</option>
                <option value="flood">Flood Risk</option>
                <option value="drought">Drought Risk</option>
                <option value="heat">Heat Risk</option>
                <option value="erosion">Erosion Risk</option>
                <option value="vulnerability">Vulnerability</option>
                <option value="adaptive_capacity">Adaptive Capacity</option>
            </select>
        </div>

        <ClimateRiskMap profiles={profiles} metric={mapMetric} />

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
            This map uses development placeholder LGA polygons. Replace
            <code className="mx-1 rounded bg-amber-100 px-1">
                public/data/kaduna_lgas_dev.geojson
            </code>
            with official Kaduna LGA boundaries before production.
        </div>
    </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-lg font-bold">LGA Risk Table</h2>
              <p className="text-sm text-slate-500">
                Filter and compare climate risk across LGAs.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <select
                value={selectedYear}
                onChange={(event) => setSelectedYear(event.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {(riskData?.available_years || []).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>

              <select
                value={riskLevel}
                onChange={(event) => setRiskLevel(event.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="all">All risk levels</option>
                <option value="low">Low</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
                <option value="very_high">Very High</option>
              </select>

              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search LGA..."
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          {isLoading ? (
            <p className="text-slate-500">Loading climate risk profiles...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-3 font-medium">LGA</th>
                    <th className="px-3 py-3 font-medium">Overall</th>
                    <th className="px-3 py-3 font-medium">Level</th>
                    <th className="px-3 py-3 font-medium">Flood</th>
                    <th className="px-3 py-3 font-medium">Drought</th>
                    <th className="px-3 py-3 font-medium">Heat</th>
                    <th className="px-3 py-3 font-medium">Erosion</th>
                    <th className="px-3 py-3 font-medium">Vulnerability</th>
                    <th className="px-3 py-3 font-medium">Adaptive Capacity</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredProfiles.map((profile) => (
                    <tr
                      key={profile.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-3 py-4 font-semibold">
                        {profile.lga_name}
                      </td>

                      <td className="px-3 py-4">
                        <div className="flex items-center gap-3">
                          <span className="w-12 font-semibold">
                            {formatNumber(profile.overall_risk_score, 2)}
                          </span>
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${getRiskBarClass(
                                profile.risk_level
                              )}`}
                              style={{
                                width: `${Math.min(
                                  Number(profile.overall_risk_score || 0),
                                  100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${getRiskClass(
                            profile.risk_level
                          )}`}
                        >
                          {profile.risk_level_display}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        {formatNumber(profile.flood_risk_score, 2)}
                      </td>
                      <td className="px-3 py-4">
                        {formatNumber(profile.drought_risk_score, 2)}
                      </td>
                      <td className="px-3 py-4">
                        {formatNumber(profile.heat_risk_score, 2)}
                      </td>
                      <td className="px-3 py-4">
                        {formatNumber(profile.erosion_risk_score, 2)}
                      </td>
                      <td className="px-3 py-4">
                        {formatNumber(profile.vulnerability_score, 2)}
                      </td>
                      <td className="px-3 py-4">
                        {formatNumber(profile.adaptive_capacity_score, 2)}
                      </td>
                    </tr>
                  ))}

                  {filteredProfiles.length === 0 && (
                    <tr>
                      <td
                        colSpan="9"
                        className="px-3 py-8 text-center text-slate-500"
                      >
                        No risk profiles found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Highest-Risk LGAs</h2>
            <p className="text-sm text-slate-500">
              Top LGAs by overall climate risk score.
            </p>

            <div className="mt-5 space-y-3">
              {topLgas.map((profile, index) => (
                <div
                  key={profile.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {index + 1}. {profile.lga_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {profile.risk_level_display}
                      </p>
                    </div>

                    <span className="text-lg font-bold">
                      {formatNumber(profile.overall_risk_score, 2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Risk Level Distribution</h2>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Low</span>
                <span className="font-semibold">
                  {summary?.risk_counts?.low || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Moderate</span>
                <span className="font-semibold">
                  {summary?.risk_counts?.moderate || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">High</span>
                <span className="font-semibold">
                  {summary?.risk_counts?.high || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Very High</span>
                <span className="font-semibold">
                  {summary?.risk_counts?.very_high || 0}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
            <h2 className="font-bold">Development Data Notice</h2>
            <p className="mt-2">
              These are seed scores for development. Before production, replace
              them with validated flood, drought, heat, exposure, vulnerability
              and adaptive-capacity datasets.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}