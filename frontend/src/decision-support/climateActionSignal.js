// Urgent Climate Action Signal — shared, testable decision-support module.
//
// Follows the IPCC AR6 hazard / exposure / vulnerability risk framing: this is
// a rule-based decision-support prioritisation signal, NOT a forecast,
// emergency warning, or independently validated climate-risk index. It adds
// current-evidence prioritisation on top of the existing validated
// ClimateRiskProfile — it does not replace or compete with it.
//
// Hazard evidence is the four Climate Hazard Assessment and Risk Tracking
// hazards (extreme heat, flood, drought, erratic rainfall) with classes from
// the backend (remote_sensing/hazards.py). Vegetation (NDVI) is environmental
// stress evidence only. Component-score bucketing reuses
// ClimateRiskProfile.classify_risk_level()'s 75/60/40 bands. The classify*
// helpers below are kept for the supporting-data displays.

export const SIGNAL_LEVEL = {
  URGENT_ACTION: "urgent_action",
  ELEVATED_ATTENTION: "elevated_attention",
  MONITOR: "monitor",
  NO_CURRENT_SIGNAL: "no_current_signal",
};

export const SIGNAL_LABEL = {
  [SIGNAL_LEVEL.URGENT_ACTION]: "Urgent Action",
  [SIGNAL_LEVEL.ELEVATED_ATTENTION]: "Elevated Attention",
  [SIGNAL_LEVEL.MONITOR]: "Monitor",
  [SIGNAL_LEVEL.NO_CURRENT_SIGNAL]: "No Current Signal",
};

const SIGNAL_RANK = {
  [SIGNAL_LEVEL.URGENT_ACTION]: 3,
  [SIGNAL_LEVEL.ELEVATED_ATTENTION]: 2,
  [SIGNAL_LEVEL.MONITOR]: 1,
  [SIGNAL_LEVEL.NO_CURRENT_SIGNAL]: 0,
};

// Visual metadata for the map and badges. Pulse durations are 1.8-2.4s and
// disabled entirely under prefers-reduced-motion (handled in CSS by the
// consuming page, keyed off these className values).
export const SIGNAL_VISUAL = {
  [SIGNAL_LEVEL.URGENT_ACTION]: {
    color: "#DC2626",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
    mapClassName: "kccc-signal-urgent",
  },
  [SIGNAL_LEVEL.ELEVATED_ATTENTION]: {
    color: "#D97706",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    mapClassName: "kccc-signal-elevated",
  },
  [SIGNAL_LEVEL.MONITOR]: {
    color: "#CA8A04",
    badgeClass: "border-yellow-200 bg-yellow-50 text-yellow-700",
    mapClassName: "kccc-signal-monitor",
  },
  [SIGNAL_LEVEL.NO_CURRENT_SIGNAL]: {
    color: "#94A3B8",
    badgeClass: "border-slate-200 bg-slate-50 text-slate-500",
    mapClassName: "",
  },
};

export const METHODOLOGY_NOTE =
  "The Urgent Climate Action Signal follows an IPCC-aligned risk framing by considering the convergence of climate hazard evidence, exposure and vulnerability/risk context. It is a decision-support prioritisation signal and not a forecast, emergency warning or independently validated climate-risk index.";

// --- classification helpers ------------------------------------------------
//
// ciLookup / climateIntelligenceData (both pages' shared evidence source) is
// populated by the public /remote-sensing/climate-intelligence/ endpoint,
// whose condition strings come from remote_sensing/views.py's
// _classify_ndvi / _classify_spi / _classify_rainfall_anomaly / _classify_lst.
// Those are reproduced verbatim below as the numeric fallback (used only if
// an indicator is supplied without a pre-computed "condition"), and the
// adverse/severe groupings below match that same file's existing approved
// _overall_status()/_build_ci_summary() bucketing — not a new classification.

export function classifyNdvi(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n >= 0.6) return "healthy vegetation";
  if (n >= 0.35) return "moderate vegetation";
  return "sparse/stressed vegetation";
}

