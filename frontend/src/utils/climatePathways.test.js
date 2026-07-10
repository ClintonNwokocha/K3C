// Targeted tests for the shared climate-pathway rule utility.
// Run from the repo root: node frontend/src/utils/climatePathways.test.js
//
// No test framework required — uses Node.js built-in assert.
// The package is "type": "module" so this file is treated as ESM.

import { strict as assert } from "assert";
import {
  deriveActionPathways,
  derivePathwaysFromIndicators,
  deriveActionPathwaysCore,
  getLensStatus,
  READINESS,
} from "./climatePathways.js";
import { canViewInternalModules, USER_ROLES } from "./permissions.js";

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
// deriveActionPathwaysCore
// ---------------------------------------------------------------------------
console.log("\nderiveActionPathwaysCore");

test("drought SPI → drought_ag pathway, ready_for_planning_discussion", () => {
  const pathways = deriveActionPathwaysCore({
    spiCond: "moderate drought",
    spiValue: -1.2,
    raCond: null,
    raValue: null,
    ndviCond: null,
    ndviValue: null,
    lstCond: null,
    lstValue: null,
    floodMean: null,
  });
  assert.ok(pathways.some((p) => p.id === "drought_ag"), "drought_ag missing");
  const p = pathways.find((p) => p.id === "drought_ag");
  assert.strictEqual(p.readinessStatus, "ready_for_planning_discussion");
  assert.ok(p.triggers.some((t) => t.includes("-1.20")));
});

test("severe drought → drought_ag pathway", () => {
  const pathways = deriveActionPathwaysCore({
    spiCond: "severe drought",
    spiValue: -1.8,
    raCond: null,
    raValue: null,
    ndviCond: null,
    ndviValue: null,
    lstCond: null,
    lstValue: null,
    floodMean: null,
  });
  assert.ok(pathways.some((p) => p.id === "drought_ag"));
});

test("extreme drought → drought_ag pathway", () => {
  const pathways = deriveActionPathwaysCore({
    spiCond: "extreme drought",
    spiValue: -2.1,
    raCond: null,
    raValue: null,
    ndviCond: null,
    ndviValue: null,
    lstCond: null,
    lstValue: null,
    floodMean: null,
  });
  assert.ok(pathways.some((p) => p.id === "drought_ag"));
});

test("drier rainfall only (no SPI) → drought_ag + ecosystem pathways", () => {
  const pathways = deriveActionPathwaysCore({
    spiCond: "near normal",
    spiValue: -0.3,
    raCond: "drier than baseline",
    raValue: -15,
    ndviCond: null,
    ndviValue: null,
    lstCond: null,
    lstValue: null,
    floodMean: null,
  });
  assert.ok(pathways.some((p) => p.id === "drought_ag"), "drought_ag missing");
  assert.ok(pathways.some((p) => p.id === "ecosystem"), "ecosystem missing");
  const drought = pathways.find((p) => p.id === "drought_ag");
  assert.ok(drought.confidence.startsWith("Low"), "expected Low confidence without SPI");
});

test("stressed vegetation → ecosystem pathway, requires_field_verification", () => {
  const pathways = deriveActionPathwaysCore({
    spiCond: null,
    spiValue: null,
    raCond: null,
    raValue: null,
    ndviCond: "sparse/stressed vegetation",
    ndviValue: 0.22,
    lstCond: null,
    lstValue: null,
    floodMean: null,
  });
  const eco = pathways.find((p) => p.id === "ecosystem");
  assert.ok(eco, "ecosystem pathway missing");
  assert.strictEqual(eco.readinessStatus, "requires_field_verification");
  assert.ok(eco.triggers.some((t) => t.includes("0.220")));
});

test("hotter LST → heat_green pathway, requires_field_verification", () => {
  const pathways = deriveActionPathwaysCore({
    spiCond: null,
    spiValue: null,
    raCond: null,
    raValue: null,
    ndviCond: null,
    ndviValue: null,
    lstCond: "relatively hotter surface conditions",
    lstValue: 38.5,
    floodMean: null,
  });
  const heat = pathways.find((p) => p.id === "heat_green");
  assert.ok(heat, "heat_green pathway missing");
  assert.strictEqual(heat.readinessStatus, "requires_field_verification");
});

test("flood signal (mean > 2) → water_drainage pathway", () => {
  const pathways = deriveActionPathwaysCore({
    spiCond: null,
    spiValue: null,
    raCond: null,
    raValue: null,
    ndviCond: null,
    ndviValue: null,
    lstCond: null,
    lstValue: null,
    floodMean: 5.3,
  });
  assert.ok(pathways.some((p) => p.id === "water_drainage"));
});

