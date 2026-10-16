/* global process */
// Targeted tests for the Climate Briefing Assistant's pure request/display
// helpers. Run from the repo root: node frontend/src/decision-support/climateAssistant.test.js
//
// No test framework required — uses Node.js built-in assert.
// The package is "type": "module" so this file is treated as ESM.

import { strict as assert } from "assert";
import {
  ASSISTANT_MAX_QUESTION_LENGTH,
  buildAssistantRequest,
  getDefaultSuggestedQuestions,
  isQuestionTooLong,
  normalizeSeasonForAssistant,
  resolveAssistantBadge,
} from "./climateAssistant.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// normalizeSeasonForAssistant
// ---------------------------------------------------------------------------
console.log("\nnormalizeSeasonForAssistant");

test("maps Full Year to annual", () => {
  assert.strictEqual(normalizeSeasonForAssistant("Full Year"), "annual");
});

test("maps Wet Season to wet_season", () => {
  assert.strictEqual(normalizeSeasonForAssistant("Wet Season"), "wet_season");
});

test("maps Dry Season to dry_season", () => {
  assert.strictEqual(normalizeSeasonForAssistant("Dry Season"), "dry_season");
});

test("defaults unknown/missing season label to annual", () => {
  assert.strictEqual(normalizeSeasonForAssistant(undefined), "annual");
  assert.strictEqual(normalizeSeasonForAssistant("Nonsense"), "annual");
});

// ---------------------------------------------------------------------------
// buildAssistantRequest
// ---------------------------------------------------------------------------
console.log("\nbuildAssistantRequest");

test("builds a statewide payload with no admin_code/lga_name when none selected", () => {
  const payload = buildAssistantRequest({
    question: "What does this mean?",
    indicatorKey: "rainfall",
    year: 2025,
    seasonLabel: "Wet Season",
  });
  assert.strictEqual(payload.question, "What does this mean?");
  assert.strictEqual(payload.indicator, "rainfall");
  assert.strictEqual(payload.year, 2025);
  assert.strictEqual(payload.season, "wet_season");
  assert.strictEqual("admin_code" in payload, false, "admin_code must be omitted, not sent as empty/null");
  assert.strictEqual("lga_name" in payload, false, "lga_name must be omitted, not sent as empty/null");
});

test("sends the visible map legend, and omits it when there is none", () => {
  const legend = { type: "gradient", caption: "Annual rainfall (mm)", labels: ["900", "1,500"], colors: ["#fff", "#00f"], extra: "ignored" };
  const withLegend = buildAssistantRequest({ question: "q", indicatorKey: "rainfall", year: 2025, seasonLabel: "Full Year", mapLegend: legend });
  assert.deepStrictEqual(withLegend.map_legend.labels, ["900", "1,500"]);
  assert.strictEqual("extra" in withLegend.map_legend, false, "only known legend fields are sent");
  const without = buildAssistantRequest({ question: "q", indicatorKey: "rainfall", year: 2025, seasonLabel: "Full Year" });
  assert.strictEqual("map_legend" in without, false);
});

test("builds an LGA-scoped payload when admin_code and lga_name are selected", () => {
  const payload = buildAssistantRequest({
    question: "What does this mean for farming?",
    indicatorKey: "drought_index",
    year: 2024,
    seasonLabel: "Dry Season",
    periodLabel: "2021–2025",
    adminCode: "19023",
    lgaName: "Zaria",
  });
  assert.strictEqual(payload.season, "dry_season");
  assert.strictEqual(payload.period, "2021–2025");
  assert.strictEqual(payload.admin_code, "19023");
  assert.strictEqual(payload.lga_name, "Zaria");
});

test("trims whitespace from the question but never changes indicator/scope fields", () => {
  const payload = buildAssistantRequest({
    question: "   What does this mean?   ",
    indicatorKey: "ndvi",
    year: 2023,
    seasonLabel: "Full Year",
    adminCode: "19001",
  });
  assert.strictEqual(payload.question, "What does this mean?");
  assert.strictEqual(payload.indicator, "ndvi");
  assert.strictEqual(payload.admin_code, "19001");
});

// ---------------------------------------------------------------------------
// getDefaultSuggestedQuestions
// ---------------------------------------------------------------------------
console.log("\ngetDefaultSuggestedQuestions");

test("adapts suggested questions to the selected indicator", () => {
  const rainfallQuestions = getDefaultSuggestedQuestions("rainfall");
  const droughtQuestions = getDefaultSuggestedQuestions("drought_index");
  assert.ok(rainfallQuestions.includes("What does this mean for farming?"));
  assert.ok(droughtQuestions.includes("What actions could planners consider?"));
  assert.notDeepStrictEqual(rainfallQuestions, droughtQuestions);
});

test("falls back to generic questions for an unrecognised indicator", () => {
  const questions = getDefaultSuggestedQuestions("not_a_real_indicator");
  assert.ok(questions.includes("What does this indicator mean?"));
});

// ---------------------------------------------------------------------------
// resolveAssistantBadge
// ---------------------------------------------------------------------------
console.log("\nresolveAssistantBadge");

test('mode "ai" resolves to the AI-assisted badge', () => {
  assert.strictEqual(resolveAssistantBadge("ai"), "AI-assisted");
});

test('mode "rule_based" resolves to the Rule-based badge', () => {
  assert.strictEqual(resolveAssistantBadge("rule_based"), "Rule-based");
});

test("any unrecognised/missing mode defaults to the Rule-based badge (never claims AI falsely)", () => {
  assert.strictEqual(resolveAssistantBadge(undefined), "Rule-based");
  assert.strictEqual(resolveAssistantBadge("something_else"), "Rule-based");
});

// ---------------------------------------------------------------------------
// isQuestionTooLong
// ---------------------------------------------------------------------------
console.log("\nisQuestionTooLong");

test("short questions are not too long", () => {
  assert.strictEqual(isQuestionTooLong("What does this mean?"), false);
});

test("a question at exactly the max length is not too long", () => {
  assert.strictEqual(isQuestionTooLong("x".repeat(ASSISTANT_MAX_QUESTION_LENGTH)), false);
});

test("a question over the max length is too long", () => {
  assert.strictEqual(isQuestionTooLong("x".repeat(ASSISTANT_MAX_QUESTION_LENGTH + 1)), true);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
