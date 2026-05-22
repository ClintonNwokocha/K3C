import { useEffect, useState } from "react";
import { updateClimateRiskProfile } from "../services/api";

const initialForm = {
  flood_risk_score: "",
  drought_risk_score: "",
  heat_risk_score: "",
  erosion_risk_score: "",
  vulnerability_score: "",
  adaptive_capacity_score: "",
  notes: "",
  data_source: "",
};

function scoreToFormValue(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

export default function ClimateRiskEditPanel({ profile, canManage, onSaved }) {
  const [form, setForm] = useState(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) {
      setForm(initialForm);
      setMessage("");
      setError("");
      return;
    }

    setForm({
      flood_risk_score: scoreToFormValue(profile.flood_risk_score),
      drought_risk_score: scoreToFormValue(profile.drought_risk_score),
      heat_risk_score: scoreToFormValue(profile.heat_risk_score),
      erosion_risk_score: scoreToFormValue(profile.erosion_risk_score),
      vulnerability_score: scoreToFormValue(profile.vulnerability_score),
      adaptive_capacity_score: scoreToFormValue(profile.adaptive_capacity_score),
      notes: profile.notes || "",
      data_source: profile.data_source || "",
    });

    setMessage("");
    setError("");
  }, [profile]);

  if (!canManage) {
    return null;
  }

  if (!profile) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Edit Risk Scores</h2>
        <p className="mt-2 text-sm text-slate-500">
          Select an LGA to edit its climate risk profile.
        </p>
      </div>
    );
  }

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function buildPayload() {
    return {
      flood_risk_score: Number(form.flood_risk_score),
      drought_risk_score: Number(form.drought_risk_score),
      heat_risk_score: Number(form.heat_risk_score),
      erosion_risk_score: Number(form.erosion_risk_score),
      vulnerability_score: Number(form.vulnerability_score),
      adaptive_capacity_score: Number(form.adaptive_capacity_score),
      notes: form.notes,
      data_source: form.data_source,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      await updateClimateRiskProfile(profile.id, buildPayload());

      setMessage("Risk profile updated successfully.");

      if (onSaved) {
        await onSaved();
      }
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not update risk profile."
      );
    } finally {
      setIsSaving(false);
    }
  }

  const scoreFields = [
    { key: "flood_risk_score", label: "Flood Risk Index (/100)" },
    { key: "drought_risk_score", label: "Drought Risk Index (/100)" },
    { key: "heat_risk_score", label: "Heat Risk Index (/100)" },
    { key: "erosion_risk_score", label: "Erosion Risk Index (/100)" },
    { key: "exposure_score", label: "Exposure Index (/100)" },
    { key: "vulnerability_score", label: "Vulnerability Index (/100)" },
    {
      key: "adaptive_capacity_score",
      label: "Adaptive Capacity Index (/100)",
    },
  ];

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <p className="text-sm font-medium text-emerald-700">
          Climate Risk Management
        </p>
        <h2 className="mt-1 text-lg font-bold">
          Edit {profile.lga_name} Risk Scores
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          These are normalized indexes from 0 to 100. Raw measured values are stored
          separately as parameter records. Overall risk and risk level are recalculated
          automatically by the backend.
        </p>
      </div>

      {(message || error) && (
        <div
          className={`mt-5 rounded-xl border p-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error || message}
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {scoreFields.map((field) => (
          <div key={field.key}>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              {field.label}
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form[field.key]}
              onChange={(event) => updateField(field.key, event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              required
            />
          </div>
        ))}
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Data Source
        </label>
        <input
          value={form.data_source}
          onChange={(event) => updateField("data_source", event.target.value)}
          className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          placeholder="Example: NiMet, KADGIS, NEMA, field survey..."
        />
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Notes
        </label>
        <textarea
          rows="3"
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          placeholder="Explain the evidence or assumptions behind this risk score."
        />
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isSaving ? "Saving..." : "Save Risk Scores"}
      </button>
    </form>
  );
}