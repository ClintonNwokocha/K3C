import { useEffect, useMemo, useState } from "react";
import ProjectPortfolioExportPanel from "../components/ProjectPortfolioExportPanel";
import ProjectPortfolioStatusBoard from "../components/ProjectPortfolioStatusBoard";
import ProjectPortfolioMapView from "../components/ProjectPortfolioMapView";
import ProjectPortfolioImportPanel from "../components/ProjectPortfolioImportPanel";
import {
  CommandButton,
  CommandNotice,
  CommandPageHeader,
  CommandSection,
  CommandStatCard,
  CommandTabs,
} from "../components/CommandUI";
import { canManageProjectPortfolio } from "../utils/permissions";
import {
  createClimateProject,
  getClimateProjects,
  getClimateRiskProfiles,
  updateClimateProject,
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

const baseTabs = [
  { key: "overview", label: "Overview" },
  { key: "map", label: "Project Map" },
  { key: "board", label: "Status Board" },
  { key: "import_export", label: "Import / Export" },
  { key: "register", label: "Project Register" },
];

const formTab = { key: "form", label: "Add / Edit Project" };

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition placeholder:text-slate-400 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10";

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function formatMoney(value, maximumFractionDigits = 0) {
  return `₦${formatNumber(value, maximumFractionDigits)}`;
}

function getStatusClass(status) {
  if (status === "completed") return "bg-[#009B35]/10 text-[#009B35]";
  if (status === "ongoing") return "bg-blue-50 text-blue-700";
  if (status === "planned") return "bg-[#030454]/10 text-[#030454]";
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

function getOptionLabel(options, value) {
  return options.find((item) => item.value === value)?.label || value || "—";
}

function normalizeDateForInput(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function buildFormFromProject(project) {
  return {
    title: project.title || "",
    project_code: project.project_code || "",
    project_type: project.project_type || "adaptation",
    sector: project.sector || "other",
    status: project.status || "proposed",
    priority: project.priority || "medium",
    lga: project.lga ? String(project.lga) : "",
    description: project.description || "",
    implementing_agency: project.implementing_agency || "",
    funding_source: project.funding_source || "",
    estimated_budget_naira: String(project.estimated_budget_naira || "0"),
    expected_ghg_reduction_tco2e: String(
      project.expected_ghg_reduction_tco2e || "0"
    ),
    expected_beneficiaries: String(project.expected_beneficiaries || "0"),
    start_date: normalizeDateForInput(project.start_date),
    end_date: normalizeDateForInput(project.end_date),
    climate_risk_relevance: project.climate_risk_relevance || "",
    location_notes: project.location_notes || "",
    is_active: project.is_active !== false,
  };
}

function getStatusCounts(projects) {
  return statusOptions.reduce((counts, item) => {
    counts[item.value] = projects.filter(
      (project) => project.status === item.value
    ).length;
    return counts;
  }, {});
}

function ProjectSummaryCards({ summary }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <CommandStatCard
        label="Total Projects"
        value={summary.total_projects || 0}
        helper="Active projects in current view."
        tone="blue"
      />

      <CommandStatCard
        label="Total Budget"
        value={formatMoney(summary.total_budget_naira, 0)}
        helper="Estimated portfolio value."
        tone="green"
      />

      <CommandStatCard
        label="Expected GHG Reduction"
        value={formatNumber(summary.total_expected_ghg_reduction_tco2e, 3)}
        helper="tCO₂e expected."
        tone="yellow"
      />

      <CommandStatCard
        label="Expected Beneficiaries"
        value={formatNumber(summary.total_expected_beneficiaries, 0)}
        helper="People expected to benefit."
        tone="white"
      />
    </section>
  );
}

function InfoTile({ label, value, muted = false }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 p-4 ${
        muted ? "bg-slate-50" : "bg-white"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <p className="mt-2 font-black text-[#030454]">{value}</p>
    </div>
  );
}

function SelectedProjectDetail({
  selectedProject,
  canManage,
  onEditProject,
  onClear,
}) {
  if (!selectedProject) {
    return (
      <CommandSection
        title="No project selected"
        description="Click View on any project card, board item, or register row to inspect its details here."
      >
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
          Project details will appear here after selection.
        </div>
      </CommandSection>
    );
  }

  return (
    <CommandSection
      title={selectedProject.title}
      description={
        selectedProject.description || "No project description provided."
      }
      actions={
        <div className="flex flex-wrap gap-3">
          {canManage && (
            <CommandButton
              variant="primary"
              onClick={() => onEditProject(selectedProject)}
            >
              Edit Project
            </CommandButton>
          )}

          <CommandButton variant="outline" onClick={onClear}>
            Clear Selection
          </CommandButton>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <InfoTile
          label="Status"
          value={
            selectedProject.status_display ||
            getOptionLabel(statusOptions, selectedProject.status)
          }
          muted
        />

        <InfoTile
          label="Priority"
          value={
            selectedProject.priority_display ||
            getOptionLabel(priorityOptions, selectedProject.priority)
          }
          muted
        />

        <InfoTile
          label="LGA"
          value={selectedProject.lga_name || "Statewide / Not specified"}
          muted
        />

        <InfoTile
          label="Implementing Agency"
          value={selectedProject.implementing_agency || "Not specified"}
        />

        <InfoTile
          label="Funding Source"
          value={selectedProject.funding_source || "Not specified"}
        />

        <InfoTile
          label="Budget"
          value={formatMoney(selectedProject.estimated_budget_naira, 0)}
        />

        <InfoTile
          label="GHG Reduction"
          value={`${formatNumber(
            selectedProject.expected_ghg_reduction_tco2e,
            3
          )} tCO₂e`}
        />

        <InfoTile
          label="Beneficiaries"
          value={formatNumber(selectedProject.expected_beneficiaries, 0)}
        />
      </div>

      {selectedProject.climate_risk_relevance && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="font-black text-[#030454]">Climate Risk Relevance</p>
          <p className="mt-2 leading-6 text-slate-600">
            {selectedProject.climate_risk_relevance}
          </p>
        </div>
      )}

      {selectedProject.location_notes && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="font-black text-[#030454]">Location Notes</p>
          <p className="mt-2 leading-6 text-slate-600">
            {selectedProject.location_notes}
          </p>
        </div>
      )}
    </CommandSection>
  );
}

function PortfolioOverview({
  projects,
  selectedProject,
  canManage,
  onEditProject,
  onClearSelectedProject,
  setActiveTab,
}) {
  const statusCounts = useMemo(() => getStatusCounts(projects), [projects]);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <CommandSection
        title="Implementation snapshot"
        description="A quick leadership-level view of project movement across implementation states."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {statusOptions.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setActiveTab("board")}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#009B35]/60 hover:bg-[#009B35]/5"
            >
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                {item.label}
              </p>

              <p className="mt-2 text-2xl font-black text-[#030454]">
                {statusCounts[item.value] || 0}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <CommandButton variant="outline" onClick={() => setActiveTab("map")}>
            Open Map
          </CommandButton>

          <CommandButton variant="outline" onClick={() => setActiveTab("board")}>
            Open Board
          </CommandButton>

          <CommandButton
            variant="outline"
            onClick={() => setActiveTab("register")}
          >
            Open Register
          </CommandButton>
        </div>
      </CommandSection>

      <SelectedProjectDetail
        selectedProject={selectedProject}
        canManage={canManage}
        onEditProject={onEditProject}
        onClear={onClearSelectedProject}
      />
    </div>
  );
}

