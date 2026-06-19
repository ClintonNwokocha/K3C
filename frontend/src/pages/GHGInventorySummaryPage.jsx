import { useEffect, useMemo, useState } from "react";
import {
  PublicEmptyState,
  PublicPortalFooter,
  PublicPortalHeader,
} from "../components/PublicPortalChrome";
import { getPublicPortalSummary } from "../services/api";

const STANDARD_SECTOR_OPTIONS = [
  "Energy",
  "IPPU",
  "Agriculture",
  "LULUCF",
  "Waste",
];

const sectorInsightCopy = {
  Energy: {
    title: "Energy systems are usually the largest emissions driver.",
    body: "Energy-sector emissions often come from electricity use, fuel combustion, transport, generators and industrial energy demand. Tracking this sector helps identify mitigation opportunities around efficiency, cleaner energy and transport transition.",
  },
  IPPU: {
    title: "Industrial processes require technical emissions accounting.",
    body: "IPPU covers emissions from industrial processes and product use. Public values should be interpreted with methodology notes because emissions may depend on production activity and sector-specific factors.",
  },
  Agriculture: {
    title: "Agriculture connects emissions with food security.",
    body: "Agriculture emissions may be linked to livestock, soil management, fertiliser use and land-based production. Mitigation must be balanced with livelihoods and food-system resilience.",
  },
  LULUCF: {
    title: "Land use can be an emissions source or a removal opportunity.",
    body: "LULUCF tracks land-use change, forests, vegetation and carbon removals. It is important for climate action because restoration and improved land management can support carbon sequestration.",
  },
  Waste: {
    title: "Waste emissions can be reduced through better systems.",
    body: "Waste-sector emissions are commonly linked to solid waste, wastewater and methane generation. Better collection, treatment, recycling and landfill management can reduce emissions.",
  },
};

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
    title: "Where will Google Earth Engine data fit in?",
    body: "Google Earth Engine data should feed the backend first, then the public portal should display processed indicators such as vegetation condition, tree cover, land-use change, LULUCF signals and spatial emissions context.",
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

