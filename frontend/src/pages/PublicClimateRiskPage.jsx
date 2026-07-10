import { useEffect, useMemo, useState } from "react";
import {
  PublicPortalFooter,
  PublicPortalHeader,
  PublicSectionIntro,
} from "../components/PublicPortalChrome";
import { getRemoteSensingLayers, getRemoteSensingLgaStats } from "../services/api";

// ---------------------------------------------------------------------------
// Data layer definitions — mirrors the sync_registry.py layer catalogue
// ---------------------------------------------------------------------------

const DATA_LAYERS = [
  {
    key: "ndvi",
    sourceLayers: ["ndvi", "ndvi_landsat"],
    label: "Vegetation / NDVI",
    status: "available",
    bullets: [
      "Landsat archive: 1985–2017, with documented archive gaps",
      "Sentinel-2: 2018–2025",
    ],
    detail: "23 LGAs · Annual, Wet & Dry seasons",
    source: "Landsat C2 L2 (LT05 / LE07 / LC08) · Sentinel-2 SR Harmonized · Google Earth Engine",
    note: "Landsat and Sentinel-2 NDVI are separate datasets, not a single calibrated series.",
  },
  {
    key: "rainfall",
    sourceLayers: ["rainfall"],
    label: "Rainfall",
    status: "in_development",
    detail: "CHIRPS v2.0 — implementation in progress",
    source: "",
  },
  {
    key: "lst",
    sourceLayers: ["lst"],
    label: "Land Surface Temperature (Daytime)",
    status: "available",
    bullets: [
      "MODIS Terra MOD11A1: 2001–2025",
      "Annual, Wet & Dry seasons · 23 LGAs",
    ],
    detail: "Daily quality-filtered daytime LST · 1 km resolution",
    source: "MODIS Terra MOD11A1 v061 · Google Earth Engine",
    note: "Daytime LST — not equivalent to air temperature.",
  },
  {
    key: "flood_hazard",
    label: "Flood Hazard",
    status: "planned",
    detail: "JRC / Sentinel-1 SAR — method decision required",
    source: "",
  },
  {
    key: "drought_index",
    sourceLayers: ["drought_index"],
    label: "Meteorological Drought Conditions (SPI)",
    status: "available",
    bullets: [
      "Fixed-window precipitation-only SPI",
      "Separate Annual, Wet Season, and Dry Season Gamma fits",
      "1991-2020 baseline",
    ],
    detail: "Annual/Wet 1981-2025, Dry Season 1982-2025",
    source: "CHIRPS v2.0 Daily rainfall totals",
    note: "Not an agricultural or hydrological drought indicator.",
  },
  {
    key: "lulc",
    label: "Land-cover Change",
    status: "planned",
    detail: "ESA WorldCover / ESRI LULC — pending implementation",
    source: "",
  },
  {
    key: "rainfall_anomaly",
    sourceLayers: ["rainfall_anomaly"],
    label: "Rainfall Anomaly",
    status: "available",
    bullets: [
      "Database-derived from CHIRPS rainfall totals",
      "Percentage departure from the 1991–2020 LGA baseline",
      "Annual, Wet Season, and Dry Season coverage",
    ],
    detail: "Annual/Wet 1981–2025 · Dry Season 1982–2025 · 23 LGAs",
    source: "CHIRPS v2.0 Daily · 1991–2020 baseline · build_rainfall_anomaly command",
    note: "Not a drought index. Interpret alongside seasonal rainfall totals.",
  },
  {
    key: "local_obs",
    label: "Local Observations",
    status: "design_phase",
    detail: "Weather stations & river gauges — design phase",
    source: "",
  },
];

