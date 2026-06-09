import { useEffect, useMemo, useState } from "react";
import {
  PublicEmptyState,
  PublicPortalFooter,
  PublicPortalHeader,
} from "../components/PublicPortalChrome";
import { getPublicPortalSummary } from "../services/api";

const aboutDataItems = [
  {
    title: "What does tCO₂e mean?",
    body: "tCO₂e means tonnes of carbon dioxide equivalent. It is a standard way of expressing different greenhouse gases using a common carbon-dioxide-equivalent unit.",
  },
  {
    title: "What is the state GHG baseline?",
    body: "The state GHG baseline is the reference emissions level used to compare future emissions and track progress toward climate targets. For Kaduna State, the public baseline is shown in MtCO₂e and should not be confused with the latest inventory year.",
  },
  {
    title: "What is shown on this public page?",
    body: "This page presents public-facing greenhouse gas inventory information where approved summary data is available. It is intended for awareness, coordination and public decision support.",
  },
  {
    title: "How should estimated GHG reduction be interpreted?",
    body: "Estimated GHG reduction represents expected mitigation outcomes from registered climate action projects. These values should be treated as planning estimates unless they have been independently verified and published through approved reports.",
  },
  {
    title: "Why are some values not published?",
    body: "Some inventory data may still be under review, incomplete, internally restricted or awaiting validation. The public portal only displays summary information approved for public access.",
  },
  {
    title: "Proper use of the data",
    body: "Public GHG information should support communication, planning and coordination. Technical users should consult approved methodology documents, inventory reports and validated datasets before making formal reporting decisions.",
  },
];

const STANDARD_SECTOR_OPTIONS = [
  "Energy",
  "IPPU",
  "Agriculture",
  "LULUCF",
  "Waste",
];

