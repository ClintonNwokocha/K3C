// ---------------------------------------------------------------------------
// Shared climate action pathway utilities.
//
// Both LgaClimateBrief (public atlas) and ClimateActionScreening (authenticated
// matrix) derive pathways from this single source of truth so the two surfaces
// never give conflicting advice.
//
// All logic is rule-based — no LLM, no external service, no AI inference.
// ---------------------------------------------------------------------------

// Provenance metadata per indicator — used in evidence panels.
export const PROVENANCE = {
  rainfall: {
    indicator: "Rainfall Total",
    source: "CHIRPS v2.0 Daily",
    method: "Satellite rainfall estimate aggregated to LGA mean",
    coverage: "1981–2025 (annual / seasonal)",
    resolution: "~5 km gridded",
    caution: "Satellite-derived estimate; not equivalent to rain-gauge measurement.",
  },
  rainfall_anomaly: {
    indicator: "Rainfall Anomaly",
    source: "CHIRPS v2.0 (1991–2020 LGA baseline)",
    method: "Percentage departure from 1991–2020 LGA seasonal baseline",
    coverage: "Annual and seasonal comparisons",
    resolution: "~5 km gridded, LGA aggregated",
    caution: "Relative to 1991–2020 reference period; baseline period choice affects the result.",
  },
  drought: {
    indicator: "Drought / SPI",
    source: "CHIRPS-derived Standardised Precipitation Index",
    method: "Meteorological precipitation-only drought classification",
    coverage: "Based on 30-year baseline",
    resolution: "LGA aggregated",
    caution:
      "SPI is a precipitation-only index. It does not represent hydrological, agricultural, or soil-moisture drought.",
  },
  vegetation: {
    indicator: "Vegetation (NDVI)",
    source: "Sentinel-2 Surface Reflectance (≥2018) / Landsat C2L2 (<2018)",
    method: "Normalised Difference Vegetation Index (NDVI), LGA mean",
    coverage: "2018–2025 (Sentinel-2); archive 1985–2017 (Landsat)",
    resolution: "10 m (Sentinel-2); ~30 m (Landsat); LGA aggregated",
    caution:
      "NDVI does not distinguish causes of vegetation stress (drought, harvesting, seasonal variation, or land-use change).",
  },
  temperature: {
    indicator: "Land Surface Temp. (LST)",
    source: "MODIS Terra Daily Land Surface Temperature",
    method: "Satellite land surface temperature reading, LGA mean",
    coverage: "2001–2025",
    resolution: "~1 km, LGA aggregated",
    caution:
      "LST is a satellite sensor reading and is NOT equivalent to air temperature. Strong seasonal and diurnal variation applies.",
  },
  elevation: {
    indicator: "Elevation",
    source: "USGS SRTMGL1 v003 (NASA SRTM, ~2000)",
    method: "Radar-derived terrain elevation, LGA mean",
    coverage: "Static DEM — approximately year 2000",
    resolution: "~30 m (nominal)",
    caution:
      "Static terrain context only. Not a climate variable, not a hazard indicator, and not survey-grade.",
  },
  flood: {
    indicator: "Historical Surface Water",
    source: "JRC Global Surface Water v1.4 (Landsat)",
    method: "Surface water occurrence frequency, LGA mean (1984–2021 archive)",
    coverage: "1984–2021 (static archive, not updated after 2021)",
    resolution: "~30 m Landsat",
    caution:
      "Historical occurrence archive — not a flood forecast, not real-time, not a flood hazard designation, and not a vulnerability assessment.",
  },
  lulc: {
    indicator: "Land Cover (LULC)",
    source: "Dynamic World v1 (Google / WRI, Sentinel-2)",
    method: "Late wet season (Sep–Oct) composite, dominant class per LGA",
    coverage: "2018–2025 (late wet season composite, all years)",
    resolution: "10 m Sentinel-2",
    caution:
      "Observed land-cover classification for a single composite period. Does not constitute land-cover change analysis or trend detection.",
  },
};

// Action-readiness badge display — consumed by both Brief and Screening Matrix.
export const READINESS = {
  ready_for_planning_discussion: {
    label: "Candidate for planning discussion",
    cls: "text-[#173B91] bg-[#EEF1FD] border border-[#C0CFF8]",
  },
  requires_field_verification: {
    label: "Requires field verification first",
    cls: "text-amber-700 bg-amber-50 border border-amber-200",
  },
  insufficient_evidence: {
    label: "Insufficient evidence",
    cls: "text-slate-500 bg-[#F7F9FA] border border-[#E6EAEC]",
  },
};