function ProjectFormSection({
  form,
  updateForm,
  editingProject,
  isSaving,
  canManage,
  lgaOptions,
  onSubmit,
  onCancel,
}) {
  if (!canManage) {
    return (
      <CommandNotice title="Access restricted" tone="yellow">
        You do not have permission to create or edit project portfolio records.
      </CommandNotice>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <CommandSection
        title={editingProject ? "Edit Climate Project" : "Create Climate Project"}
        description={
          editingProject
            ? "Update project status, priority, budget, outcomes and implementation details."
            : "Add an adaptation, mitigation or cross-cutting project to the portfolio."
        }
        actions={
          editingProject ? (
            <CommandButton variant="outline" onClick={onCancel}>
              Cancel Editing
            </CommandButton>
          ) : null
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              Project Title
            </label>
            <input
              value={form.title}
              onChange={(event) => updateForm("title", event.target.value)}
              className={inputClass}
              placeholder="Example: Kaduna Urban Flood Drainage Upgrade"
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
              LGA
            </label>
            <select
              value={form.lga}
              onChange={(event) => updateForm("lga", event.target.value)}
              className={inputClass}
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
                updateForm("expected_ghg_reduction_tco2e", event.target.value)
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
              Start Date
            </label>
            <input
              type="date"
              value={form.start_date}
              onChange={(event) => updateForm("start_date", event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              End Date
            </label>
            <input
              type="date"
              value={form.end_date}
              onChange={(event) => updateForm("end_date", event.target.value)}
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
              Description
            </label>
            <textarea
              rows="3"
              value={form.description}
              onChange={(event) => updateForm("description", event.target.value)}
              className={inputClass}
              placeholder="Describe the project..."
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              Climate Risk Relevance
            </label>
            <textarea
              rows="3"
              value={form.climate_risk_relevance}
              onChange={(event) =>
                updateForm("climate_risk_relevance", event.target.value)
              }
              className={inputClass}
              placeholder="Explain how this project responds to flood, drought, heat, erosion, vulnerability, exposure or adaptive capacity issues..."
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              Location Notes
            </label>
            <textarea
              rows="2"
              value={form.location_notes}
              onChange={(event) =>
                updateForm("location_notes", event.target.value)
              }
              className={inputClass}
              placeholder="Describe site, wards, communities, coordinates or implementation area..."
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <CommandButton type="submit" disabled={isSaving}>
            {isSaving
              ? "Saving..."
              : editingProject
                ? "Update Project"
                : "Save Project"}
          </CommandButton>

          <CommandButton variant="outline" onClick={onCancel}>
            Cancel
          </CommandButton>
        </div>
      </CommandSection>
    </form>
  );
}

function ProjectRegisterSection({
  filters,
  updateFilter,
  lgaOptions,
  filteredProjects,
  selectedProject,
  isLoading,
  canManage,
  onViewProject,
  onEditProject,
}) {
  return (
    <CommandSection
      title="Project Register"
      description="Filter and review climate projects across LGAs, sectors, agencies, and funding sources."
      actions={
        <div className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select
            value={filters.project_type}
            onChange={(event) =>
              updateFilter("project_type", event.target.value)
            }
            className={inputClass}
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
            className={inputClass}
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
            className={inputClass}
          >
            <option value="all">All statuses</option>
            {statusOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            value={filters.priority}
            onChange={(event) => updateFilter("priority", event.target.value)}
            className={inputClass}
          >
            <option value="all">All priorities</option>
            {priorityOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            value={filters.lga}
            onChange={(event) => updateFilter("lga", event.target.value)}
            className={inputClass}
          >
            <option value="">All LGAs</option>
            {lgaOptions.map((item) => (
              <option key={item.lga_id} value={item.lga_id}>
                {item.lga_name}
              </option>
            ))}
          </select>

          <input
            value={filters.implementing_agency}
            onChange={(event) =>
              updateFilter("implementing_agency", event.target.value)
            }
            placeholder="Filter by agency..."
            className={inputClass}
          />

          <input
            value={filters.funding_source}
            onChange={(event) =>
              updateFilter("funding_source", event.target.value)
            }
            placeholder="Filter by funding source..."
            className={inputClass}
          />

          <input
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Search projects..."
            className={inputClass}
          />
        </div>
      }
    >
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading projects...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1550px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-3 font-bold">Project</th>
                <th className="px-3 py-3 font-bold">Type</th>
                <th className="px-3 py-3 font-bold">Sector</th>
                <th className="px-3 py-3 font-bold">LGA</th>
                <th className="px-3 py-3 font-bold">Agency</th>
                <th className="px-3 py-3 font-bold">Funding Source</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-3 py-3 font-bold">Priority</th>
                <th className="px-3 py-3 font-bold">Budget</th>
                <th className="px-3 py-3 font-bold">GHG Reduction</th>
                <th className="px-3 py-3 font-bold">Beneficiaries</th>
                <th className="px-3 py-3 font-bold">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredProjects.map((project) => (
                <tr
                  key={project.id}
                  className={`border-b border-slate-100 last:border-0 hover:bg-[#009B35]/5 ${
                    selectedProject?.id === project.id
                      ? "bg-[#009B35]/10"
                      : ""
                  }`}
                >
                  <td className="px-3 py-4">
                    <p className="font-black text-[#030454]">{project.title}</p>
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
                    {project.implementing_agency || "Not specified"}
                  </td>

                  <td className="px-3 py-4">
                    {project.funding_source || "Not specified"}
                  </td>

                  <td className="px-3 py-4">
                    <span
                      className={`rounded-md px-3 py-1 text-xs font-bold ${getStatusClass(
                        project.status
                      )}`}
                    >
                      {project.status_display ||
                        getOptionLabel(statusOptions, project.status)}
                    </span>
                  </td>

                  <td className="px-3 py-4">
                    <span
                      className={`rounded-md px-3 py-1 text-xs font-bold ${getPriorityClass(
                        project.priority
                      )}`}
                    >
                      {project.priority_display ||
                        getOptionLabel(priorityOptions, project.priority)}
                    </span>
                  </td>

                  <td className="px-3 py-4">
                    {formatMoney(project.estimated_budget_naira, 0)}
                  </td>

                  <td className="px-3 py-4">
                    {formatNumber(project.expected_ghg_reduction_tco2e, 3)}{" "}
                    tCO₂e
                  </td>

                  <td className="px-3 py-4">
                    {formatNumber(project.expected_beneficiaries, 0)}
                  </td>

                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onViewProject(project)}
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-bold text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
                      >
                        View
                      </button>

                      {canManage && (
                        <button
                          type="button"
                          onClick={() => onEditProject(project)}
                          className="rounded-md bg-[#009B35] px-3 py-1 text-xs font-bold text-white transition hover:bg-[#00842e]"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredProjects.length === 0 && (
                <tr>
                  <td
                    colSpan={12}
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
    </CommandSection>
  );
}

export default function ProjectPortfolioPage({ currentUser }) {
  const [projectsData, setProjectsData] = useState(null);
  const [lgaOptions, setLgaOptions] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingProject, setEditingProject] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const [filters, setFilters] = useState({
    project_type: "all",
    sector: "all",
    status: "all",
    priority: "all",
    lga: "",
    implementing_agency: "",
    funding_source: "",
    search: "",
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canManage = canManageProjectPortfolio(currentUser);

  const tabs = useMemo(() => {
    return canManage ? [...baseTabs, formTab] : baseTabs;
  }, [canManage]);

  async function loadProjects() {
    setIsLoading(true);
    setError("");

    try {
      const params = {};

      const serverFilterKeys = [
        "project_type",
        "sector",
        "status",
        "priority",
        "lga",
      ];

      Object.entries(filters).forEach(([key, value]) => {
        if (serverFilterKeys.includes(key) && value && value !== "all") {
          params[key] = value;
        }
      });

      const data = await getClimateProjects(params);
      setProjectsData(data);

      if (selectedProject) {
        const refreshedProject = (data.results || []).find(
          (project) => project.id === selectedProject.id
        );

        setSelectedProject(refreshedProject || null);
      }
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
    const implementingAgency = filters.implementing_agency.trim().toLowerCase();
    const fundingSource = filters.funding_source.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesSearch =
        !search ||
        String(project.title || "").toLowerCase().includes(search) ||
        String(project.project_code || "").toLowerCase().includes(search) ||
        String(project.implementing_agency || "")
          .toLowerCase()
          .includes(search) ||
        String(project.funding_source || "").toLowerCase().includes(search) ||
        String(project.lga_name || "").toLowerCase().includes(search) ||
        String(project.sector_display || "").toLowerCase().includes(search);

      const matchesImplementingAgency =
        !implementingAgency ||
        String(project.implementing_agency || "")
          .toLowerCase()
          .includes(implementingAgency);

      const matchesFundingSource =
        !fundingSource ||
        String(project.funding_source || "")
          .toLowerCase()
          .includes(fundingSource);

      return matchesSearch && matchesImplementingAgency && matchesFundingSource;
    });
  }, [
    projects,
    filters.search,
    filters.implementing_agency,
    filters.funding_source,
  ]);

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

  function resetForm() {
    setForm(initialForm);
    setEditingProject(null);
  }

  function startCreateProject() {
    setEditingProject(null);
    setForm(initialForm);
    setMessage("");
    setError("");
    setActiveTab("form");
  }

  function handleEditProject(project) {
    setEditingProject(project);
    setSelectedProject(project);
    setForm(buildFormFromProject(project));
    setMessage("");
    setError("");
    setActiveTab("form");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function handleViewProject(project) {
    setSelectedProject(project);
    setActiveTab("overview");
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
      if (editingProject) {
        const result = await updateClimateProject(editingProject.id, payload);

        setMessage("Climate project updated successfully.");
        setSelectedProject(result.project);
      } else {
        const result = await createClimateProject(payload);

        setMessage("Climate project created successfully.");
        setSelectedProject(result.project);
      }

      setForm(initialForm);
      setEditingProject(null);
      await loadProjects();
      setActiveTab("register");
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : editingProject
            ? "Could not update climate project."
            : "Could not create climate project."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <CommandPageHeader
        title="Climate Project Portfolio"
        description="Register, track and summarize climate projects across LGAs, sectors, mitigation outcomes, adaptation relevance, budgets and beneficiaries."
        actions={
          <div className="flex flex-wrap gap-3">
            <CommandButton variant="outline" onClick={loadProjects}>
              Refresh Projects
            </CommandButton>

            {canManage && (
              <CommandButton onClick={startCreateProject}>
                Add Project
              </CommandButton>
            )}
          </div>
        }
      />

      {error && (
        <CommandNotice title="Project portfolio error" tone="red">
          {error}
        </CommandNotice>
      )}

      {message && (
        <CommandNotice title="Project portfolio update" tone="green">
          {message}
        </CommandNotice>
      )}

      <ProjectSummaryCards summary={summary} />

      <div className="sticky top-24 z-10">
        <CommandTabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === "overview" && (
        <PortfolioOverview
          projects={filteredProjects}
          selectedProject={selectedProject}
          canManage={canManage}
          onEditProject={handleEditProject}
          onClearSelectedProject={() => setSelectedProject(null)}
          setActiveTab={setActiveTab}
        />
      )}

      {activeTab === "map" && (
        <CommandSection
          title="Climate projects by LGA"
          description="Spatial view of project concentration across Kaduna LGAs."
        >
          <ProjectPortfolioMapView projects={projects} />
        </CommandSection>
      )}

      {activeTab === "board" && (
        <CommandSection
          title="Portfolio Implementation Board"
          description="View projects by implementation status and track movement from proposed concepts to completed climate action."
        >
          <ProjectPortfolioStatusBoard
            projects={filteredProjects}
            canManage={canManage}
            onViewProject={handleViewProject}
            onEditProject={handleEditProject}
          />
        </CommandSection>
      )}

      {activeTab === "import_export" && (
        <div className="space-y-6">
          <ProjectPortfolioImportPanel
            canManage={canManage}
            onImported={loadProjects}
          />

          <ProjectPortfolioExportPanel
            projects={projects}
            filteredProjects={filteredProjects}
            summary={summary}
          />
        </div>
      )}

      {activeTab === "register" && (
        <ProjectRegisterSection
          filters={filters}
          updateFilter={updateFilter}
          lgaOptions={lgaOptions}
          filteredProjects={filteredProjects}
          selectedProject={selectedProject}
          isLoading={isLoading}
          canManage={canManage}
          onViewProject={handleViewProject}
          onEditProject={handleEditProject}
        />
      )}

      {activeTab === "form" && (
        <ProjectFormSection
          form={form}
          updateForm={updateForm}
          editingProject={editingProject}
          isSaving={isSaving}
          canManage={canManage}
          lgaOptions={lgaOptions}
          onSubmit={handleSubmit}
          onCancel={() => {
            resetForm();
            setActiveTab("overview");
          }}
        />
      )}
    </div>
  );
}