export function classifyRainfallAnomaly(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n > 10.0) return "wetter than baseline";
  if (n >= -10.0) return "near baseline";
  return "drier than baseline";
}

export function classifySpi(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n <= -2.0) return "extreme drought condition";
  if (n <= -1.5) return "severe drought condition";
  if (n <= -1.0) return "moderate drought condition";
  if (n < 1.0) return "near normal";
  if (n < 1.5) return "moderately wet";
  if (n < 2.0) return "very wet";
  return "extremely wet";
}

export function classifyLst(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 28.0) return "relatively cooler surface conditions";
  if (n <= 36.0) return "moderate surface temperature";
  return "relatively hotter surface conditions";
}

// Reuses ClimateRiskProfile.classify_risk_level()'s 75/60/40 score bands to
// bucket the 0-100 component scores (flood/drought/heat/erratic rainfall/vulnerability).
function bucketRiskScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  if (n >= 75) return "very_high";
  if (n >= 60) return "high";
  if (n >= 40) return "moderate";
  return "low";
}

function isNdviStressed(condition) {
  return condition === "sparse/stressed vegetation";
}

// The four Climate Hazard Assessment and Risk Tracking hazards, with classes
// from the backend (remote_sensing/hazards.py): each LGA against its own
// 1991-2020 normal; Moderate / Severe / Extreme = 1 / 1.5 / 2 standard
// deviations beyond normal.  NDVI stays as environmental stress evidence.
export const HAZARD_KEYS = ["extreme_heat", "flood", "drought", "erratic_rainfall"];
export const HAZARD_LABELS = {
  extreme_heat: "Extreme Heat",
  flood: "Flood",
  drought: "Drought",
  erratic_rainfall: "Erratic Rainfall",
};
const ADVERSE_CLASSES = new Set(["Moderate", "Severe", "Extreme"]);
const SEVERE_CLASSES = new Set(["Severe", "Extreme"]);
const ELIGIBLE_HAZARD_INDICATOR_COUNT = HAZARD_KEYS.length;

/**
 * Compute the Urgent Climate Action Signal for one LGA from normalized
 * evidence. Pure function — no fetching, no side effects.
 *
 * @param {object} evidence
 * @param {string} evidence.admin_code
 * @param {string} evidence.admin_name
 * @param {object|null} evidence.riskProfile - ClimateRiskProfile-shaped record
 *   (overall_risk_score, risk_level, risk_level_display, flood_risk_score,
 *   drought_risk_score, heat_risk_score, erratic_rainfall_risk_score, vulnerability_score)
 * @param {object|null} evidence.hazards - climate_intelligence "hazards" shape:
 *   { extreme_heat, flood, drought, erratic_rainfall } each { class, label, ... }
 * @param {object|null} evidence.indicators - climate_intelligence "indicators";
 *   only ndvi is used (environmental stress evidence)
 * @param {object|null} evidence.exposure - { estimated_people, mapped_buildings }
 *   present only where an approved high-risk-LGA exposure breakdown entry exists
 */
