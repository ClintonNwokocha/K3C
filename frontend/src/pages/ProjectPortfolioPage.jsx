import { useEffect, useMemo, useState } from "react";
import ProjectPortfolioExportPanel from "../components/ProjectPortfolioExportPanel";
import ProjectPortfolioStatusBoard from "../components/ProjectPortfolioStatusBoard";
import ProjectPortfolioMapView from "../components/ProjectPortfolioMapView";
import ProjectPortfolioImportPanel from "../components/ProjectPortfolioImportPanel";
import {
  CommandBadge,
  CommandButton,
  CommandNotice,
  CommandPageHeader,
  CommandSection,
  CommandStatCard,
  CommandTabs,
} from "../components/CommandUI";
import { ChartDonut } from "../components/CommandCharts";
import { canManageProjectPortfolio } from "../utils/permissions";
import { readProjectPathwayContext, matchesContributingProject } from "../utils/projectPathwayContext.js";
import ProjectPathwayNotice from "../components/ProjectPathwayNotice";
import {
  createClimateProject,
  createProjectProgressUpdate,
  getClimateProjects,
  getClimateRiskProfiles,
  getProjectGhgSectorSummary,
  getProjectProgressUpdates,
  updateClimateProject,
} from "../services/api";

const SDG_GOALS = Array.from({ length: 17 }, (_, index) => index + 1);

const RAG_LABELS = {
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
  not_assessed: "Not Assessed",
};

const RAG_TONES = {
  on_track: "success",
  at_risk: "warning",
  off_track: "danger",
  not_assessed: "neutral",
};

function RagBadge({ status: ragStatus }) {
  return (
    <CommandBadge tone={RAG_TONES[ragStatus] || RAG_TONES.not_assessed}>
      {RAG_LABELS[ragStatus] || "Not Assessed"}
    </CommandBadge>
  );
}

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

const ghgSectorOptions = [
  { value: "energy", label: "Energy" },
  { value: "agriculture", label: "Agriculture" },
  { value: "lulucf", label: "LULUCF" },
  { value: "ippu", label: "IPPU" },
  { value: "waste", label: "Waste" },
  { value: "not_assessed", label: "Not Assessed" },
];