// ---------------------------------------------------------------------------
// Core pathway derivation.
//
// Accepts raw condition strings and values extracted from either an E5 profile
// (sections shape) or E1 indicators object — the two callers each have a thin
// adapter wrapper below.  Thresholds must not be changed here without updating
// the backend _classify_* helpers in views.py.
// ---------------------------------------------------------------------------
export function deriveActionPathwaysCore({
  ndviCond,
  raCond,
  spiCond,
  lstCond,
  ndviValue,
  raValue,
  spiValue,
  lstValue,
  floodMean,
}) {
  const pathways = [];

  const isDrought =
    !!spiCond &&
    (spiCond.includes("moderate drought") ||
      spiCond.includes("severe drought") ||
      spiCond.includes("extreme drought"));
  const isDrierRainfall = raCond === "drier than baseline";
  const isVegStressed = ndviCond === "sparse/stressed vegetation";
  const isHotter = lstCond === "relatively hotter surface conditions";
  const hasFloodSignal = floodMean != null && floodMean > 2;

  // Pathway: Drought and Agricultural Adaptation
  if (isDrought || isDrierRainfall) {
    const triggers = [];
    if (isDrought && spiValue != null)
      triggers.push(`SPI ${Number(spiValue).toFixed(2)} — ${spiCond}`);
    if (isDrierRainfall && raValue != null)
      triggers.push(
        `Rainfall anomaly ${Number(raValue).toFixed(1)}% — drier than 1991–2020 baseline`
      );
    pathways.push({
      id: "drought_ag",
      theme: "Drought and Agricultural Adaptation",
      triggers,
      evidenceBasis: "CHIRPS satellite rainfall and CHIRPS-derived SPI",
      scale: "LGA administrative boundary (aggregated)",
      confidence: isDrought
        ? "Moderate — SPI is a well-established meteorological index; LGA aggregation masks sub-LGA variation"
        : "Low — rainfall anomaly only; no SPI confirmation available",
      actionConsideration:
        "Consider reviewing water-conservation options, climate-smart agriculture programmes, and drought-resilient livelihood strategies. Engage Kaduna State Agricultural Development Programme (KADP) for sub-LGA field-level assessment.",
      scientificCaution:
        "SPI is a precipitation-only index — it does not represent hydrological, agricultural, or soil-moisture drought, and does not capture groundwater conditions. LGA-scale values may not reflect conditions at village or farm level.",
      validationSteps: [
        "Crop-condition and vegetation field survey at community level.",
        "Engagement with State ADP for sub-LGA agricultural status data.",
        "Review of local water-availability and borehole records.",
      ],
      readinessStatus: "ready_for_planning_discussion",
    });
  }

  // Pathway: Ecosystem Restoration and Land Cover Screening
  if (isVegStressed || isDrierRainfall) {
    const triggers = [];
    if (isVegStressed && ndviValue != null)
      triggers.push(`NDVI ${Number(ndviValue).toFixed(3)} — ${ndviCond}`);
    else if (isVegStressed) triggers.push(`Vegetation condition: ${ndviCond}`);
    if (isDrierRainfall && !isDrought)
      triggers.push("Rainfall anomaly: drier than 1991–2020 baseline");
    pathways.push({
      id: "ecosystem",
      theme: "Ecosystem Restoration and Land Cover Screening",
      triggers,
      evidenceBasis: "Satellite-derived NDVI (Sentinel-2 / Landsat)",
      scale: "LGA administrative boundary (aggregated)",
      confidence:
        "Low — spectral index at LGA scale; requires ground-level verification before any intervention planning",
      actionConsideration:
        "Consider commissioning a restoration and afforestation suitability screening study. Any recommended intervention must first assess land tenure, existing livelihoods, soil conditions, natural vegetation cover, protected-area designations, and community priorities before any site-level recommendation.",
      scientificCaution:
        "This LGA is a candidate area for field verification only — not a designated restoration or afforestation site. NDVI does not identify causes of vegetation stress (drought, harvesting, seasonal variation, or land-use change). No pixel or LGA boundary should be called a priority afforestation site without land-tenure, soil, ecology, livelihood, protected-area, and community-consultation evidence.",
      validationSteps: [
        "Field verification of vegetation condition and land-cover type.",
        "Land-tenure, ecology, and soil-suitability assessment.",
        "Protected-area boundary review and community livelihood consultation.",
        "Free, prior, and informed consent process for any proposed intervention.",
      ],
      readinessStatus: "requires_field_verification",
    });
  }

  // Pathway: Historical Water and Drainage Resilience Screening
  if (hasFloodSignal) {
    pathways.push({
      id: "water_drainage",
      theme: "Historical Water and Drainage Resilience Screening",
      triggers: [
        `Historical surface-water occurrence mean: ${Number(floodMean).toFixed(1)}% of observation years (1984–2021 archive)`,
      ],
      evidenceBasis: "JRC Global Surface Water v1.4 — Landsat archive 1984–2021",
      scale: "LGA administrative boundary (aggregated)",
      confidence:
        "Low-moderate — 1984–2021 historical archive; not real-time; not predictive; LGA aggregation masks local spatial patterns",
      actionConsideration:
        "Consider drainage, culvert, and infrastructure-maintenance field review for areas with recurrent historical surface-water context. Use as a screening consideration when reviewing local development siting and drainage design — not as a hazard designation.",
      scientificCaution:
        "This is a historical surface-water occurrence indicator — not a flood forecast, flood hazard designation, flood risk score, or vulnerability analysis. The archive ends 2021 and does not account for future climate change or current land-use changes.",
      validationSteps: [
        "Field inspection of drainage infrastructure in locations with historical surface-water context.",
        "Engagement with local works department and NEMA on past infrastructure incidents.",
        "Review of any existing emergency-management plans for the LGA.",
      ],
      readinessStatus: "ready_for_planning_discussion",
    });
  }

  // Pathway: Heat and Urban Green-Infrastructure (only if capacity allows)
  if (isHotter && pathways.length < 3) {
    pathways.push({
      id: "heat_green",
      theme: "Heat and Urban Green-Infrastructure Considerations",
      triggers: [
        `LST ${lstValue != null ? Number(lstValue).toFixed(1) + " °C" : "—"} — ${lstCond}`,
      ],
      evidenceBasis: "MODIS Terra land surface temperature (satellite sensor reading)",
      scale: "LGA administrative boundary (aggregated)",
      confidence:
        "Low — LST is a satellite sensor reading, not equivalent to air temperature; strong seasonal and land-use variation applies",
      actionConsideration:
        "Consider reviewing urban-shade, tree-canopy, cooling infrastructure, and heat-exposure planning. Validate local population exposure patterns and land-use context before planning any intervention.",
      scientificCaution:
        "Land surface temperature (LST) is not equivalent to air temperature. It does not directly represent human heat exposure or health risk without additional population distribution and exposure-pathway data.",
      validationSteps: [
        "Validate local heat-exposure patterns and population use-times.",
        "Engage Kaduna State Urban Planning and Development Authority (KASUPDA).",
        "Review existing urban tree-cover and green-infrastructure inventory.",
      ],
      readinessStatus: "requires_field_verification",
    });
  }

  // Fallback: no strong signal
  if (pathways.length === 0) {
    pathways.push({
      id: "no_signal",
      theme: "No Strong Climate Signal from Current Data",
      triggers: [
        "All available indicators are within near-normal or stable classification ranges.",
      ],
      evidenceBasis: "All available CI indicators",
      scale: "LGA administrative boundary (aggregated)",
      confidence:
        "Low — aggregated satellite data; sub-LGA and community-level conditions are not captured",
      actionConsideration:
        "No specific action pathway is indicated by current remote-sensing indicators. Recommend continued monitoring and engagement with community-level assessments.",
      scientificCaution:
        "Absence of a satellite-derived signal does not confirm absence of climate stress at local or community level. LGA-scale aggregation may mask sub-LGA variability.",
      validationSteps: [
        "Maintain regular monitoring across all CI indicator layers.",
        "Commission community-level assessments where local concerns are reported.",
      ],
      readinessStatus: "insufficient_evidence",
    });
  }

  return pathways.slice(0, 3);
}

