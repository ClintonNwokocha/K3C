function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits });
}

function StatCard({ label, value, helper, tone = "blue" }) {
  const toneClasses = {
    blue: "border-[#030454]/15 bg-[#030454]/5",
    green: "border-[#009B35]/20 bg-[#009B35]/8",
    yellow: "border-[#F3F74B]/70 bg-[#F3F74B]/25",
    white: "border-slate-200 bg-white",
  };

  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm ${
        toneClasses[tone] || toneClasses.white
      }`}
    >
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>

      <h3 className="mt-3 text-3xl font-black text-[#030454]">{value}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

function CountRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="font-black text-[#030454]">{value}</span>
    </div>
  );
}

// Fills the gap of no GHG executive summary existing on the Dashboard.
// Unlike its three siblings (ExecutiveClimateRiskSummary etc.), this
// component performs no fetch of its own — ghgSummary is already fetched
// once in App.jsx's loadDashboardData() cycle and passed down as a prop.
export default function ExecutiveGHGInventorySummary({ ghgSummary }) {
  if (!ghgSummary) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">
          GHG inventory dashboard summary unavailable.
        </p>
      </section>
    );
  }

  const ghg = ghgSummary.ghg || {};
  const ndcPreview = ghgSummary.ndc_preview || {};
  const sectorBreakdown = ghg.sector_breakdown || [];

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#009B35]">
          GHG Inventory Intelligence
        </p>

        <h2 className="mt-2 text-2xl font-black text-[#030454]">
          Cross-Sector GHG Executive Summary
        </h2>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Live summary of approved greenhouse gas totals across Energy, Agriculture,
          Waste, IPPU and LULUCF, plus the current review-queue position.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Latest Total Emissions"
          value={`${formatNumber(ghg.latest_total_mtco2e, 2)} MtCO₂e`}
          helper="Sum of latest approved totals across implemented sectors."
          tone="blue"
        />

        <StatCard
          label="Latest Approved Year"
          value={ghg.latest_year ?? "—"}
          helper="Most recent year with an approved sector total."
          tone="green"
        />

        <StatCard
          label="Review Queue"
          value={formatNumber(ghg.total_review_queue_count, 0)}
          helper="Entries pending or under review."
          tone="yellow"
        />

        <StatCard
          label="NDC Implemented Progress"
          value={`${formatNumber(ndcPreview.implemented_progress_pct, 1)}%`}
          helper="Progress against the unconditional NDC target, implemented sectors only."
          tone="white"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h3 className="text-xl font-black text-[#030454]">Sector Breakdown</h3>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            Latest approved total per implemented sector.
          </p>

          <div className="mt-5 space-y-3">
            {sectorBreakdown.map((sector) => (
              <div
                key={sector.sector}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3"
              >
                <div>
                  <p className="font-black text-[#030454]">{sector.sector_label}</p>
                  <p className="text-xs text-slate-500">
                    {sector.year ?? "No approved year yet"}
                  </p>
                </div>

                <p className="text-lg font-black text-[#030454]">
                  {formatNumber(sector.total_mtco2e, 3)}
                  <span className="ml-1 text-xs font-semibold text-slate-400">MtCO₂e</span>
                </p>
              </div>
            ))}

            {sectorBreakdown.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                No sector totals available yet.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-black text-[#030454]">Review Status</h3>

            <div className="mt-5 space-y-3 text-sm">
              <CountRow label="Approved" value={formatNumber(ghg.approved_entry_count, 0)} />
              <CountRow
                label="Pending Review"
                value={formatNumber(ghg.pending_review_count, 0)}
              />
              <CountRow label="Under Review" value={formatNumber(ghg.under_review_count, 0)} />
              <CountRow
                label="Revision Requested"
                value={formatNumber(ghg.revision_requested_count, 0)}
              />
              <CountRow label="Rejected" value={formatNumber(ghg.rejected_count, 0)} />
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-5 py-4 text-sm leading-6 text-[#030454] shadow-sm">
            <h3 className="font-black">NDC Progress Note</h3>
            <p className="mt-1">{ndcPreview.note}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
