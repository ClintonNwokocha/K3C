import { useState } from "react";
import {
  normalizeClimateRiskParameters,
  recalculateClimateRiskScores,
} from "../services/api";

export default function ClimateRiskScoringPanel({
  selectedProfile,
  selectedYear,
  canManage,
  onRecalculated,
}) {
  const [scope, setScope] = useState("selected_lga");
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [normalizeResult, setNormalizeResult] = useState(null);
  const [error, setError] = useState("");

  if (!canManage) {
    return null;
  }

  function buildPayload() {
    const payload = {
      year: selectedYear || selectedProfile?.year || 2025,
    };

    if (scope === "selected_lga" && selectedProfile?.lga) {
      payload.lga = selectedProfile.lga;
    }

    return payload;
  }

  async function handleNormalize() {
    setIsNormalizing(true);
    setNormalizeResult(null);
    setError("");

    try {
      const data = await normalizeClimateRiskParameters(buildPayload());
      setNormalizeResult(data);
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not normalize parameter records."
      );
    } finally {
      setIsNormalizing(false);
    }
  }

  async function handleRecalculate() {
    setIsRunning(true);
    setResult(null);
    setError("");

    try {
      const data = await recalculateClimateRiskScores(buildPayload());
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

  async function handleNormalizeAndRecalculate() {
    setIsNormalizing(true);
    setIsRunning(true);
    setNormalizeResult(null);
    setResult(null);
    setError("");

    try {
      const payload = buildPayload();

      const normalizeData = await normalizeClimateRiskParameters(payload);
      setNormalizeResult(normalizeData);

      const recalculateData = await recalculateClimateRiskScores(payload);
      setResult(recalculateData);

      if (onRecalculated) {
        await onRecalculated();
      }
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not normalize and recalculate climate risk scores."
      );
    } finally {
      setIsNormalizing(false);
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
          Normalize Parameters and Recalculate Risk Indexes
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          This converts raw parameter values into normalized scores, then uses
          those normalized scores to update final LGA climate risk indexes.
        </p>
      </div>

      <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-semibold">Current normalization method</p>
        <p className="mt-1">
          The system uses relative min-max normalization by year, category and
          parameter. Scores are therefore relative to available Kaduna LGA data
          for the selected year.
        </p>
        <p className="mt-2">
          For most indicators, higher raw value means higher concern. For
          rainfall anomaly, NDVI, vegetation condition, and service access,
          lower raw values are treated as higher concern. Adaptive capacity is
          interpreted separately: higher score means stronger capacity.
        </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Processing Scope
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

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {normalizeResult && (
        <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <p className="font-semibold">{normalizeResult.message}</p>
          <p className="mt-1">
            Normalized records: {normalizeResult.updated_count} | Skipped
            groups: {normalizeResult.skipped_count}
          </p>
        </div>
      )}

      {result && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <p className="font-semibold">{result.message}</p>
          <p className="mt-1">
            Updated profiles: {result.updated_count} | Skipped profiles:{" "}
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

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleNormalize}
          disabled={
            isNormalizing || (scope === "selected_lga" && !selectedProfile)
          }
          className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          {isNormalizing ? "Normalizing..." : "Normalize Raw Values"}
        </button>

        <button
          type="button"
          onClick={handleRecalculate}
          disabled={isRunning || (scope === "selected_lga" && !selectedProfile)}
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          {isRunning ? "Recalculating..." : "Recalculate Indexes"}
        </button>

        <button
          type="button"
          onClick={handleNormalizeAndRecalculate}
          disabled={
            isNormalizing ||
            isRunning ||
            (scope === "selected_lga" && !selectedProfile)
          }
          className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isNormalizing || isRunning
            ? "Processing..."
            : "Normalize and Recalculate"}
        </button>
      </div>
    </section>
  );
}