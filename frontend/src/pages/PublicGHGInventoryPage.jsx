import { useEffect, useState } from "react";
import {
  PublicEmptyState,
  PublicPortalFooter,
  PublicPortalHeader,
  PublicSectionIntro,
} from "../components/PublicPortalChrome";
import { getPublicPortalSummary } from "../services/api";

function formatNumber(value, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function MetricCard({ label, value, helper }) {
  return (
    <div className="rounded-md border border-[#D8DDE2] bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-3 font-['Playfair_Display'] text-4xl font-bold text-[#030454]">
        {value}
      </p>

      {helper && <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>}
    </div>
  );
}

export default function PublicGHGInventoryPage() {
  const [summaryData, setSummaryData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSummary() {
    setIsLoading(true);
    setError("");

    try {
      const data = await getPublicPortalSummary();
      setSummaryData(data.summary || {});
    } catch (err) {
      console.error(err);
      setError("Could not load public GHG inventory summary.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const ghg =
    summaryData?.ghg_inventory ||
    summaryData?.ghg ||
    summaryData?.emissions ||
    {};

  const projects = summaryData?.projects || {};

  const sectorRows =
    ghg.by_sector ||
    ghg.sector_totals ||
    ghg.sectors ||
    [];

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <PublicPortalHeader
        activePage="ghg"
        compact
        tag="Public greenhouse gas inventory"
        title={<>Greenhouse gas inventory summary</>}
        description="View public-facing greenhouse gas inventory insights, sector summaries and estimated emissions information where approved data is available."
        showActions={false}
      />

      {error && (
        <section className="px-4 py-4 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        </section>
      )}

      {isLoading ? (
        <section className="px-4 py-16 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-sm border border-[#CAD2D7] bg-white p-8 text-sm text-slate-500 shadow-sm">
            Loading public GHG inventory information...
          </div>
        </section>
      ) : (
        <section className="bg-white px-4 py-16 sm:px-8 lg:px-10 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <PublicSectionIntro
              title="Public emissions overview"
              description="This page is reserved for approved greenhouse gas inventory summaries and public sector-level emissions insights."
            />

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              <MetricCard
                label="Reporting Year"
                value={ghg.latest_year || ghg.reporting_year || "—"}
                helper="Most recent approved public inventory year."
              />

              <MetricCard
                label="Estimated Emissions"
                value={
                  ghg.total_emissions_tco2e
                    ? `${formatNumber(ghg.total_emissions_tco2e, 0)} tCO₂e`
                    : ghg.state_emissions_mt
                      ? `${formatNumber(ghg.state_emissions_mt, 2)} MtCO₂e`
                      : "Not published"
                }
                helper="Displayed only where approved public data is available."
              />

              <MetricCard
                label="Estimated GHG Reduction"
                value={`${formatNumber(
                  projects.total_expected_ghg_reduction_tco2e,
                  0
                )} tCO₂e`}
                helper="Estimated reduction from registered public climate projects."
              />
            </div>

            <div className="mt-10 rounded-md border border-[#D8DDE2] bg-white p-6 shadow-sm">
              <h3 className="font-['Playfair_Display'] text-3xl font-bold text-[#030454]">
                Sector-level summary
              </h3>

              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                Public GHG information should be shown by sector only after
                approval. This keeps the public portal clear while protecting
                raw agency-level submissions.
              </p>

              {sectorRows.length > 0 ? (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="px-3 py-3 font-bold">Sector</th>
                        <th className="px-3 py-3 font-bold">Estimated Emissions</th>
                        <th className="px-3 py-3 font-bold">Share</th>
                      </tr>
                    </thead>

                    <tbody>
                      {sectorRows.map((row, index) => (
                        <tr
                          key={row.sector || row.name || index}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-3 py-4 font-black text-[#030454]">
                            {row.sector_display || row.sector || row.name}
                          </td>

                          <td className="px-3 py-4">
                            {formatNumber(
                              row.total_emissions_tco2e ||
                                row.emissions_tco2e ||
                                row.value,
                              0
                            )}{" "}
                            tCO₂e
                          </td>

                          <td className="px-3 py-4">
                            {row.share_pct !== undefined
                              ? `${formatNumber(row.share_pct, 1)}%`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-6">
                  <PublicEmptyState
                    title="No public sector summary available"
                    message="Approved sector-level GHG inventory summaries have not yet been published to the public portal."
                  />
                </div>
              )}
            </div>

            <div className="mt-10 rounded-md border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-6 py-5 text-sm leading-7 text-[#030454]">
              <p className="font-black">Methodology note</p>
              <p className="mt-2">
                Public GHG figures should be treated as official only when they
                have passed internal review and are marked for publication.
                Technical methodology and data gaps should be documented in the
                reports centre.
              </p>
            </div>
          </div>
        </section>
      )}

      <PublicPortalFooter />
    </main>
  );
}