import { useState } from "react";
import { recalculateClimateRiskScores } from "../services/api";

export default function ClimateRiskScoringPanel({
  selectedProfile,
  selectedYear,
  canManage,
  onRecalculated,
}) {
  const [scope, setScope] = useState("selected_lga");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  if (!canManage) {
    return null;
  }

  async function handleRecalculate() {
    setIsRunning(true);
    setResult(null);
    setError("");

    const payload = {
      year: selectedYear || selectedProfile?.year || 2025,
    };

    if (scope === "selected_lga" && selectedProfile?.lga) {
      payload.lga = selectedProfile.lga;
    }

    try {
      const data = await recalculateClimateRiskScores(payload);
      setResult(data);

      if (onRecalculated) {
        await onRecalculated();
      }
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not recalculate climate risk scores."
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-sm font-medium text-emerald-700">
          Climate Risk Scoring Engine
        </p>
        <h2 className="mt-1 text-lg font-bold">
          Recalculate Risk Indexes from Parameter Records
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          This uses parameter records with normalized scores to update the final
          flood, drought, heat, erosion, exposure, vulnerability and adaptive
          capacity indexes.
        </p>
      </div>

      <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-semibold">Important</p>
        <p className="mt-1">
          This stage does not yet convert raw values automatically. It only uses{" "}
          <strong>normalized_score</strong> values that are already stored in
          the parameter records.
        </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Recalculation Scope
          </label>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="selected_lga">Selected LGA only</option>
            <option value="all_lgas">All LGAs for selected year</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Year
          </label>
          <input
            value={selectedYear || selectedProfile?.year || 2025}
            disabled
            className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-500"
          />
        </div>
      </div>

      {scope === "selected_lga" && (
        <p className="mt-3 text-sm text-slate-500">
          Selected LGA:{" "}
          <span className="font-semibold text-slate-700">
            {selectedProfile?.lga_name || "None selected"}
          </span>
        </p>
      )}

      {(result || error) && (
        <div
          className={`mt-5 rounded-xl border p-4 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error ? (
            error
          ) : (
            <div>
              <p className="font-semibold">{result.message}</p>
              <p className="mt-1">
                Updated: {result.updated_count} | Skipped:{" "}
                {result.skipped_count}
              </p>

              {result.skipped_profiles?.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer font-medium">
                    View skipped LGAs
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-white p-3 text-xs text-slate-700">
                    {JSON.stringify(result.skipped_profiles, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleRecalculate}
        disabled={isRunning || (scope === "selected_lga" && !selectedProfile)}
        className="mt-5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isRunning ? "Recalculating..." : "Recalculate Risk Indexes"}
      </button>
    </section>
  );
}