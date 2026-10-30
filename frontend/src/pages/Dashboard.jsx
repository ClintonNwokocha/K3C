import { useState } from "react";
import {
  Activity,
  ArrowRight,
  CloudSun,
  Database,
  FileText,
  FolderKanban,
  Globe2,
  Leaf,
  RefreshCw,
} from "lucide-react";
import ExecutiveClimateRiskSummary from "../components/ExecutiveClimateRiskSummary";
import ExecutiveProjectPortfolioSummary from "../components/ExecutiveProjectPortfolioSummary";
import ExecutiveReportsSummary from "../components/ExecutiveReportsSummary";
import DashboardCommandMetricsRow from "../components/DashboardCommandMetricsRow";
import DashboardClimateAtlasDatasets from "../components/DashboardClimateAtlasDatasets";
import DashboardRecentInsights from "../components/DashboardRecentInsights";
import ExecutiveGHGInventorySummary from "../components/ExecutiveGHGInventorySummary";
import { useExecutiveDashboardData } from "../hooks/useExecutiveDashboardData";
import { CommandBadge, CommandSection } from "../components/CommandUI";
import { ChartBarRow, ChartDonut } from "../components/CommandCharts";

// Mirrors the same risk_level groupings already used by the existing
// Climate Intelligence classification (see DashboardRecentInsights'
// getRiskClass) - this only maps that same meaning onto ChartBarRow's tone
// vocabulary, it does not introduce a new risk methodology.
function riskLevelToTone(level) {
  if (level === "very_high" || level === "high") return "danger";
  if (level === "moderate") return "warning";
  return "success";
}

// Real taxonomy from ClimateProject.Status (backend/projects/models.py) and
// the colours already associated with each status elsewhere in the app
// (RagBadge / getProjectStatusClass: ongoing=navy, completed=green,
// planned=gold). Suspended/cancelled have no existing chart colour, so they
// get the app's established red/orange caution hues.
const PROJECT_STATUS_LABELS = {
  proposed: "Proposed",
  planned: "Planned",
  ongoing: "Ongoing",
  completed: "Completed",
  suspended: "Suspended",
  cancelled: "Cancelled",
};

const PROJECT_STATUS_COLORS = {
  proposed: "#74809A",
  planned: "#E9FF35",
  ongoing: "#080D52",
  completed: "#078B4B",
  suspended: "#ea580c",
  cancelled: "#dc2626",
};

function formatRole(role) {
  const labels = {
    admin: "Administrator",
    analyst: "Analyst",
    sector_focal_point: "Sector Focal Point",
    reviewer: "Reviewer",
    viewer: "Viewer",
  };

  return labels[role] || "User";
}