test("flood mean ≤ 2 → no water_drainage pathway", () => {
  const pathways = deriveActionPathwaysCore({
    spiCond: null,
    spiValue: null,
    raCond: null,
    raValue: null,
    ndviCond: null,
    ndviValue: null,
    lstCond: null,
    lstValue: null,
    floodMean: 1.9,
  });
  assert.ok(!pathways.some((p) => p.id === "water_drainage"));
});

test("no signal → fallback no_signal pathway with insufficient_evidence", () => {
  const pathways = deriveActionPathwaysCore({
    spiCond: "near normal",
    spiValue: 0.1,
    raCond: "near baseline",
    raValue: 2,
    ndviCond: "healthy vegetation",
    ndviValue: 0.65,
    lstCond: "relatively cooler",
    lstValue: 27,
    floodMean: null,
  });
  assert.strictEqual(pathways.length, 1);
  assert.strictEqual(pathways[0].id, "no_signal");
  assert.strictEqual(pathways[0].readinessStatus, "insufficient_evidence");
});

test("result always ≤ 3 pathways even with all signals active", () => {
  const pathways = deriveActionPathwaysCore({
    spiCond: "moderate drought",
    spiValue: -1.2,
    raCond: "drier than baseline",
    raValue: -20,
    ndviCond: "sparse/stressed vegetation",
    ndviValue: 0.2,
    lstCond: "relatively hotter surface conditions",
    lstValue: 39,
    floodMean: 10,
  });
  assert.ok(pathways.length <= 3, `expected ≤3 but got ${pathways.length}`);
});

// ---------------------------------------------------------------------------
// deriveActionPathways (E5 profile wrapper)
// ---------------------------------------------------------------------------
console.log("\nderiveActionPathways (E5 wrapper)");

test("reads drought condition from sections.drought.condition", () => {
  const ciProfile = {
    sections: {
      drought: { value: -1.5, condition: "severe drought" },
      rainfall: { total: { value: 400 }, anomaly: { value: -5, condition: "near baseline" } },
      vegetation: { value: 0.55, condition: "moderate vegetation" },
      temperature: { value: 32, condition: "moderate" },
    },
  };
  const pathways = deriveActionPathways({ ciProfile, floodSnap: null, isFloodAvailable: false });
  assert.ok(pathways.some((p) => p.id === "drought_ag"), "drought_ag missing");
});

test("reads vegetation from sections.vegetation.condition", () => {
  const ciProfile = {
    sections: {
      vegetation: { value: 0.2, condition: "sparse/stressed vegetation" },
    },
  };
  const pathways = deriveActionPathways({ ciProfile, floodSnap: null, isFloodAvailable: false });
  assert.ok(pathways.some((p) => p.id === "ecosystem"));
});

test("reads flood from floodSnap when isFloodAvailable", () => {
  const ciProfile = { sections: {} };
  const floodSnap = { mean_value: 8.2 };
  const pathways = deriveActionPathways({ ciProfile, floodSnap, isFloodAvailable: true });
  assert.ok(pathways.some((p) => p.id === "water_drainage"));
});

test("flood ignored when isFloodAvailable is false", () => {
  const ciProfile = { sections: {} };
  const floodSnap = { mean_value: 8.2 };
  const pathways = deriveActionPathways({ ciProfile, floodSnap, isFloodAvailable: false });
  assert.ok(!pathways.some((p) => p.id === "water_drainage"));
});

test("null ciProfile → fallback no_signal", () => {
  const pathways = deriveActionPathways({ ciProfile: null, floodSnap: null, isFloodAvailable: false });
  assert.strictEqual(pathways[0].id, "no_signal");
});

// ---------------------------------------------------------------------------
// derivePathwaysFromIndicators (E1 indicators wrapper)
// ---------------------------------------------------------------------------
console.log("\nderivePathwaysFromIndicators (E1 wrapper)");

test("reads spi condition from indicators.spi.condition", () => {
  const indicators = { spi: { value: -1.1, condition: "moderate drought" } };
  const pathways = derivePathwaysFromIndicators(indicators);
  assert.ok(pathways.some((p) => p.id === "drought_ag"));
});

test("reads rainfall_anomaly from indicators.rainfall_anomaly.condition", () => {
  const indicators = {
    rainfall_anomaly: { value: -18, condition: "drier than baseline" },
  };
  const pathways = derivePathwaysFromIndicators(indicators);
  assert.ok(pathways.some((p) => p.id === "drought_ag"));
  assert.ok(pathways.some((p) => p.id === "ecosystem"));
});

