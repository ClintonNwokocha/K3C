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
  if (status === "aligned") return "bg-[#009B35]/10 text-[#009B35]";
  if (status === "needs_recalculation") return "bg-orange-50 text-orange-700";
  if (status === "raw_only") return "bg-[#030454]/10 text-[#030454]";
  return "bg-slate-100 text-slate-600";
}

function getStatusLabel(status) {
  if (status === "aligned") return "Aligned";
  if (status === "needs_recalculation") return "Needs Recalculation";
  if (status === "raw_only") return "Raw Evidence Only";
  return "No Evidence";
}

function getBarColor(value, reverse = false) {
  const number = Number(value || 0);

  if (reverse) {
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

function ScoreBar({ value, reverse = false }) {
  const number = Number(value || 0);

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(Math.max(number, 0), 100)}%`,
          backgroundColor: getBarColor(number, reverse),
        }}
      />
    </div>
  );
}

function ScoreCard({ label, value, helper, tone = "blue" }) {
  const toneClasses = {
    blue: "border-[#030454]/15 bg-[#030454]/5",
    green: "border-[#009B35]/20 bg-[#009B35]/8",
    yellow: "border-[#F3F74B]/70 bg-[#F3F74B]/25",
    white: "border-slate-200 bg-white",
  };

  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        toneClasses[tone] || toneClasses.white
      }`}
    >
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black text-[#030454]">
        {formatNumber(value, 2)}
        {hasValue(value) && (
          <span className="text-base font-semibold text-slate-400"> / 100</span>
        )}
      </p>

      {helper && <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>}
    </div>
  );
}

function CountCard({ label, value, tone = "blue" }) {
  const toneClasses = {
    green: "border-[#009B35]/20 bg-[#009B35]/8",
    orange: "border-orange-200 bg-orange-50",
    blue: "border-[#030454]/15 bg-[#030454]/5",
  };

  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        toneClasses[tone] || toneClasses.blue
      }`}
    >
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black text-[#030454]">{value}</p>
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
        <h2 className="text-xl font-black text-[#030454]">
          Scoring Transparency
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Select an LGA to inspect how its Climate Intelligence scores are supported by
          parameter evidence.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
            Scoring Transparency
          </p>

          <h2 className="mt-2 text-2xl font-black text-[#030454]">
            {selectedProfile.lga_name} Score Breakdown
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            This panel compares the final LGA score indexes with the normalized
            parameter evidence behind them. It helps you identify whether
            scores are supported, missing evidence, or need recalculation.
          </p>
        </div>

        <button
          type="button"
          onClick={loadRecords}
          className="rounded-md border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
        >
          Refresh Evidence
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-r-xl border-l-4 border-red-400 bg-red-50 px-5 py-4 text-sm leading-6 text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-xl border-l-4 border-[#030454] bg-[#030454]/5 px-5 py-4 text-sm leading-6 text-[#030454]">
        <p className="font-black">How this should be interpreted</p>

        <p className="mt-2">
          Category indexes are normally produced from parameter records that
          have normalized scores. Raw values are evidence; normalized scores are
          the values used for scoring.
        </p>

        <p className="mt-2">
          Adaptive capacity is different: a high adaptive capacity score is
          good. For risk interpretation, the capacity gap is calculated as{" "}
          <strong>100 - adaptive capacity score</strong>.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScoreCard
          label="Overall Climate Intelligence Index"
          value={selectedProfile.overall_risk_score}
          helper="Final backend-calculated score."
          tone="blue"
        />

        <ScoreCard
          label="Hazard Average"
          value={hazardAverage}
          helper="Average of flood, drought, heat and erosion indexes."
          tone="green"
        />

        <ScoreCard
          label="Exposure Index"
          value={selectedProfile.exposure_score}
          helper="People/assets exposed to climate hazards."
          tone="white"
        />

        <ScoreCard
          label="Adaptive Capacity Gap"
          value={adaptiveCapacityGap}
          helper="100 minus adaptive capacity score."
          tone="yellow"
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <CountCard
          label="Aligned Categories"
          value={alignedCount}
          tone="green"
        />

        <CountCard
          label="Need Recalculation"
          value={needsRecalculationCount}
          tone="orange"
        />

        <CountCard
          label="Raw Evidence Only"
          value={rawOnlyCount}
          tone="blue"
        />
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <th className="px-3 py-3 font-bold">Category</th>
              <th className="px-3 py-3 font-bold">Profile Index</th>
              <th className="px-3 py-3 font-bold">Evidence Average</th>
              <th className="px-3 py-3 font-bold">Records</th>
              <th className="px-3 py-3 font-bold">Normalized Records</th>
              <th className="px-3 py-3 font-bold">Status</th>
              <th className="px-3 py-3 font-bold">Meaning</th>
            </tr>
          </thead>

          <tbody>
            {categoryRows.map((row) => (
              <tr
                key={row.key}
                className="border-b border-slate-100 last:border-0 hover:bg-[#009B35]/5"
              >
                <td className="px-3 py-4 font-black text-[#030454]">
                  {row.label}
                </td>

                <td className="px-3 py-4">
                  <div className="space-y-2">
                    <p className="font-black text-[#030454]">
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
                      <p className="font-black text-[#030454]">
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
                    className={`rounded-md px-3 py-1 text-xs font-bold ${getStatusClass(
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
            <h3 className="text-xl font-black text-[#030454]">
              Underlying Parameter Evidence
            </h3>

            <p className="mt-1 text-sm leading-6 text-slate-500">
              These are the records used to support the scoring process.
            </p>
          </div>

          {categoryRows.map((row) => {
            if (!row.records.length) return null;

            return (
              <div
                key={`records-${row.key}`}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <h4 className="font-black text-[#030454]">{row.label}</h4>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="px-3 py-3 font-bold">Parameter</th>
                        <th className="px-3 py-3 font-bold">Raw Value</th>
                        <th className="px-3 py-3 font-bold">Unit</th>
                        <th className="px-3 py-3 font-bold">
                          Normalized Score
                        </th>
                        <th className="px-3 py-3 font-bold">Source</th>
                        <th className="px-3 py-3 font-bold">Notes</th>
                      </tr>
                    </thead>

                    <tbody>
                      {row.records.map((record) => (
                        <tr
                          key={record.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-[#009B35]/5"
                        >
                          <td className="px-3 py-4">
                            <p className="font-black text-[#030454]">
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

      <div className="mt-6 rounded-xl border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-5 py-4 text-sm leading-6 text-[#030454]">
        <p className="font-black">Recommended workflow</p>

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