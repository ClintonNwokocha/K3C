const scoreFields = [
  { key: "flood_risk_score", label: "Flood" },
  { key: "drought_risk_score", label: "Drought" },
  { key: "heat_risk_score", label: "Heat" },
  { key: "erosion_risk_score", label: "Erosion" },
  { key: "exposure_score", label: "Exposure" },
  { key: "vulnerability_score", label: "Vulnerability" },
  { key: "adaptive_capacity_score", label: "Adaptive Capacity" },
];

function formatNumber(value, maximumFractionDigits = 1) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function hasValidScore(value) {
  return value !== null && value !== undefined && value !== "";
}

function getCompleteness(profile) {
  const availableFields = scoreFields.filter((field) =>
    hasValidScore(profile[field.key])
  );

  const missingFields = scoreFields.filter(
    (field) => !hasValidScore(profile[field.key])
  );

  const percentage = (availableFields.length / scoreFields.length) * 100;

  return {
    availableCount: availableFields.length,
    missingCount: missingFields.length,
    percentage,
    missingFields,
  };
}

function getQualityStatus(percentage) {
  if (percentage >= 100) {
    return {
      label: "Complete",
      className: "bg-[#009B35]/10 text-[#009B35]",
    };
  }

  if (percentage >= 70) {
    return {
      label: "Mostly Complete",
      className: "bg-[#030454]/10 text-[#030454]",
    };
  }

  if (percentage >= 40) {
    return {
      label: "Partial",
      className: "bg-[#F3F74B]/45 text-[#030454]",
    };
  }

  return {
    label: "Poor",
    className: "bg-red-50 text-red-700",
  };
}

function getBarColor(percentage) {
  if (percentage >= 100) return "#009B35";
  if (percentage >= 70) return "#030454";
  if (percentage >= 40) return "#F3F74B";
  return "#B91C1C";
}

function isDevelopmentData(profile) {
  const source = String(profile.data_source || "").toLowerCase();
  const notes = String(profile.notes || "").toLowerCase();

  return (
    source.includes("development") ||
    source.includes("test") ||
    source.includes("seed") ||
    notes.includes("development") ||
    notes.includes("test") ||
    notes.includes("seed")
  );
}

function QualityStatCard({ label, value, helper, tone = "blue" }) {
  const toneClasses = {
    blue: "border-[#030454]/15 bg-[#030454]/5",
    green: "border-[#009B35]/20 bg-[#009B35]/8",
    yellow: "border-[#F3F74B]/70 bg-[#F3F74B]/25",
    red: "border-red-200 bg-red-50",
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

      {helper && <p className="mt-1 text-sm text-slate-500">{helper}</p>}
    </div>
  );
}

