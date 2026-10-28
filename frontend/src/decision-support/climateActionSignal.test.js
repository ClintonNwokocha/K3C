import { strict as assert } from "node:assert";
import { test } from "node:test";
import { computeClimateActionSignal, SIGNAL_LEVEL } from "./climateActionSignal.js";

const highRisk = { risk_level: "high", risk_level_display: "High", vulnerability_score: 80 };
const hazards = (classes) =>
  Object.fromEntries(Object.entries(classes).map(([key, cls]) => [key, { class: cls, score: 90, driver_label: "Hot days" }]));
const signal = (riskProfile, classes, extra = {}) =>
  computeClimateActionSignal({ admin_code: "1", admin_name: "Zaria", riskProfile, hazards: hazards(classes), ...extra });

test("a severe hazard in a high-risk, vulnerable LGA is urgent", () => {
  const s = signal(highRisk, { extreme_heat: "Severe", flood: "Normal", drought: "Normal", erratic_rainfall: "Normal" });
  assert.equal(s.signal_level, SIGNAL_LEVEL.URGENT_ACTION);
  assert.equal(s.dominant_concern, "Extreme Heat");
  assert.equal(s.evidence_completeness, "Good");
  assert.match(s.explanation.hazard_lines[0], /Extreme Heat: Severe \(driven by hot days\)/);
});

test("one moderate hazard without vulnerability is elevated, not urgent", () => {
  const s = signal({ risk_level: "high", vulnerability_score: 10 }, { flood: "Moderate" });
  assert.equal(s.signal_level, SIGNAL_LEVEL.ELEVATED_ATTENTION);
  assert.equal(s.evidence_completeness, "Limited");
});

test("two adverse hazards name multiple hazards; moderate-risk LGAs are monitored", () => {
  const s = signal({ risk_level: "moderate" }, { drought: "Moderate", erratic_rainfall: "Extreme" });
  assert.equal(s.signal_level, SIGNAL_LEVEL.MONITOR);
  assert.equal(s.dominant_concern, "Multiple climate hazards");
});

test("normal hazards give no current signal", () => {
  const s = signal(highRisk, { extreme_heat: "Normal", flood: "Normal", drought: "Normal", erratic_rainfall: "Normal" });
  assert.equal(s.signal_level, SIGNAL_LEVEL.NO_CURRENT_SIGNAL);
});

test("erratic rainfall risk counts as a vulnerability component", () => {
  const s = signal({ risk_level: "high", erratic_rainfall_risk_score: 80 }, { flood: "Severe" });
  assert.equal(s.signal_level, SIGNAL_LEVEL.URGENT_ACTION);
  assert.equal(s.vulnerability_evidence[0].key, "erratic_rainfall_risk_score");
});
