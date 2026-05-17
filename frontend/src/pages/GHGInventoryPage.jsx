import { useState } from "react";
import GHGAgriculturePage from "./GHGAgriculturePage";
import GHGEnergyPage from "./GHGEnergyPage";

export default function GHGInventoryPage({ foundation, currentUser }) {
  const [activeSector, setActiveSector] = useState("energy");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-medium text-slate-500">
          GHG Sector Workspace
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setActiveSector("energy")}
            className={`rounded-full px-5 py-2 text-sm font-medium transition ${
              activeSector === "energy"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Energy
          </button>

          <button
            onClick={() => setActiveSector("agriculture")}
            className={`rounded-full px-5 py-2 text-sm font-medium transition ${
              activeSector === "agriculture"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Agriculture
          </button>

          <button
            disabled
            className="cursor-not-allowed rounded-full bg-slate-50 px-5 py-2 text-sm font-medium text-slate-400"
          >
            Waste
          </button>

          <button
            disabled
            className="cursor-not-allowed rounded-full bg-slate-50 px-5 py-2 text-sm font-medium text-slate-400"
          >
            LULUCF
          </button>

          <button
            disabled
            className="cursor-not-allowed rounded-full bg-slate-50 px-5 py-2 text-sm font-medium text-slate-400"
          >
            IPPU
          </button>
        </div>
      </div>

      {activeSector === "energy" ? (
        <GHGEnergyPage foundation={foundation} currentUser={currentUser} />
      ) : (
        <GHGAgriculturePage foundation={foundation} currentUser={currentUser} />
      )}
    </div>
  );
}