export default function ClimateRiskDataQualityPanel({ profiles = [] }) {
  const qualityRows = profiles.map((profile) => {
    const completeness = getCompleteness(profile);
    const status = getQualityStatus(completeness.percentage);

    return {
      profile,
      completeness,
      status,
      developmentData: isDevelopmentData(profile),
    };
  });

  const totalLgas = qualityRows.length;
  const completeLgas = qualityRows.filter(
    (row) => row.completeness.percentage >= 100
  ).length;
  const incompleteLgas = totalLgas - completeLgas;
  const developmentDataCount = qualityRows.filter(
    (row) => row.developmentData
  ).length;

  const averageCompleteness =
    totalLgas > 0
      ? qualityRows.reduce(
          (sum, row) => sum + row.completeness.percentage,
          0
        ) / totalLgas
      : 0;

  const sortedRows = [...qualityRows].sort(
    (a, b) => a.completeness.percentage - b.completeness.percentage
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
          Data Quality Checks
        </p>

        <h2 className="mt-2 text-2xl font-black text-[#030454]">
          Climate Risk Data Completeness
        </h2>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          This panel checks whether each LGA has the required climate risk
          index fields for flood, drought, heat, erosion, exposure,
          vulnerability and adaptive capacity.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <QualityStatCard
          label="Total LGAs Checked"
          value={totalLgas}
          helper="Profiles reviewed."
          tone="blue"
        />

        <QualityStatCard
          label="Complete LGAs"
          value={completeLgas}
          helper="All score fields available."
          tone="green"
        />

        <QualityStatCard
          label="Incomplete LGAs"
          value={incompleteLgas}
          helper="Missing one or more score fields."
          tone="yellow"
        />

        <QualityStatCard
          label="Average Completeness"
          value={`${formatNumber(averageCompleteness, 1)}%`}
          helper="Across all LGAs."
          tone="blue"
        />
      </div>

      {developmentDataCount > 0 && (
        <div className="mt-5 rounded-r-xl border-l-4 border-orange-400 bg-orange-50 px-5 py-4 text-sm leading-6 text-orange-800">
          <p className="font-black">Development/Test Data Notice</p>

          <p className="mt-1">
            {developmentDataCount} LGA profile(s) appear to still reference
            development, seed, or test data. These should be replaced with
            validated operational datasets before production reporting.
          </p>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <th className="px-3 py-3 font-bold">LGA</th>
              <th className="px-3 py-3 font-bold">Completeness</th>
              <th className="px-3 py-3 font-bold">Status</th>
              <th className="px-3 py-3 font-bold">Missing Fields</th>
              <th className="px-3 py-3 font-bold">Data Source</th>
              <th className="px-3 py-3 font-bold">Flag</th>
            </tr>
          </thead>

          <tbody>
            {sortedRows.map(({ profile, completeness, status, developmentData }) => (
              <tr
                key={profile.id}
                className="border-b border-slate-100 last:border-0 hover:bg-[#009B35]/5"
              >
                <td className="px-3 py-4 font-black text-[#030454]">
                  {profile.lga_name}
                </td>

                <td className="px-3 py-4">
                  <div className="flex items-center gap-3">
                    <span className="w-14 font-black text-[#030454]">
                      {formatNumber(completeness.percentage, 1)}%
                    </span>

                    <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(
                            Math.max(completeness.percentage, 0),
                            100
                          )}%`,
                          backgroundColor: getBarColor(completeness.percentage),
                        }}
                      />
                    </div>
                  </div>

                  <p className="mt-1 text-xs text-slate-400">
                    {completeness.availableCount} of {scoreFields.length} score
                    fields available
                  </p>
                </td>

                <td className="px-3 py-4">
                  <span
                    className={`rounded-md px-3 py-1 text-xs font-bold ${status.className}`}
                  >
                    {status.label}
                  </span>
                </td>

                <td className="px-3 py-4">
                  {completeness.missingFields.length === 0 ? (
                    <span className="font-bold text-[#009B35]">None</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {completeness.missingFields.map((field) => (
                        <span
                          key={field.key}
                          className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600"
                        >
                          {field.label}
                        </span>
                      ))}
                    </div>
                  )}
                </td>

                <td className="px-3 py-4 text-xs text-slate-500">
                  {profile.data_source || "Not specified"}
                </td>

                <td className="px-3 py-4">
                  {developmentData ? (
                    <span className="rounded-md bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
                      Development/Test
                    </span>
                  ) : (
                    <span className="rounded-md bg-[#009B35]/10 px-3 py-1 text-xs font-bold text-[#009B35]">
                      Normal
                    </span>
                  )}
                </td>
              </tr>
            ))}

            {sortedRows.length === 0 && (
              <tr>
                <td
                  colSpan="6"
                  className="px-3 py-8 text-center text-slate-500"
                >
                  No climate risk profiles available for quality checks.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 rounded-xl border-l-4 border-[#030454] bg-[#030454]/5 px-5 py-4 text-sm leading-6 text-[#030454]">
        <p className="font-black">How to use this</p>

        <p className="mt-1">
          LGAs with missing fields should be prioritized for data upload,
          parameter record completion, and scoring recalculation. This panel
          does not judge whether a value is scientifically correct; it checks
          whether the expected score fields are present.
        </p>
      </div>
    </section>
  );
}