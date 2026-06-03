import { useEffect, useMemo, useState } from "react";
import {
  createClimateRiskParameterRecord,
  getClimateRiskParameterRecords,
  updateClimateRiskParameterRecord,
} from "../services/api";

const categoryOptions = [
  { value: "flood", label: "Flood" },
  { value: "drought", label: "Drought" },
  { value: "heat", label: "Heat" },
  { value: "erosion", label: "Erosion" },
  { value: "exposure", label: "Exposure" },
  { value: "vulnerability", label: "Vulnerability" },
  { value: "adaptive_capacity", label: "Adaptive Capacity" },
];

const suggestedParameters = {
  flood: [
    ["flood_occurrence_count", "Flood occurrence count", "count"],
    ["flood_exposed_population", "Population exposed to flood", "persons"],
    ["flood_prone_area", "Flood-prone area", "km²"],
  ],
  drought: [
    ["rainfall_anomaly", "Rainfall anomaly", "%"],
    ["consecutive_dry_days", "Consecutive dry days", "days"],
    ["vegetation_stress_index", "Vegetation stress index", "index"],
  ],
  heat: [
    ["mean_lst", "Mean land surface temperature", "°C"],
    ["temperature_anomaly", "Temperature anomaly", "°C"],
    ["urban_heat_exposure", "Urban heat exposure", "index"],
  ],
  erosion: [
    ["slope_index", "Slope index", "index"],
    ["soil_erodibility", "Soil erodibility", "index"],
    ["rainfall_erosivity", "Rainfall erosivity", "index"],
  ],
  exposure: [
    ["population_exposed", "Population exposed", "persons"],
    ["schools_exposed", "Schools exposed", "count"],
    ["hospitals_exposed", "Hospitals exposed", "count"],
    ["roads_exposed_km", "Roads exposed", "km"],
  ],
  vulnerability: [
    ["population_density", "Population density", "persons/km²"],
    ["poverty_index", "Poverty index", "index"],
    ["infrastructure_exposure", "Infrastructure exposure", "index"],
  ],
  adaptive_capacity: [
    ["health_facility_access", "Health facility access", "index"],
    ["early_warning_access", "Early warning access", "index"],
    ["drainage_capacity", "Drainage capacity", "index"],
  ],
};

const initialForm = {
  lga: "",
  year: "2025",
  category: "flood",
  parameter_key: "flood_occurrence_count",
  parameter_label: "Flood occurrence count",
  raw_value: "",
  unit: "count",
  normalized_score: "",
  data_source: "",
  notes: "",
  is_active: true,
};

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition placeholder:text-slate-400 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10";

