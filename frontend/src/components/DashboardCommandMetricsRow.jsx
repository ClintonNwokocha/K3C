function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits });
}

function formatMoney(value) {
  return `₦${formatNumber(value, 2)}`;
}

function CommandMetric({ label, value, helper, tone = "blue", errorNotice }) {
  const toneClasses = {
    blue: "border-[#030454]/15 bg-[#030454]/5",
    green: "border-[#009B35]/20 bg-[#009B35]/8",
    yellow: "border-[#F3F74B]/70 bg-[#F3F74B]/18",
    white: "border-slate-200 bg-white",
  };

  return (
    <div
      className={`rounded-xl border p-5 shadow-sm ${
        toneClasses[tone] || toneClasses.blue
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <p className="mt-3 text-2xl font-black text-[#030454]">{value}</p>

      <p className="mt-2 text-sm leading-6 text-slate-600">{helper}</p>

      {errorNotice && (
        <p className="mt-2 text-xs font-bold text-red-600">{errorNotice}</p>
      )}
    </div>
  );
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
      <CommandMetric
        label="Climate Intelligence"
        value={loading ? "—" : formatNumber(riskSummary.high_or_very_high_count, 0)}
        helper={
          loading
            ? "Loading LGA risk profiles…"
            : `High / very high risk LGAs of ${formatNumber(riskSummary.total_lgas, 0)} assessed statewide.`
        }
        tone="green"
        errorNotice={errors.risk ? "Couldn't load Climate Intelligence data." : null}
      />

      <CommandMetric
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
              )} entries in review.`
            : "GHG inventory summary unavailable."
        }
        tone="blue"
      />

      <CommandMetric
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

      <CommandMetric
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
