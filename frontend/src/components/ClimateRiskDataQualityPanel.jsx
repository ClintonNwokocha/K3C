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
      className: "bg-emerald-50 text-emerald-700",
    };
  }

  if (percentage >= 70) {
    return {
      label: "Mostly Complete",
      className: "bg-blue-50 text-blue-700",
    };
  }

  if (percentage >= 40) {
    return {
      label: "Partial",
      className: "bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Poor",
    className: "bg-red-50 text-red-700",
  };
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
        <p className="text-sm font-medium text-emerald-700">
          Data Quality Checks
        </p>
        <h2 className="mt-1 text-2xl font-bold">
          Climate Risk Data Completeness
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          This panel checks whether each LGA has the required climate risk
          index fields for flood, drought, heat, erosion, exposure,
          vulnerability and adaptive capacity.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm text-slate-500">Total LGAs Checked</p>
          <p className="mt-2 text-3xl font-bold">{totalLgas}</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm text-emerald-700">Complete LGAs</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {completeLgas}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm text-amber-700">Incomplete LGAs</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">
            {incompleteLgas}
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-sm text-blue-700">Average Completeness</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {formatNumber(averageCompleteness, 1)}%
          </p>
        </div>
      </div>

      {developmentDataCount > 0 && (
        <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm text-orange-800">
          <p className="font-bold">Development/Test Data Notice</p>
          <p className="mt-2">
            {developmentDataCount} LGA profile(s) appear to still reference
            development, seed, or test data. These should be replaced with
            validated operational datasets before production reporting.
          </p>
        </div>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-3 py-3 font-medium">LGA</th>
              <th className="px-3 py-3 font-medium">Completeness</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Missing Fields</th>
              <th className="px-3 py-3 font-medium">Data Source</th>
              <th className="px-3 py-3 font-medium">Flag</th>
            </tr>
          </thead>

          <tbody>
            {sortedRows.map(({ profile, completeness, status, developmentData }) => (
              <tr
                key={profile.id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-3 py-4 font-semibold">
                  {profile.lga_name}
                </td>

                <td className="px-3 py-4">
                  <div className="flex items-center gap-3">
                    <span className="w-14 font-semibold">
                      {formatNumber(completeness.percentage, 1)}%
                    </span>

                    <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{
                          width: `${Math.min(
                            Math.max(completeness.percentage, 0),
                            100
                          )}%`,
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
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}
                  >
                    {status.label}
                  </span>
                </td>

                <td className="px-3 py-4">
                  {completeness.missingFields.length === 0 ? (
                    <span className="text-emerald-700">None</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {completeness.missingFields.map((field) => (
                        <span
                          key={field.key}
                          className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"
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
                    <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                      Development/Test
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
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

      <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
        <p className="font-bold">How to use this</p>
        <p className="mt-2">
          LGAs with missing fields should be prioritized for data upload,
          parameter record completion, and scoring recalculation. This panel
          does not judge whether a value is scientifically correct; it checks
          whether the expected score fields are present.
        </p>
      </div>
    </section>
  );
}