function hasValidNumber(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

function formatNumber(value, maximumFractionDigits = 2) {
  if (!hasValidNumber(value)) return "—";

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

function formatCompactNumber(value) {
  if (!hasValidNumber(value)) return "—";

  const number = Number(value);

  if (number >= 1_000_000) {
    return `${formatNumber(number / 1_000_000, 2)}M`;
  }

  if (number >= 1_000) {
    return `${formatNumber(number / 1_000, 1)}K`;
  }

  return formatNumber(number, 0);
}

function getSectorName(row) {
  return (
    row.sector_display ||
    row.sector_name ||
    row.sector ||
    row.name ||
    "Unspecified sector"
  );
}

function getSectorValue(row) {
  return (
    row.total_emissions_tco2e ||
    row.emissions_tco2e ||
    row.total ||
    row.value ||
    0
  );
}

function getSectorShare(row) {
  if (hasValidNumber(row.share_pct)) return row.share_pct;
  if (hasValidNumber(row.share)) return row.share;
  return null;
}

function SummaryChip({ label, value, helper }) {
  return (
    <div className="rounded-md border border-[#D8DDE2] bg-white px-4 py-4">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-xl font-black text-[#030454]">{value}</p>

      {helper && <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>}
    </div>
  );
}

function ControlField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </span>

      {children}
    </label>
  );
}

function ExplorerControlBar({
  selectedSector,
  onSectorChange,
  sectorOptions,
  reportingYear,
}) {
  return (
    <div className="rounded-md border border-[#D8DDE2] bg-[#F7F9FA] p-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <ControlField label="Sector">
          <select
            value={selectedSector}
            onChange={(event) => onSectorChange(event.target.value)}
            className="h-11 w-full rounded-md border border-[#D8DDE2] bg-white px-4 text-sm font-bold text-[#030454] outline-none transition focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10"
          >
            <option value="all">All sectors</option>

            {sectorOptions.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>
        </ControlField>

        <div className="flex flex-wrap gap-2 text-xs text-slate-500 lg:justify-end">
          <span className="rounded-full bg-white px-3 py-2">
            Reporting year:{" "}
            <strong className="text-[#030454]">
              {reportingYear || "Not published"}
            </strong>
          </span>

          <span className="rounded-full bg-white px-3 py-2">
            Unit: <strong className="text-[#030454]">tCO₂e</strong>
          </span>

          <span className="rounded-full bg-white px-3 py-2">
            Data view:{" "}
            <strong className="text-[#030454]">Public summary</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

function SectorBreakdownChart({ rows }) {
  if (rows.length === 0) {
    return (
      <PublicEmptyState
        title="No public sector data available for this selection"
        message="This sector is available as a standard GHG inventory category, but approved public emissions data has not yet been published for it."
      />
    );
  }

  const maxValue = Math.max(...rows.map((row) => Number(getSectorValue(row) || 0)), 1);

  return (
    <div className="rounded-md border border-[#D8DDE2] bg-white p-5">
      <div className="mb-5">
        <h3 className="text-xl font-black text-[#030454]">
          Sector-level emissions breakdown
        </h3>

        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
          Public sector values are shown as estimated emissions where approved
          summary data is available.
        </p>
      </div>

      <div className="space-y-4">
        {rows.map((row, index) => {
          const value = Number(getSectorValue(row) || 0);
          const width = `${Math.min(Math.max((value / maxValue) * 100, 4), 100)}%`;
          const share = getSectorShare(row);

          return (
            <div
              key={`${getSectorName(row)}-${index}`}
              className="grid gap-3 md:grid-cols-[220px_130px_1fr_90px] md:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#030454]">
                  {getSectorName(row)}
                </p>
              </div>

              <p className="font-mono text-sm font-black text-[#030454]">
                {formatCompactNumber(value)} tCO₂e
              </p>

              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#009B35]"
                  style={{ width }}
                />
              </div>

              <p className="text-sm font-bold text-slate-500">
                {share !== null ? `${formatNumber(share, 1)}%` : "—"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InventoryOverviewPanel({
  ghg,
  projects,
  filteredSectorRows,
  selectedSector,
  onSectorChange,
  sectorOptions,
  reportingYear,
}) {

  const baselineMt = ghg.baseline_emissions_mtco2e;
  const baselineValue = hasValidNumber(baselineMt)
    ? `${formatNumber(baselineMt, 2)} MtCO₂e`
    : "Not published";

  const totalEmissions = hasValidNumber(ghg.total_emissions_tco2e)
    ? `${formatNumber(ghg.total_emissions_tco2e, 0)} tCO₂e`
    : hasValidNumber(ghg.state_emissions_mt)
      ? `${formatNumber(ghg.state_emissions_mt, 2)} MtCO₂e`
      : "Not published";

  const estimatedReduction = hasValidNumber(
    projects.total_expected_ghg_reduction_tco2e
  )
    ? `${formatNumber(projects.total_expected_ghg_reduction_tco2e, 0)} tCO₂e`
    : "Not published";

  return (
    <section className="bg-[#F7F9FA] px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1536px]">
        <div className="rounded-md border border-[#CAD2D7] bg-white shadow-sm">
          <div className="border-b border-[#E6EAEC] px-6 py-5">
            <h2 className="font-['Playfair_Display'] text-3xl font-bold text-[#030454]">
              Public greenhouse gas inventory overview
            </h2>

            <p className="mt-3 max-w-5xl text-sm leading-7 text-slate-600">
              This public view summarises greenhouse gas emissions information
              and estimated mitigation outcomes where approved summary data is
              available.
            </p>
          </div>

          <div className="space-y-6 p-5">
          <ExplorerControlBar
            selectedSector={selectedSector}
            onSectorChange={onSectorChange}
            sectorOptions={sectorOptions}
            reportingYear={reportingYear}
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              
              <SummaryChip
                label="State GHG baseline"
                value={baselineValue}
                helper="Kaduna State reference baseline for NDC and emissions progress tracking."
              />
              
              <SummaryChip
                label="Reporting year"
                value={reportingYear}
                helper="Most recent public inventory period."
              />

              <SummaryChip
                label="Estimated GHG emissions"
                value={totalEmissions}
                helper="Displayed only where approved summary data exists."
              />

              <SummaryChip
                label="Estimated GHG reduction"
                value={estimatedReduction}
                helper="Expected reduction from registered public climate projects."
              />
            </div>

            <SectorBreakdownChart rows={filteredSectorRows} />

            {selectedSector !== "all" && (
              <div className="rounded-md border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-5 py-4 text-sm leading-7 text-[#030454]">
                Showing public emissions information for{" "}
                <strong>{selectedSector}</strong>. Use the sector filter above to
                return to all sectors.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function AboutDataAccordion() {
  const [openItems, setOpenItems] = useState([]);

  function toggleItem(title) {
    setOpenItems((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : [...current, title]
    );
  }

  return (
    <section className="bg-[#F7F9FA] px-4 pb-14 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-['Playfair_Display'] text-3xl font-bold text-[#030454]">
          About the data
        </h2>

        <div className="mt-6 divide-y divide-[#D8DDE2] rounded-md border border-[#D8DDE2] bg-white">
          {aboutDataItems.map((item) => {
            const isOpen = openItems.includes(item.title);

            return (
              <div key={item.title}>
                <button
                  type="button"
                  onClick={() => toggleItem(item.title)}
                  className="flex w-full items-center justify-between gap-6 px-5 py-5 text-left"
                >
                  <span className="font-bold text-[#030454]">{item.title}</span>

                  <span className="text-xl font-black text-[#009B35]">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 text-sm leading-7 text-slate-600">
                    {item.body}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function PublicGHGInventoryPage() {
  const [summaryData, setSummaryData] = useState(null);
  const [selectedSector, setSelectedSector] = useState("all");
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

  const sectorRows = useMemo(() => {
    const rows = ghg.by_sector || ghg.sector_totals || ghg.sectors || [];

    return [...rows].sort(
      (a, b) => Number(getSectorValue(b) || 0) - Number(getSectorValue(a) || 0)
    );
  }, [ghg]);

  const sectorOptions = useMemo(() => {
    const publishedSectors = sectorRows.map((row) => getSectorName(row));

    return Array.from(
      new Set([...STANDARD_SECTOR_OPTIONS, ...publishedSectors])
    );
  }, [sectorRows]);

  const filteredSectorRows = useMemo(() => {
    if (selectedSector === "all") return sectorRows;

    return sectorRows.filter((row) => getSectorName(row) === selectedSector);
  }, [sectorRows, selectedSector]);

  const reportingYear = ghg.latest_year || ghg.reporting_year || "";

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <PublicPortalHeader
        activePage="ghg"
        compact
        title={<>Greenhouse gas inventory</>}
        description="Explore public greenhouse gas inventory summaries, sector-level emissions information and estimated mitigation outcomes."
        showActions={false}
      />

      {error && (
        <section className="px-4 py-4 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1536px] rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        </section>
      )}

      {isLoading ? (
        <section className="px-4 py-16 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1536px] rounded-sm border border-[#CAD2D7] bg-white p-8 text-sm text-slate-500 shadow-sm">
            Loading public GHG inventory information...
          </div>
        </section>
      ) : (
        <>
         <InventoryOverviewPanel
          ghg={ghg}
          projects={projects}
          filteredSectorRows={filteredSectorRows}
          selectedSector={selectedSector}
          onSectorChange={setSelectedSector}
          sectorOptions={sectorOptions}
          reportingYear={reportingYear}
        />

          <AboutDataAccordion />
        </>
      )}

      <PublicPortalFooter />
    </main>
  );
}