function formatNumber(value, maximumFractionDigits = 4) {
  if (value === null || value === undefined || value === "") return "—";

  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function getCategoryBadgeClass(category) {
  if (category === "flood") return "bg-[#030454]/10 text-[#030454]";
  if (category === "drought") return "bg-[#F3F74B]/45 text-[#030454]";
  if (category === "heat") return "bg-orange-50 text-orange-700";
  if (category === "erosion") return "bg-red-50 text-red-700";
  if (category === "exposure") return "bg-blue-50 text-blue-700";
  if (category === "vulnerability") return "bg-purple-50 text-purple-700";
  return "bg-[#009B35]/10 text-[#009B35]";
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

export default function ClimateRiskParameterPanel({
  lgas = [],
  selectedProfile,
  canManage,
}) {
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingRecordId, setEditingRecordId] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedLgaId = selectedProfile?.lga || selectedProfile?.lga_id || "";

  useEffect(() => {
    if (selectedLgaId) {
      setForm((current) => ({
        ...current,
        lga: String(selectedLgaId),
        year: String(selectedProfile?.year || 2025),
      }));
    }
  }, [selectedLgaId, selectedProfile?.year]);

  async function loadRecords() {
    if (!selectedLgaId) {
      setRecords([]);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const params = {
        lga: selectedLgaId,
        year: selectedProfile?.year || 2025,
      };

      if (categoryFilter !== "all") {
        params.category = categoryFilter;
      }

      const data = await getClimateRiskParameterRecords(params);
      setRecords(data.results || []);
    } catch (err) {
      console.error(err);
      setError("Could not load parameter records.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLgaId, selectedProfile?.year, categoryFilter]);

  function updateForm(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "category") {
        const firstSuggestion = suggestedParameters[value]?.[0];

        if (firstSuggestion) {
          next.parameter_key = firstSuggestion[0];
          next.parameter_label = firstSuggestion[1];
          next.unit = firstSuggestion[2];
        }
      }

      if (field === "parameter_key") {
        const suggestion = suggestedParameters[current.category]?.find(
          ([key]) => key === value
        );

        if (suggestion) {
          next.parameter_label = suggestion[1];
          next.unit = suggestion[2];
        }
      }

      return next;
    });
  }

  function resetForm() {
    setEditingRecordId(null);
    setForm({
      ...initialForm,
      lga: selectedLgaId ? String(selectedLgaId) : "",
      year: String(selectedProfile?.year || 2025),
    });
  }

  function startEdit(record) {
    setEditingRecordId(record.id);
    setForm({
      lga: String(record.lga),
      year: String(record.year),
      category: record.category,
      parameter_key: record.parameter_key,
      parameter_label: record.parameter_label,
      raw_value: String(record.raw_value),
      unit: record.unit || "",
      normalized_score:
        record.normalized_score === null || record.normalized_score === undefined
          ? ""
          : String(record.normalized_score),
      data_source: record.data_source || "",
      notes: record.notes || "",
      is_active: record.is_active,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canManage) return;

    setIsSaving(true);
    setMessage("");
    setError("");

    const payload = {
      lga: Number(form.lga),
      year: Number(form.year),
      category: form.category,
      parameter_key: form.parameter_key,
      parameter_label: form.parameter_label,
      raw_value: Number(form.raw_value),
      unit: form.unit,
      normalized_score:
        form.normalized_score === "" ? null : Number(form.normalized_score),
      data_source: form.data_source,
      notes: form.notes,
      is_active: Boolean(form.is_active),
    };

    try {
      if (editingRecordId) {
        await updateClimateRiskParameterRecord(editingRecordId, payload);
        setMessage("Parameter record updated successfully.");
      } else {
        await createClimateRiskParameterRecord(payload);
        setMessage("Parameter record created successfully.");
      }

      resetForm();
      await loadRecords();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not save parameter record."
      );
    } finally {
      setIsSaving(false);
    }
  }

  const currentSuggestions = useMemo(() => {
    return suggestedParameters[form.category] || [];
  }, [form.category]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
            Climate Risk Parameters
          </p>

          <h2 className="mt-2 text-2xl font-black text-[#030454]">
            Raw Parameter Data for {selectedProfile?.lga_name || "Selected LGA"}
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            Store the raw climate, exposure, vulnerability and
            adaptive-capacity evidence behind each final risk score.
          </p>
        </div>

        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
        >
          <option value="all">All categories</option>
          {categoryOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-5 space-y-4">
        {message && <Notice type="success">{message}</Notice>}
        {error && <Notice type="error">{error}</Notice>}
      </div>

      {canManage && selectedProfile && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-[#030454]">
                {editingRecordId ? "Edit Parameter Record" : "Add Parameter Record"}
              </h3>

              <p className="mt-1 text-sm leading-6 text-slate-600">
                Raw value is the measured evidence. Normalized score is the
                0–100 index used by the current scoring engine.
              </p>
            </div>

            {editingRecordId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                LGA
              </label>

              <select
                value={form.lga}
                onChange={(event) => updateForm("lga", event.target.value)}
                className={inputClass}
                required
              >
                <option value="">Select LGA</option>
                {lgas.map((lga) => (
                  <option key={lga.lga_id} value={lga.lga_id}>
                    {lga.lga_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Year
              </label>

              <input
                type="number"
                value={form.year}
                onChange={(event) => updateForm("year", event.target.value)}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Category
              </label>

              <select
                value={form.category}
                onChange={(event) => updateForm("category", event.target.value)}
                className={inputClass}
              >
                {categoryOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Suggested Parameter
              </label>

              <select
                value={form.parameter_key}
                onChange={(event) =>
                  updateForm("parameter_key", event.target.value)
                }
                className={inputClass}
              >
                {currentSuggestions.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Parameter Label
              </label>

              <input
                value={form.parameter_label}
                onChange={(event) =>
                  updateForm("parameter_label", event.target.value)
                }
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Raw Value
              </label>

              <input
                type="number"
                step="0.0001"
                value={form.raw_value}
                onChange={(event) => updateForm("raw_value", event.target.value)}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Unit
              </label>

              <input
                value={form.unit}
                onChange={(event) => updateForm("unit", event.target.value)}
                className={inputClass}
                placeholder="count, %, °C, km², index..."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Normalized Score
              </label>

              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.normalized_score}
                onChange={(event) =>
                  updateForm("normalized_score", event.target.value)
                }
                className={inputClass}
                placeholder="Optional 0–100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Data Source
              </label>

              <input
                value={form.data_source}
                onChange={(event) =>
                  updateForm("data_source", event.target.value)
                }
                className={inputClass}
                placeholder="NiMet, KADGIS, NEMA..."
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              Notes
            </label>

            <textarea
              rows="2"
              value={form.notes}
              onChange={(event) => updateForm("notes", event.target.value)}
              className={inputClass}
              placeholder="Explain evidence, assumptions, method, source year..."
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-4 rounded-md bg-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e] disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSaving
              ? "Saving..."
              : editingRecordId
                ? "Update Parameter"
                : "Save Parameter"}
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading parameter records...</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <th className="px-3 py-3 font-bold">Category</th>
                <th className="px-3 py-3 font-bold">Parameter</th>
                <th className="px-3 py-3 font-bold">Raw Value</th>
                <th className="px-3 py-3 font-bold">Normalized</th>
                <th className="px-3 py-3 font-bold">Source</th>
                <th className="px-3 py-3 font-bold">Action</th>
              </tr>
            </thead>

            <tbody>
              {records.map((record) => (
                <tr
                  key={record.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-[#009B35]/5"
                >
                  <td className="px-3 py-4">
                    <span
                      className={`rounded-md px-3 py-1 text-xs font-bold ${getCategoryBadgeClass(
                        record.category
                      )}`}
                    >
                      {record.category_display}
                    </span>
                  </td>

                  <td className="px-3 py-4">
                    <p className="font-black text-[#030454]">
                      {record.parameter_label}
                    </p>
                    <p className="text-xs text-slate-400">
                      {record.parameter_key}
                    </p>
                  </td>

                  <td className="px-3 py-4">
                    {formatNumber(record.raw_value, 4)} {record.unit}
                  </td>

                  <td className="px-3 py-4">
                    {record.normalized_score === null ||
                    record.normalized_score === undefined
                      ? "—"
                      : `${formatNumber(record.normalized_score, 2)} / 100`}
                  </td>

                  <td className="px-3 py-4 text-xs text-slate-500">
                    {record.data_source || "—"}
                  </td>

                  <td className="px-3 py-4">
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => startEdit(record)}
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-bold text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
                      >
                        Edit
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}

              {records.length === 0 && (
                <tr>
                  <td
                    colSpan="6"
                    className="px-3 py-8 text-center text-slate-500"
                  >
                    No parameter records found for this LGA/year yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}