const METHOD_NOTES = [
  {
    key: "rainfall_anomaly",
    label: "Rainfall Anomaly (%)",
    status: "available",
    bullets: [
      "Database-derived from CHIRPS rainfall totals",
      "Percentage departure from the 1991-2020 LGA baseline",
      "Public layer with database-backed seasonal comparison metadata",
    ],
    detail: "Annual/Wet 1981-2025, Dry Season 1982-2025",
    source: "CHIRPS v2.0 Daily rainfall totals",
    note: "Keep this distinct from Rainfall Total and from SPI.",
  },
  {
    key: "drought_index",
    label: "Meteorological Drought Conditions (SPI)",
    status: "available",
    bullets: [
      "Fixed-window precipitation-only SPI",
      "Separate Annual, Wet Season, and Dry Season Gamma fits",
      "Public layer with precipitation-only meteorological drought interpretation",
    ],
    detail: "Annual/Wet 1981-2025, Dry Season 1982-2025",
    source: "CHIRPS v2.0 Daily rainfall totals",
    note: "Not an agricultural or hydrological drought indicator.",
  },
];

const STATUS_META = {
  available:     { label: "Available",      chipClass: "border-[#009B35]/30 bg-[#009B35]/8 text-[#007a29]" },
  in_development:{ label: "In development", chipClass: "border-amber-200 bg-amber-50 text-amber-700" },
  planned:       { label: "Planned",        chipClass: "border-slate-200 bg-slate-50 text-slate-600" },
  design_phase:  { label: "Design phase",   chipClass: "border-slate-200 bg-slate-50 text-slate-500" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeNdvi(rawValue) {
  const n = parseFloat(rawValue);
  return Number.isFinite(n) ? n : null;
}

function barPct(ndviValue) {
  return Math.max(0, Math.min(100, ndviValue * 100)).toFixed(1);
}

function countWithData(dataset) {
  if (!dataset?.results) return 0;
  return dataset.results.filter((item) => safeNdvi(item.mean_value) !== null).length;
}

function stateMeanNdvi(dataset) {
  if (!dataset?.results?.length) return null;
  const vals = dataset.results
    .map((r) => safeNdvi(r.mean_value))
    .filter((v) => v !== null);
  if (!vals.length) return null;
  return vals.reduce((sum, v) => sum + v, 0) / vals.length;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingBlock({ label }) {
  return (
    <div className="rounded-md border border-[#CAD2D7] bg-[#F7F9FA] p-6 text-sm text-slate-500">
      {label}
    </div>
  );
}

function ErrorBlock({ message }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
      {message}
    </div>
  );
}

function StatChip({ value, loading, label }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-[#CAD2D7] bg-white px-6 py-6 shadow-sm">
      <span className="text-3xl font-black text-[#030454]">
        {loading ? "—" : value}
      </span>
      <span className="mt-1.5 text-center text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </span>
    </div>
  );
}

function NdviBarChart({ results, isLoading }) {
  const sorted = useMemo(() => {
    if (!results) return [];
    return [...results]
      .map((item) => ({ ...item, _ndvi: safeNdvi(item.mean_value) }))
      .filter((item) => item._ndvi !== null)
      .sort((a, b) => b._ndvi - a._ndvi);
  }, [results]);

  if (isLoading) return <LoadingBlock label="Loading vegetation data…" />;

  if (sorted.length === 0) {
    return (
      <LoadingBlock label="Vegetation data for 2025 is being processed. Check back soon." />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-y-3 md:grid-cols-2 md:gap-x-12">
      {sorted.map((item) => (
        <div
          key={item.admin_code || item.admin_name}
          className="flex items-center gap-3"
        >
          <span className="w-28 shrink-0 text-right text-xs font-bold text-[#030454]">
            {item.admin_name}
          </span>
          <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-[#E6EAEC]">
            <div
              style={{ width: `${barPct(item._ndvi)}%` }}
              className="h-3.5 rounded-full bg-[#009B35] transition-all duration-300"
            />
          </div>
          <span className="w-14 shrink-0 text-right font-mono text-xs text-slate-500">
            {item._ndvi.toFixed(3)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DataLayerCard({ layer }) {
  const meta = STATUS_META[layer.status] || STATUS_META.planned;
  return (
    <div className="rounded-xl border border-[#CAD2D7] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-black text-[#030454]">{layer.label}</p>
        <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold ${meta.chipClass}`}>
          {meta.label}
        </span>
      </div>
      {layer.detail && <p className="mt-2 text-[11px] leading-5 text-slate-500">{layer.detail}</p>}
      {layer.bullets && (
        <ul className="mt-2 space-y-0.5">
          {layer.bullets.map((b, i) => (
            <li key={i} className="text-[11px] leading-5 text-slate-500">• {b}</li>
          ))}
        </ul>
      )}
      {layer.source && (
        <p className="mt-2 text-[10px] text-slate-400">{layer.source}</p>
      )}
      {layer.note && (
        <p className="mt-2 text-[10px] italic text-amber-700">{layer.note}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PublicClimateRiskPage() {
  const [annualData, setAnnualData] = useState(null);
  const [wetData, setWetData]       = useState(null);
  const [dryData, setDryData]       = useState(null);
  const [isLoading, setIsLoading]   = useState(true);
  const [apiError, setApiError]     = useState("");
  const [publicLayerCatalog, setPublicLayerCatalog] = useState(null);

  const [rainAnnualCount, setRainAnnualCount] = useState(null);
  const [rainWetCount, setRainWetCount]       = useState(null);
  const [rainDryCount, setRainDryCount]       = useState(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setApiError("");

      const [
        annualResult, wetResult, dryResult,
        rainAnnualResult, rainWetResult, rainDryResult, layerCatalogResult,
      ] = await Promise.allSettled([
        getRemoteSensingLgaStats({ layer: "ndvi",     year: 2025, season: "annual",     admin_level: "lga" }),
        getRemoteSensingLgaStats({ layer: "ndvi",     year: 2025, season: "wet_season", admin_level: "lga" }),
        getRemoteSensingLgaStats({ layer: "ndvi",     year: 2025, season: "dry_season", admin_level: "lga" }),
        getRemoteSensingLgaStats({ layer: "rainfall", year: 2025, season: "annual",     admin_level: "lga" }),
        getRemoteSensingLgaStats({ layer: "rainfall", year: 2025, season: "wet_season", admin_level: "lga" }),
        getRemoteSensingLgaStats({ layer: "rainfall", year: 2025, season: "dry_season", admin_level: "lga" }),
        getRemoteSensingLayers(),
      ]);

      if (
        annualResult.status === "rejected" &&
        wetResult.status   === "rejected" &&
        dryResult.status   === "rejected"
      ) {
        setApiError("Could not load vegetation data. Please try again later.");
      }

      setAnnualData(annualResult.status === "fulfilled" ? annualResult.value : null);
      setWetData(wetResult.status   === "fulfilled" ? wetResult.value   : null);
      setDryData(dryResult.status   === "fulfilled" ? dryResult.value   : null);

      setRainAnnualCount(rainAnnualResult.status === "fulfilled"
        ? (rainAnnualResult.value?.results?.length ?? 0) : null);
      setRainWetCount(rainWetResult.status === "fulfilled"
        ? (rainWetResult.value?.results?.length ?? 0) : null);
      setRainDryCount(rainDryResult.status === "fulfilled"
        ? (rainDryResult.value?.results?.length ?? 0) : null);
      setPublicLayerCatalog(layerCatalogResult.status === "fulfilled"
        ? (layerCatalogResult.value?.results || []) : []);

      setIsLoading(false);
    }

    load();
  }, []);

  const annualCount = countWithData(annualData);
  const wetCount    = countWithData(wetData);
  const dryCount    = countWithData(dryData);

  const meanNdvi = useMemo(() => {
    const v = stateMeanNdvi(annualData);
    return v !== null ? v.toFixed(3) : null;
  }, [annualData]);

  const rainfallCardData = useMemo(() => {
    if (isLoading) {
      return {
        key: "rainfall", label: "Rainfall Total", status: "in_development",
        detail: "Loading coverage data...", source: "", note: "",
      };
    }
    const anyLoaded = rainAnnualCount !== null || rainWetCount !== null || rainDryCount !== null;
    if (!anyLoaded) {
      return {
        key: "rainfall", label: "Rainfall Total", status: "in_development",
        detail: "CHIRPS v2.0 Daily — coverage data currently unavailable",
        source: "", note: "",
      };
    }
    const parts = [];
    if (rainAnnualCount !== null) parts.push(`Annual: ${rainAnnualCount} LGAs`);
    if (rainWetCount    !== null) parts.push(`Wet season: ${rainWetCount} LGAs`);
    if (rainDryCount    !== null) parts.push(`Dry season: ${rainDryCount} LGAs`);
    return {
      key: "rainfall",
      label: "Rainfall Total",
      status: "available",
      detail: `2025 · ${parts.join(" · ")}`,
      source: "CHIRPS v2.0 Daily · Historical: Annual/Wet 1981–2025 · Dry 1982–2025",
      note: "Rainfall totals are satellite-derived estimates. Local gauge validation is planned.",
    };
  }, [isLoading, rainAnnualCount, rainWetCount, rainDryCount]);

  const publicLayerKeys = useMemo(
    () => new Set((publicLayerCatalog || []).map((layer) => layer.key)),
    [publicLayerCatalog],
  );

  const availableDataLayers = useMemo(() => {
    if (!publicLayerCatalog) {
      return DATA_LAYERS.filter((layer) => layer.key === "rainfall");
    }
    return DATA_LAYERS.filter((layer) => {
      const requiredLayers = layer.sourceLayers || [layer.key];
      return requiredLayers.every((layerKey) => publicLayerKeys.has(layerKey));
    });
  }, [publicLayerCatalog, publicLayerKeys]);

  return (
    <main className="min-h-screen bg-[#DFE3E4] font-['DM_Sans'] text-[#030454]">
      <PublicPortalHeader
        activePage="climate-intelligence"
        tag="Kaduna Climate Intelligence"
        title="Kaduna Climate Intelligence"
        description="Satellite-based vegetation monitoring across Kaduna State's 23 LGAs, with data availability updates and links to detailed climate exploration."
        primaryActionLabel="Open Climate Atlas"
        secondaryActionLabel="Explore Climate Resources"
        onPrimaryAction={() => { window.location.href = "/public/climate-atlas"; }}
        onSecondaryAction={() => { window.location.href = "/public/reports"; }}
      />

      {apiError && (
        <section className="px-4 py-4 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <ErrorBlock message={apiError} />
          </div>
        </section>
      )}

      {/* Coverage stats */}
      <section className="bg-white px-4 py-12 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <PublicSectionIntro
            eyebrow="Vegetation / NDVI · 2025"
            title="Vegetation monitoring across Kaduna"
            description="Current-year vegetation condition (Sentinel-2 2025 composites) for each of Kaduna's 23 LGAs, across annual, wet-season, and dry-season windows. The Climate Atlas provides access to the full NDVI archive: Landsat 1985–2017 and Sentinel-2 2018–2025."
          />

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6 max-w-2xl">
            <StatChip
              loading={isLoading}
              value={annualCount}
              label="LGAs · Annual"
            />
            <StatChip
              loading={isLoading}
              value={wetCount}
              label="LGAs · Wet Season"
            />
            <StatChip
              loading={isLoading}
              value={dryCount}
              label="LGAs · Dry Season"
            />
            <StatChip
              loading={isLoading}
              value={meanNdvi ?? "—"}
              label="Kaduna annual mean"
            />
          </div>

          <p className="mt-5 text-[11px] text-slate-400">
            Source: Sentinel-2 Surface Reflectance Harmonized via Google Earth Engine · 2025 composites.
          </p>
        </div>
      </section>

      {/* NDVI by LGA bar chart */}
      <section className="bg-[#F7F9FA] px-4 py-14 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <PublicSectionIntro
            eyebrow="Vegetation / NDVI · Annual · 2025"
            title="Vegetation condition by LGA"
            description="NDVI (Normalized Difference Vegetation Index) ranges from 0 to 1. Higher values indicate denser, healthier vegetation cover. Values shown are Sentinel-2 annual medians (2025). The Climate Atlas provides the full archive: Landsat 1985–2017 and Sentinel-2 2018–2025, with year and season filtering."
          />

          <div className="mt-8">
            {apiError ? null : (
              <NdviBarChart
                results={annualData?.results ?? null}
                isLoading={isLoading}
              />
            )}
          </div>

          <p className="mt-6 text-[11px] text-slate-400">
            Source: Sentinel-2 Surface Reflectance Harmonized (COPERNICUS/S2_SR_HARMONIZED) via Google Earth Engine ·
            Annual composite Jan–Dec 2025 · Scale 60 m · Cloud filter &lt;30%.
          </p>

          <button
            type="button"
            onClick={() => { window.location.href = "/public/climate-atlas"; }}
            className="mt-5 rounded-md border border-[#030454]/20 px-5 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-[#030454] transition hover:bg-[#030454] hover:text-white"
          >
            Explore full data in the Climate Atlas
          </button>
        </div>
      </section>

      {/* Data availability */}
      <section className="bg-white px-4 py-14 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <PublicSectionIntro
            eyebrow="Data availability"
            title="What is available now and what is coming"
            description="Available now is derived from the public layer catalog. With the current catalog, public layers include Rainfall Total, Vegetation / NDVI, Land Surface Temperature, Rainfall Anomaly, and Meteorological Drought Conditions (SPI)."
          />

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableDataLayers.map((layer) => (
              <DataLayerCard
                key={layer.key}
                layer={layer.key === "rainfall" ? rainfallCardData : layer}
              />
            ))}
          </div>

          <div className="mt-10">
            <PublicSectionIntro
              eyebrow="Method notes"
              title="Public database-derived layers"
              description="These layers are already in the public catalog, but they remain method-sensitive and should be interpreted with their scientific caveats."
            />
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {METHOD_NOTES.map((layer) => (
                <DataLayerCard key={layer.key} layer={layer} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Methodology note */}
      <section className="bg-[#F7F9FA] px-4 py-10 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <PublicSectionIntro
            eyebrow="Data and methodology"
            title="How the data is produced"
          />

          <div className="mt-6 grid gap-4 md:grid-cols-2 max-w-4xl">
            <div className="rounded-xl border border-[#CAD2D7] bg-white p-5 text-sm leading-7 text-slate-600">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#030454]">
                Satellite vegetation monitoring
              </p>
              NDVI values on this page are the 2025 Sentinel-2 composites. The Climate Atlas
              covers the full archive: Sentinel-2 (2018–2025) and Landsat Collection 2 (1985–2017),
              each processed as quality-screened seasonal medians via Google Earth Engine.
              Landsat and Sentinel-2 are separate, non-interchangeable datasets.
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 p-5 text-sm leading-7 text-amber-800">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-amber-700">
                Climate risk profile records
              </p>
              The platform also holds climate risk profile records for Kaduna LGAs.
              These are composite assessment records built from multi-indicator scoring.
              They are <strong>not derived from real-time satellite measurements</strong> and
              have not been validated against remote-sensing data. The Climate Atlas is the
              correct tool for satellite-based exploration.
            </div>
          </div>
        </div>
      </section>

      {/* Final Atlas CTA */}
      <section className="bg-[#030454] px-4 py-16 text-white sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#F3F74B]">
            Detailed exploration
          </p>
          <h2 className="mt-3 font-['Playfair_Display'] text-4xl font-bold tracking-tight">
            Open the interactive Climate Atlas
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70">
            The Climate Atlas provides an interactive map with year-by-year NDVI monitoring,
            seasonal filtering, LGA-level drill-down, and basemap controls across all
            available periods.
          </p>
          <div className="mt-7">
            <button
              type="button"
              onClick={() => { window.location.href = "/public/climate-atlas"; }}
              className="rounded-md bg-[#F3F74B] px-8 py-4 text-sm font-black uppercase tracking-[0.08em] text-[#030454] transition hover:bg-white"
            >
              Open Interactive Climate Atlas
            </button>
          </div>
        </div>
      </section>

      <PublicPortalFooter />
    </main>
  );
}