export function computeClimateActionSignal(evidence) {
  const { admin_code, admin_name, riskProfile, hazards, indicators, exposure } = evidence;

  const riskLevel = riskProfile?.risk_level || null;
  const riskLevelDisplay = riskProfile?.risk_level_display || "Not yet available";
  const isHighOrVeryHigh = riskLevel === "high" || riskLevel === "very_high";

  const hazardEvidence = [];
  let hazardAdverseCount = 0;
  let hasSevereHazard = false;
  let availableHazardIndicators = 0;

  for (const key of HAZARD_KEYS) {
    const block = hazards?.[key];
    if (!block?.class || block.class === "No data") continue;
    availableHazardIndicators += 1;
    const adverse = ADVERSE_CLASSES.has(block.class);
    if (adverse) {
      hazardAdverseCount += 1;
      if (SEVERE_CLASSES.has(block.class)) hasSevereHazard = true;
    }
    hazardEvidence.push({
      key,
      label: HAZARD_LABELS[key],
      category: "hazard",
      condition: block.class,
      adverse,
      value: block.score,
      driver: block.driver_label || null,
    });
  }

  let ndviStressed = false;
  const ndvi = indicators?.ndvi;
  if (ndvi && Number.isFinite(Number(ndvi.value))) {
    const condition = ndvi.condition || classifyNdvi(ndvi.value);
    ndviStressed = isNdviStressed(condition);
    hazardEvidence.push({ key: "ndvi", label: "Vegetation condition", category: "environmental_stress", condition, adverse: ndviStressed, value: ndvi.value });
  }

  // --- Exposure evidence: only populated where a genuine LGA-specific figure
  // exists (Section 16 — never a statewide aggregate).
  const exposureEvidence = [];
  let exposurePresent = false;
  if (exposure) {
    if (Number.isFinite(Number(exposure.estimated_people))) {
      exposurePresent = true;
      exposureEvidence.push({ key: "population", label: "Population exposure", value: exposure.estimated_people });
    }
    if (Number.isFinite(Number(exposure.mapped_buildings))) {
      exposurePresent = true;
      exposureEvidence.push({ key: "buildings", label: "Mapped structures", value: exposure.mapped_buildings });
    }
  }

  // --- Vulnerability / existing risk context: ClimateRiskProfile components.
  const vulnerabilityEvidence = [];
  let vulnerabilityPresent = false;
  let availableVulnerabilityIndicators = 0;
  if (riskProfile) {
    availableVulnerabilityIndicators += 1;
    const componentFields = [
      ["flood_risk_score", "Flood risk component"],
      ["drought_risk_score", "Drought risk component"],
      ["heat_risk_score", "Heat risk component"],
      ["erratic_rainfall_risk_score", "Erratic rainfall risk component"],
    ];
    for (const [field, label] of componentFields) {
      const bucket = bucketRiskScore(riskProfile[field]);
      if (bucket === "high" || bucket === "very_high") {
        vulnerabilityPresent = true;
        vulnerabilityEvidence.push({ key: field, label, bucket, value: riskProfile[field] });
      }
    }
    const vulnBucket = bucketRiskScore(riskProfile.vulnerability_score);
    if (vulnBucket === "high" || vulnBucket === "very_high") {
      vulnerabilityPresent = true;
      vulnerabilityEvidence.push({ key: "vulnerability_score", label: "Vulnerability score", bucket: vulnBucket, value: riskProfile.vulnerability_score });
    }
  }

  const evidenceCompleteness =
    availableHazardIndicators === ELIGIBLE_HAZARD_INDICATOR_COUNT && availableVulnerabilityIndicators === 1
      ? "Good"
      : "Limited";

  // --- Dominant concern (Section 15) — existing component classifications only, no causal inference.
  const concernFlags = hazardEvidence.filter((e) => e.category === "hazard" && e.adverse).map((e) => e.label);
  if (concernFlags.length === 0 && ndviStressed) concernFlags.push("Vegetation stress");
  const dominantConcern = concernFlags.length === 0 ? null : concernFlags.length > 1 ? "Multiple climate hazards" : concernFlags[0];

  // --- Decision matrix (Section 7) ------------------------------------------------
  const exposureOrVulnerability = exposurePresent || vulnerabilityPresent;
  const strongHazardConvergence = hazardAdverseCount >= 2 || (hazardAdverseCount === 1 && hasSevereHazard);

  let signalLevel;
  if (isHighOrVeryHigh && hazardAdverseCount >= 1 && strongHazardConvergence && exposureOrVulnerability) {
    signalLevel = SIGNAL_LEVEL.URGENT_ACTION;
  } else if (isHighOrVeryHigh && hazardAdverseCount >= 1) {
    signalLevel = SIGNAL_LEVEL.ELEVATED_ATTENTION;
  } else if (hazardAdverseCount >= 1 || ndviStressed) {
    signalLevel = SIGNAL_LEVEL.MONITOR;
  } else {
    signalLevel = SIGNAL_LEVEL.NO_CURRENT_SIGNAL;
  }

  // --- Explanation (Section 13) ---
  const hazardLines = hazardEvidence
    .filter((e) => e.category === "hazard")
    .map((e) => `${e.label}: ${e.condition}${e.adverse && e.driver ? ` (driven by ${e.driver.charAt(0).toLowerCase()}${e.driver.slice(1)})` : ""}`);
  const stressLines = hazardEvidence
    .filter((e) => e.category === "environmental_stress")
    .map((e) => `${e.label} (environmental stress evidence): ${e.condition}`);
  const exposureLines = exposureEvidence.length
    ? exposureEvidence.map((e) => `${e.label}: ${Number(e.value).toLocaleString()}`)
    : ["Not currently available for this LGA"];
  const vulnerabilityLines = vulnerabilityEvidence.length
    ? vulnerabilityEvidence.map((e) => `${e.label}: ${e.bucket === "very_high" ? "Very High" : "High"}`)
    : ["No elevated risk component identified"];

  let interpretation;
  const dominantConcernLower = dominantConcern ? dominantConcern.toLowerCase() : "climate";
  if (signalLevel === SIGNAL_LEVEL.URGENT_ACTION) {
    interpretation = `Current climate stress coincides with significant exposure or vulnerability context in an LGA already classified as ${riskLevelDisplay} risk.`;
  } else if (signalLevel === SIGNAL_LEVEL.ELEVATED_ATTENTION) {
    interpretation = `An LGA already classified as ${riskLevelDisplay} risk is showing adverse ${dominantConcernLower} evidence, but exposure/vulnerability evidence is currently incomplete, or the hazard signal is limited to one moderate indicator.`;
  } else if (signalLevel === SIGNAL_LEVEL.MONITOR) {
    interpretation = `Emerging ${dominantConcernLower} evidence is present in this LGA. Existing risk classification and evidence convergence do not currently support a stronger signal.`;
  } else if (evidenceCompleteness === "Limited" && availableHazardIndicators === 0) {
    interpretation = "Insufficient current evidence is available to assess this LGA. This does not indicate normal or safe conditions.";
  } else {
    interpretation = "Available indicators for this LGA are currently within normal ranges.";
  }

  return {
    admin_code,
    admin_name,
    signal_level: signalLevel,
    signal_label: SIGNAL_LABEL[signalLevel],
    risk_level: riskLevel,
    risk_level_display: riskLevelDisplay,
    overall_risk_score: riskProfile?.overall_risk_score ?? null,
    hazard_evidence: hazardEvidence,
    exposure_evidence: exposureEvidence,
    vulnerability_evidence: vulnerabilityEvidence,
    evidence_completeness: evidenceCompleteness,
    dominant_concern: dominantConcern,
    explanation: {
      risk_context: riskLevel ? `Overall climate risk: ${riskLevelDisplay}` : "Overall climate risk: Not yet available",
      hazard_lines: hazardLines,
      stress_lines: stressLines,
      exposure_lines: exposureLines,
      vulnerability_lines: vulnerabilityLines,
      summary: {
        hazard_count: hazardAdverseCount,
        exposure_present: exposurePresent,
        vulnerability_present: vulnerabilityPresent,
        completeness: evidenceCompleteness,
      },
      interpretation,
    },
  };
}

/**
 * Transparent ordinal ranking for sorting/display only (Section 10) — not a
 * public climate-risk index. Order: signal level, then existing
 * ClimateRiskProfile score, then corroborating hazard-signal count, then
 * evidence completeness.
 */
export function rankSignals(signals) {
  const completenessRank = { Good: 1, Limited: 0 };
  return [...signals].sort((a, b) => {
    const levelDiff = (SIGNAL_RANK[b.signal_level] ?? -1) - (SIGNAL_RANK[a.signal_level] ?? -1);
    if (levelDiff !== 0) return levelDiff;
    const scoreDiff = Number(b.overall_risk_score || 0) - Number(a.overall_risk_score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const hazardDiff = (b.explanation.summary.hazard_count || 0) - (a.explanation.summary.hazard_count || 0);
    if (hazardDiff !== 0) return hazardDiff;
    return (completenessRank[b.evidence_completeness] || 0) - (completenessRank[a.evidence_completeness] || 0);
  });
}