function getFirstValidNumber(...values) {
  return values.find((value) => hasValidNumber(value));
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

function getGhgObject(summaryData) {
  return (
    summaryData?.ghg_inventory ||
    summaryData?.ghg ||
    summaryData?.emissions ||
    {}
  );
}

function getSectorRows(ghg) {
  const rows = ghg.by_sector || ghg.sector_totals || ghg.sectors || [];

  return [...rows].sort(
    (a, b) => Number(getSectorValue(b) || 0) - Number(getSectorValue(a) || 0)
  );
}

function getTotalEmissions(ghg, sectorRows) {
  const directValue = getFirstValidNumber(
    ghg.total_emissions_tco2e,
    ghg.total_emissions,
    ghg.gross_emissions_tco2e
  );

  if (hasValidNumber(directValue)) return directValue;

  const sectorTotal = sectorRows.reduce((total, row) => {
    return total + Number(getSectorValue(row) || 0);
  }, 0);

  return sectorTotal || null;
}

function getTotalRemovals(ghg) {
  return getFirstValidNumber(
    ghg.total_removals_tco2e,
    ghg.removals_tco2e,
    ghg.total_carbon_removals_tco2e,
    0
  );
}

function getTopSector(sectorRows) {
  if (!sectorRows.length) return null;

  return sectorRows[0];
}

function SummaryChip({ label, value, helper, tone = "default" }) {
  const toneClasses = {
    default: "border-[#D8DDE2] bg-white",
    blue: "border-[#030454]/20 bg-[#030454]/5",
    green: "border-[#009B35]/20 bg-[#009B35]/5",
    yellow: "border-[#F3F74B] bg-[#F3F74B]/20",
  };

  return (
    <div
      className={`rounded-md border px-4 py-4 ${
        toneClasses[tone] || toneClasses.default
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-xl font-black text-[#030454]">{value}</p>

      {helper && <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>}
    </div>
  );
}

function GhgMetricRibbon({ ghg, projects, reportingYear, sectorRows }) {
  const baselineMt = getFirstValidNumber(
    ghg.baseline_emissions_mtco2e,
    ghg.state_emissions_mt,
    ghg.baseline_mtco2e
  );

  const totalEmissions = getTotalEmissions(ghg, sectorRows);
  const totalRemovals = getTotalRemovals(ghg);
  const netEmissions =
    hasValidNumber(totalEmissions) && hasValidNumber(totalRemovals)
      ? Number(totalEmissions) - Number(totalRemovals)
      : null;

  const topSector = getTopSector(sectorRows);
  const targetYear = ghg.target_year || ghg.ndc_target_year || "2030";

  const items = [
    {
      label: "Baseline",
      value: hasValidNumber(baselineMt)
        ? `${formatNumber(baselineMt, 2)} MtCO₂e`
        : "Not published",
    },
    {
      label: "Total emissions",
      value: hasValidNumber(totalEmissions)
        ? `${formatCompactNumber(totalEmissions)} tCO₂e`
        : "Not published",
    },
    {
      label: "Total removals",
      value: hasValidNumber(totalRemovals)
        ? `${formatCompactNumber(totalRemovals)} tCO₂e`
        : "Not published",
    },
    {
      label: "Net emissions",
      value: hasValidNumber(netEmissions)
        ? `${formatCompactNumber(netEmissions)} tCO₂e`
        : "Not published",
    },
    {
      label: "Top sector",
      value: topSector ? getSectorName(topSector) : "Not published",
    },
    {
      label: "Reporting year",
      value: reportingYear || "Not published",
    },
    {
      label: "Target year",
      value: targetYear,
    },
    {
      label: "Project reductions",
      value: `${formatCompactNumber(
        projects.total_expected_ghg_reduction_tco2e
      )} tCO₂e`,
    },
  ];

  const scrollingItems = [...items, ...items];

  return (
    <section className="overflow-hidden border-y border-[#D8DDE2] bg-white">
      <style>
        {`
          @keyframes ghg-info-ribbon {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }

          .ghg-info-ribbon-track {
            width: max-content;
            animation: ghg-info-ribbon 55s linear infinite;
            will-change: transform;
          }

          .ghg-info-ribbon-track:hover {
            animation-play-state: paused;
          }

          @media (prefers-reduced-motion: reduce) {
            .ghg-info-ribbon-track {
              animation: none;
              flex-wrap: wrap;
              width: 100%;
            }
          }
        `}
      </style>

      <div className="ghg-info-ribbon-track flex">
        {scrollingItems.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            className="flex min-w-[280px] items-center gap-4 border-r border-[#E6EAEC] px-7 py-5"
          >
            <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-[#009B35]" />

            <span>
              <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                {item.label}
              </span>

              <strong className="mt-1 block text-xl font-black tracking-tight text-[#030454]">
                {item.value}
              </strong>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BaselineIntelligencePanel({ ghg, projects, reportingYear, sectorRows }) {
  const baselineMt = getFirstValidNumber(
    ghg.baseline_emissions_mtco2e,
    ghg.state_emissions_mt,
    ghg.baseline_mtco2e
  );

  const nigeriaBaselineMt = getFirstValidNumber(
    ghg.nigeria_baseline_mtco2e,
    ghg.national_baseline_mtco2e,
    ghg.nigeria_emissions_mtco2e
  );

  const kadunaShare = getFirstValidNumber(
    ghg.kaduna_share_of_national_pct,
    ghg.share_of_national_pct,
    ghg.national_share_pct
  );

  const estimatedReduction = getFirstValidNumber(
    projects.total_expected_ghg_reduction_tco2e,
    ghg.estimated_reduction_tco2e
  );

  const totalEmissions = getTotalEmissions(ghg, sectorRows);

  return (
    <section className="bg-[#F7F9FA] px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-[1536px] gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="overflow-hidden rounded-xl border border-[#CAD2D7] bg-[#030454] text-white shadow-sm">
          <div className="relative p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(0,155,53,0.35),transparent_30%),radial-gradient(circle_at_90%_10%,rgba(243,247,75,0.18),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.06)_0_1px,transparent_1px_34px)]" />

            <div className="relative">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F3F74B]">
                GHG baseline intelligence
              </p>

              <h2 className="mt-4 font-['Playfair_Display'] text-4xl font-bold leading-tight text-white md:text-5xl">
                Kaduna’s emissions baseline is the reference point for tracking
                climate progress.
              </h2>

              <p className="mt-5 max-w-3xl text-sm leading-7 text-white/75">
                This public view translates greenhouse gas inventory information
                into baseline, sector, reduction and target signals for public
                decision support.
              </p>

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                <div className="rounded-md border border-white/10 bg-white/10 p-5 backdrop-blur">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/55">
                    Kaduna baseline
                  </p>

                  <p className="mt-2 text-3xl font-black text-white">
                    {hasValidNumber(baselineMt)
                      ? `${formatNumber(baselineMt, 2)} MtCO₂e`
                      : "Not published"}
                  </p>

                  <p className="mt-2 text-xs leading-5 text-white/60">
                    State reference baseline for tracking emissions progress.
                  </p>
                </div>

                <div className="rounded-md border border-white/10 bg-white/10 p-5 backdrop-blur">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/55">
                    Total emissions
                  </p>

                  <p className="mt-2 text-3xl font-black text-white">
                    {hasValidNumber(totalEmissions)
                      ? `${formatCompactNumber(totalEmissions)} tCO₂e`
                      : "Not published"}
                  </p>

                  <p className="mt-2 text-xs leading-5 text-white/60">
                    Public emissions total where sector data is available.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SummaryChip
            label="Nigeria baseline"
            value={
              hasValidNumber(nigeriaBaselineMt)
                ? `${formatNumber(nigeriaBaselineMt, 0)} MtCO₂e`
                : "Not published"
            }
            helper="National baseline used for public comparison where available."
            tone="blue"
          />

          <SummaryChip
            label="Kaduna share"
            value={
              hasValidNumber(kadunaShare)
                ? `${formatNumber(kadunaShare, 1)}%`
                : "Not published"
            }
            helper="Kaduna's approximate share of the national baseline."
            tone="green"
          />

          <SummaryChip
            label="Reporting year"
            value={reportingYear || "Not published"}
            helper="Latest public inventory period where available."
            tone="yellow"
          />

          <SummaryChip
            label="Project reductions"
            value={
              hasValidNumber(estimatedReduction)
                ? `${formatCompactNumber(estimatedReduction)} tCO₂e`
                : "Not published"
            }
            helper="Expected mitigation outcomes from public climate projects."
            tone="default"
          />
        </div>
      </div>
    </section>
  );
}

function NdcPathwayPanel({ ghg }) {
  const targetYear = ghg.target_year || ghg.ndc_target_year || "2030";

  const unconditionalTarget = getFirstValidNumber(
    ghg.unconditional_reduction_pct,
    ghg.ndc_unconditional_reduction_pct,
    ghg.unconditional_target_pct
  );

  const conditionalTarget = getFirstValidNumber(
    ghg.conditional_reduction_pct,
    ghg.ndc_conditional_reduction_pct,
    ghg.conditional_target_pct
  );

  const unconditionalWidth = hasValidNumber(unconditionalTarget)
    ? `${Math.min(Math.max(Number(unconditionalTarget), 5), 100)}%`
    : "0%";

  const conditionalWidth = hasValidNumber(conditionalTarget)
    ? `${Math.min(Math.max(Number(conditionalTarget), 5), 100)}%`
    : "0%";

  return (
    <section className="bg-[#F7F9FA] px-4 pb-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1536px]">
        <div className="rounded-xl border border-[#D8DDE2] bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#009B35]">
                Reduction pathway
              </p>

              <h3 className="mt-2 font-['Playfair_Display'] text-3xl font-bold text-[#030454]">
                Public NDC target signal for {targetYear}
              </h3>
            </div>

            <span className="w-fit rounded-full bg-[#F3F74B]/35 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#030454]">
              Baseline to target
            </span>
          </div>

          <div className="mt-8 space-y-6">
            <div>
              <div className="mb-2 flex justify-between text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                <span>Unconditional reduction</span>
                <span>
                  {hasValidNumber(unconditionalTarget)
                    ? `${formatNumber(unconditionalTarget, 0)}%`
                    : "Not published"}
                </span>
              </div>

              <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#009B35]"
                  style={{ width: unconditionalWidth }}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex justify-between text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                <span>Conditional reduction</span>
                <span>
                  {hasValidNumber(conditionalTarget)
                    ? `${formatNumber(conditionalTarget, 0)}%`
                    : "Not published"}
                </span>
              </div>

              <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#030454]"
                  style={{ width: conditionalWidth }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-md border-l-4 border-[#F3F74B] bg-[#F3F74B]/20 px-5 py-4 text-sm leading-7 text-[#030454]">
            These percentages communicate the public target pathway. Formal
            reporting should still rely on approved inventory methodology
            documents, validated datasets and published technical reports.
          </div>
        </div>
      </div>
    </section>
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
        <label className="block">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            Sector
          </span>

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
        </label>

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

  const maxValue = Math.max(
    ...rows.map((row) => Number(getSectorValue(row) || 0)),
    1
  );

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
          const width = `${Math.min(
            Math.max((value / maxValue) * 100, 4),
            100
          )}%`;
          const share = getSectorShare(row);

          return (
            <div
              key={`${getSectorName(row)}-${index}`}
              className="group grid gap-3 rounded-md p-2 transition hover:bg-[#F7F9FA] md:grid-cols-[220px_130px_1fr_90px] md:items-center"
              title={`${getSectorName(row)}: ${formatNumber(value, 0)} tCO₂e`}
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
                  className="h-full rounded-full bg-[#009B35] transition group-hover:bg-[#030454]"
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

function SectorInsightPanel({ selectedSector }) {
  const insight =
    selectedSector !== "all"
      ? sectorInsightCopy[selectedSector]
      : {
          title:
            "Sector filtering helps identify where emissions action may matter most.",
          body: "Use the sector selector to focus on Energy, IPPU, Agriculture, LULUCF or Waste. Public data should be interpreted as summary-level evidence until detailed methodology and technical reports are consulted.",
        };

  return (
    <div className="rounded-md border border-[#D8DDE2] bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#009B35]">
        What this means
      </p>

      <h3 className="mt-3 text-2xl font-black leading-tight text-[#030454]">
        {insight?.title || "Sector insight is not yet available."}
      </h3>

      <p className="mt-4 text-sm leading-7 text-slate-600">
        {insight?.body ||
          "This sector is part of the standard public GHG inventory structure."}
      </p>

      <div className="mt-5 rounded-md border-l-4 border-[#F3F74B] bg-[#F3F74B]/20 px-5 py-4 text-sm leading-7 text-[#030454]">
        Public guidance: use this page for awareness and coordination. Use
        official inventory reports for formal accounting and reporting.
      </div>
    </div>
  );
}

function GeeReadinessPanel() {
  return (
    <section className="border-y border-[#D8DDE2] bg-white px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-[1536px] gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#009B35]">
            Next backend milestone
          </p>

          <h2 className="mt-2 font-['Playfair_Display'] text-3xl font-bold text-[#030454]">
            Google Earth Engine data will connect after this page is stable.
          </h2>

          <p className="mt-4 text-sm leading-7 text-slate-600">
            GEE should feed processed indicators into Django first. The public
            page should only display approved outputs from the backend, not call
            Earth Engine directly from React.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {[
            "Tree cover and forest change",
            "Vegetation condition",
            "LULUCF activity signals",
            "Land surface temperature",
            "Rainfall anomaly",
            "LGA-level spatial summaries",
          ].map((item) => (
            <div
              key={item}
              className="rounded-md border border-[#D8DDE2] bg-[#F7F9FA] px-4 py-4 text-sm font-bold text-[#030454]"
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function InventoryOverviewPanel({
  filteredSectorRows,
  selectedSector,
  onSectorChange,
  sectorOptions,
  reportingYear,
}) {
  return (
    <section className="bg-[#F7F9FA] px-4 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1536px]">
        <div className="rounded-xl border border-[#CAD2D7] bg-white shadow-sm">
          <div className="border-b border-[#E6EAEC] px-6 py-5">
            <h2 className="font-['Playfair_Display'] text-3xl font-bold text-[#030454]">
              Public greenhouse gas inventory explorer
            </h2>

            <p className="mt-3 max-w-5xl text-sm leading-7 text-slate-600">
              Filter sector-level GHG data and interpret what the public summary
              means for climate action planning.
            </p>
          </div>

          <div className="space-y-6 p-5">
            <ExplorerControlBar
              selectedSector={selectedSector}
              onSectorChange={onSectorChange}
              sectorOptions={sectorOptions}
              reportingYear={reportingYear}
            />

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <SectorBreakdownChart rows={filteredSectorRows} />

              <SectorInsightPanel selectedSector={selectedSector} />
            </div>

            {selectedSector !== "all" && (
              <div className="rounded-md border-l-4 border-[#F3F74B] bg-[#F3F74B]/25 px-5 py-4 text-sm leading-7 text-[#030454]">
                Showing public emissions information for{" "}
                <strong>{selectedSector}</strong>. Use the sector filter above
                to return to all sectors.
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

  const ghg = getGhgObject(summaryData);
  const projects = summaryData?.projects || {};

  const sectorRows = useMemo(() => {
    return getSectorRows(ghg);
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
          <GhgMetricRibbon
            ghg={ghg}
            projects={projects}
            reportingYear={reportingYear}
            sectorRows={sectorRows}
          />

          <BaselineIntelligencePanel
            ghg={ghg}
            projects={projects}
            reportingYear={reportingYear}
            sectorRows={sectorRows}
          />

          <NdcPathwayPanel ghg={ghg} />

          <InventoryOverviewPanel
            filteredSectorRows={filteredSectorRows}
            selectedSector={selectedSector}
            onSectorChange={setSelectedSector}
            sectorOptions={sectorOptions}
            reportingYear={reportingYear}
          />

          <GeeReadinessPanel />

          <AboutDataAccordion />
        </>
      )}

      <PublicPortalFooter />
    </main>
  );
}