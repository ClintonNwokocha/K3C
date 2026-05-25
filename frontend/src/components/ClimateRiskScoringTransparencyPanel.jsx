import { useEffect, useMemo, useState } from "react";
import { getClimateRiskParameterRecords } from "../services/api";

const categoryConfig = [
  {
    key: "flood",
    label: "Flood",
    profileField: "flood_risk_score",
    meaning: "Higher score means higher flood concern.",
  },
  {
    key: "drought",
    label: "Drought",
    profileField: "drought_risk_score",
    meaning: "Higher score means higher drought concern.",
  },
  {
    key: "heat",
    label: "Heat",
    profileField: "heat_risk_score",
    meaning: "Higher score means higher heat concern.",
  },
  {
    key: "erosion",
    label: "Erosion",
    profileField: "erosion_risk_score",
    meaning: "Higher score means higher erosion concern.",
  },
  {
    key: "exposure",
    label: "Exposure",
    profileField: "exposure_score",
    meaning: "Higher score means more people/assets are exposed.",
  },
  {
    key: "vulnerability",
    label: "Vulnerability",
    profileField: "vulnerability_score",
    meaning: "Higher score means greater social or economic sensitivity.",
  },
  {
    key: "adaptive_capacity",
    label: "Adaptive Capacity",
    profileField: "adaptive_capacity_score",
    meaning: "Higher score means stronger ability to cope.",
    reverse: true,
  },
];

function formatNumber(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || value === "") return "—";

  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function parseScore(value) {
  if (!hasValue(value)) return null;

  const number = Number(value);

  if (!Number.isFinite(number)) return null;

  return number;
}