test("reads ndvi condition from indicators.ndvi.condition", () => {
  const indicators = {
    ndvi: { value: 0.19, condition: "sparse/stressed vegetation" },
  };
  const pathways = derivePathwaysFromIndicators(indicators);
  assert.ok(pathways.some((p) => p.id === "ecosystem"));
});

test("reads lst condition from indicators.lst.condition", () => {
  const indicators = {
    lst: { value: 40.1, condition: "relatively hotter surface conditions" },
  };
  const pathways = derivePathwaysFromIndicators(indicators);
  assert.ok(pathways.some((p) => p.id === "heat_green"));
});

test("null indicators → fallback no_signal", () => {
  const pathways = derivePathwaysFromIndicators(null);
  assert.strictEqual(pathways[0].id, "no_signal");
});

test("empty indicators object → fallback no_signal", () => {
  const pathways = derivePathwaysFromIndicators({});
  assert.strictEqual(pathways[0].id, "no_signal");
});

test("water_drainage never produced by E1 wrapper (no flood data in E1)", () => {
  const indicators = {
    spi: { value: -1.5, condition: "severe drought" },
    rainfall_anomaly: { value: -25, condition: "drier than baseline" },
    ndvi: { value: 0.15, condition: "sparse/stressed vegetation" },
    lst: { value: 42, condition: "relatively hotter surface conditions" },
  };
  const pathways = derivePathwaysFromIndicators(indicators);
  assert.ok(!pathways.some((p) => p.id === "water_drainage"),
    "water_drainage must not appear from E1 data");
});

test("lulc field in indicators is ignored — no lulc-based pathway produced", () => {
  const indicators = {
    lulc: { dominant_class: "trees", dominant_label: "Trees", is_public: false },
  };
  const pathways = derivePathwaysFromIndicators(indicators);
  assert.ok(!pathways.some((p) => p.id === "lulc"), "lulc pathway must not exist");
  assert.ok(
    !pathways.some(
      (p) => p.evidenceBasis?.toLowerCase().includes("lulc") && p.id !== "no_signal"
    ),
    "no pathway should reference LULC evidence"
  );
  assert.strictEqual(pathways[0].id, "no_signal");
});

// ---------------------------------------------------------------------------
// READINESS constant
// ---------------------------------------------------------------------------
console.log("\nREADINESS constant");

test("has ready_for_planning_discussion key", () => {
  assert.ok(READINESS.ready_for_planning_discussion);
  assert.ok(READINESS.ready_for_planning_discussion.label);
  assert.ok(READINESS.ready_for_planning_discussion.cls);
});

test("has requires_field_verification key", () => {
  assert.ok(READINESS.requires_field_verification);
});

test("has insufficient_evidence key", () => {
  assert.ok(READINESS.insufficient_evidence);
});

// ---------------------------------------------------------------------------
// Access control: canViewInternalModules
// ---------------------------------------------------------------------------
console.log("\nAccess control — canViewInternalModules");

test("returns false for null user (unauthenticated)", () => {
  assert.strictEqual(canViewInternalModules(null), false);
});

test("returns false for user with PUBLIC role", () => {
  assert.strictEqual(
    canViewInternalModules({ profile: { role: USER_ROLES.PUBLIC } }),
    false
  );
});

test("returns false for user with no profile", () => {
  assert.strictEqual(canViewInternalModules({}), false);
});

test("returns true for ADMIN role", () => {
  assert.strictEqual(
    canViewInternalModules({ profile: { role: USER_ROLES.ADMIN } }),
    true
  );
});

test("returns true for ANALYST role", () => {
  assert.strictEqual(
    canViewInternalModules({ profile: { role: USER_ROLES.ANALYST } }),
    true
  );
});

test("returns true for REVIEWER role", () => {
  assert.strictEqual(
    canViewInternalModules({ profile: { role: USER_ROLES.REVIEWER } }),
    true
  );
});

test("returns true for VIEWER role", () => {
  assert.strictEqual(
    canViewInternalModules({ profile: { role: USER_ROLES.VIEWER } }),
    true
  );
});

test("returns true for superuser regardless of role", () => {
  assert.strictEqual(
    canViewInternalModules({ is_superuser: true, profile: { role: USER_ROLES.PUBLIC } }),
    true
  );
});

// ---------------------------------------------------------------------------
// getLensStatus — map lens status helper
// ---------------------------------------------------------------------------
console.log("\ngetLensStatus");

test("water_drainage always → not_assessed regardless of pathways", () => {
  const pathways = [{ id: "drought_ag", readinessStatus: "ready_for_planning_discussion" }];
  assert.strictEqual(getLensStatus(pathways, "water_drainage"), "not_assessed");
});

