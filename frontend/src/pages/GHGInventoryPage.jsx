import { useEffect, useState } from "react";
import { getGHGDashboardSummary } from "../services/api";
import GHGAgriculturePage from "./GHGAgriculturePage";
import GHGEnergyPage from "./GHGEnergyPage";
import GHGInventorySummaryPage from "./GHGInventorySummaryPage";
import GHGIPPUPage from "./GHGIPPUPage";
import GHGLULUCFPage from "./GHGLULUCFPage";
import GHGWastePage from "./GHGWastePage";

export default function GHGInventoryPage({ foundation, currentUser }) {
  const [activeSector, setActiveSector] = useState("summary");
  const [ghgSummary, setGhgSummary] = useState(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);

  async function loadSummary() {
    setIsSummaryLoading(true);

    try {
      const data = await getGHGDashboardSummary();
      setGhgSummary(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSummaryLoading(false);
    }
  }

  useEffect(() => {
    if (activeSector === "summary") {
      loadSummary();
    }
  }, [activeSector]);

  const sectorButtons = [
    { key: "summary", label: "Summary" },
    { key: "energy", label: "Energy" },
    { key: "agriculture", label: "Agriculture" },
    { key: "waste", label: "Waste" },
    { key: "ippu", label: "IPPU" },
    { key: "lulucf", label: "LULUCF" },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-medium text-slate-500">
          GHG Sector Workspace
        </p>

        <div className="flex flex-wrap gap-3">
          {sectorButtons.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveSector(item.key)}
              className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                activeSector === item.key
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {activeSector === "summary" && (
        <GHGInventorySummaryPage
          ghgSummary={ghgSummary}
          isLoading={isSummaryLoading}
          onRefresh={loadSummary}
          onOpenSector={setActiveSector}
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