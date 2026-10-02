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

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition placeholder:text-slate-400 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10";

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function formatMoney(value) {
  return `₦${formatNumber(value, 2)}`;
}

function getStatusClass(status) {
  if (status === "completed") return "bg-[#009B35]/10 text-[#009B35]";
  if (status === "ongoing") return "bg-[#030454]/10 text-[#030454]";
  if (status === "planned") return "bg-[#F3F74B]/45 text-[#030454]";
  if (status === "proposed") return "bg-slate-100 text-slate-700";
  if (status === "suspended") return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

function getPriorityClass(priority) {
  if (priority === "very_high") return "bg-red-50 text-red-700";
  if (priority === "high") return "bg-orange-50 text-orange-700";
  if (priority === "medium") return "bg-[#F3F74B]/45 text-[#030454]";
  return "bg-[#009B35]/10 text-[#009B35]";
}

function getRiskClass(level) {
  if (level === "very_high") return "bg-red-50 text-red-700";
  if (level === "high") return "bg-orange-50 text-orange-700";
  if (level === "moderate") return "bg-[#F3F74B]/45 text-[#030454]";
  return "bg-[#009B35]/10 text-[#009B35]";
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
    : "Climate Intelligence and resilience needs";

  return `This project responds to ${riskText} in ${profile.lga_name}.`;
}

function SummaryCard({ label, value, helper, tone = "blue" }) {
  const toneClasses = {
    blue: "border-[#030454]/15 bg-[#030454]/5",
    green: "border-[#009B35]/20 bg-[#009B35]/8",
    yellow: "border-[#F3F74B]/70 bg-[#F3F74B]/25",
    orange: "border-orange-200 bg-orange-50",
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

function buildInitialForm(selectedProfile) {
  if (!selectedProfile) return initialForm;

  return {
    ...initialForm,
    climate_risk_relevance: getDefaultRiskRelevance(selectedProfile),
    location_notes: `${selectedProfile.lga_name} LGA`,
  };
}

export default function ClimateRiskLinkedProjectsPanel({
  selectedProfile,
  canManage,
}) {
  const [projects, setProjects] = useState([]);
  // Form defaults are intentionally derived from `selectedProfile` on mount
  // only — the parent remounts this component (via `key`) whenever the
  // selected LGA changes, so a fresh instance always starts in sync.
  const [form, setForm] = useState(() => buildInitialForm(selectedProfile));
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !!selectedProfile?.lga);
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
    if (!selectedProfile?.lga) return undefined;

    let cancelled = false;

    getClimateProjects({ lga: selectedProfile.lga })
      .then((data) => {
        if (!cancelled) {
          setProjects(data.results || []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setError("Could not load linked projects for this LGA.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // This effect intentionally runs once per mounted instance — the parent
    // remounts this component (via `key`) whenever the selected LGA changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <h2 className="text-xl font-black text-[#030454]">
          Linked Climate Projects
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Select an LGA to view climate projects linked to its risk profile.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
            Linked Climate Projects
          </p>

          <h2 className="mt-2 text-2xl font-black text-[#030454]">
            Projects Responding to {selectedProfile.lga_name} Risk
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            View and register climate projects linked to this LGA’s risk
            profile. This connects Climate Intelligence analysis to adaptation and
            mitigation action planning.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadProjects}
            className="rounded-md border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
          >
            Refresh Projects
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => setShowForm((current) => !current)}
              className="rounded-md bg-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e]"
            >
              {showForm ? "Hide Form" : "Add Linked Project"}
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              Selected LGA Risk Context
            </p>

            <h3 className="mt-2 text-xl font-black text-[#030454]">
              {selectedProfile.lga_name}
            </h3>
          </div>

          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-md px-3 py-1 text-xs font-bold ${getRiskClass(
                selectedProfile.risk_level
              )}`}
            >
              {selectedProfile.risk_level_display}
            </span>

            <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              Overall: {formatNumber(selectedProfile.overall_risk_score, 2)} /
              100
            </span>

            <span className="rounded-md bg-[#030454]/10 px-3 py-1 text-xs font-bold text-[#030454]">
              Adaptive Capacity:{" "}
              {formatNumber(selectedProfile.adaptive_capacity_score, 2)} / 100
            </span>
          </div>
        </div>
      </div>

      <div className="mb-5 space-y-4">
        {error && <Notice type="error">{error}</Notice>}
        {message && <Notice type="success">{message}</Notice>}
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Linked Projects"
          value={summary.totalProjects}
          helper="Projects connected to this LGA."
          tone="blue"
        />

        <SummaryCard
          label="Linked Budget"
          value={formatMoney(summary.totalBudget)}
          helper="Total estimated value."
          tone="green"
        />

        <SummaryCard
          label="Expected GHG Reduction"
          value={formatNumber(summary.totalGhgReduction, 3)}
          helper="tCO₂e expected."
          tone="yellow"
        />

        <SummaryCard
          label="Expected Beneficiaries"
          value={formatNumber(summary.totalBeneficiaries, 0)}
          helper="People expected to benefit."
          tone="orange"
        />
      </div>

      {canManage && showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5"
        >
          <div className="mb-4">
            <h3 className="text-xl font-black text-[#030454]">
              Create Project for {selectedProfile.lga_name}
            </h3>

            <p className="mt-1 text-sm leading-6 text-slate-600">
              This project will be automatically linked to the selected LGA.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Project Title
              </label>

              <input
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                className={inputClass}
                placeholder={`Example: ${selectedProfile.lga_name} Flood Resilience Project`}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Project Code
              </label>

              <input
                value={form.project_code}
                onChange={(event) =>
                  updateForm("project_code", event.target.value)
                }
                className={inputClass}
                placeholder="KCCC-PRJ-001"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Project Type
              </label>

              <select
                value={form.project_type}
                onChange={(event) =>
                  updateForm("project_type", event.target.value)
                }
                className={inputClass}
              >
                {projectTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Sector
              </label>

              <select
                value={form.sector}
                onChange={(event) => updateForm("sector", event.target.value)}
                className={inputClass}
              >
                {sectorOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Status
              </label>

              <select
                value={form.status}
                onChange={(event) => updateForm("status", event.target.value)}
                className={inputClass}
              >
                {statusOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Priority
              </label>

              <select
                value={form.priority}
                onChange={(event) => updateForm("priority", event.target.value)}
                className={inputClass}
              >
                {priorityOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
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
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
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
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Expected Beneficiaries
              </label>

              <input
                type="number"
                min="0"
                value={form.expected_beneficiaries}
                onChange={(event) =>
                  updateForm("expected_beneficiaries", event.target.value)
                }
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Implementing Agency
              </label>

              <input
                value={form.implementing_agency}
                onChange={(event) =>
                  updateForm("implementing_agency", event.target.value)
                }
                className={inputClass}
                placeholder="Ministry, agency, NGO, donor..."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Funding Source
              </label>

              <input
                value={form.funding_source}
                onChange={(event) =>
                  updateForm("funding_source", event.target.value)
                }
                className={inputClass}
                placeholder="State budget, donor, private sector..."
              />
            </div>

            <div className="md:col-span-3">
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Climate Intelligence Relevance
              </label>

              <textarea
                rows="3"
                value={form.climate_risk_relevance}
                onChange={(event) =>
                  updateForm("climate_risk_relevance", event.target.value)
                }
                className={inputClass}
              />
            </div>

            <div className="md:col-span-3">
              <label className="mb-2 block text-sm font-bold text-[#030454]">
                Project Description
              </label>

              <textarea
                rows="3"
                value={form.description}
                onChange={(event) =>
                  updateForm("description", event.target.value)
                }
                className={inputClass}
                placeholder="Describe project scope, outputs and expected resilience/mitigation benefit..."
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-5 rounded-md bg-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e] disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSaving ? "Saving..." : "Save Linked Project"}
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading linked projects...</p>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-5 py-4 text-sm leading-6 text-[#030454]">
          <p className="font-black">No linked projects yet</p>

          <p className="mt-1">
            This LGA has no climate project linked to it. If the LGA has high
            or very high risk, this may indicate an adaptation planning gap.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#009B35]/60 hover:bg-[#009B35]/5"
            >
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div>
                  <h3 className="text-lg font-black text-[#030454]">
                    {project.title}
                  </h3>

                  <p className="mt-1 text-xs text-slate-400">
                    {project.project_code || "No project code"} •{" "}
                    {project.sector_display ||
                      getOptionLabel(sectorOptions, project.sector)}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`rounded-md px-3 py-1 text-xs font-bold ${getStatusClass(
                        project.status
                      )}`}
                    >
                      {project.status_display ||
                        getOptionLabel(statusOptions, project.status)}
                    </span>

                    <span
                      className={`rounded-md px-3 py-1 text-xs font-bold ${getPriorityClass(
                        project.priority
                      )}`}
                    >
                      {project.priority_display ||
                        getOptionLabel(priorityOptions, project.priority)}
                    </span>

                    <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                      {project.project_type_display ||
                        getOptionLabel(
                          projectTypeOptions,
                          project.project_type
                        )}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 text-sm md:grid-cols-3 lg:min-w-[420px]">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs text-slate-500">Budget</p>
                    <p className="mt-1 font-black text-[#030454]">
                      {formatMoney(project.estimated_budget_naira)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs text-slate-500">GHG Reduction</p>
                    <p className="mt-1 font-black text-[#030454]">
                      {formatNumber(project.expected_ghg_reduction_tco2e, 3)}{" "}
                      tCO₂e
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs text-slate-500">Beneficiaries</p>
                    <p className="mt-1 font-black text-[#030454]">
                      {formatNumber(project.expected_beneficiaries, 0)}
                    </p>
                  </div>
                </div>
              </div>

              {project.climate_risk_relevance && (
                <div className="mt-4 rounded-xl border-l-4 border-[#030454] bg-[#030454]/5 px-5 py-4 text-sm leading-6 text-[#030454]">
                  <p className="font-black">Climate Intelligence Relevance</p>
                  <p className="mt-1">{project.climate_risk_relevance}</p>
                </div>
              )}

              {project.description && (
                <p className="mt-4 text-sm leading-6 text-slate-600">
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