function average(values) {
  const validValues = values
    .map((value) => parseScore(value))
    .filter((value) => value !== null);

  if (!validValues.length) return null;

  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function getStatusClass(status) {
  if (status === "aligned") return "bg-emerald-50 text-emerald-700";
  if (status === "needs_recalculation") return "bg-orange-50 text-orange-700";
  if (status === "raw_only") return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

function getStatusLabel(status) {
  if (status === "aligned") return "Aligned";
  if (status === "needs_recalculation") return "Needs Recalculation";
  if (status === "raw_only") return "Raw Evidence Only";
  return "No Evidence";
}

function getBarClass(value, reverse = false) {
  const number = Number(value || 0);

  if (reverse) {
    if (number >= 70) return "bg-emerald-500";
    if (number >= 55) return "bg-lime-500";
    if (number >= 40) return "bg-amber-500";
    return "bg-red-500";
  }

  if (number >= 75) return "bg-red-500";
  if (number >= 60) return "bg-orange-500";
  if (number >= 40) return "bg-amber-500";
  return "bg-emerald-500";
}

function ScoreBar({ value, reverse = false }) {
  const number = Number(value || 0);

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${getBarClass(number, reverse)}`}
        style={{
          width: `${Math.min(Math.max(number, 0), 100)}%`,
        }}
      />
    </div>
  );
}

function ScoreCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold">
        {formatNumber(value, 2)}
        {hasValue(value) && (
          <span className="text-base font-semibold text-slate-400"> / 100</span>
        )}
      </p>
      {helper && <p className="mt-2 text-xs text-slate-500">{helper}</p>}
    </div>
  );
}

export default function ClimateRiskScoringTransparencyPanel({
  selectedProfile,
}) {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadRecords() {
    if (!selectedProfile?.lga) {
      setRecords([]);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const data = await getClimateRiskParameterRecords({
        lga: selectedProfile.lga,
        year: selectedProfile.year,
      });

      setRecords(data.results || []);
    } catch (err) {
      console.error(err);
      setError("Could not load scoring evidence records.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfile?.lga, selectedProfile?.year]);

  const groupedRecords = useMemo(() => {
    return records.reduce((groups, record) => {
      const key = record.category || "other";

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(record);

      return groups;
    }, {});
  }, [records]);

  const categoryRows = useMemo(() => {
    if (!selectedProfile) return [];

    return categoryConfig.map((category) => {
      const categoryRecords = groupedRecords[category.key] || [];
      const normalizedRecords = categoryRecords.filter((record) =>
        hasValue(record.normalized_score)
      );

      const evidenceAverage = average(
        normalizedRecords.map((record) => record.normalized_score)
      );

      const profileScore = parseScore(selectedProfile[category.profileField]);

      let status = "no_evidence";

      if (categoryRecords.length > 0 && normalizedRecords.length === 0) {
        status = "raw_only";
      }

      if (evidenceAverage !== null && profileScore !== null) {
        const difference = Math.abs(profileScore - evidenceAverage);

        status = difference <= 0.05 ? "aligned" : "needs_recalculation";
      }

      return {
        ...category,
        records: categoryRecords,
        normalizedRecords,
        evidenceAverage,
        profileScore,
        status,
      };
    });
  }, [groupedRecords, selectedProfile]);

  const hazardAverage = useMemo(() => {
    if (!selectedProfile) return null;

    return average([
      selectedProfile.flood_risk_score,
      selectedProfile.drought_risk_score,
      selectedProfile.heat_risk_score,
      selectedProfile.erosion_risk_score,
    ]);
  }, [selectedProfile]);

  const adaptiveCapacityGap = selectedProfile
    ? 100 - Number(selectedProfile.adaptive_capacity_score || 0)
    : null;

  const alignedCount = categoryRows.filter(
    (row) => row.status === "aligned"
  ).length;
  const needsRecalculationCount = categoryRows.filter(
    (row) => row.status === "needs_recalculation"
  ).length;
  const rawOnlyCount = categoryRows.filter(
    (row) => row.status === "raw_only"
  ).length;

  if (!selectedProfile) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Scoring Transparency</h2>
        <p className="mt-2 text-sm text-slate-500">
          Select an LGA to inspect how its climate risk scores are supported by
          parameter evidence.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            Scoring Transparency
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            {selectedProfile.lga_name} Score Breakdown
          </h2>
          <p className="mt-2 max-w-4xl text-sm text-slate-500">
            This panel compares the final LGA score indexes with the normalized
            parameter evidence behind them. It helps you identify whether
            scores are supported, missing evidence, or need recalculation.
          </p>
        </div>

        <button
          type="button"
          onClick={loadRecords}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh Evidence
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
        <p className="font-bold">How this should be interpreted</p>
        <p className="mt-2">
          Category indexes are normally produced from parameter records that
          have normalized scores. For example, flood-related parameter scores
          are averaged into the Flood Risk Index. Raw values are evidence;
          normalized scores are the values used for scoring.
        </p>
        <p className="mt-2">
          Adaptive capacity is different: a high adaptive capacity score is
          good. For risk interpretation, the capacity gap is calculated as{" "}
          <strong>100 - adaptive capacity score</strong>.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScoreCard
          label="Overall Climate Risk Index"
          value={selectedProfile.overall_risk_score}
          helper="Final backend-calculated score."
        />
        <ScoreCard
          label="Hazard Average"
          value={hazardAverage}
          helper="Average of flood, drought, heat and erosion indexes."
        />
        <ScoreCard
          label="Exposure Index"
          value={selectedProfile.exposure_score}
          helper="People/assets exposed to climate hazards."
        />
        <ScoreCard
          label="Adaptive Capacity Gap"
          value={adaptiveCapacityGap}
          helper="100 minus adaptive capacity score."
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm text-emerald-700">Aligned Categories</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {alignedCount}
          </p>
        </div>

        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <p className="text-sm text-orange-700">Need Recalculation</p>
          <p className="mt-2 text-3xl font-bold text-orange-700">
            {needsRecalculationCount}
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-sm text-blue-700">Raw Evidence Only</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {rawOnlyCount}
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-3 py-3 font-medium">Category</th>
              <th className="px-3 py-3 font-medium">Profile Index</th>
              <th className="px-3 py-3 font-medium">Evidence Average</th>
              <th className="px-3 py-3 font-medium">Records</th>
              <th className="px-3 py-3 font-medium">Normalized Records</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Meaning</th>
            </tr>
          </thead>

          <tbody>
            {categoryRows.map((row) => (
              <tr
                key={row.key}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-3 py-4 font-semibold">{row.label}</td>

                <td className="px-3 py-4">
                  <div className="space-y-2">
                    <p className="font-semibold">
                      {formatNumber(row.profileScore, 2)} / 100
                    </p>
                    <ScoreBar value={row.profileScore} reverse={row.reverse} />
                  </div>
                </td>

                <td className="px-3 py-4">
                  {row.evidenceAverage === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <div className="space-y-2">
                      <p className="font-semibold">
                        {formatNumber(row.evidenceAverage, 2)} / 100
                      </p>
                      <ScoreBar
                        value={row.evidenceAverage}
                        reverse={row.reverse}
                      />
                    </div>
                  )}
                </td>

                <td className="px-3 py-4">{row.records.length}</td>

                <td className="px-3 py-4">{row.normalizedRecords.length}</td>

                <td className="px-3 py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                      row.status
                    )}`}
                  >
                    {getStatusLabel(row.status)}
                  </span>
                </td>

                <td className="px-3 py-4 text-xs text-slate-500">
                  {row.meaning}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-slate-500">
          Loading parameter evidence...
        </p>
      ) : records.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
          No parameter records are available for this LGA/year yet.
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <div>
            <h3 className="text-lg font-bold">Underlying Parameter Evidence</h3>
            <p className="mt-1 text-sm text-slate-500">
              These are the records used to support the scoring process.
            </p>
          </div>

          {categoryRows.map((row) => {
            if (!row.records.length) return null;

            return (
              <div
                key={`records-${row.key}`}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <h4 className="font-bold">{row.label}</h4>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="px-3 py-3 font-medium">Parameter</th>
                        <th className="px-3 py-3 font-medium">Raw Value</th>
                        <th className="px-3 py-3 font-medium">Unit</th>
                        <th className="px-3 py-3 font-medium">
                          Normalized Score
                        </th>
                        <th className="px-3 py-3 font-medium">Source</th>
                        <th className="px-3 py-3 font-medium">Notes</th>
                      </tr>
                    </thead>

                    <tbody>
                      {row.records.map((record) => (
                        <tr
                          key={record.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-3 py-4">
                            <p className="font-semibold">
                              {record.parameter_label}
                            </p>
                            <p className="text-xs text-slate-400">
                              {record.parameter_key}
                            </p>
                          </td>

                          <td className="px-3 py-4">
                            {formatNumber(record.raw_value, 4)}
                          </td>

                          <td className="px-3 py-4">
                            {record.unit || "—"}
                          </td>

                          <td className="px-3 py-4">
                            {hasValue(record.normalized_score)
                              ? `${formatNumber(
                                  record.normalized_score,
                                  2
                                )} / 100`
                              : "—"}
                          </td>

                          <td className="px-3 py-4 text-xs text-slate-500">
                            {record.data_source || "—"}
                          </td>

                          <td className="px-3 py-4 text-xs text-slate-500">
                            {record.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        <p className="font-bold">Recommended workflow</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Upload or add raw parameter records.</li>
          <li>Normalize raw values into scores from 0 to 100.</li>
          <li>Recalculate final category indexes.</li>
          <li>Use this panel to confirm the profile score matches evidence.</li>
        </ol>
      </div>
    </section>
  );
}