import { useState } from "react";
import {
  normalizeClimateRiskParameters,
  recalculateClimateRiskScores,
} from "../services/api";

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10 disabled:bg-slate-100 disabled:text-slate-500";

function Notice({ type = "blue", title, children }) {
  const classes = {
    blue: "border-[#030454] bg-[#030454]/5 text-[#030454]",
    green: "border-[#009B35] bg-[#009B35]/8 text-[#030454]",
    yellow: "border-[#F3F74B] bg-[#F3F74B]/25 text-[#030454]",
    red: "border-red-400 bg-red-50 text-red-700",
  };

  return (
    <div
      className={`rounded-r-xl border-l-4 px-5 py-4 text-sm leading-6 ${
        classes[type] || classes.blue
      }`}
    >
      {title && <p className="font-black">{title}</p>}
      <div className={title ? "mt-1" : ""}>{children}</div>
    </div>
  );
}

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
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
          Climate Risk Scoring Engine
        </p>

        <h2 className="mt-2 text-2xl font-black text-[#030454]">
          Normalize Parameters and Recalculate Risk Indexes
        </h2>

        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          This converts raw parameter values into normalized scores, then uses
          those normalized scores to update final LGA climate risk indexes.
        </p>
      </div>

      <div className="mt-5">
        <Notice type="yellow" title="Current normalization method">
          <p>
            The system uses relative min-max normalization by year, category and
            parameter. Scores are therefore relative to available Kaduna LGA data
            for the selected year.
          </p>

          <p className="mt-2">
            For most indicators, higher raw value means higher concern. For
            rainfall anomaly, NDVI, vegetation condition and service access,
            lower raw values are treated as higher concern. Adaptive capacity is
            interpreted separately: higher score means stronger capacity.
          </p>
        </Notice>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-bold text-[#030454]">
            Processing Scope
          </label>

          <select
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className={inputClass}
          >
            <option value="selected_lga">Selected LGA only</option>
            <option value="all_lgas">All LGAs for selected year</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-[#030454]">
            Year
          </label>

          <input
            value={selectedYear || selectedProfile?.year || 2025}
            disabled
            className={inputClass}
          />
        </div>
      </div>

      {scope === "selected_lga" && (
        <p className="mt-3 text-sm text-slate-600">
          Selected LGA:{" "}
          <span className="font-black text-[#030454]">
            {selectedProfile?.lga_name || "None selected"}
          </span>
        </p>
      )}

      <div className="mt-5 space-y-4">
        {error && (
          <Notice type="red" title="Scoring error">
            {error}
          </Notice>
        )}

        {normalizeResult && (
          <Notice type="blue" title={normalizeResult.message}>
            Normalized records: {normalizeResult.updated_count} | Skipped
            groups: {normalizeResult.skipped_count}
          </Notice>
        )}

        {result && (
          <Notice type="green" title={result.message}>
            <p>
              Updated profiles: {result.updated_count} | Skipped profiles:{" "}
              {result.skipped_count}
            </p>

            {result.skipped_profiles?.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer font-bold">
                  View skipped LGAs
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-white p-3 text-xs text-slate-700">
                  {JSON.stringify(result.skipped_profiles, null, 2)}
                </pre>
              </details>
            )}
          </Notice>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleNormalize}
          disabled={
            isNormalizing || (scope === "selected_lga" && !selectedProfile)
          }
          className="rounded-md border border-[#030454]/20 bg-[#030454]/5 px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:bg-[#030454]/10 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          {isNormalizing ? "Normalizing..." : "Normalize Raw Values"}
        </button>

        <button
          type="button"
          onClick={handleRecalculate}
          disabled={isRunning || (scope === "selected_lga" && !selectedProfile)}
          className="rounded-md border border-[#009B35]/30 bg-[#009B35]/8 px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-[#009B35] transition hover:bg-[#009B35]/12 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
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
          className="rounded-md bg-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e] disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isNormalizing || isRunning
            ? "Processing..."
            : "Normalize and Recalculate"}
        </button>
      </div>
    </section>
  );
}