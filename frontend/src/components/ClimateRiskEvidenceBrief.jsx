import { useEffect, useMemo, useState } from "react";
import { getClimateRiskParameterRecords } from "../services/api";

const categoryLabels = {
  flood: "Flood",
  drought: "Drought",
  heat: "Heat",
  erosion: "Erosion",
  exposure: "Exposure",
  vulnerability: "Vulnerability",
  adaptive_capacity: "Adaptive Capacity",
};

function formatNumber(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || value === "") return "—";

  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function scoreClass(value, reverse = false) {
  const number = Number(value || 0);

  if (reverse) {
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

function badgeClass(value, reverse = false) {
  const number = Number(value || 0);

  if (reverse) {
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRecommendedActions(profile) {
  if (!profile) return [];

  const actions = [];

  if (Number(profile.flood_risk_score || 0) >= 60) {
    actions.push(
      "Prioritize flood drainage improvement, floodplain monitoring, early warning systems, and protection of exposed settlements."
    );
  }

  if (Number(profile.drought_risk_score || 0) >= 60) {
    actions.push(
      "Strengthen drought preparedness through water access planning, climate-smart agriculture, rainfall monitoring, and vegetation stress tracking."
    );
  }

  if (Number(profile.heat_risk_score || 0) >= 60) {
    actions.push(
      "Promote urban greening, heat-health awareness, cooling shelters, and monitoring of extreme temperature hotspots."
    );
  }

  if (Number(profile.erosion_risk_score || 0) >= 60) {
    actions.push(
      "Target erosion-control works, slope stabilization, vegetation restoration, and high-risk gully/soil-loss monitoring."
    );
  }

  if (Number(profile.exposure_score || 0) >= 60) {
    actions.push(
      "Review exposed population, roads, schools, hospitals, markets, and other critical assets for targeted risk reduction."
    );
  }

  if (Number(profile.vulnerability_score || 0) >= 60) {
    actions.push(
      "Prioritize vulnerable communities with livelihood support, social protection, service access improvement, and targeted adaptation planning."
    );
  }

  if (Number(profile.adaptive_capacity_score || 0) < 40) {
    actions.push(
      "Increase adaptive capacity through local response systems, health access, early warning coverage, drainage capacity, and institutional support."
    );
  }

  if (actions.length === 0) {
    actions.push(
      "Maintain monitoring and update the LGA profile as improved climate, exposure, and vulnerability datasets become available."
    );
  }

  return actions;
}

function ScoreCard({ label, value, reverse = false }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-black text-[#030454]">
        {formatNumber(value, 2)}
        <span className="text-sm font-semibold text-slate-400"> / 100</span>
      </p>

      <span
        className={`mt-2 inline-flex rounded-md px-3 py-1 text-xs font-bold ${badgeClass(
          value,
          reverse
        )}`}
      >
        {scoreClass(value, reverse)}
      </span>
    </div>
  );
}

function buildPrintHtml(profile, records, groupedRecords, recommendations) {
  const rowsHtml = Object.entries(groupedRecords)
    .map(([category, categoryRecords]) => {
      const recordsHtml = categoryRecords
        .map(
          (record) => `
            <tr>
              <td>${escapeHtml(record.parameter_label)}</td>
              <td>${escapeHtml(record.parameter_key)}</td>
              <td>${formatNumber(record.raw_value, 4)}</td>
              <td>${escapeHtml(record.unit || "—")}</td>
              <td>${
                record.normalized_score === null ||
                record.normalized_score === undefined
                  ? "—"
                  : `${formatNumber(record.normalized_score, 2)} / 100`
              }</td>
              <td>${escapeHtml(record.data_source || "—")}</td>
            </tr>
          `
        )
        .join("");

      return `
        <h3>${escapeHtml(categoryLabels[category] || titleCase(category))}</h3>
        <table>
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Key</th>
              <th>Raw Value</th>
              <th>Unit</th>
              <th>Normalized Score</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>${recordsHtml}</tbody>
        </table>
      `;
    })
    .join("");

  const actionsHtml = recommendations
    .map((action) => `<li>${escapeHtml(action)}</li>`)
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(profile.lga_name)} Climate Risk Evidence Brief</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #030454;
            padding: 32px;
            line-height: 1.5;
          }
          h1, h2, h3 {
            margin-bottom: 8px;
            color: #030454;
          }
          .muted {
            color: #64748b;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin: 20px 0;
          }
          .card {
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 14px;
          }
          .score {
            font-size: 24px;
            font-weight: bold;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 12px 0 24px;
            font-size: 12px;
          }
          th, td {
            border: 1px solid #e2e8f0;
            padding: 8px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #f8fafc;
          }
          ul {
            margin-top: 8px;
          }
          @media print {
            body {
              padding: 18px;
            }
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(profile.lga_name)} Climate Risk Evidence Brief</h1>
        <p class="muted">Year: ${escapeHtml(profile.year)} | Data source: ${escapeHtml(
    profile.data_source || "Not specified"
  )}</p>

        <h2>Risk Summary</h2>
        <div class="grid">
          <div class="card">
            <div class="muted">Overall Climate Risk Index</div>
            <div class="score">${formatNumber(profile.overall_risk_score, 2)} / 100</div>
          </div>
          <div class="card">
            <div class="muted">Risk Class</div>
            <div class="score">${escapeHtml(profile.risk_level_display || profile.risk_level)}</div>
          </div>
          <div class="card">
            <div class="muted">Dominant Hazard</div>
            <div class="score">${escapeHtml(titleCase(profile.dominant_hazard || "Not set"))}</div>
          </div>
        </div>

        <div class="grid">
          <div class="card"><div class="muted">Flood</div><div class="score">${formatNumber(profile.flood_risk_score, 2)} / 100</div></div>
          <div class="card"><div class="muted">Drought</div><div class="score">${formatNumber(profile.drought_risk_score, 2)} / 100</div></div>
          <div class="card"><div class="muted">Heat</div><div class="score">${formatNumber(profile.heat_risk_score, 2)} / 100</div></div>
          <div class="card"><div class="muted">Erosion</div><div class="score">${formatNumber(profile.erosion_risk_score, 2)} / 100</div></div>
          <div class="card"><div class="muted">Exposure</div><div class="score">${formatNumber(profile.exposure_score, 2)} / 100</div></div>
          <div class="card"><div class="muted">Vulnerability</div><div class="score">${formatNumber(profile.vulnerability_score, 2)} / 100</div></div>
          <div class="card"><div class="muted">Adaptive Capacity</div><div class="score">${formatNumber(profile.adaptive_capacity_score, 2)} / 100</div></div>
        </div>

        <h2>Recommended Actions</h2>
        <ul>${actionsHtml}</ul>

        <h2>Parameter Evidence</h2>
        ${
          records.length
            ? rowsHtml
            : "<p class='muted'>No parameter records are available for this LGA/year.</p>"
        }

        <p class="muted">
          Note: Risk indexes are normalized from 0 to 100. Raw values are measured or processed evidence values and may use different units.
        </p>
      </body>
    </html>
  `;
}

function printBrief(profile, records, groupedRecords, recommendations) {
  const printWindow = window.open("", "_blank", "width=1000,height=800");

  if (!printWindow) {
    alert("Please allow pop-ups to print the evidence brief.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(
    buildPrintHtml(profile, records, groupedRecords, recommendations)
  );
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}

export default function ClimateRiskEvidenceBrief({ selectedProfile }) {
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
      setError("Could not load parameter evidence for this LGA.");
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

  const recommendations = useMemo(() => {
    return getRecommendedActions(selectedProfile);
  }, [selectedProfile]);

  if (!selectedProfile) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-[#030454]">
          LGA Risk Evidence Brief
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Select an LGA to generate its climate risk evidence brief.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
            LGA Risk Evidence Brief
          </p>

          <h2 className="mt-2 text-2xl font-black text-[#030454]">
            {selectedProfile.lga_name} Climate Risk Brief
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            A one-page evidence view combining risk indexes, raw parameter
            evidence, interpretation and recommended actions for the selected
            LGA.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadRecords}
            className="rounded-md border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
          >
            Refresh Evidence
          </button>

          <button
            type="button"
            onClick={() =>
              printBrief(
                selectedProfile,
                records,
                groupedRecords,
                recommendations
              )
            }
            className="rounded-md bg-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e]"
          >
            Print Brief
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-r-xl border-l-4 border-red-400 bg-red-50 px-5 py-4 text-sm leading-6 text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScoreCard
          label="Overall Climate Risk Index"
          value={selectedProfile.overall_risk_score}
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            Risk Class
          </p>
          <p className="mt-2 text-2xl font-black text-[#030454]">
            {selectedProfile.risk_level_display ||
              titleCase(selectedProfile.risk_level)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            Dominant Hazard
          </p>
          <p className="mt-2 text-2xl font-black text-[#030454]">
            {titleCase(selectedProfile.dominant_hazard || "Not set")}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            Profile Year
          </p>
          <p className="mt-2 text-2xl font-black text-[#030454]">
            {selectedProfile.year}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScoreCard label="Flood Risk Index" value={selectedProfile.flood_risk_score} />
        <ScoreCard label="Drought Risk Index" value={selectedProfile.drought_risk_score} />
        <ScoreCard label="Heat Risk Index" value={selectedProfile.heat_risk_score} />
        <ScoreCard label="Erosion Risk Index" value={selectedProfile.erosion_risk_score} />
        <ScoreCard label="Exposure Index" value={selectedProfile.exposure_score} />
        <ScoreCard label="Vulnerability Index" value={selectedProfile.vulnerability_score} />
        <ScoreCard
          label="Adaptive Capacity Index"
          value={selectedProfile.adaptive_capacity_score}
          reverse
        />
      </div>

      <div className="mt-6 rounded-xl border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-5 py-4 text-sm leading-6 text-[#030454]">
        <h3 className="font-black">Recommended Actions</h3>

        <ul className="mt-3 list-disc space-y-2 pl-5">
          {recommendations.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-[#030454]">
              Parameter Evidence
            </h3>

            <p className="mt-1 text-sm leading-6 text-slate-500">
              Raw values are measured/processed evidence. Normalized scores are
              the 0–100 values used by the scoring engine.
            </p>
          </div>

          {isLoading && (
            <span className="text-sm text-slate-500">Loading evidence...</span>
          )}
        </div>

        {records.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
            No parameter records are available for this LGA/year yet.
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedRecords).map(([category, categoryRecords]) => (
              <div
                key={category}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <h4 className="font-black text-[#030454]">
                  {categoryLabels[category] || titleCase(category)}
                </h4>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="px-3 py-3 font-bold">Parameter</th>
                        <th className="px-3 py-3 font-bold">Raw Value</th>
                        <th className="px-3 py-3 font-bold">Unit</th>
                        <th className="px-3 py-3 font-bold">Score /100</th>
                        <th className="px-3 py-3 font-bold">Source</th>
                        <th className="px-3 py-3 font-bold">Notes</th>
                      </tr>
                    </thead>

                    <tbody>
                      {categoryRecords.map((record) => (
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
                            {record.normalized_score === null ||
                            record.normalized_score === undefined
                              ? "—"
                              : `${formatNumber(
                                  record.normalized_score,
                                  2
                                )} / 100`}
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
            ))}
          </div>
        )}
      </div>
    </section>
  );
}