const ghgImpactTypeOptions = [
  { value: "emission_reduction", label: "Emission Reduction" },
  { value: "avoided_emissions", label: "Avoided Emissions" },
  { value: "carbon_removal", label: "Carbon Removal" },
  { value: "mixed_reduction_removal", label: "Mixed Reduction + Removal" },
  { value: "not_assessed", label: "Not Assessed" },
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
  external_link: "",
  latitude: "",
  longitude: "",
  climate_risk_relevance: "",
  location_notes: "",
  sdg_goals: [],
  ndc_linkage_reference: "",
  climate_action_context: "",
  primary_ghg_sector: "not_assessed",
  ghg_impact_type: "not_assessed",
  expected_annual_ghg_impact_tco2e: "",
  verified_annual_ghg_impact_tco2e: "",
  ghg_methodology: "",
  ghg_monitoring_indicator: "",
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

// Unlike other project metrics, GHG impact fields are nullable by design:
// null means "never quantified", which must never render the same as a
// real 0. Callers should not fall back to formatNumber() for these fields.
function formatNullableGhgValue(value) {
  return value === null || value === undefined
    ? null
    : `${formatNumber(value, 3)} tCO₂e/year`;
}

// Maps the existing status/priority taxonomy onto CommandBadge/ChartDonut's
// tone/colour vocabulary - the classifications and labels themselves are
// unchanged (statusOptions/priorityOptions above remain the single source
// of truth).
function statusToTone(status) {
  if (status === "completed") return "success";
  if (status === "ongoing") return "info";
  if (status === "planned") return "accent";
  if (status === "suspended") return "warning";
  if (status === "cancelled") return "danger";
  return "neutral";
}

function priorityToTone(priority) {
  if (priority === "very_high") return "danger";
  if (priority === "high") return "warning";
  if (priority === "medium") return "accent";
  return "success";
}

// Same real taxonomy/colours already used for this status distribution on
// the Executive Dashboard (Dashboard.jsx) - kept consistent across both
// dashboards rather than inventing a second palette for the same statuses.
const PROJECT_STATUS_DONUT_COLORS = {
  proposed: "#74809A",
  planned: "#E9FF35",
  ongoing: "#080D52",
  completed: "#078B4B",
  suspended: "#ea580c",
  cancelled: "#dc2626",
};

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
    external_link: project.external_link || "",
    latitude: project.latitude !== null && project.latitude !== undefined ? String(project.latitude) : "",
    longitude: project.longitude !== null && project.longitude !== undefined ? String(project.longitude) : "",
    climate_risk_relevance: project.climate_risk_relevance || "",
    location_notes: project.location_notes || "",
    sdg_goals: Array.isArray(project.sdg_goals) ? project.sdg_goals : [],
    ndc_linkage_reference: project.ndc_linkage_reference || "",
    climate_action_context: project.climate_action_context || "",
    primary_ghg_sector: project.primary_ghg_sector || "not_assessed",
    ghg_impact_type: project.ghg_impact_type || "not_assessed",
    expected_annual_ghg_impact_tco2e:
      project.expected_annual_ghg_impact_tco2e !== null &&
      project.expected_annual_ghg_impact_tco2e !== undefined
        ? String(project.expected_annual_ghg_impact_tco2e)
        : "",
    verified_annual_ghg_impact_tco2e:
      project.verified_annual_ghg_impact_tco2e !== null &&
      project.verified_annual_ghg_impact_tco2e !== undefined
        ? String(project.verified_annual_ghg_impact_tco2e)
        : "",
    ghg_methodology: project.ghg_methodology || "",
    ghg_monitoring_indicator: project.ghg_monitoring_indicator || "",
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

function PortfolioAnalyticsSummary({ summary }) {
  const bySector = summary.by_sector || [];
  const byLga = summary.by_lga || [];
  const byFundingSource = summary.by_funding_source || [];
  const averageRate = summary.average_implementation_rate;
  const assessedCount = summary.assessed_project_count || 0;
  const offTrackCount = summary.off_track_count || 0;
  const atRiskCount = summary.at_risk_count || 0;

  return (
    <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Sector Distribution
        </p>
        <div className="mt-3 space-y-1.5">
          {bySector.slice(0, 5).map((row) => (
            <div key={row.sector} className="flex items-center justify-between text-sm">
              <span className="truncate text-[#030454]">
                {getOptionLabel(sectorOptions, row.sector)}
              </span>
              <span className="font-black text-[#030454]">{row.count}</span>
            </div>
          ))}
          {bySector.length === 0 && (
            <p className="text-xs text-slate-400">No data yet.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Geographic Spread
        </p>
        <div className="mt-3 space-y-1.5">
          {byLga.slice(0, 5).map((row) => (
            <div key={row.lga_name} className="flex items-center justify-between text-sm">
              <span className="truncate text-[#030454]">{row.lga_name}</span>
              <span className="font-black text-[#030454]">{row.count}</span>
            </div>
          ))}
          {byLga.length === 0 && (
            <p className="text-xs text-slate-400">No data yet.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Financing Source Mix
        </p>
        <div className="mt-3 space-y-1.5">
          {byFundingSource.slice(0, 5).map((row) => (
            <div
              key={row.funding_source}
              className="flex items-center justify-between text-sm"
            >
              <span className="truncate text-[#030454]">{row.funding_source}</span>
              <span className="font-black text-[#030454]">{row.count}</span>
            </div>
          ))}
          {byFundingSource.length === 0 && (
            <p className="text-xs text-slate-400">No data yet.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Average Implementation Rate
        </p>
        <p className="mt-3 text-3xl font-black text-[#030454]">
          {averageRate != null ? `${formatNumber(averageRate, 2)}%` : "Not available"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Based on {assessedCount} project{assessedCount === 1 ? "" : "s"} with reported
          progress. Projects without a progress update are not counted as 0%.
        </p>

        {(offTrackCount > 0 || atRiskCount > 0) && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-red-700">
              Attention Required
            </p>
            <p className="mt-1 text-xs text-red-700">
              {offTrackCount} off track · {atRiskCount} at risk
            </p>
          </div>
        )}
      </div>
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

function ProjectProgressSection({ project, canManage, onProgressAdded }) {
  const [updates, setUpdates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState({
    reporting_date: "",
    physical_completion_pct: "",
    financial_disbursement_naira: "",
    progress_notes: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // No setIsLoading(true) here: isLoading already starts true (see
    // useState above), and this effect is mount-only — the parent remounts
    // this component fresh (via key={project.id}) whenever the selected
    // project changes, so the initial value is always correct already.
    let cancelled = false;

    getProjectProgressUpdates(project.id)
      .then((data) => {
        if (!cancelled) {
          setUpdates(data.results || []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setUpdates([]);
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
    // Mount-only per project — the parent keys this component on
    // project.id, so a fresh instance always fetches the current project's
    // own progress history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddProgress(event) {
    event.preventDefault();

    setIsSaving(true);
    setError("");

    try {
      const data = await createProjectProgressUpdate(project.id, {
        reporting_date: formState.reporting_date,
        physical_completion_pct: Number(formState.physical_completion_pct || 0),
        financial_disbursement_naira: Number(
          formState.financial_disbursement_naira || 0
        ),
        progress_notes: formState.progress_notes,
      });

      setUpdates((current) => [data.progress_update, ...current]);
      setFormState({
        reporting_date: "",
        physical_completion_pct: "",
        financial_disbursement_naira: "",
        progress_notes: "",
      });
      setShowForm(false);

      if (onProgressAdded) {
        await onProgressAdded();
      }
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data
          ? JSON.stringify(err.response.data)
          : "Could not save progress update."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-black text-[#030454]">Progress Updates</p>

        {canManage && (
          <CommandButton
            variant="outline"
            onClick={() => setShowForm((current) => !current)}
          >
            {showForm ? "Cancel" : "Add Progress Update"}
          </CommandButton>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {showForm && (
        <form
          onSubmit={handleAddProgress}
          className="mt-4 grid gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4 sm:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-xs font-bold text-[#030454]">
              Reporting Date
            </label>
            <input
              type="date"
              required
              value={formState.reporting_date}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  reporting_date: event.target.value,
                }))
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-[#030454]">
              Physical Completion %
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={formState.physical_completion_pct}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  physical_completion_pct: event.target.value,
                }))
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-[#030454]">
              Amount Disbursed (₦)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formState.financial_disbursement_naira}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  financial_disbursement_naira: event.target.value,
                }))
              }
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-bold text-[#030454]">
              Notes
            </label>
            <textarea
              rows="2"
              value={formState.progress_notes}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  progress_notes: event.target.value,
                }))
              }
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <CommandButton type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Progress Update"}
            </CommandButton>
          </div>
        </form>
      )}

      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading progress updates...</p>
        ) : updates.length === 0 ? (
          <p className="text-sm text-slate-500">
            No progress updates recorded yet for this project.
          </p>
        ) : (
          <div className="space-y-2">
            {updates.map((update) => (
              <div
                key={update.id}
                className="rounded-lg border border-slate-100 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-[#030454]">
                    {update.reporting_date}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatNumber(update.physical_completion_pct, 2)}% complete ·{" "}
                    {formatMoney(update.financial_disbursement_naira, 0)} disbursed
                  </span>
                </div>
                {update.progress_notes && (
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {update.progress_notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SelectedProjectDetail({
  selectedProject,
  canManage,
  onEditProject,
  onClear,
  onProgressAdded,
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
        <div className="flex flex-wrap items-center gap-3">
          <RagBadge status={selectedProject.performance_status} />

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

        <InfoTile
          label="Physical Completion"
          value={
            selectedProject.latest_physical_completion_pct != null
              ? `${formatNumber(selectedProject.latest_physical_completion_pct, 2)}%`
              : "Not yet reported"
          }
        />

        <InfoTile
          label="Financial Disbursement"
          value={
            selectedProject.latest_financial_disbursement_naira != null
              ? formatMoney(selectedProject.latest_financial_disbursement_naira, 0)
              : "Not yet reported"
          }
        />

        <InfoTile
          label="Disbursement %"
          value={
            selectedProject.budget_disbursement_pct != null
              ? `${formatNumber(selectedProject.budget_disbursement_pct, 2)}%`
              : "Not available"
          }
        />

        <InfoTile
          label="Latest Reporting Date"
          value={selectedProject.latest_progress_date || "Not yet reported"}
        />
      </div>

      {selectedProject.sdg_goals?.length > 0 && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="font-black text-[#030454]">SDG Goals</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedProject.sdg_goals.map((goal) => (
              <span
                key={goal}
                className="rounded-md bg-[#030454]/10 px-2.5 py-1 text-xs font-bold text-[#030454]"
              >
                SDG {goal}
              </span>
            ))}
          </div>
        </div>
      )}

      {selectedProject.ndc_linkage_reference && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="font-black text-[#030454]">NDC Linkage</p>
          <p className="mt-2 leading-6 text-slate-600">
            {selectedProject.ndc_linkage_reference}
          </p>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p className="font-black text-[#030454]">Climate & GHG Linkage</p>

        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <InfoTile
            label="Primary GHG Sector"
            value={
              selectedProject.primary_ghg_sector_display ||
              getOptionLabel(ghgSectorOptions, selectedProject.primary_ghg_sector)
            }
            muted
          />

          <InfoTile
            label="GHG Impact Type"
            value={
              selectedProject.ghg_impact_type_display ||
              getOptionLabel(ghgImpactTypeOptions, selectedProject.ghg_impact_type)
            }
            muted
          />

          <InfoTile
            label="Expected Annual GHG Impact"
            value={
              formatNullableGhgValue(selectedProject.expected_annual_ghg_impact_tco2e) ||
              "Not assessed"
            }
          />

          <InfoTile
            label="Verified Annual GHG Impact"
            value={
              formatNullableGhgValue(selectedProject.verified_annual_ghg_impact_tco2e) ||
              "Not independently verified"
            }
          />
        </div>

        {selectedProject.climate_action_context && (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              Climate Action Context
            </p>
            <p className="mt-1 leading-6 text-slate-600">
              {selectedProject.climate_action_context}
            </p>
          </div>
        )}

        {selectedProject.ghg_methodology && (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              Methodology / Evidence
            </p>
            <p className="mt-1 leading-6 text-slate-600">
              {selectedProject.ghg_methodology}
            </p>
          </div>
        )}

        {selectedProject.ghg_monitoring_indicator && (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              Monitoring Indicator
            </p>
            <p className="mt-1 leading-6 text-slate-600">
              {selectedProject.ghg_monitoring_indicator}
            </p>
          </div>
        )}
      </div>

      {selectedProject.climate_risk_relevance && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="font-black text-[#030454]">Climate Intelligence Relevance</p>
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

      <ProjectProgressSection
        key={selectedProject.id}
        project={selectedProject}
        canManage={canManage}
        onProgressAdded={onProgressAdded}
      />
    </CommandSection>
  );
}

function GhgSectorPipelinePanel({ summary, loading, error }) {
  return (
    <CommandSection
      title="GHG sector mitigation pipeline"
      description="How registered projects roll up into the five GHG inventory sectors. Modelled/self-reported project figures only — never subtracted from the statewide GHG inventory."
    >
      {loading && (
        <p className="text-sm text-slate-500">Loading GHG sector pipeline...</p>
      )}

      {!loading && error && (
        <p className="text-sm text-red-600">
          Project mitigation summary is currently unavailable.
        </p>
      )}

      {!loading && !error && summary && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-2 font-bold">Sector</th>
                  <th className="px-3 py-2 font-bold">Projects</th>
                  <th className="px-3 py-2 font-bold">Concept</th>
                  <th className="px-3 py-2 font-bold">Ongoing</th>
                  <th className="px-3 py-2 font-bold">Completed</th>
                  <th className="px-3 py-2 font-bold">Expected (tCO₂e/yr)</th>
                  <th className="px-3 py-2 font-bold">Verified (tCO₂e/yr)</th>
                  <th className="px-3 py-2 font-bold">Not Yet Quantified</th>
                </tr>
              </thead>
              <tbody>
                {summary.sectors.map((row) => (
                  <tr key={row.sector} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-black text-[#030454]">
                      {row.sector_display}
                    </td>
                    <td className="px-3 py-3">{row.project_count}</td>
                    <td className="px-3 py-3">{row.concept_count}</td>
                    <td className="px-3 py-3">{row.ongoing_count}</td>
                    <td className="px-3 py-3">{row.completed_count}</td>
                    <td className="px-3 py-3">
                      {row.expected_annual_impact_tco2e != null
                        ? formatNumber(row.expected_annual_impact_tco2e, 3)
                        : "Not assessed"}
                    </td>
                    <td className="px-3 py-3">
                      {row.verified_annual_impact_tco2e != null
                        ? formatNumber(row.verified_annual_impact_tco2e, 3)
                        : "Not verified"}
                    </td>
                    <td className="px-3 py-3">{row.unassessed_impact_project_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            {summary.unassessed_sector_project_count} project
            {summary.unassessed_sector_project_count === 1 ? "" : "s"} have no GHG
            sector assigned yet and are excluded from the sectors above.
          </p>
        </>
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
  onProgressAdded,
  setActiveTab,
  ghgSummary,
  ghgSummaryLoading,
  ghgSummaryError,
}) {
  const statusCounts = useMemo(() => getStatusCounts(projects), [projects]);

  return (
    <div className="space-y-6">
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
            <CommandButton
              variant="outline"
              onClick={() => setActiveTab("map")}
            >
              Open Map
            </CommandButton>

            <CommandButton
              variant="outline"
              onClick={() => setActiveTab("board")}
            >
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
          onProgressAdded={onProgressAdded}
        />
      </div>

      <CommandSection
        title="Project status distribution"
        description="Proportional breakdown of the projects currently in view by implementation status."
      >
        {projects.length === 0 ? (
          <p className="text-sm text-slate-500">
            No projects in the current view.
          </p>
        ) : (
          <ChartDonut
            data={statusOptions
              .filter((item) => statusCounts[item.value] > 0)
              .map((item) => ({
                label: item.label,
                value: statusCounts[item.value],
                color: PROJECT_STATUS_DONUT_COLORS[item.value],
              }))}
          />
        )}
      </CommandSection>

      <GhgSectorPipelinePanel
        summary={ghgSummary}
        loading={ghgSummaryLoading}
        error={ghgSummaryError}
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
          <p className="md:col-span-3 text-[11px] font-black uppercase tracking-[0.14em] text-[#009B35]">
            Project Identity
          </p>

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

          <p className="md:col-span-3 mt-2 border-t border-slate-100 pt-4 text-[11px] font-black uppercase tracking-[0.14em] text-[#009B35]">
            Classification
          </p>

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

          <p className="md:col-span-3 mt-2 border-t border-slate-100 pt-4 text-[11px] font-black uppercase tracking-[0.14em] text-[#009B35]">
            Implementation
          </p>

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

          <p className="md:col-span-3 mt-2 border-t border-slate-100 pt-4 text-[11px] font-black uppercase tracking-[0.14em] text-[#009B35]">
            Impact
          </p>

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

          <p className="md:col-span-3 mt-2 border-t border-slate-100 pt-4 text-[11px] font-black uppercase tracking-[0.14em] text-[#009B35]">
            Media / References
          </p>

          <div className="md:col-span-3">
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              External Link
            </label>
            <input
              type="url"
              value={form.external_link}
              onChange={(event) =>
                updateForm("external_link", event.target.value)
              }
              className={inputClass}
              placeholder="https://... (optional project resource, donor page or report)"
            />
            <p className="mt-2 text-xs text-slate-500">
              Project pictures are managed in the Django admin project record.
            </p>
          </div>

          <p className="md:col-span-3 mt-2 border-t border-slate-100 pt-4 text-[11px] font-black uppercase tracking-[0.14em] text-[#009B35]">
            Spatial
          </p>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              Latitude
            </label>
            <input
              type="number"
              step="0.000001"
              min="-90"
              max="90"
              value={form.latitude}
              onChange={(event) => updateForm("latitude", event.target.value)}
              className={inputClass}
              placeholder="e.g. 10.5105"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              Longitude
            </label>
            <input
              type="number"
              step="0.000001"
              min="-180"
              max="180"
              value={form.longitude}
              onChange={(event) => updateForm("longitude", event.target.value)}
              className={inputClass}
              placeholder="e.g. 7.4165"
            />
          </div>

          <p className="md:col-span-3 mt-2 border-t border-slate-100 pt-4 text-[11px] font-black uppercase tracking-[0.14em] text-[#009B35]">
            Additional Context
          </p>

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

          <div className="md:col-span-3">
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              SDG Goals
            </label>
            <div className="flex flex-wrap gap-2">
              {SDG_GOALS.map((goal) => {
                const checked = form.sdg_goals.includes(goal);
                return (
                  <button
                    key={goal}
                    type="button"
                    onClick={() =>
                      updateForm(
                        "sdg_goals",
                        checked
                          ? form.sdg_goals.filter((item) => item !== goal)
                          : [...form.sdg_goals, goal].sort((a, b) => a - b)
                      )
                    }
                    className={`h-9 w-9 rounded-md border text-xs font-black transition ${
                      checked
                        ? "border-[#009B35] bg-[#009B35] text-white"
                        : "border-slate-200 bg-white text-[#030454] hover:border-[#009B35]"
                    }`}
                    title={`SDG ${goal}`}
                  >
                    {goal}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              NDC Linkage Reference
            </label>
            <input
              value={form.ndc_linkage_reference}
              onChange={(event) =>
                updateForm("ndc_linkage_reference", event.target.value)
              }
              className={inputClass}
              placeholder="e.g. Unconditional target — Agriculture sector mitigation"
            />
          </div>

          <p className="md:col-span-3 mt-2 border-t border-slate-100 pt-4 text-[11px] font-black uppercase tracking-[0.14em] text-[#009B35]">
            Climate & GHG Linkage
          </p>

          <div className="md:col-span-3">
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              Climate Action Context
            </label>
            <textarea
              rows="2"
              value={form.climate_action_context}
              onChange={(event) =>
                updateForm("climate_action_context", event.target.value)
              }
              className={inputClass}
              placeholder="e.g. Vegetation stress and drought conditions in Kachia"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              Primary GHG Sector
            </label>
            <select
              value={form.primary_ghg_sector}
              onChange={(event) =>
                updateForm("primary_ghg_sector", event.target.value)
              }
              className={inputClass}
            >
              {ghgSectorOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              GHG Impact Type
            </label>
            <select
              value={form.ghg_impact_type}
              onChange={(event) =>
                updateForm("ghg_impact_type", event.target.value)
              }
              className={inputClass}
            >
              {ghgImpactTypeOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              Expected Annual GHG Impact (tCO₂e/year)
            </label>
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.expected_annual_ghg_impact_tco2e}
              onChange={(event) =>
                updateForm("expected_annual_ghg_impact_tco2e", event.target.value)
              }
              className={inputClass}
              placeholder="Leave blank if not assessed"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              Verified Annual GHG Impact (tCO₂e/year)
            </label>
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.verified_annual_ghg_impact_tco2e}
              onChange={(event) =>
                updateForm("verified_annual_ghg_impact_tco2e", event.target.value)
              }
              className={inputClass}
              placeholder="Leave blank unless independently verified"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              Methodology / Evidence
            </label>
            <textarea
              rows="2"
              value={form.ghg_methodology}
              onChange={(event) =>
                updateForm("ghg_methodology", event.target.value)
              }
              className={inputClass}
              placeholder="Basis for the expected/verified figures above, if any..."
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-[#030454]">
              Monitoring Indicator
            </label>
            <textarea
              rows="2"
              value={form.ghg_monitoring_indicator}
              onChange={(event) =>
                updateForm("ghg_monitoring_indicator", event.target.value)
              }
              className={inputClass}
              placeholder="How this project's GHG performance is tracked, if at all..."
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
                    <CommandBadge tone={statusToTone(project.status)}>
                      {project.status_display ||
                        getOptionLabel(statusOptions, project.status)}
                    </CommandBadge>
                  </td>

                  <td className="px-3 py-4">
                    <CommandBadge tone={priorityToTone(project.priority)}>
                      {project.priority_display ||
                        getOptionLabel(priorityOptions, project.priority)}
                    </CommandBadge>
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

export default function ProjectPortfolioPage({
  currentUser,
  sharedLgaId,
  sharedLgaName,
}) {
  const [pathwayContext] = useState(() => readProjectPathwayContext(window.location.search));
  const [projectsData, setProjectsData] = useState(null);
  const [lgaOptions, setLgaOptions] = useState([]);
  const [ghgSummary, setGhgSummary] = useState(null);
  const [ghgSummaryLoading, setGhgSummaryLoading] = useState(true);
  const [ghgSummaryError, setGhgSummaryError] = useState("");

  const [form, setForm] = useState(() => ({
    ...initialForm,
    project_type: pathwayContext.projectType || initialForm.project_type,
    sector: pathwayContext.sector || initialForm.sector,
    climate_risk_relevance: pathwayContext.recommendation
      ? `Suggested action: ${pathwayContext.recommendation}; ${pathwayContext.lga}; ${pathwayContext.indicator}; ${pathwayContext.year}; ${pathwayContext.period}; ${pathwayContext.season}. Requires assessment.`
      : initialForm.climate_risk_relevance,
  }));
  const [editingProject, setEditingProject] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeTab, setActiveTab] = useState(pathwayContext.register ? "form" : "overview");

  // Lazy initializer only: this page remounts fresh whenever the user
  // navigates to "projects" (App.jsx swaps the rendered page component
  // entirely), so this always picks up the latest inherited LGA without
  // needing an effect that could fight the user's own filter changes.
  const [filters, setFilters] = useState(() => ({
    project_type: "all",
    sector: pathwayContext.sector || "all",
    status: "all",
    priority: "all",
    lga: sharedLgaId ? String(sharedLgaId) : "",
    implementing_agency: "",
    funding_source: "",
    search: "",
  }));

  const [isLoadingState, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const projectsRequestKey = [
    filters.project_type,
    filters.sector,
    filters.status,
    filters.priority,
    filters.lga,
  ].join("|");
  const [settledProjectsRequestKey, setSettledProjectsRequestKey] = useState(null);
  const isLoading = isLoadingState || settledProjectsRequestKey !== projectsRequestKey;

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

  useEffect(() => {
    let cancelled = false;

    getClimateRiskProfiles({})
      .then((data) => {
        if (cancelled) return;

        const options =
          data?.results?.map((profile) => ({
            lga_id: profile.lga,
            lga_name: profile.lga_name,
          })) || [];

        const uniqueOptions = Array.from(
          new Map(options.map((item) => [item.lga_id, item])).values()
        ).sort((a, b) => a.lga_name.localeCompare(b.lga_name));

        setLgaOptions(uniqueOptions);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setLgaOptions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Only reachable once the user is authenticated (this whole page sits
  // behind the internal command-console login), matching the backend's
  // IsAuthenticated-only gate on /portfolio/projects/ghg-summary/.
  useEffect(() => {
    let cancelled = false;

    getProjectGhgSectorSummary()
      .then((data) => {
        if (!cancelled) {
          setGhgSummary(data);
          setGhgSummaryError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setGhgSummaryError("Could not load GHG sector mitigation pipeline.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGhgSummaryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Used after a project save: refreshes the pipeline without touching
  // ghgSummaryLoading, so an already-populated panel never flashes back
  // to "Loading..." — a failure here only sets the error flag, it never
  // clears a previously-loaded summary.
  function refreshGhgSummary() {
    getProjectGhgSectorSummary()
      .then((data) => {
        setGhgSummary(data);
        setGhgSummaryError("");
      })
      .catch((err) => {
        console.error(err);
        setGhgSummaryError("Could not load GHG sector mitigation pipeline.");
      });
  }

  useEffect(() => {
    let cancelled = false;
    const key = projectsRequestKey;

    const params = {};
    const serverFilterKeys = ["project_type", "sector", "status", "priority", "lga"];

    Object.entries(filters).forEach(([field, value]) => {
      if (serverFilterKeys.includes(field) && value && value !== "all") {
        params[field] = value;
      }
    });

    getClimateProjects(params)
      .then((data) => {
        if (cancelled) return;

        setProjectsData(data);
        setError("");

        setSelectedProject((current) => {
          if (!current) return current;
          const refreshed = (data.results || []).find(
            (project) => project.id === current.id
          );
          return refreshed || null;
        });
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setError("Could not load project portfolio.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSettledProjectsRequestKey(key);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsRequestKey]);

  const projects = useMemo(() => projectsData?.results || [], [projectsData]);
  const summary = projectsData?.summary || {};

  const filteredProjects = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const implementingAgency = filters.implementing_agency.trim().toLowerCase();
    const fundingSource = filters.funding_source.trim().toLowerCase();

    return projects.filter((project) => {
      if (!matchesContributingProject(project, pathwayContext)) return false;
      if (!sharedLgaId && pathwayContext.lga && String(project.lga_name || "").toLowerCase() !== pathwayContext.lga.toLowerCase()) return false;
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
    pathwayContext,
    sharedLgaId,
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
      external_link: form.external_link.trim() || null,
      latitude: form.latitude !== "" ? Number(form.latitude) : null,
      longitude: form.longitude !== "" ? Number(form.longitude) : null,
      expected_annual_ghg_impact_tco2e:
        form.expected_annual_ghg_impact_tco2e !== ""
          ? Number(form.expected_annual_ghg_impact_tco2e)
          : null,
      verified_annual_ghg_impact_tco2e:
        form.verified_annual_ghg_impact_tco2e !== ""
          ? Number(form.verified_annual_ghg_impact_tco2e)
          : null,
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
      refreshGhgSummary();
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
        title="Project Portfolio"
        description="Climate project implementation, geographic distribution, and portfolio performance."
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

      <ProjectPathwayNotice context={pathwayContext} />
      {sharedLgaId != null && filters.lga === String(sharedLgaId) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#009B35]/30 bg-[#009B35]/5 px-5 py-3 text-sm text-[#030454]">
          <span>
            Viewing: <strong>{sharedLgaName || "Selected LGA"}</strong> — inherited from Climate Risk.
          </span>
          <button
            type="button"
            onClick={() => setFilters((current) => ({ ...current, lga: "" }))}
            className="text-xs font-bold uppercase tracking-[0.08em] text-[#030454] underline hover:text-[#009B35]"
          >
            Clear LGA filter
          </button>
        </div>
      )}

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

      <PortfolioAnalyticsSummary summary={summary} />

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
          onProgressAdded={loadProjects}
          setActiveTab={setActiveTab}
          ghgSummary={ghgSummary}
          ghgSummaryLoading={ghgSummaryLoading}
          ghgSummaryError={ghgSummaryError}
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
