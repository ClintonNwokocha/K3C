# Climate Intelligence → suggested actions → Projects → GHG

## Architecture

`climateRecommendations.js` is a pure deterministic engine. It reuses the
existing `climateActionSignal.js` classifier bands and `climatePathways.js`
evidence explanations. No AI, project creation, approval or emissions estimate
is performed. `RecommendedActions` renders its outputs on the public Climate
Intelligence page and the selected Atlas LGA/indicator. Existing pathway panels
also expose the same recommendation metadata.

Inputs: selected indicator, optional existing classification/severity, LGA,
admin code, year, period, season and available metric values. Outputs: stable
rule ID, title, rationale, transparent screening priority, project type, suggested
GHG sector(s), adaptation/mitigation relevance, example interventions and limitations.
Missing or nonnumeric selected metrics do not trigger a rule.

## Rules

| Evidence | Suggested interventions | Project type | GHG context |
|---|---|---|---|
| SPI ≤ −1, or rainfall anomaly < −10% | Water harvesting, sustainable irrigation, drought-resilient agriculture, soil moisture conservation | Climate Adaptation | Agriculture; mitigation not assessed |
| NDVI < 0.35 | Agroforestry, appropriate reforestation, landscape and soil restoration | Nature-Based Solutions & Ecosystem Restoration | LULUCF; conditional removals |
| Daytime LST > 36°C | Urban greening, shade/tree planting, efficient buildings, cool roofs | Climate Adaptation & Mitigation | Energy and/or LULUCF; conditional benefits |
| Historical surface-water occurrence > 2% | Drainage review, watershed management, retention/storage, preparedness | Climate Resilience & Disaster Risk Reduction | Not Assessed |
| Available rainfall metric with supplied flood classification | Flood/drainage preparedness review | Climate Resilience & Disaster Risk Reduction | Not Assessed |

Classification values supplied by an existing assessment take precedence over
numeric fallback bands. Severe/extreme classifications get **High** screening
priority; other triggers get **Planning review**. This is neither an emergency
alert nor an investment ranking. A wet anomaly or large rainfall total alone
does not establish a hazard. A single deficit does not prove persistence.
Low NDVI does not establish degradation, land suitability or its cause.
Historical water occurrence is not a flood forecast. LST is not air temperature.

## Inventory and transition progress

The staff `/api/ghg/dashboard-summary/` API gains additive `ghg.scope` and
`ghg.sector_transition` fields. History uses approved-only `GHGStateTotal` rows.
Sector baselines/targets are null because no sector configuration exists in
this schema. The statewide NDC constant is never allocated to sectors.
Legacy `sector_breakdown` fields are retained for compatibility; a missing
reporting year makes its legacy zero unavailable in the transition display.

The public transition adapter uses `totals.by_sector_year`, which the existing
public API builds before explorer filters. An unfiltered snapshot is retained
separately, so chart/geography/gas selections cannot change statewide progress.
All five sectors are shown with actual history, conditional configured progress,
and suitable intervention types. An explicit non-statewide payload is rejected.

When a sector baseline/target is provided in future:

- Change = latest − baseline, in tCO2e.
- Progress = (baseline − latest) / (baseline − target) × 100, only for a positive reduction goal.
- Remaining gap = max(0, latest − target), in tCO2e.
- Trend compares the two latest available reporting years; uneven periods and coverage require interpretation.

Missing baselines/targets/progress remain **Not Available / Not Configured**.
Negative progress and progress above 100% are retained, not silently clamped.

## Pending Projects summary API contract

The isolated `services/projectMitigation.js` adapter performs no request until
`VITE_PROJECT_GHG_SUMMARY_ENDPOINT` is configured to an API-relative route.
No endpoint is assumed to exist. The public view never calls a staff endpoint.
Missing configuration, 404/501, request errors, invalid units/scope or absent
assessment values show **No project mitigation assessment available**.

Proposed payload to align with the Projects branch before enabling:

```json
{
  "scope": "statewide",
  "unit": "tCO2e/year",
  "sectors": [
    {
      "sector": "energy",
      "contributing_projects": null,
      "contributing_project_ids": [],
      "expected_annual_tco2e": null,
      "verified_annual_tco2e": null,
      "reductions_avoided_tco2e": null,
      "removals_tco2e": null
    }
  ]
}
```

This schema example contains no invented assessments. Null means unavailable;
numeric zero means an explicitly assessed zero. Reductions/avoided emissions
and removals are the **expected annual** breakdown, not a mixture of expected
and verified values. Contributing IDs must identify actual registered projects
included in the aggregate. Validate the reporting period, verification basis,
double-counting policy and permissions with the API owner. If Claude's API uses
different field names or units, change only this adapter after verifying the
contract. No project totals are combined with or subtracted from inventory.

## Navigation and merge boundaries

Actions link to `/public/projects` with LGA, first suggested sector and planning
context. Sector labels are translated to existing public filter values.
Registration links to `/?page=projects&tab=form`; login preserves the requested
page and the form opens with reviewable legacy type/sector suggestions and
climate relevance text. LGA registry IDs are never invented; the staff user
must select the actual LGA before saving. No request submits the form automatically.
The GHG link uses `from_lga` as context, never an inventory geography filter.
Multi-sector recommendations show both sectors and link initially to the first;
the GHG dashboard exposes all five.

Contributing-project navigation filters only explicit summary IDs. When no IDs
are available, it shows an empty assessed-project selection and explains why.
Public project visibility remains controlled by existing publication rules.

No Projects backend model, migration, serializer, endpoint or publication gate
is changed. Likely merge overlap: `ProjectPortfolioPage.jsx`, `PublicProjectsPage.jsx`,
`App.jsx` navigation, project-type options and summary contract. Display labels
are the requested new taxonomy; staff form codes remain `adaptation`, `mitigation`,
`cross_cutting` until the Projects branch supplies its authoritative taxonomy.
Registration maps Climate Adaptation to `adaptation`, Climate Mitigation to
`mitigation`, and combined, nature-based, resilience or other recommendation
labels to `cross_cutting`. Descriptive labels are never stored as `project_type`.

## Verification

Run from `frontend`: `node --test src/decision-support/climateRecommendations.test.js`
plus existing climate utility suites, `npm run lint`, `npm run build`.
Run backend GHG/public portal/remote sensing tests against an isolated test
database. No production or staging configuration is required. Final test results
and merge review are reported in the task response.

Validation completed: 83 frontend assertions pass (18 new pathway/integration
tests plus 65 existing utility assertions). The 169 focused backend tests pass.
The broader 641-test backend run initially exceeded default anonymous throttling;
a local-only high-rate rerun passed 621 tests and left 20 errors in existing
`release_lulc` publication tests. Those fixtures allocate scoped dataset IDs 3/4,
which the unchanged release command explicitly excludes. Publication gates were
not altered to make that suite pass. Tests used in-memory SQLite rather than
production PostgreSQL. Lint has zero errors and six existing hook warnings;
build passes with the existing large-bundle warning. Browser visual testing was
not performed in this worktree.
