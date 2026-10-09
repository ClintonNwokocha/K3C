import { useEffect, useState } from "react";
import {
  CommandButton,
  CommandNotice,
  CommandPageHeader,
  CommandTabs,
} from "../components/CommandUI";
import { getGHGDashboardSummary } from "../services/api";
import GHGAgriculturePage from "./GHGAgriculturePage";
import GHGEnergyPage from "./GHGEnergyPage";
import GHGInventorySummaryPage from "./GHGInventorySummaryPage";
import GHGIPPUPage from "./GHGIPPUPage";
import GHGLULUCFPage from "./GHGLULUCFPage";
import GHGWastePage from "./GHGWastePage";

const sectorTabs = [
  { key: "summary", label: "Summary" },
  { key: "energy", label: "Energy" },
  { key: "agriculture", label: "Agriculture" },
  { key: "waste", label: "Waste" },
  { key: "ippu", label: "IPPU" },
  { key: "lulucf", label: "LULUCF" },
];

const sectorDescriptions = {
  summary:
    "Review the overall greenhouse gas inventory summary across major reporting sectors.",
  energy:
    "Manage activity data and emissions records for stationary combustion, transport and energy-related sources.",
  agriculture:
    "Manage agriculture emissions records, livestock activity data and land-based agricultural sources.",
  waste:
    "Manage waste-sector activity data, disposal records, wastewater data and related emissions.",
  ippu:
    "Manage industrial processes and product-use activity records for inventory reporting.",
  lulucf:
    "Manage land use, land-use change and forestry records for emissions and removals accounting.",
};

export default function GHGInventoryPage({
  foundation,
  currentUser,
  sharedSector,
  sharedLgaName,
}) {
  // Stays on the Summary tab even when arriving with shared sector context
  // — "View related emissions" means look at the dashboard, not jump into
  // the sector's data-entry workspace (a different, unrelated action already
  // reachable via each SectorCard's own "Open Sector Workspace" button).
  const [activeSector, setActiveSector] = useState("summary");
  const [ghgSummary, setGhgSummary] = useState(null);
  const [isSummaryLoadingState, setIsSummaryLoading] = useState(false);
  const [error, setError] = useState("");

  const [settledSector, setSettledSector] = useState(null);
  const isSummaryLoading =
    isSummaryLoadingState ||
    (activeSector === "summary" && settledSector !== activeSector);

  async function loadSummary() {
    setIsSummaryLoading(true);
    setError("");

    try {
      const data = await getGHGDashboardSummary();
      setGhgSummary(data);
    } catch (err) {
      console.error(err);
      setError("Could not load GHG inventory summary.");
    } finally {
      setIsSummaryLoading(false);
    }
  }

  useEffect(() => {
    if (activeSector !== "summary") return undefined;

    let cancelled = false;
    const sector = activeSector;

    getGHGDashboardSummary()
      .then((data) => {
        if (!cancelled) {
          setGhgSummary(data);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setError("Could not load GHG inventory summary.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSettledSector(sector);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSector]);

  const sharedSectorLabel = sectorTabs.find((tab) => tab.key === sharedSector)?.label || "";

  return (
    <div className="space-y-6">
      <CommandPageHeader
        title="GHG Inventory"
        description="Greenhouse gas inventory workspace for sector activity data, emissions records, reporting summaries and review-ready climate accounting outputs."
        actions={
          activeSector === "summary" ? (
            <CommandButton
              variant="outline"
              onClick={loadSummary}
              disabled={isSummaryLoading}
            >
              {isSummaryLoading ? "Refreshing..." : "Refresh Summary"}
            </CommandButton>
          ) : null
        }
      />

      {sharedLgaName && (
        <div className="rounded-xl border border-[#173B91]/30 bg-[#EEF1FD] px-5 py-3 text-sm text-[#030454]">
          <p>
            Viewing Kaduna State-wide{sharedSectorLabel ? ` ${sharedSectorLabel}` : ""} emissions in
            the context of climate-action opportunities identified for <strong>{sharedLgaName}</strong>.
          </p>
          <p className="mt-1 text-xs text-[#030454]/70">
            GHG inventory figures are reported at Kaduna State level and are not {sharedLgaName}-specific
            emissions.
          </p>
        </div>
      )}

      {error && (
        <CommandNotice title="GHG inventory error" tone="red">
          {error}
        </CommandNotice>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="text-xl font-black text-[#030454]">
            Sector Workspace
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            {sectorDescriptions[activeSector]}
          </p>
        </div>

        <CommandTabs
          tabs={sectorTabs}
          activeTab={activeSector}
          onChange={setActiveSector}
        />
      </section>

      {activeSector === "summary" && (
        <GHGInventorySummaryPage
          ghgSummary={ghgSummary}
          isLoading={isSummaryLoading}
          onRefresh={loadSummary}
          onOpenSector={setActiveSector}
          highlightSector={sharedSector}
        />
      )}

      {activeSector === "energy" && (
        <GHGEnergyPage foundation={foundation} currentUser={currentUser} />
      )}

      {activeSector === "agriculture" && (
        <GHGAgriculturePage foundation={foundation} currentUser={currentUser} />
      )}

      {activeSector === "waste" && (
        <GHGWastePage foundation={foundation} currentUser={currentUser} />
      )}

      {activeSector === "ippu" && (
        <GHGIPPUPage foundation={foundation} currentUser={currentUser} />
      )}

      {activeSector === "lulucf" && (
        <GHGLULUCFPage foundation={foundation} currentUser={currentUser} />
      )}
    </div>
  );
}