import { GHG_SHORT_NOTE } from "../config/ghgInventoryNotes.js";
import { CommandStatCard } from "./CommandUI";

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits });
}

function formatMoney(value) {
  return `₦${formatNumber(value, 2)}`;
}

// Live KPI row for the Executive Dashboard. Data is supplied by
// useExecutiveDashboardData (fetched once in Dashboard.jsx) plus the
// ghgSummary already fetched at App level — this component performs no
// fetching of its own.
export default function DashboardCommandMetricsRow({
  risk,
  projects,
  reports,
  ghgSummary,
  loading,
  errors = {},
}) {
  const riskSummary = risk?.summary || {};
  const projectSummary = projects?.summary || {};
  const reportSummary = reports?.summary || {};
  const ghg = ghgSummary?.ghg || null;

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <CommandStatCard
        label="Climate Hazard Assessment and Risk Tracking"
        value={loading ? "—" : formatNumber(riskSummary.high_or_very_high_count, 0)}
        helper={
          loading
            ? "Loading LGA risk profiles…"
            : `High / very high risk LGAs of ${formatNumber(riskSummary.total_lgas, 0)} assessed statewide.`
        }
        tone="green"
        errorNotice={errors.risk ? "Couldn't load Climate Hazard Assessment and Risk Tracking data." : null}
      />

      <CommandStatCard
        label="Mitigation Tracking"
        value={
          ghg?.latest_total_mtco2e != null
            ? `${formatNumber(ghg.latest_total_mtco2e, 2)} MtCO₂e`
            : "—"
        }
        helper={
          ghg
            ? `Latest approved year ${ghg.latest_year ?? "—"} · ${formatNumber(
                ghg.total_review_queue_count,
                0
              )} entries in review. ${GHG_SHORT_NOTE}`
            : "GHG inventory summary unavailable."
        }
        tone="blue"
      />

      <CommandStatCard
        label="Climate Action"
        value={loading ? "—" : formatNumber(projectSummary.total_projects, 0)}
        helper={
          loading
            ? "Loading project portfolio…"
            : `${formatMoney(projectSummary.total_budget_naira)} portfolio value.`
        }
        tone="yellow"
        errorNotice={errors.projects ? "Couldn't load Climate Action data." : null}
      />

      <CommandStatCard
        label="Accountability"
        value={loading ? "—" : formatNumber(reportSummary.total_reports, 0)}
        helper={
          loading
            ? "Loading report records…"
            : `${formatNumber(reportSummary.by_status?.review, 0)} reports awaiting review.`
        }
        tone="white"
        errorNotice={errors.reports ? "Couldn't load Accountability data." : null}
      />
    </section>
  );
}
