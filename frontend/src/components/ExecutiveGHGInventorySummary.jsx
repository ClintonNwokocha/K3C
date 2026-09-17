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

      <h3 className="kccc-kpi-value mt-3 text-3xl font-black text-[#030454]">{value}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

function CountRow({ label, value, swatchClass }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-slate-500">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${swatchClass}`} />
        {label}
      </span>
      <span className="font-black text-[#030454]">{value}</span>
    </div>
  );
}

// Status color mapping shared conceptually with GHGSectorWorkspace's
// getStatusClass — same five statuses, same meaning, kept in sync by hand
// since the two live in different parts of the tree.
const STATUS_META = [
  { key: "approved_entry_count", label: "Approved", bar: "bg-[#009B35]", swatch: "bg-[#009B35]" },
  { key: "pending_review_count", label: "Pending Review", bar: "bg-[#F3F74B]", swatch: "bg-[#F3F74B]" },
  { key: "under_review_count", label: "Under Review", bar: "bg-[#030454]/40", swatch: "bg-[#030454]/40" },
  { key: "revision_requested_count", label: "Revision Requested", bar: "bg-purple-400", swatch: "bg-purple-400" },
  { key: "rejected_count", label: "Rejected", bar: "bg-red-400", swatch: "bg-red-400" },
];

