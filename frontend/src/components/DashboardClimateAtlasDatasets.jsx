import { CLIMATE_ATLAS_LAYER_CONFIGS } from "../config/climateAtlasLayers";

// Fixed display order for the datasets that exist today; any future
// newly-published layer key not listed here still renders — it's appended
// at the end rather than dropped, so the panel never silently hides data.
const DATASET_DISPLAY_ORDER = [
  "rainfall",
  "rainfall_anomaly",
  "ndvi",
  "ndvi_landsat",
  "drought_index",
  "lst",
  "annual_lulc",
  "flood_occurrence",
];

// The backend's ndvi_landsat entry has no matching Atlas config of its own —
// it shares the "ndvi" config, using the archive coverage note instead.
function resolveCoverageNote(key) {
  if (key === "ndvi_landsat") {
    return CLIMATE_ATLAS_LAYER_CONFIGS.ndvi?.archiveCoverageNote || null;
  }
  return CLIMATE_ATLAS_LAYER_CONFIGS[key]?.coverageNote || null;
}

function formatSyncedAt(value) {
  if (!value) return "Static archive";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Static archive";
  return `Synced ${date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}`;
}

function DatasetCard({ entry }) {
  const coverageNote = resolveCoverageNote(entry.key);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="font-black text-[#030454]">{entry.label}</p>

      <p className="mt-1 text-xs font-bold uppercase tracking-[0.1em] text-slate-400">
        {entry.unit}
      </p>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        {coverageNote || entry.description}
      </p>

      <p className="mt-3 text-xs font-bold text-[#009B35]">
        {formatSyncedAt(entry.last_synced_at)}
      </p>
    </div>
  );
}

// Concise executive summary of the datasets published on the public Climate
// Atlas — deliberately no map, no layer toggles, no GIS controls. Data is
// supplied by useExecutiveDashboardData (fetched once in Dashboard.jsx).
export default function DashboardClimateAtlasDatasets({ layers, loading, error }) {
  const entries = layers?.results || [];

  const orderedEntries = [...entries].sort((a, b) => {
    const aIndex = DATASET_DISPLAY_ORDER.indexOf(a.key);
    const bIndex = DATASET_DISPLAY_ORDER.indexOf(b.key);
    const aRank = aIndex === -1 ? DATASET_DISPLAY_ORDER.length : aIndex;
    const bRank = bIndex === -1 ? DATASET_DISPLAY_ORDER.length : bIndex;
    return aRank - bRank;
  });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-[#030454]">
            Public climate datasets now available
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {loading
              ? "Loading published dataset catalogue…"
              : `${orderedEntries.length} live remote-sensing and climate dataset${
                  orderedEntries.length === 1 ? "" : "s"
                } published on the Kaduna Climate Atlas.`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            window.location.href = "/public/climate-atlas";
          }}
          className="rounded-md bg-[#009B35] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#00842e]"
        >
          Open Climate Atlas
        </button>
      </div>

      {error && (
        <p className="mt-4 text-xs font-bold text-red-600">
          Couldn't load the published dataset catalogue.
        </p>
      )}

      {!loading && !error && orderedEntries.length === 0 && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
          No public datasets are currently published.
        </div>
      )}

      {orderedEntries.length > 0 && (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {orderedEntries.map((entry) => (
            <DatasetCard key={entry.key} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}
