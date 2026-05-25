import ExecutiveClimateRiskSummary from "../components/ExecutiveClimateRiskSummary";

function formatNumber(value, maximumFractionDigits = 2) {
  const number = Number(value || 0);

  return number.toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function getProgressWidth(value) {
  const number = Number(value || 0);

  if (number < 0) return "0%";
  if (number > 100) return "100%";

  return `${number}%`;
}

export default function Dashboard({ health, foundation, ghgSummary }) {
  const lgas = foundation?.lgas || [];
  const gwpValues = foundation?.gwp_values || [];
  const ndc = foundation?.ndc_constant;

  const ghg = ghgSummary?.ghg;
  const ndcPreview = ghgSummary?.ndc_preview;
  const sectorBreakdown = ghg?.sector_breakdown || [];
  const yearlyTotals = ghg?.yearly_totals || [];

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium text-emerald-700">
          Executive Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          KS-CCC Executive Overview
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Approved GHG records from implemented sectors now feed this
          dashboard. Current implemented sectors are Energy, Agriculture, Waste, IPPU and LULUCF.
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Backend Status</p>
          <h2 className="mt-3 text-2xl font-bold text-emerald-700">
            {health?.status || "Loading"}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {health?.message || "Checking API connection..."}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">
            Approved GHG Emissions
          </p>
          <h2 className="mt-3 text-2xl font-bold">
            {formatNumber(ghg?.latest_total_tco2e, 3)}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            tCO₂e{ghg?.latest_year ? ` in ${ghg.latest_year}` : ""}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Approved GHG Entries</p>
          <h2 className="mt-3 text-2xl font-bold">
            {ghg?.approved_entry_count || 0}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Records included in official implemented-sector total.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Pending GHG Reviews</p>
          <h2 className="mt-3 text-2xl font-bold text-amber-600">
            {ghg?.total_review_queue_count || 0}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Pending or currently under review.
          </p>
        </div>
      </section>

      <ExecutiveClimateRiskSummary />

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Cross-Sector GHG Summary</h2>
              <p className="text-sm text-slate-500">
                Approved totals from Energy, Agriculture, Waste, IPPU and LULUCF.
              </p>
            </div>

            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              Approved-only totals
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Latest approved year</p>
              <p className="mt-2 text-3xl font-bold">
                {ghg?.latest_year || "—"}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Total in MtCO₂e</p>
              <p className="mt-2 text-3xl font-bold">
                {formatNumber(ghg?.latest_total_mtco2e, 6)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">
                Equivalent cars removed
              </p>
              <p className="mt-2 text-3xl font-bold">
                {formatNumber(ghg?.cars_equivalent, 0)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">
                Equivalent homes powered
              </p>
              <p className="mt-2 text-3xl font-bold">
                {formatNumber(ghg?.homes_equivalent, 0)}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold">Sector Breakdown</h3>
            <p className="text-sm text-slate-500">
              Latest-year approved emissions by implemented sector.
            </p>

            <div className="mt-5 space-y-4">
              {sectorBreakdown.length === 0 && (
                <p className="text-sm text-slate-500">
                  No approved sector totals yet.
                </p>
              )}

              {sectorBreakdown.map((item) => {
                const maxTotal = Math.max(
                  ...sectorBreakdown.map((row) => Math.abs(Number(row.total_co2e || 0))),
                  1
                );

                const width = `${(Math.abs(Number(item.total_co2e || 0)) / maxTotal) * 100}%`;

                return (
                  <div key={item.sector}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{item.sector_label}</span>
                      <span className="text-slate-500">
                        {formatNumber(item.total_co2e, 3)} tCO₂e
                      </span>
                    </div>

                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          Number(item.total_co2e) < 0 ? "bg-sky-500" : "bg-emerald-500"
                        }`}
                        style={{ width }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold">Yearly Approved GHG Totals</h3>
            <p className="text-sm text-slate-500">
              Combined approved totals from implemented sectors.
            </p>

            <div className="mt-5 space-y-3">
              {yearlyTotals.length === 0 && (
                <p className="text-sm text-slate-500">
                  No approved GHG records yet.
                </p>
              )}

              {yearlyTotals.map((item) => {
                const maxTotal = Math.max(
                  ...yearlyTotals.map((row) => Number(row.total_co2e || 0)),
                  1
                );

                const width = `${(Number(item.total_co2e || 0) / maxTotal) * 100}%`;

                return (
                  <div key={item.year}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{item.year}</span>
                      <span className="text-slate-500">
                        {formatNumber(item.total_co2e, 3)} tCO₂e
                      </span>
                    </div>

                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">
              Implemented-Sector NDC Preview
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              This preview uses only sectors already built in the system.
            </p>

            <div className="mt-5">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-slate-500">Preview progress</span>
                <span className="font-semibold">
                  {formatNumber(ndcPreview?.implemented_progress_pct, 2)}%
                </span>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{
                    width: getProgressWidth(
                      ndcPreview?.implemented_progress_pct
                    ),
                  }}
                />
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Kaduna baseline</span>
                <span className="font-semibold">
                  {formatNumber(ndcPreview?.kaduna_baseline_mt, 3)} Mt
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Target reduction</span>
                <span className="font-semibold">
                  {formatNumber(ndcPreview?.unconditional_target_pct, 2)}%
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">
                  Implemented-sector reduction
                </span>
                <span className="font-semibold">
                  {formatNumber(ndcPreview?.implemented_reduction_pct, 2)}%
                </span>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
              {ndcPreview?.note ||
                "This preview becomes official only after all sectors are implemented."}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Review Status</h2>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Pending review</span>
                <span className="font-semibold">
                  {ghg?.pending_review_count || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Under review</span>
                <span className="font-semibold">
                  {ghg?.under_review_count || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Revision requested</span>
                <span className="font-semibold">
                  {ghg?.revision_requested_count || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Rejected</span>
                <span className="font-semibold">
                  {ghg?.rejected_count || 0}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Review by Sector</h2>

            <div className="mt-5 space-y-4 text-sm">
              {(ghg?.pending_by_sector || []).map((item) => (
                <div
                  key={item.sector}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <p className="font-semibold">{item.sector_label}</p>

                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Pending</span>
                      <span className="font-semibold">
                        {item.pending_review_count}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Under review</span>
                      <span className="font-semibold">
                        {item.under_review_count}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Approved entries</span>
                      <span className="font-semibold">
                        {item.approved_entry_count}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Foundation Data</h2>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Kaduna LGAs</span>
                <span className="font-semibold">{lgas.length}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">GWP values</span>
                <span className="font-semibold">{gwpValues.length}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">NDC target year</span>
                <span className="font-semibold">
                  {ndc?.target_year || "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}