function ReviewStatusDistribution({ ghg }) {
  const counts = STATUS_META.map((status) => ({
    ...status,
    value: Number(ghg[status.key] || 0),
  }));
  const total = counts.reduce((sum, status) => sum + status.value, 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-black text-[#030454]">Review Status Distribution</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        Every GHG entry across all five sectors, by current status.
      </p>

      {total > 0 ? (
        <div
          className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={counts
            .filter((status) => status.value > 0)
            .map((status) => `${status.label}: ${status.value}`)
            .join(", ")}
        >
          {counts.map((status) =>
            status.value > 0 ? (
              <span
                key={status.key}
                className={status.bar}
                style={{ width: `${(status.value / total) * 100}%` }}
                title={`${status.label}: ${status.value}`}
              />
            ) : null
          )}
        </div>
      ) : (
        <div className="mt-5 h-3 w-full rounded-full bg-slate-100" />
      )}

      <div className="mt-5 grid gap-2.5 text-sm sm:grid-cols-2">
        {counts.map((status) => (
          <CountRow
            key={status.key}
            label={status.label}
            value={formatNumber(status.value, 0)}
            swatchClass={status.swatch}
          />
        ))}
      </div>
    </div>
  );
}

function SectorComparisonChart({ rows }) {
  const maxValue = Math.max(...rows.map((row) => Number(row.total_mtco2e || 0)), 0.0001);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-black text-[#030454]">Five-Sector Comparison</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        Latest approved total per sector, MtCO₂e.
      </p>

      <div
        className="mt-6 space-y-4"
        role="img"
        aria-label={rows
          .map(
            (row) =>
              `${row.sector_label}: ${formatNumber(row.total_mtco2e, 3)} MtCO2e${
                row.year ? ` in ${row.year}` : ""
              }`
          )
          .join(", ")}
      >
        {rows.map((row) => {
          const width = `${Math.max(
            (Number(row.total_mtco2e || 0) / maxValue) * 100,
            row.total_mtco2e ? 3 : 0
          )}%`;

          return (
            <div key={row.sector}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="font-bold text-[#030454]">{row.sector_label}</span>
                <span className="font-mono text-xs font-bold text-slate-500">
                  {formatNumber(row.total_mtco2e, 3)} MtCO₂e
                  {row.year ? ` · ${row.year}` : ""}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[#030454]" style={{ width }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnnualTrendChart({ rows }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-black text-[#030454]">Annual Approved Emissions</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Cross-sector approved total by reporting year.
        </p>
        <p className="mt-6 text-sm text-slate-500">No approved yearly totals yet.</p>
      </div>
    );
  }

  const maxValue = Math.max(...rows.map((row) => Number(row.total_mtco2e || 0)), 0.0001);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-black text-[#030454]">Annual Approved Emissions</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        Cross-sector approved total by reporting year, MtCO₂e.
      </p>

      <div
        className="mt-6 flex h-40 items-end gap-3"
        role="img"
        aria-label={rows
          .map((row) => `${row.year}: ${formatNumber(row.total_mtco2e, 3)} MtCO2e`)
          .join(", ")}
      >
        {rows.map((row) => {
          const heightPct = Math.max(
            (Number(row.total_mtco2e || 0) / maxValue) * 100,
            row.total_mtco2e ? 4 : 2
          );

          return (
            <div key={row.year} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">
                {formatNumber(row.total_mtco2e, 2)}
              </span>
              <div className="flex h-28 w-full items-end">
                <div
                  className="w-full rounded-t-md bg-[#009B35]"
                  style={{ height: `${heightPct}%` }}
                  title={`${row.year}: ${formatNumber(row.total_mtco2e, 3)} MtCO₂e`}
                />
              </div>
              <span className="text-xs font-black text-[#030454]">{row.year}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopEmissionSources({ rows }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-black text-[#030454]">Top Emission Sources</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Highest-emitting activities across all approved entries, every sector and year.
        </p>
        <p className="mt-6 text-sm text-slate-500">No approved entries yet.</p>
      </div>
    );
  }

  const maxValue = Math.max(...rows.map((row) => Number(row.total_co2e || 0)), 0.0001);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-black text-[#030454]">Top Emission Sources</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        Highest-emitting activities across all approved entries, every sector and year.
      </p>

      <div
        className="mt-6 space-y-4"
        role="img"
        aria-label={rows
          .map(
            (row) =>
              `${row.sector_label} ${row.fuel_or_activity}: ${formatNumber(row.total_co2e, 1)} tCO2e across ${row.entry_count} entries`
          )
          .join(", ")}
      >
        {rows.map((row, index) => {
          const width = `${Math.max((Number(row.total_co2e || 0) / maxValue) * 100, 3)}%`;

          return (
            <div key={`${row.sector}-${row.sub_category}-${row.fuel_or_activity}`}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="font-bold text-[#030454]">
                  {index + 1}. {row.fuel_or_activity}
                  <span className="ml-2 text-xs font-semibold text-slate-400">
                    {row.sector_label}
                  </span>
                </span>
                <span className="font-mono text-xs font-bold text-slate-500">
                  {formatNumber(row.total_co2e, 1)} tCO₂e · {row.entry_count}{" "}
                  {row.entry_count === 1 ? "entry" : "entries"}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[#009B35]" style={{ width }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectorCard({ sector, pending, onOpenSector }) {
  const inReview = Number(pending?.pending_review_count || 0) + Number(pending?.under_review_count || 0);

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="font-black text-[#030454]">{sector.sector_label}</p>

        <p className="mt-3 text-2xl font-black text-[#030454]">
          {formatNumber(sector.total_mtco2e, 3)}
          <span className="ml-1 text-xs font-semibold text-slate-400">MtCO₂e</span>
        </p>

        <p className="mt-1 text-xs text-slate-500">
          {sector.year ? `Latest approved year ${sector.year}` : "No approved year yet"}
        </p>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>
            <strong className="text-[#030454]">{formatNumber(pending?.approved_entry_count, 0)}</strong> approved
          </span>
          <span>
            <strong className="text-[#030454]">{formatNumber(inReview, 0)}</strong> in review
          </span>
        </div>
      </div>

      {typeof onOpenSector === "function" && (
        <button
          type="button"
          onClick={() => onOpenSector(sector.sector)}
          className="mt-4 w-full rounded-md border border-[#030454]/20 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#030454] transition hover:border-[#009B35] hover:text-[#009B35]"
        >
          Open Sector Workspace
        </button>
      )}
    </div>
  );
}

// Fills the gap of no GHG executive summary existing on the Dashboard.
// Also composed directly by the internal GHG Inventory Summary tab
// (GHGInventorySummaryPage.jsx), where onOpenSector is wired to switch
// the parent's active sector tab. This component performs no fetch of its
// own — ghgSummary is fetched once by the caller and passed down as a prop.
export default function ExecutiveGHGInventorySummary({ ghgSummary, onOpenSector }) {
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
  const yearlyTotals = ghg.yearly_totals || [];
  const pendingBySector = ghg.pending_by_sector || [];
  const topEmissionSources = ghg.top_emission_sources || [];

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
          label="Latest Approved Emissions"
          value={`${formatNumber(ghg.latest_total_mtco2e, 2)} MtCO₂e`}
          helper="Sum of latest approved totals across implemented sectors."
          tone="blue"
        />

        <StatCard
          label="Latest Approved Reporting Year"
          value={ghg.latest_year ?? "—"}
          helper="Most recent year with an approved sector total."
          tone="green"
        />

        <StatCard
          label="Entries Awaiting Review"
          value={formatNumber(ghg.total_review_queue_count, 0)}
          helper="Entries pending or under review."
          tone="yellow"
        />

        <StatCard
          label="Implemented NDC Progress"
          value={`${formatNumber(ndcPreview.implemented_progress_pct, 1)}%`}
          helper="Progress against the unconditional NDC target, implemented sectors only."
          tone="white"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectorComparisonChart rows={sectorBreakdown} />
        <AnnualTrendChart rows={yearlyTotals} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReviewStatusDistribution ghg={ghg} />
        <TopEmissionSources rows={topEmissionSources} />
      </div>

      <div>
        <h3 className="text-xl font-black text-[#030454]">Sector Workspaces</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Latest approved total, reporting year and review position per sector.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {sectorBreakdown.map((sector) => (
            <SectorCard
              key={sector.sector}
              sector={sector}
              pending={pendingBySector.find((row) => row.sector === sector.sector)}
              onOpenSector={onOpenSector}
            />
          ))}

          {sectorBreakdown.length === 0 && (
            <div className="col-span-full rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
              No sector totals available yet.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[#F3F74B]/70 bg-[#F3F74B]/20 px-5 py-4 text-sm leading-6 text-[#030454] shadow-sm">
        <h3 className="font-black">NDC Progress Note</h3>
        <p className="mt-1">{ndcPreview.note}</p>
      </div>
    </section>
  );
}
