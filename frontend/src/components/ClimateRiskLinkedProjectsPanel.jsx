import { useEffect, useMemo, useState } from "react";
import {
  createClimateProject,
  getClimateProjects,
} from "../services/api";

const projectTypeOptions = [
  { value: "adaptation", label: "Adaptation" },
  { value: "mitigation", label: "Mitigation" },
  { value: "cross_cutting", label: "Cross-cutting" },
];

const sectorOptions = [
  { value: "energy", label: "Energy" },
  { value: "agriculture", label: "Agriculture" },
  { value: "waste", label: "Waste" },
  { value: "ippu", label: "IPPU" },
  { value: "lulucf", label: "LULUCF" },
  { value: "water", label: "Water" },
  { value: "health", label: "Health" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "disaster_risk", label: "Disaster Risk Management" },
  { value: "other", label: "Other" },
];

const statusOptions = [
  { value: "proposed", label: "Proposed" },
  { value: "planned", label: "Planned" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "suspended", label: "Suspended" },
  { value: "cancelled", label: "Cancelled" },
];

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "very_high", label: "Very High" },
];

const initialForm = {
  title: "",
  project_code: "",
  project_type: "adaptation",
  sector: "disaster_risk",
  status: "proposed",
  priority: "high",
  description: "",
  implementing_agency: "",
  funding_source: "",
  estimated_budget_naira: "0",
  expected_ghg_reduction_tco2e: "0",
  expected_beneficiaries: "0",
  start_date: "",
  end_date: "",
  climate_risk_relevance: "",
  location_notes: "",
};

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function formatMoney(value) {
  return `₦${formatNumber(value, 2)}`;
}

function getStatusClass(status) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "ongoing") return "bg-blue-50 text-blue-700";
  if (status === "planned") return "bg-indigo-50 text-indigo-700";
  if (status === "proposed") return "bg-slate-100 text-slate-700";
  if (status === "suspended") return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

