// Pure helpers for the Climate Briefing Assistant panel (PublicClimateAtlasPage's
// "Climate briefing" / "Ask about this map" panel). Kept separate from the page
// component so the request-shaping and display logic can be unit tested without
// mounting the full Atlas page (same rationale as climatePathways.js).
//
// This module never calls the backend itself and never talks to xAI/Grok
// directly — it only shapes the request the page sends via
// services/api.js#getClimateAssistantAnswer and resolves small display
// concerns (badge label, suggested questions) from the response.

export const ASSISTANT_SEASON_PARAM = {
  "Full Year": "annual",
  "Wet Season": "wet_season",
  "Dry Season": "dry_season",
};

export function normalizeSeasonForAssistant(seasonLabel) {
  return ASSISTANT_SEASON_PARAM[seasonLabel] || "annual";
}

export const ASSISTANT_MAX_QUESTION_LENGTH = 400;

// Mirrors backend/remote_sensing/climate_context.py's
// SUGGESTED_QUESTIONS_BY_INDICATOR — kept in sync by hand. The backend's
// suggested_questions in a successful response always wins when present;
// this is the client-side default shown before any question is asked, and
// the fallback if the backend returns none.
const GENERIC_SUGGESTED_QUESTIONS = [
  "What does this indicator mean?",
  "How does this compare with the historical baseline?",
  "What limitations should I consider?",
];

const HAZARD_QUESTIONS = [
  "Which LGAs are most affected this year?",
  "What is driving this hazard?",
  "How does this compare with the 1991-2020 normal?",
  "What actions could planners consider?",
];

const SUGGESTED_QUESTIONS_BY_INDICATOR = {
  hazard_extreme_heat: HAZARD_QUESTIONS,
  hazard_flood: HAZARD_QUESTIONS,
  hazard_drought: [...HAZARD_QUESTIONS, "What does this mean for farmers?"],
  hazard_erratic_rainfall: [...HAZARD_QUESTIONS, "What does this mean for planting dates?"],
  rainfall: [...GENERIC_SUGGESTED_QUESTIONS, "What does this mean for farming?"],
  rainfall_anomaly: [...GENERIC_SUGGESTED_QUESTIONS, "What does this mean for farming?"],
  drought_index: [...GENERIC_SUGGESTED_QUESTIONS, "What does this mean for farmers?", "What actions could planners consider?"],
  ndvi: [...GENERIC_SUGGESTED_QUESTIONS, "What does this mean for farming?"],
  lst: [...GENERIC_SUGGESTED_QUESTIONS, "Which LGAs require attention?"],
  annual_lulc: GENERIC_SUGGESTED_QUESTIONS,
  elevation: GENERIC_SUGGESTED_QUESTIONS,
  flood_occurrence: [...GENERIC_SUGGESTED_QUESTIONS, "What actions could planners consider?"],
};

export function getDefaultSuggestedQuestions(indicatorKey) {
  return SUGGESTED_QUESTIONS_BY_INDICATOR[indicatorKey] || GENERIC_SUGGESTED_QUESTIONS;
}

/**
 * Builds the exact payload sent to POST /api/climate/assistant/. The
 * backend treats indicator/year/season/period/admin_code/lga_name as
 * lookup identifiers only — it resolves every climate value itself — so
 * this function's only job is naming/shaping, never computing evidence.
 */
export function buildAssistantRequest({
  question,
  indicatorKey,
  year,
  seasonLabel,
  periodLabel,
  adminCode,
  lgaName,
  mapLegend,
}) {
  const payload = {
    question: String(question || "").trim(),
    indicator: indicatorKey,
    year,
    season: normalizeSeasonForAssistant(seasonLabel),
  };
  if (periodLabel) payload.period = periodLabel;
  if (adminCode) payload.admin_code = adminCode;
  if (lgaName) payload.lga_name = lgaName;
  // The legend the visitor is looking at, so colour/class questions are answered from it (never guessed).
  if (mapLegend) {
    payload.map_legend = {
      type: mapLegend.type,
      caption: mapLegend.caption,
      labels: mapLegend.labels,
      colors: mapLegend.colors,
      rows: mapLegend.rows,
    };
  }
  return payload;
}

export function resolveAssistantBadge(mode) {
  return mode === "ai" ? "AI-assisted" : "Rule-based";
}

export function isQuestionTooLong(question) {
  return String(question || "").length > ASSISTANT_MAX_QUESTION_LENGTH;
}
