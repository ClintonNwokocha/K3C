import { useEffect, useState } from "react";
import { updateClimateRiskProfile } from "../services/api";

const initialForm = {
  flood_risk_score: "",
  drought_risk_score: "",
  heat_risk_score: "",
  erosion_risk_score: "",
  exposure_score: "",
  vulnerability_score: "",
  adaptive_capacity_score: "",
  notes: "",
  data_source: "",
};

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition placeholder:text-slate-400 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10";

function scoreToFormValue(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function Notice({ type = "success", children }) {
  const classes = {
    success: "border-[#009B35] bg-[#009B35]/8 text-[#030454]",
    error: "border-red-400 bg-red-50 text-red-700",
    yellow: "border-[#F3F74B] bg-[#F3F74B]/25 text-[#030454]",
  };

  return (
    <div
      className={`rounded-r-xl border-l-4 px-5 py-4 text-sm leading-6 ${
        classes[type] || classes.success
      }`}
    >
      {children}
    </div>
  );
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
      exposure_score: scoreToFormValue(profile.exposure_score),
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
        <h2 className="text-xl font-black text-[#030454]">Edit Risk Scores</h2>

        <p className="mt-2 text-sm leading-6 text-slate-500">
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
      exposure_score: Number(form.exposure_score),
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
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
          Climate Risk Management
        </p>

        <h2 className="mt-2 text-2xl font-black text-[#030454]">
          Edit {profile.lga_name} Risk Scores
        </h2>

        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          These are normalized indexes from 0 to 100. Raw measured values are
          stored separately as parameter records. Overall risk and risk level are
          recalculated automatically by the backend.
        </p>
      </div>

      <div className="mt-5 space-y-4">
        {message && <Notice type="success">{message}</Notice>}
        {error && <Notice type="error">{error}</Notice>}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {scoreFields.map((field) => (
          <div key={field.key}>
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              {field.label}
            </label>

            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form[field.key]}
              onChange={(event) => updateField(field.key, event.target.value)}
              className={inputClass}
              required
            />
          </div>
        ))}
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-sm font-bold text-[#030454]">
          Data Source
        </label>

        <input
          value={form.data_source}
          onChange={(event) => updateField("data_source", event.target.value)}
          className={inputClass}
          placeholder="Example: NiMet, KADGIS, NEMA, field survey..."
        />
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-sm font-bold text-[#030454]">
          Notes
        </label>

        <textarea
          rows="3"
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          className={inputClass}
          placeholder="Explain the evidence or assumptions behind this risk score."
        />
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="mt-5 w-full rounded-md bg-[#009B35] px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e] disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isSaving ? "Saving..." : "Save Risk Scores"}
      </button>
    </form>
  );
}