// ---------------------------------------------------------------------------
// E5 profile wrapper — used by LgaClimateBrief.
// Signature is unchanged from the previous local function.
// ---------------------------------------------------------------------------
export function deriveActionPathways({ ciProfile, floodSnap, isFloodAvailable }) {
  const { rainfall, vegetation, temperature, drought } = ciProfile?.sections || {};
  const floodMean =
    isFloodAvailable && floodSnap?.mean_value != null
      ? Number(floodSnap.mean_value)
      : null;

  return deriveActionPathwaysCore({
    ndviCond: vegetation?.condition ?? null,
    raCond: rainfall?.anomaly?.condition ?? null,
    spiCond: drought?.condition ?? null,
    lstCond: temperature?.condition ?? null,
    ndviValue: vegetation?.value,
    raValue: rainfall?.anomaly?.value,
    spiValue: drought?.value,
    lstValue: temperature?.value,
    floodMean,
  });
}

// ---------------------------------------------------------------------------
// Map lens status helper.
//
// Derives the single screening status for a given LGA on a given pathway lens.
// Used by ClimateActionLensMap to determine fill colour and legend slot.
//
// Returns one of:
//   "ready_for_planning_discussion" | "requires_field_verification"
//   "insufficient_evidence" | "no_signal" | "not_assessed"
//
// Water/drainage always returns "not_assessed" because HSW evidence is not
// available from the E1 aggregate endpoint and no approved methodology exists.
// ---------------------------------------------------------------------------
export function getLensStatus(pathways, pathwayId) {
  if (pathwayId === "water_drainage") return "not_assessed";
  const match = pathways.find((p) => p.id === pathwayId);
  if (!match) return "no_signal";
  return match.readinessStatus;
}

// ---------------------------------------------------------------------------
// E1 indicators wrapper — used by the Climate Action Screening matrix.
// HSW (floodMean) is never available from the E1 aggregate endpoint; the
// water_drainage pathway will therefore never be produced here.
// ---------------------------------------------------------------------------
export function derivePathwaysFromIndicators(indicators) {
  return deriveActionPathwaysCore({
    ndviCond: indicators?.ndvi?.condition ?? null,
    raCond: indicators?.rainfall_anomaly?.condition ?? null,
    spiCond: indicators?.spi?.condition ?? null,
    lstCond: indicators?.lst?.condition ?? null,
    ndviValue: indicators?.ndvi?.value,
    raValue: indicators?.rainfall_anomaly?.value,
    spiValue: indicators?.spi?.value,
    lstValue: indicators?.lst?.value,
    floodMean: null,
  });
}
