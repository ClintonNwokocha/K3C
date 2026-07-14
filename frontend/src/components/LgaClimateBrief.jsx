import React from "react";
import { PROVENANCE, READINESS, deriveActionPathways } from "../utils/climatePathways";

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
function SectionHeading({ children }) {
  return (
    <p className="mb-2 text-[9px] font-black uppercase tracking-[0.15em] text-[#173B91]">
      {children}
    </p>
  );
}

function EvidenceRow({ label, value, condition, note, isPreview }) {
  return (
    <div className="flex items-start gap-2 py-1 border-b border-[#F0F3F5] last:border-0">
      <span className="w-[90px] shrink-0 text-[9px] text-slate-500 pt-[1px]">{label}</span>
      <div className="min-w-0 flex-1">
        {value != null ? (
          <span className="text-[10px] font-bold text-slate-800">{value}</span>
        ) : (
          <span className="text-[9px] italic text-slate-400">Not available for this briefing</span>
        )}
        {condition && (
          <span className="ml-1 text-[9px] text-slate-500">· {condition}</span>
        )}
        {isPreview && (
          <span className="ml-1 rounded-sm bg-amber-100 px-1 text-[8px] font-bold text-amber-700">
            PREVIEW
          </span>
        )}
        {note && (
          <p className="mt-0.5 text-[8px] leading-3 text-slate-400">{note}</p>
        )}
      </div>
    </div>
  );
}