function getPriorityClass(priority) {
  if (priority === "very_high") return "bg-red-50 text-red-700";
  if (priority === "high") return "bg-orange-50 text-orange-700";
  if (priority === "medium") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

function getRiskClass(level) {
  if (level === "very_high") return "bg-red-50 text-red-700";
  if (level === "high") return "bg-orange-50 text-orange-700";
  if (level === "moderate") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

function getOptionLabel(options, value) {
  return options.find((item) => item.value === value)?.label || value || "—";
}

function getDefaultRiskRelevance(profile) {
  if (!profile) return "";

  const riskParts = [];

  if (Number(profile.flood_risk_score || 0) >= 60) {
    riskParts.push("flood risk");
  }

  if (Number(profile.drought_risk_score || 0) >= 60) {
    riskParts.push("drought risk");
  }

  if (Number(profile.heat_risk_score || 0) >= 60) {
    riskParts.push("heat risk");
  }

  if (Number(profile.erosion_risk_score || 0) >= 60) {
    riskParts.push("erosion risk");
  }

  if (Number(profile.vulnerability_score || 0) >= 60) {
    riskParts.push("high vulnerability");
  }

  if (Number(profile.adaptive_capacity_score || 0) < 40) {
    riskParts.push("weak adaptive capacity");
  }

  const riskText = riskParts.length
    ? riskParts.join(", ")
    : "climate risk and resilience needs";

  return `This project responds to ${riskText} in ${profile.lga_name}.`;
}

export default function ClimateRiskLinkedProjectsPanel({
  selectedProfile,
  canManage,
}) {
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadProjects() {
    if (!selectedProfile?.lga) {
      setProjects([]);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const data = await getClimateProjects({
        lga: selectedProfile.lga,
      });

      setProjects(data.results || []);
    } catch (err) {
      console.error(err);
      setError("Could not load linked projects for this LGA.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();

    if (selectedProfile) {
      setForm((current) => ({
        ...current,
        climate_risk_relevance: getDefaultRiskRelevance(selectedProfile),
        location_notes: `${selectedProfile.lga_name} LGA`,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfile?.lga]);

  const summary = useMemo(() => {
    const totalBudget = projects.reduce(
      (sum, project) => sum + Number(project.estimated_budget_naira || 0),
      0
    );

    const totalGhgReduction = projects.reduce(
      (sum, project) =>
        sum + Number(project.expected_ghg_reduction_tco2e || 0),
      0
    );

    const totalBeneficiaries = projects.reduce(
      (sum, project) => sum + Number(project.expected_beneficiaries || 0),
      0
    );

    const ongoingCount = projects.filter(
      (project) => project.status === "ongoing"
    ).length;

    const highPriorityCount = projects.filter((project) =>
      ["high", "very_high"].includes(project.priority)
    ).length;

    return {
      totalProjects: projects.length,
      totalBudget,
      totalGhgReduction,
      totalBeneficiaries,
      ongoingCount,
      highPriorityCount,
    };
  }, [projects]);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canManage || !selectedProfile?.lga) return;

    setIsSaving(true);
    setMessage("");
    setError("");

    const payload = {
      ...form,
      lga: Number(selectedProfile.lga),
      estimated_budget_naira: Number(form.estimated_budget_naira || 0),
      expected_ghg_reduction_tco2e: Number(
        form.expected_ghg_reduction_tco2e || 0
      ),
      expected_beneficiaries: Number(form.expected_beneficiaries || 0),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      is_active: true,
    };

    try {
      await createClimateProject(payload);

      setMessage("Project linked to this LGA successfully.");
      setForm({
        ...initialForm,
        climate_risk_relevance: getDefaultRiskRelevance(selectedProfile),
        location_notes: `${selectedProfile.lga_name} LGA`,
      });
      setShowForm(false);
      await loadProjects();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not create linked project."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!selectedProfile) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Linked Climate Projects</h2>
        <p className="mt-2 text-sm text-slate-500">
          Select an LGA to view climate projects linked to its risk profile.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            Linked Climate Projects
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            Projects Responding to {selectedProfile.lga_name} Risk
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            View and register climate projects linked to this LGA’s risk
            profile. This connects climate risk analysis to adaptation and
            mitigation action planning.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadProjects}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Refresh Projects
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => setShowForm((current) => !current)}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {showForm ? "Hide Form" : "Add Linked Project"}
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm text-slate-500">Selected LGA Risk Context</p>
            <h3 className="mt-1 text-xl font-bold">
              {selectedProfile.lga_name}
            </h3>
          </div>

          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${getRiskClass(
                selectedProfile.risk_level
              )}`}
            >
              {selectedProfile.risk_level_display}
            </span>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Overall: {formatNumber(selectedProfile.overall_risk_score, 2)} /
              100
            </span>

            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              Adaptive Capacity:{" "}
              {formatNumber(selectedProfile.adaptive_capacity_score, 2)} / 100
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Linked Projects</p>
          <p className="mt-2 text-3xl font-bold">{summary.totalProjects}</p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-sm text-blue-700">Linked Budget</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {formatMoney(summary.totalBudget)}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm text-emerald-700">Expected GHG Reduction</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">
            {formatNumber(summary.totalGhgReduction, 3)}
          </p>
          <p className="mt-1 text-sm text-emerald-700">tCO₂e</p>
        </div>

        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <p className="text-sm text-orange-700">Expected Beneficiaries</p>
          <p className="mt-2 text-3xl font-bold text-orange-700">
            {formatNumber(summary.totalBeneficiaries, 0)}
          </p>
        </div>
      </div>

      {canManage && showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5"
        >
          <div className="mb-4">
            <h3 className="font-bold">Create Project for {selectedProfile.lga_name}</h3>
            <p className="text-sm text-slate-500">
              This project will be automatically linked to the selected LGA.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Project Title
              </label>
              <input
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder={`Example: ${selectedProfile.lga_name} Flood Resilience Project`}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Project Code
              </label>
              <input
                value={form.project_code}
                onChange={(event) =>
                  updateForm("project_code", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="KCCC-PRJ-001"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Project Type
              </label>
              <select
                value={form.project_type}
                onChange={(event) =>
                  updateForm("project_type", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {projectTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Sector
              </label>
              <select
                value={form.sector}
                onChange={(event) => updateForm("sector", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {sectorOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Status
              </label>
              <select
                value={form.status}
                onChange={(event) => updateForm("status", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {statusOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(event) => updateForm("priority", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {priorityOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Estimated Budget ₦
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.estimated_budget_naira}
                onChange={(event) =>
                  updateForm("estimated_budget_naira", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Expected GHG Reduction tCO₂e
              </label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={form.expected_ghg_reduction_tco2e}
                onChange={(event) =>
                  updateForm(
                    "expected_ghg_reduction_tco2e",
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Expected Beneficiaries
              </label>
              <input
                type="number"
                min="0"
                value={form.expected_beneficiaries}
                onChange={(event) =>
                  updateForm("expected_beneficiaries", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="md:col-span-3">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Climate Risk Relevance
              </label>
              <textarea
                rows="3"
                value={form.climate_risk_relevance}
                onChange={(event) =>
                  updateForm("climate_risk_relevance", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="md:col-span-3">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Project Description
              </label>
              <textarea
                rows="3"
                value={form.description}
                onChange={(event) =>
                  updateForm("description", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Describe project scope, outputs and expected resilience/mitigation benefit..."
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSaving ? "Saving..." : "Save Linked Project"}
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading linked projects...</p>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <p className="font-bold">No linked projects yet</p>
          <p className="mt-2">
            This LGA has no climate project linked to it. If the LGA has high
            or very high risk, this may indicate an adaptation planning gap.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div>
                  <h3 className="text-lg font-bold">{project.title}</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {project.project_code || "No project code"} •{" "}
                    {project.sector_display ||
                      getOptionLabel(sectorOptions, project.sector)}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                        project.status
                      )}`}
                    >
                      {project.status_display ||
                        getOptionLabel(statusOptions, project.status)}
                    </span>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getPriorityClass(
                        project.priority
                      )}`}
                    >
                      {project.priority_display ||
                        getOptionLabel(priorityOptions, project.priority)}
                    </span>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {project.project_type_display ||
                        getOptionLabel(
                          projectTypeOptions,
                          project.project_type
                        )}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 text-sm md:grid-cols-3 lg:min-w-[420px]">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Budget</p>
                    <p className="mt-1 font-bold">
                      {formatMoney(project.estimated_budget_naira)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">GHG Reduction</p>
                    <p className="mt-1 font-bold">
                      {formatNumber(project.expected_ghg_reduction_tco2e, 3)}{" "}
                      tCO₂e
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Beneficiaries</p>
                    <p className="mt-1 font-bold">
                      {formatNumber(project.expected_beneficiaries, 0)}
                    </p>
                  </div>
                </div>
              </div>

              {project.climate_risk_relevance && (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  <p className="font-semibold">Climate Risk Relevance</p>
                  <p className="mt-1">{project.climate_risk_relevance}</p>
                </div>
              )}

              {project.description && (
                <p className="mt-4 text-sm text-slate-600">
                  {project.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}