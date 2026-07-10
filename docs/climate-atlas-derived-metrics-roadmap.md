# Climate Atlas — Derived Metrics Roadmap

## Status

The Derived Metrics stage has not started. No backend support for percentile or
baseline comparisons exists yet.

The next stage begins only after the NDVI historical sync completes and its
records are validated.

---

## What is already in place

The Climate Atlas currently stores and exposes one statistic per LGA, season,
and year for each operational remote-sensing layer:

- **NDVI** — spatial mean NDVI across the LGA for the selected period
- **Rainfall Total** — spatial mean accumulated rainfall (mm) across the LGA
  for the selected season window

These are derived from saved `RemoteSensingLGAMetric` records and do not
trigger new GEE downloads.

---

## What the Quantity control currently shows

The Atlas sidebar shows a read-only **Statistic** label, not a selectable
quantity. The label reflects the only currently supported statistic:

| Variable | Label shown |
|---|---|
| Vegetation / NDVI | Spatial mean |
| Rainfall Total (mm) | Spatial mean |
| Overall Climate Intelligence | Composite assessment score |
| Mean Temperature / Heat Risk | Composite assessment score |
| All other variables | Spatial mean |

**The Quantity control must not become editable again until the backend API
exposes the corresponding derived metric endpoint.**

---

## Approved future Quantity choices

When the Derived Metrics stage is implemented, the Atlas will expose exactly
three selectable statistics:

1. **Spatial mean** — current value (already implemented)
2. **Change from reference period** — selected value minus the LGA's seasonal
   baseline mean for the reference period, in native units
3. **Historical percentile rank** — selected value ranked against the same LGA
   and season historical record, expressed as a percentile

### Not retained as separate selectable quantities

| Removed option | Reason |
|---|---|
| P10 | Used internally as a reference threshold only |
| P90 | Used internally as a reference threshold only |
| Change rel. to baseline | Renamed to *Change from reference period* |

P10 and P90 will be calculated as supporting historical reference thresholds
for interpretation context (e.g., "this season's rainfall is above the 90th
percentile"). They are not user-selectable statistics.

---

## Rainfall Total — Derived metric method

- **Product:** CHIRPS Rainfall Total (mm) — accumulated seasonal total, NOT a
  rainfall anomaly
- **Baseline candidate:** 1991–2020 climatological reference period
- **Calculate separately for:** Annual, Wet Season, Dry Season
- **Change from reference period:** selected LGA seasonal total minus that
  LGA's baseline mean for the same season, in mm
- **Historical percentile rank:** selected total ranked against the same LGA
  and season historical record (1981–2025 after backfill)
- **Do not label this as Rainfall Anomaly.** Rainfall anomaly is a separate
  layer key with its own computation method.

---

## NDVI — Derived metric method

- **Current comparable record after backfill:** 2018–2025
- **Reference comparisons must be labelled:** `Short satellite reference period`
- **Do not describe this as a 30-year climate normal.** The NDVI record is
  approximately 7–8 years long; it cannot support climatological normals.
- **Calculate separately by LGA and season.**
- Reference period and available year range must be documented in the
  `metadata` field of every derived-metric record.

---

## LST — Derived metric method

- Add LST to the derived-metric system only after its historical 2001–2025
  backfill is complete and validated.
- Keep LST, air temperature, and heat-risk composite metrics separate at every
  stage. Do not mix units (°C vs. risk score vs. anomaly index).

---

## Required future backend work

The Derived Metrics stage must:

- derive all new statistics from already-saved `RemoteSensingLGAMetric`
  records — no new GEE downloads
- store each result with full method metadata: reference period, layer, LGA,
  season, calculation date, and version string
- expose only scientifically defined statistics through the API — no frontend
  calculations of percentiles or baselines
- update the Atlas Quantity control only after the backend API endpoint for
  that statistic is live and validated
- document the reference period, historical record length, and any coverage
  caveats alongside every derived metric returned by the API

---

## What must not be done prematurely

- Do not expose a Quantity dropdown with options the backend cannot fulfil.
- Do not calculate percentile rank or baseline comparison in the frontend from
  raw LGA stats.
- Do not describe NDVI percentile comparisons as 30-year climate normals.
- Do not label a Rainfall Total comparison as a Rainfall Anomaly.
- Do not add LST to the derived-metric system before its full historical
  backfill (2001–2025) is complete.