function formatDate() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ModuleCard({
  icon: Icon,
  title,
  description,
  actionLabel,
  onClick,
  tone = "blue",
}) {
  const iconClasses = {
    blue: "bg-[#030454] text-white",
    green: "bg-[#009B35] text-white",
    yellow: "bg-[#F3F74B] text-[#030454]",
    white: "bg-white text-[#030454] border border-slate-200",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#009B35]/60 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            iconClasses[tone] || iconClasses.blue
          }`}
        >
          <Icon size={20} />
        </div>

        <ArrowRight
          size={18}
          className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#009B35]"
        />
      </div>

      <h3 className="mt-5 text-base font-black text-[#030454]">{title}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>

      <p className="mt-4 text-xs font-black uppercase tracking-[0.1em] text-[#009B35]">
        {actionLabel}
      </p>
    </button>
  );
}

function FocusItem({ icon: Icon, title, description, tone = "blue" }) {
  const iconClasses = {
    blue: "bg-[#030454]/10 text-[#030454]",
    green: "bg-[#009B35]/10 text-[#009B35]",
    yellow: "bg-[#F3F74B]/35 text-[#030454]",
    white: "bg-white text-[#030454] border border-slate-200",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            iconClasses[tone] || iconClasses.blue
          }`}
        >
          <Icon size={20} />
        </div>

        <div>
          <p className="font-black text-[#030454]">{title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

const EXECUTIVE_TABS = [
  { key: "overview", label: "Overview" },
  { key: "climate", label: "Climate Hazard Assessment and Risk Tracking" },
  { key: "ghg", label: "GHG Inventory" },
  { key: "projectsReports", label: "Projects & Reports" },
];

function ExecutiveTabBar({ activeTab, onSelect }) {
  return (
    <div
      role="tablist"
      aria-label="Executive Dashboard sections"
      className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm sm:flex-nowrap sm:overflow-x-auto"
    >
      {EXECUTIVE_TABS.map((tab) => {
        const isActive = activeTab === tab.key;

        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.key)}
            className={`shrink-0 rounded-lg px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009B35] focus-visible:ring-offset-2 ${
              isActive
                ? "bg-[#030454] text-white shadow-sm"
                : "bg-transparent text-[#030454] hover:bg-[#030454]/6"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Dashboard({ ghgSummary, currentUser, onPageChange }) {
  const role = currentUser?.profile?.role || "viewer";
  const {
    data: dashboardData,
    loading: dashboardLoading,
    errors: dashboardErrors,
    refresh: refreshDashboardData,
  } = useExecutiveDashboardData();
  const [activeExecutiveTab, setActiveExecutiveTab] = useState("overview");

  const topRiskLgas = dashboardData.risk?.top_lgas?.slice(0, 5) || [];
  const projectStatusCounts = dashboardData.projects?.summary?.by_status || null;
  const totalProjectsForStatusChart =
    dashboardData.projects?.summary?.total_projects ?? null;

  const projectStatusChartData = projectStatusCounts
    ? Object.entries(projectStatusCounts)
        .filter(([, count]) => typeof count === "number" && count > 0)
        .map(([status, count]) => ({
          label: PROJECT_STATUS_LABELS[status] || status,
          value: count,
          color: PROJECT_STATUS_COLORS[status] || "#74809A",
        }))
    : [];

  function navigateTo(pageKey) {
    if (typeof onPageChange === "function") {
      onPageChange(pageKey);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr] xl:items-center">
          <div>
            <div className="flex flex-wrap gap-3">
              <span className="rounded-md bg-[#030454] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white">
                Executive Command View
              </span>

              <span className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#030454]">
                {formatDate()}
              </span>
            </div>

            <h1 className="mt-5 text-3xl font-black tracking-tight text-[#030454] sm:text-4xl">
              Kaduna Climate Command Centre
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Monitor Climate Hazard Assessment and Risk Tracking, greenhouse gas inventory, climate action
              projects, reports, public transparency outputs and audit-ready
              governance workflows from one internal command dashboard.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              Signed in as
            </p>

            <p className="mt-2 text-xl font-black text-[#030454]">
              {formatRole(role)}
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Username: {currentUser?.username || "Current user"}
            </p>
          </div>
        </div>
      </section>

      <ExecutiveTabBar activeTab={activeExecutiveTab} onSelect={setActiveExecutiveTab} />

      {activeExecutiveTab === "overview" && (
        <>
          <div>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-[#030454]">
                  Executive indicators
                </h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                  High-level signals across KCCC work areas.
                </p>
              </div>

              <button
                type="button"
                onClick={refreshDashboardData}
                disabled={dashboardLoading}
                className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-command-green transition-colors duration-200 hover:text-command-navy disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={14} className={dashboardLoading ? "animate-spin" : ""} />
                Refresh view
              </button>
            </div>

            <DashboardCommandMetricsRow
              risk={dashboardData.risk}
              projects={dashboardData.projects}
              reports={dashboardData.reports}
              ghgSummary={ghgSummary}
              loading={dashboardLoading}
              errors={dashboardErrors}
            />
          </div>

          <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <CommandSection
              title="Priority climate-risk LGAs"
              description="Highest overall risk scores among assessed LGAs. Full detail and methodology live in Climate Intelligence."
              actions={<CommandBadge tone="success">Risk overview</CommandBadge>}
            >
              {dashboardErrors.risk ? (
                <p className="text-xs font-bold text-red-600">
                  Couldn't load Climate Intelligence data.
                </p>
              ) : dashboardLoading ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : topRiskLgas.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No risk profiles available yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {topRiskLgas.map((profile) => (
                    <ChartBarRow
                      key={profile.id}
                      label={profile.lga_name}
                      value={profile.overall_risk_score}
                      max={100}
                      tone={riskLevelToTone(profile.risk_level)}
                    />
                  ))}
                </div>
              )}
            </CommandSection>

            <CommandSection
              title="Climate action portfolio by status"
              description="Real-time distribution of registered climate projects by status."
              actions={<CommandBadge tone="success">Portfolio mix</CommandBadge>}
            >
              {dashboardErrors.projects ? (
                <p className="text-xs font-bold text-red-600">
                  Couldn't load Climate Action data.
                </p>
              ) : dashboardLoading ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : projectStatusChartData.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No projects registered yet.
                </p>
              ) : (
                <>
                  <ChartDonut data={projectStatusChartData} />
                  <p className="mt-4 text-xs font-bold text-slate-500">
                    {totalProjectsForStatusChart ?? "—"} total registered
                    project{totalProjectsForStatusChart === 1 ? "" : "s"}.
                  </p>
                </>
              )}
            </CommandSection>
          </section>

          <CommandSection
            title="Move quickly into the active work areas"
            description="Use these module cards to move from overview to operational work."
          >
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <ModuleCard
                icon={CloudSun}
                title="Climate Hazard Assessment and Risk Tracking"
                description="Review LGA Climate Hazard Assessment and Risk Tracking scores, maps, raw parameter records and scoring outputs."
                actionLabel="Open risk module"
                tone="green"
                onClick={() => navigateTo("risk")}
              />

              <ModuleCard
                icon={Leaf}
                title="GHG Inventory"
                description="Manage emissions activity data and sector inventory workflows for reporting."
                actionLabel="Open GHG module"
                tone="blue"
                onClick={() => navigateTo("ghg")}
              />

              <ModuleCard
                icon={FolderKanban}
                title="Project Portfolio"
                description="Track climate projects, budgets, beneficiaries, GHG reduction and status."
                actionLabel="Open projects"
                tone="yellow"
                onClick={() => navigateTo("projects")}
              />

              <ModuleCard
                icon={FileText}
                title="Reports Centre"
                description="Store, review, publish and export climate reports and public-facing documents."
                actionLabel="Open reports"
                tone="blue"
                onClick={() => navigateTo("reports")}
              />
            </div>
          </CommandSection>

          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <CommandSection
              title="What leadership should answer quickly"
              description="A command dashboard should immediately connect risk, action, evidence and accountability."
            >
              <div className="space-y-4">
                <FocusItem
                  icon={Globe2}
                  title="Where are the highest climate risks?"
                  description="Use LGA risk maps and scores to identify priority locations and risk drivers."
                  tone="green"
                />

                <FocusItem
                  icon={Activity}
                  title="What actions are responding to those risks?"
                  description="Track climate projects by LGA, sector, budget, beneficiaries and mitigation outcome."
                  tone="yellow"
                />

                <FocusItem
                  icon={Database}
                  title="What evidence supports decisions?"
                  description="Maintain reports, imports, audit logs and data provenance for accountability."
                  tone="blue"
                />
              </div>
            </CommandSection>

            <CommandSection
              title="Recent Climate Hazard Assessment and Risk Tracking and action"
              description="Signals decision-makers should see first — highest-risk LGAs, the latest emissions position, and the newest projects and reports."
            >
              <DashboardRecentInsights
                risk={dashboardData.risk}
                projects={dashboardData.projects}
                reports={dashboardData.reports}
                ghgSummary={ghgSummary}
                loading={dashboardLoading}
                errors={dashboardErrors}
              />
            </CommandSection>
          </section>

          <DashboardClimateAtlasDatasets
            layers={dashboardData.layers}
            loading={dashboardLoading}
            error={dashboardErrors.layers}
          />
        </>
      )}

      {activeExecutiveTab === "climate" && (
        <CommandSection
          title="Executive Climate Hazard Assessment and Risk Tracking summary"
          description="Leadership-level view of LGA Climate Hazard Assessment and Risk Tracking scores, highest-risk LGAs and adaptation signals."
        >
          <ExecutiveClimateRiskSummary />
        </CommandSection>
      )}

      {activeExecutiveTab === "ghg" && (
        <CommandSection
          title="GHG inventory executive summary"
          description="Cross-sector emissions totals, review-queue status and NDC implemented-progress preview."
        >
          <ExecutiveGHGInventorySummary ghgSummary={ghgSummary} />
        </CommandSection>
      )}

      {activeExecutiveTab === "projectsReports" && (
        <>
          <CommandSection
            title="Climate action and investment summary"
            description="Track project counts, budgets, expected beneficiaries, mitigation outcomes and implementation gaps."
          >
            <ExecutiveProjectPortfolioSummary />
          </CommandSection>

          <CommandSection
            title="Reports centre executive summary"
            description="Review publication status, report queue and recent documents from the Reports Centre."
          >
            <ExecutiveReportsSummary />
          </CommandSection>
        </>
      )}
    </div>
  );
}