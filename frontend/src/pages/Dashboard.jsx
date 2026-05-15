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

  const energy = ghgSummary?.energy;
  const ndcPreview = ghgSummary?.ndc_preview;

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
          Approved GHG records now feed this dashboard. For this stage, the
          dashboard is connected to the Energy sector module only.
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
          <p className="text-sm text-slate-500">Approved Energy Emissions</p>
          <h2 className="mt-3 text-2xl font-bold">
            {formatNumber(energy?.latest_total_tco2e, 3)}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            tCO₂e{energy?.latest_year ? ` in ${energy.latest_year}` : ""}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Approved Energy Entries</p>
          <h2 className="mt-3 text-2xl font-bold">
            {energy?.approved_entry_count || 0}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Records included in official Energy total.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Pending GHG Reviews</p>
          <h2 className="mt-3 text-2xl font-bold text-amber-600">
            {energy?.total_review_queue_count || 0}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Pending or currently under review.
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">GHG Energy Summary</h2>
              <p className="text-sm text-slate-500">
                Approved Energy emissions from the GHG Inventory module.
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
                {energy?.latest_year || "—"}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Energy total in MtCO₂e</p>
              <p className="mt-2 text-3xl font-bold">
                {formatNumber(energy?.latest_total_mtco2e, 6)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">
                Equivalent cars removed
              </p>
              <p className="mt-2 text-3xl font-bold">
                {formatNumber(energy?.cars_equivalent, 0)}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">
                Equivalent homes powered
              </p>
              <p className="mt-2 text-3xl font-bold">
                {formatNumber(energy?.homes_equivalent, 0)}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold">Yearly Approved Energy Totals</h3>
                <p className="text-sm text-slate-500">
                  Simple bar view of approved Energy totals.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {(energy?.yearly_totals || []).length === 0 && (
                <p className="text-sm text-slate-500">
                  No approved Energy records yet.
                </p>
              )}

              {(energy?.yearly_totals || []).map((item) => {
                const maxTotal = Math.max(
                  ...(energy?.yearly_totals || []).map((row) =>
                    Number(row.total_co2e || 0)
                  ),
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
            <h2 className="text-lg font-bold">Energy-only NDC Preview</h2>
            <p className="mt-1 text-sm text-slate-500">
              This is not yet the official NDC progress because other sectors
              are not implemented.
            </p>

            <div className="mt-5">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-slate-500">Preview progress</span>
                <span className="font-semibold">
                  {formatNumber(ndcPreview?.energy_only_progress_pct, 2)}%
                </span>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{
                    width: getProgressWidth(
                      ndcPreview?.energy_only_progress_pct
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
                <span className="text-slate-500">Energy-only reduction</span>
                <span className="font-semibold">
                  {formatNumber(ndcPreview?.energy_only_reduction_pct, 2)}%
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
                  {energy?.pending_review_count || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Under review</span>
                <span className="font-semibold">
                  {energy?.under_review_count || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Revision requested</span>
                <span className="font-semibold">
                  {energy?.revision_requested_count || 0}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Rejected</span>
                <span className="font-semibold">
                  {energy?.rejected_count || 0}
                </span>
              </div>
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