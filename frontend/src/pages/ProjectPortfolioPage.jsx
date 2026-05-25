import { useEffect, useMemo, useState } from "react";
import {
  createClimateProject,
  getClimateProjects,
  getClimateRiskProfiles,
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
  sector: "other",
  status: "proposed",
  priority: "medium",
  lga: "",
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
  is_active: true,
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

function getOptionLabel(options, value) {
  return options.find((item) => item.value === value)?.label || value || "—";
}

export default function ProjectPortfolioPage({ currentUser }) {
  const [projectsData, setProjectsData] = useState(null);
  const [lgaOptions, setLgaOptions] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState({
    project_type: "all",
    sector: "all",
    status: "all",
    priority: "all",
    lga: "",
    search: "",
  });
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canManage =
    currentUser?.is_superuser ||
    ["admin", "analyst"].includes(currentUser?.profile?.role);

  async function loadProjects() {
    setIsLoading(true);
    setError("");

    try {
      const params = {};

      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== "all") {
          params[key] = value;
        }
      });

      const data = await getClimateProjects(params);
      setProjectsData(data);
    } catch (err) {
      console.error(err);
      setError("Could not load project portfolio.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadLgas() {
    try {
      const data = await getClimateRiskProfiles({});
      const options =
        data?.results?.map((profile) => ({
          lga_id: profile.lga,
          lga_name: profile.lga_name,
        })) || [];

      const uniqueOptions = Array.from(
        new Map(options.map((item) => [item.lga_id, item])).values()
      ).sort((a, b) => a.lga_name.localeCompare(b.lga_name));

      setLgaOptions(uniqueOptions);
    } catch (err) {
      console.error(err);
      setLgaOptions([]);
    }
  }

  useEffect(() => {
    loadLgas();
  }, []);

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.project_type,
    filters.sector,
    filters.status,
    filters.priority,
    filters.lga,
  ]);

  const projects = projectsData?.results || [];
  const summary = projectsData?.summary || {};

  const filteredProjects = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    if (!search) return projects;

    return projects.filter((project) => {
      return (
        String(project.title || "").toLowerCase().includes(search) ||
        String(project.project_code || "").toLowerCase().includes(search) ||
        String(project.implementing_agency || "").toLowerCase().includes(search)
      );
    });
  }, [projects, filters.search]);

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canManage) return;

    setIsSaving(true);
    setMessage("");
    setError("");

    const payload = {
      ...form,
      lga: form.lga ? Number(form.lga) : null,
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

      setMessage("Climate project created successfully.");
      setForm(initialForm);
      setShowForm(false);
      await loadProjects();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not create climate project."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            Project Portfolio
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Climate Project Portfolio
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Register, track and summarize climate projects across LGAs, sectors,
            mitigation outcomes, adaptation relevance, budgets and
            beneficiaries.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadProjects}
            className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Refresh projects
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => setShowForm((current) => !current)}
              className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              {showForm ? "Hide Form" : "Add Project"}
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Total Projects</p>
          <h2 className="mt-3 text-3xl font-bold">
            {summary.total_projects || 0}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Active projects in current view.
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
          <p className="text-sm text-blue-700">Total Budget</p>
          <h2 className="mt-3 text-3xl font-bold text-blue-700">
            {formatMoney(summary.total_budget_naira)}
          </h2>
          <p className="mt-2 text-sm text-blue-700">
            Estimated portfolio value.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <p className="text-sm text-emerald-700">Expected GHG Reduction</p>
          <h2 className="mt-3 text-3xl font-bold text-emerald-700">
            {formatNumber(summary.total_expected_ghg_reduction_tco2e, 3)}
          </h2>
          <p className="mt-2 text-sm text-emerald-700">tCO₂e expected.</p>
        </div>

        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
          <p className="text-sm text-orange-700">Expected Beneficiaries</p>
          <h2 className="mt-3 text-3xl font-bold text-orange-700">
            {formatNumber(summary.total_expected_beneficiaries, 0)}
          </h2>
          <p className="mt-2 text-sm text-orange-700">
            People expected to benefit.
          </p>
        </div>
      </section>

      {canManage && showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-5">
            <h2 className="text-lg font-bold">Create Climate Project</h2>
            <p className="text-sm text-slate-500">
              Add an adaptation, mitigation or cross-cutting project to the
              portfolio.
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
                placeholder="Example: Kaduna Urban Flood Drainage Upgrade"
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
                LGA
              </label>
              <select
                value={form.lga}
                onChange={(event) => updateForm("lga", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">Statewide / Not specified</option>
                {lgaOptions.map((item) => (
                  <option key={item.lga_id} value={item.lga_id}>
                    {item.lga_name}
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

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Start Date
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={(event) =>
                  updateForm("start_date", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                End Date
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={(event) => updateForm("end_date", event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Implementing Agency
              </label>
              <input
                value={form.implementing_agency}
                onChange={(event) =>
                  updateForm("implementing_agency", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Ministry, agency, NGO, donor..."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Funding Source
              </label>
              <input
                value={form.funding_source}
                onChange={(event) =>
                  updateForm("funding_source", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="State budget, donor, private sector..."
              />
            </div>

            <div className="md:col-span-3">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Description
              </label>
              <textarea
                rows="3"
                value={form.description}
                onChange={(event) =>
                  updateForm("description", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Describe the project..."
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
                placeholder="Explain how this project responds to flood, drought, heat, erosion, vulnerability, exposure or adaptive capacity issues..."
              />
            </div>

            <div className="md:col-span-3">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Location Notes
              </label>
              <textarea
                rows="2"
                value={form.location_notes}
                onChange={(event) =>
                  updateForm("location_notes", event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                placeholder="Describe site, wards, communities, coordinates or implementation area..."
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSaving ? "Saving..." : "Save Project"}
          </button>
        </form>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-lg font-bold">Project Register</h2>
            <p className="text-sm text-slate-500">
              Filter and review climate projects across LGAs and sectors.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={filters.project_type}
              onChange={(event) =>
                updateFilter("project_type", event.target.value)
              }
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="all">All project types</option>
              {projectTypeOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={filters.sector}
              onChange={(event) => updateFilter("sector", event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="all">All sectors</option>
              {sectorOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="all">All statuses</option>
              {statusOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <input
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search projects..."
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading projects...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-3 font-medium">Project</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Sector</th>
                  <th className="px-3 py-3 font-medium">LGA</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Priority</th>
                  <th className="px-3 py-3 font-medium">Budget</th>
                  <th className="px-3 py-3 font-medium">GHG Reduction</th>
                  <th className="px-3 py-3 font-medium">Beneficiaries</th>
                </tr>
              </thead>

              <tbody>
                {filteredProjects.map((project) => (
                  <tr
                    key={project.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-3 py-4">
                      <p className="font-semibold">{project.title}</p>
                      <p className="text-xs text-slate-400">
                        {project.project_code || "No code"}
                      </p>
                    </td>

                    <td className="px-3 py-4">
                      {project.project_type_display ||
                        getOptionLabel(projectTypeOptions, project.project_type)}
                    </td>

                    <td className="px-3 py-4">
                      {project.sector_display ||
                        getOptionLabel(sectorOptions, project.sector)}
                    </td>

                    <td className="px-3 py-4">
                      {project.lga_name || "Statewide / Not specified"}
                    </td>

                    <td className="px-3 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                          project.status
                        )}`}
                      >
                        {project.status_display ||
                          getOptionLabel(statusOptions, project.status)}
                      </span>
                    </td>

                    <td className="px-3 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getPriorityClass(
                          project.priority
                        )}`}
                      >
                        {project.priority_display ||
                          getOptionLabel(priorityOptions, project.priority)}
                      </span>
                    </td>

                    <td className="px-3 py-4">
                      {formatMoney(project.estimated_budget_naira)}
                    </td>

                    <td className="px-3 py-4">
                      {formatNumber(project.expected_ghg_reduction_tco2e, 3)}{" "}
                      tCO₂e
                    </td>

                    <td className="px-3 py-4">
                      {formatNumber(project.expected_beneficiaries, 0)}
                    </td>
                  </tr>
                ))}

                {filteredProjects.length === 0 && (
                  <tr>
                    <td
                      colSpan="9"
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      No climate projects found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}