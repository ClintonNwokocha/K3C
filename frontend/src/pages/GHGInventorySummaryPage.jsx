function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function getBarWidth(value, rows) {
  const maxTotal = Math.max(
    ...rows.map((row) => Math.abs(Number(row.total_co2e || 0))),
    1
  );

  return `${(Math.abs(Number(value || 0)) / maxTotal) * 100}%`;
}

const sectorOrder = ["energy", "agriculture", "waste", "ippu", "lulucf"];

const sectorDescriptions = {
  energy: "Fuel combustion, transport and stationary energy use.",
  agriculture: "Livestock, rice cultivation and fertiliser-related emissions.",
  waste: "Solid waste disposal and wastewater emissions.",
  ippu: "Industrial processes, mineral products and refrigerants.",
  lulucf: "Land-use conversion, deforestation and afforestation removals.",
};

export default function GHGInventorySummaryPage({
  ghgSummary,
  isLoading,
  onRefresh,
  onOpenSector,
}) {
  const ghg = ghgSummary?.ghg;
  const implementedSectors = ghgSummary?.implemented_sectors || [];
  const sectorBreakdown = ghg?.sector_breakdown || [];
  const pendingBySector = ghg?.pending_by_sector || [];
  const yearlyTotals = ghg?.yearly_totals || [];

  const sectors = sectorOrder
    .map((sectorKey) => {
      const sectorInfo = implementedSectors.find(
        (item) => item.sector === sectorKey
      );

      const totalInfo = sectorBreakdown.find(
        (item) => item.sector === sectorKey
      );

      const reviewInfo = pendingBySector.find(
        (item) => item.sector === sectorKey
      );

      if (!sectorInfo) return null;

      return {
        sector: sectorKey,
        sectorLabel: sectorInfo.sector_label,
        totalCo2e: totalInfo?.total_co2e || 0,
        totalMtco2e: totalInfo?.total_mtco2e || 0,
        year: totalInfo?.year || ghg?.latest_year || "—",
        pendingReviewCount: reviewInfo?.pending_review_count || 0,
        underReviewCount: reviewInfo?.under_review_count || 0,
        approvedEntryCount: reviewInfo?.approved_entry_count || 0,
        description: sectorDescriptions[sectorKey],
      };
    })
    .filter(Boolean);

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            GHG Inventory
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Inventory Summary
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Approved records from all implemented GHG sectors are summarised
            here before feeding the Executive Dashboard.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Refresh summary
        </button>
      </section>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-500 shadow-sm">
          Loading GHG inventory summary...
        </div>
      ) : (
        <>
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Approved GHG Total</p>
              <h2 className="mt-3 text-2xl font-bold">
                {formatNumber(ghg?.latest_total_tco2e, 3)}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                tCO₂e{ghg?.latest_year ? ` in ${ghg.latest_year}` : ""}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Total in MtCO₂e</p>
              <h2 className="mt-3 text-2xl font-bold">
                {formatNumber(ghg?.latest_total_mtco2e, 6)}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Combined implemented-sector total.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Approved Entries</p>
              <h2 className="mt-3 text-2xl font-bold">
                {ghg?.approved_entry_count || 0}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Records feeding official totals.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Pending Reviews</p>
              <h2 className="mt-3 text-2xl font-bold text-amber-600">
                {ghg?.total_review_queue_count || 0}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Pending or under review.
              </p>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-5">
            {sectors.map((item) => {
              const totalIsNegative = Number(item.totalCo2e) < 0;

              return (
                <div
                  key={item.sector}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-bold">{item.sectorLabel}</h2>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Approved Total
                    </p>
                    <p
                      className={`mt-1 text-2xl font-bold ${
                        totalIsNegative ? "text-sky-600" : "text-slate-900"
                      }`}
                    >
                      {formatNumber(item.totalCo2e, 3)}
                    </p>
                    <p className="text-xs text-slate-500">
                        tCO₂e{item.year ? ` · latest year ${item.year}` : ""}
                    </p>
                  </div>

                  <div className="mt-5 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Approved entries</span>
                      <span className="font-semibold">
                        {item.approvedEntryCount}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Pending</span>
                      <span className="font-semibold">
                        {item.pendingReviewCount}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Under review</span>
                      <span className="font-semibold">
                        {item.underReviewCount}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => onOpenSector(item.sector)}
                    className="mt-5 w-full rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                  >
                    Open {item.sectorLabel}
                  </button>
                </div>
              );
            })}
          </section>

          <section className="grid gap-6 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
              <h2 className="text-lg font-bold">Sector Breakdown</h2>
              <p className="text-sm text-slate-500">
                Latest-year approved GHG total by sector.
              </p>

              <div className="mt-6 space-y-4">
                {sectorBreakdown.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No approved sector totals yet.
                  </p>
                )}

                {sectorBreakdown.map((item) => {
                  const width = getBarWidth(item.total_co2e, sectorBreakdown);
                  const isRemoval = Number(item.total_co2e) < 0;

                  return (
                    <div key={item.sector}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-medium">
                          {item.sector_label}
                        </span>
                        <span
                          className={
                            isRemoval ? "text-sky-600" : "text-slate-500"
                          }
                        >
                          {formatNumber(item.total_co2e, 3)} tCO₂e
                        </span>
                      </div>

                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${
                            isRemoval ? "bg-sky-500" : "bg-emerald-500"
                          }`}
                          style={{ width }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold">Review Load</h2>
              <p className="text-sm text-slate-500">
                Records currently waiting for attention.
              </p>

              <div className="mt-5 space-y-4">
                {pendingBySector.map((item) => (
                  <div
                    key={item.sector}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <p className="font-semibold">{item.sector_label}</p>

                    <div className="mt-3 space-y-2 text-sm">
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
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Yearly Approved GHG Totals</h2>
            <p className="text-sm text-slate-500">
              Combined approved totals from all implemented sectors.
            </p>

            <div className="mt-6 space-y-4">
              {yearlyTotals.length === 0 && (
                <p className="text-sm text-slate-500">
                  No approved GHG totals yet.
                </p>
              )}

              {yearlyTotals.map((item) => {
                const width = getBarWidth(item.total_co2e, yearlyTotals);
                const isRemoval = Number(item.total_co2e) < 0;

                return (
                  <div key={item.year}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{item.year}</span>
                      <span
                        className={
                          isRemoval ? "text-sky-600" : "text-slate-500"
                        }
                      >
                        {formatNumber(item.total_co2e, 3)} tCO₂e
                      </span>
                    </div>

                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          isRemoval ? "bg-sky-500" : "bg-emerald-500"
                        }`}
                        style={{ width }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}