function ReadinessBadge({ status }) {
  const r = READINESS[status] || READINESS.insufficient_evidence;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[8px] font-bold leading-tight ${r.cls}`}>
      {r.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function LgaClimateBrief({
  lgaName,
  ciProfile,
  elevSnap,
  floodSnap,
  showLulc,
  lulcPublic,
  isFloodAvailable,
  isElevationAvailable,
}) {
  if (!ciProfile) return null;

  const { sections, briefing, cautions, method_notes, year, season, headline } = ciProfile;
  const { rainfall, vegetation, temperature, drought, land_cover } = sections || {};

  const displaySeason =
    season === "annual"
      ? "Annual"
      : season === "wet_season"
      ? "Wet Season"
      : season === "dry_season"
      ? "Dry Season"
      : season;

  // Build evidence row data
  const evidenceRows = [];

  if (rainfall?.total?.value != null) {
    evidenceRows.push({
      key: "rainfall",
      label: "Rainfall total",
      value: `${Number(rainfall.total.value).toFixed(0)} mm`,
      condition: null,
      note: `${year} ${displaySeason} · CHIRPS v2.0`,
    });
  }
  if (rainfall?.anomaly?.value != null) {
    evidenceRows.push({
      key: "rainfall_anomaly",
      label: "Rainfall anomaly",
      value: `${Number(rainfall.anomaly.value) >= 0 ? "+" : ""}${Number(rainfall.anomaly.value).toFixed(1)}%`,
      condition: rainfall.anomaly.condition,
      note: "vs. 1991–2020 LGA baseline",
    });
  }
  if (drought?.value != null || drought?.condition) {
    evidenceRows.push({
      key: "drought",
      label: "Drought (SPI)",
      value: drought?.value != null ? Number(drought.value).toFixed(2) : null,
      condition: drought?.condition,
      note: "Meteorological drought index",
    });
  }
  if (vegetation?.value != null || vegetation?.condition) {
    evidenceRows.push({
      key: "vegetation",
      label: "Vegetation (NDVI)",
      value: vegetation?.value != null ? Number(vegetation.value).toFixed(3) : null,
      condition: vegetation?.condition,
      note: year >= 2018 ? "Sentinel-2 SR" : "Landsat C2L2",
    });
  }
  if (temperature?.value != null || temperature?.condition) {
    evidenceRows.push({
      key: "temperature",
      label: "Surface temp. (LST)",
      value: temperature?.value != null ? `${Number(temperature.value).toFixed(1)} °C` : null,
      condition: temperature?.condition,
      note: "Satellite LST ≠ air temperature",
    });
  }

  // Elevation — available only if the elevation variable was loaded this session
  if (isElevationAvailable) {
    evidenceRows.push({
      key: "elevation",
      label: "Elevation (LGA mean)",
      value:
        elevSnap?.mean_value != null
          ? `${Number(elevSnap.mean_value).toFixed(0)} m`
          : null,
      condition: null,
      note:
        elevSnap?.mean_value != null
          ? "SRTM ~2000 · static terrain"
          : "Select the Elevation layer to load",
    });
  }

  // Historical Surface Water — available only if flood variable was loaded this session
  if (isFloodAvailable) {
    evidenceRows.push({
      key: "flood",
      label: "Historical surf. water",
      value:
        floodSnap?.mean_value != null
          ? `${Number(floodSnap.mean_value).toFixed(1)}% mean`
          : null,
      condition: null,
      note:
        floodSnap?.mean_value != null
          ? "JRC GSW v1.4 · 1984–2021 archive"
          : "Select the Historical Surface Water layer to load",
    });
  }

  // LULC — published Dynamic World v1 baseline, or internal preview when not public
  if (showLulc && land_cover) {
    evidenceRows.push({
      key: "lulc",
      label: "Land cover (dominant)",
      value:
        land_cover.dominant_label || land_cover.dominant_class
          ? `${land_cover.dominant_label || land_cover.dominant_class}${land_cover.dominant_pct != null ? ` ${Number(land_cover.dominant_pct).toFixed(1)}%` : ""}`
          : null,
      condition: null,
      note: `DW v1 · ${land_cover.year ?? year} composite`,
      isPreview: !lulcPublic,
    });
  }

  // Derive action pathways
  const pathways = deriveActionPathways({
    ciProfile,
    floodSnap,
    isFloodAvailable,
  });

  // Which provenance rows to show
  const provenanceKeys = evidenceRows.map((r) => r.key).filter((k) => PROVENANCE[k]);

  return (
    <div className="divide-y divide-[#E6EAEC] text-[10px]">
      {/* Header */}
      <div className="bg-[#F0F3FF] px-4 py-3">
        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[#173B91]">
          Climate Intelligence Brief
        </p>
        <p className="mt-0.5 text-xs font-black text-slate-800">{lgaName}</p>
        <p className="mt-0.5 text-[9px] text-slate-500">
          {year} · {displaySeason} · Rule-based analysis only
        </p>
        {headline && (
          <p className="mt-1.5 rounded-md bg-white px-2 py-1.5 text-[10px] font-bold capitalize text-[#173B91]">
            {headline}
          </p>
        )}
        <p className="mt-2 text-[9px] leading-[1.4] text-slate-500">
          This brief is generated from satellite-derived indicators. It is a screening
          tool for planning discussions — not a hazard assessment, vulnerability ranking,
          or implementation plan. All action considerations require field verification.
        </p>
      </div>

      {/* A. Evidence Snapshot */}
      <div className="px-4 py-3">
        <SectionHeading>A. Evidence Snapshot</SectionHeading>
        <div>
          {evidenceRows.map((row) => (
            <EvidenceRow key={row.key} {...row} />
          ))}
          {evidenceRows.length === 0 && (
            <p className="italic text-slate-400">No indicator data available for this LGA.</p>
          )}
        </div>
      </div>

      {/* B. Rule-Based Interpretation */}
      <div className="px-4 py-3">
        <SectionHeading>B. Rule-Based Interpretation</SectionHeading>
        {briefing?.length > 0 ? (
          <div className="space-y-1">
            {briefing.map((line, i) => (
              <p key={i} className="leading-[1.5] text-slate-700">
                • {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="italic text-slate-400">No interpretation available.</p>
        )}
        {cautions?.length > 0 && (
          <div className="mt-2 space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2">
            {cautions.map((c, i) => (
              <p key={i} className="leading-[1.4] text-[9px] text-amber-700">
                ⚠ {c}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* C. Climate Action Considerations */}
      <div className="px-4 py-3">
        <SectionHeading>C. Climate Action Considerations</SectionHeading>
        <p className="mb-2 text-[9px] leading-[1.4] text-slate-500">
          Screening-level action pathways only. Each pathway requires local validation
          before any planning decision.
        </p>
        <div className="space-y-3">
          {pathways.map((pw, idx) => (
            <div
              key={pw.id}
              className="rounded-md border border-[#E6EAEC] bg-[#F7F9FA] p-2.5"
            >
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                Pathway {idx + 1}
              </p>
              <p className="mt-0.5 text-[10px] font-bold text-slate-800">{pw.theme}</p>

              {pw.triggers.length > 0 && (
                <div className="mt-1.5">
                  <p className="text-[9px] font-bold text-slate-500">Evidence trigger</p>
                  {pw.triggers.map((t, i) => (
                    <p key={i} className="mt-0.5 text-[9px] leading-[1.4] text-slate-700">
                      · {t}
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-1.5">
                <p className="text-[9px] font-bold text-slate-500">Action consideration</p>
                <p className="mt-0.5 text-[9px] leading-[1.4] text-slate-700">
                  {pw.actionConsideration}
                </p>
              </div>

              <div className="mt-1.5">
                <p className="text-[9px] font-bold text-slate-500">Scientific caution</p>
                <p className="mt-0.5 text-[9px] leading-[1.4] text-amber-700">
                  ⚠ {pw.scientificCaution}
                </p>
              </div>

              <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[9px]">
                <div>
                  <p className="font-bold text-slate-500">Evidence basis</p>
                  <p className="mt-0.5 leading-[1.3] text-slate-600">{pw.evidenceBasis}</p>
                </div>
                <div>
                  <p className="font-bold text-slate-500">Confidence</p>
                  <p className="mt-0.5 leading-[1.3] text-slate-600">{pw.confidence}</p>
                </div>
              </div>

              <div className="mt-2">
                <ReadinessBadge status={pw.readinessStatus} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* D. Provenance and Limitations */}
      <details className="group">
        <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 hover:bg-[#F7F9FA]">
          <SectionHeading>D. Provenance and Limitations</SectionHeading>
          <span className="ml-2 shrink-0 text-[9px] text-slate-400 group-open:hidden">▼ show</span>
          <span className="ml-2 shrink-0 text-[9px] text-slate-400 hidden group-open:inline">▲ hide</span>
        </summary>
        <div className="px-4 pb-4">
          <p className="mb-2 text-[9px] leading-[1.4] text-slate-500">
            All data shown are satellite-derived estimates aggregated to LGA boundaries.
            Values are not equivalent to ground-based measurements and are subject to the
            limitations of each dataset.
          </p>
          <div className="space-y-3">
            {provenanceKeys.map((key) => {
              const p = PROVENANCE[key];
              return (
                <div key={key} className="rounded border border-[#E6EAEC] p-2">
                  <p className="font-bold text-slate-700">{p.indicator}</p>
                  <div className="mt-1 space-y-0.5 text-[9px]">
                    <p>
                      <span className="text-slate-400">Source: </span>
                      <span className="text-slate-600">{p.source}</span>
                    </p>
                    <p>
                      <span className="text-slate-400">Method: </span>
                      <span className="text-slate-600">{p.method}</span>
                    </p>
                    <p>
                      <span className="text-slate-400">Coverage: </span>
                      <span className="text-slate-600">{p.coverage}</span>
                    </p>
                    <p>
                      <span className="text-slate-400">Resolution: </span>
                      <span className="text-slate-600">{p.resolution}</span>
                    </p>
                    <p className="mt-1 leading-[1.3] text-amber-700">⚠ {p.caution}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {method_notes?.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-[9px] font-bold text-slate-500">Method notes</p>
              {method_notes.map((note, i) => (
                <p key={i} className="text-[9px] leading-[1.4] text-slate-500">
                  {i + 1}. {note}
                </p>
              ))}
            </div>
          )}
        </div>
      </details>

      {/* E. Action Readiness Panel */}
      <details className="group">
        <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 hover:bg-[#F7F9FA]">
          <SectionHeading>E. Action Readiness Panel</SectionHeading>
          <span className="ml-2 shrink-0 text-[9px] text-slate-400 group-open:hidden">▼ show</span>
          <span className="ml-2 shrink-0 text-[9px] text-slate-400 hidden group-open:inline">▲ hide</span>
        </summary>
        <div className="px-4 pb-4">
          <p className="mb-2 text-[9px] leading-[1.4] text-slate-500">
            Summary of all identified screening considerations. Status reflects evidence
            quality and data maturity — not implementation priority.
          </p>
          <div className="space-y-2">
            {pathways.map((pw) => (
              <div
                key={pw.id}
                className="rounded border border-[#E6EAEC] bg-white p-2"
              >
                <p className="text-[9px] font-bold leading-tight text-slate-800">
                  {pw.theme}
                </p>
                <div className="mt-1.5 space-y-1 text-[9px]">
                  <div className="flex gap-2">
                    <span className="w-20 shrink-0 text-slate-400">Evidence</span>
                    <span className="leading-[1.3] text-slate-600">{pw.evidenceBasis}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-20 shrink-0 text-slate-400">Scale</span>
                    <span className="leading-[1.3] text-slate-600">{pw.scale}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-20 shrink-0 text-slate-400">Confidence</span>
                    <span className="leading-[1.3] text-slate-600">{pw.confidence}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-20 shrink-0 text-slate-400">Validation</span>
                    <ul className="list-none leading-[1.3] text-slate-600">
                      {pw.validationSteps.map((step, i) => (
                        <li key={i}>· {step}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex gap-2 pt-0.5">
                    <span className="w-20 shrink-0 text-slate-400">Status</span>
                    <ReadinessBadge status={pw.readinessStatus} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded border border-[#E6EAEC] bg-[#F7F9FA] p-2 text-[9px] leading-[1.4] text-slate-500">
            <p className="font-bold text-slate-600">Governance note</p>
            <p className="mt-0.5">
              No LGA, ward, site, land parcel, or pixel in this brief is designated as a
              priority area, implementation site, or hazard zone. All considerations
              require independent field verification, community consultation, and approval
              through established Kaduna State planning processes before any decision is
              made.
            </p>
          </div>
        </div>
      </details>

      {/* Footer */}
      <div className="bg-[#F7F9FA] px-4 py-2.5">
        <p className="text-[8px] leading-[1.4] text-slate-400">
          Generated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ·
          Rule-based analysis from satellite-derived indicators · No AI or LLM inference ·
          Not for regulatory or statutory use · Internal planning tool only
        </p>
      </div>
    </div>
  );
}