test("water_drainage → not_assessed even when pathways is empty", () => {
  assert.strictEqual(getLensStatus([], "water_drainage"), "not_assessed");
});

test("triggered ecosystem pathway → returns its readinessStatus", () => {
  const pathways = [
    { id: "ecosystem", readinessStatus: "requires_field_verification" },
    { id: "drought_ag", readinessStatus: "ready_for_planning_discussion" },
  ];
  assert.strictEqual(getLensStatus(pathways, "ecosystem"), "requires_field_verification");
});

test("triggered drought_ag pathway → returns its readinessStatus", () => {
  const pathways = [{ id: "drought_ag", readinessStatus: "ready_for_planning_discussion" }];
  assert.strictEqual(getLensStatus(pathways, "drought_ag"), "ready_for_planning_discussion");
});

test("non-triggered drought_ag → no_signal", () => {
  const pathways = [{ id: "ecosystem", readinessStatus: "requires_field_verification" }];
  assert.strictEqual(getLensStatus(pathways, "drought_ag"), "no_signal");
});

test("no_signal fallback array → no_signal for all real lens pathways", () => {
  const pathways = [{ id: "no_signal", readinessStatus: "insufficient_evidence" }];
  assert.strictEqual(getLensStatus(pathways, "ecosystem"), "no_signal");
  assert.strictEqual(getLensStatus(pathways, "drought_ag"), "no_signal");
  assert.strictEqual(getLensStatus(pathways, "heat_green"), "no_signal");
});

test("empty pathways array → no_signal for non-water pathway", () => {
  assert.strictEqual(getLensStatus([], "ecosystem"), "no_signal");
  assert.strictEqual(getLensStatus([], "drought_ag"), "no_signal");
  assert.strictEqual(getLensStatus([], "heat_green"), "no_signal");
});

test("getLensStatus round-trips correctly for heat_green", () => {
  const pathways = deriveActionPathwaysCore({
    spiCond: null, spiValue: null,
    raCond: null, raValue: null,
    ndviCond: null, ndviValue: null,
    lstCond: "relatively hotter surface conditions", lstValue: 39,
    floodMean: null,
  });
  assert.strictEqual(getLensStatus(pathways, "heat_green"), "requires_field_verification");
  assert.strictEqual(getLensStatus(pathways, "drought_ag"), "no_signal");
  assert.strictEqual(getLensStatus(pathways, "water_drainage"), "not_assessed");
});

// ---------------------------------------------------------------------------
// Governance — prohibited phrases must not appear in approved display labels
// ---------------------------------------------------------------------------
console.log("\nGovernance — prohibited phrases");

const PROHIBITED_PHRASES = [
  "priority area",
  "high-risk",
  "flood-prone",
  "flood hazard",
  "implementation-ready",
  "afforestation priority site",
];

test("READINESS status labels contain no prohibited phrases", () => {
  for (const key of Object.keys(READINESS)) {
    const lower = READINESS[key].label.toLowerCase();
    for (const phrase of PROHIBITED_PHRASES) {
      assert.ok(
        !lower.includes(phrase),
        `READINESS[${key}].label contains prohibited phrase: "${phrase}"`
      );
    }
  }
});

test("pathway themes produced by deriveActionPathwaysCore contain no prohibited phrases", () => {
  const pathways = deriveActionPathwaysCore({
    spiCond: "moderate drought", spiValue: -1.2,
    raCond: "drier than baseline", raValue: -20,
    ndviCond: "sparse/stressed vegetation", ndviValue: 0.2,
    lstCond: "relatively hotter surface conditions", lstValue: 39,
    floodMean: 10,
  });
  for (const p of pathways) {
    const lowerTheme = p.theme.toLowerCase();
    for (const phrase of PROHIBITED_PHRASES) {
      assert.ok(
        !lowerTheme.includes(phrase),
        `Pathway "${p.id}" theme contains prohibited phrase: "${phrase}" in "${p.theme}"`
      );
    }
  }
});

test("no_signal pathway theme contains no prohibited phrases", () => {
  const pathways = deriveActionPathwaysCore({
    spiCond: null, spiValue: null, raCond: null, raValue: null,
    ndviCond: null, ndviValue: null, lstCond: null, lstValue: null,
    floodMean: null,
  });
  assert.strictEqual(pathways[0].id, "no_signal");
  const lower = pathways[0].theme.toLowerCase();
  for (const phrase of PROHIBITED_PHRASES) {
    assert.ok(!lower.includes(phrase), `no_signal theme contains "${phrase}"`);
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
