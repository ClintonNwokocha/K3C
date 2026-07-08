# LULC QA Report — Google Dynamic World V1, Kaduna State 2018–2025

**Status:** Internal QA complete — pending validation approval  
**Public exposure:** None (`is_public=False`, `is_validated=False` on all records)  
**QA date:** 2026-07-08

---

## 1. Dataset Summary

| Field | Value |
|---|---|
| Source | Google Dynamic World V1 |
| GEE collection | `GOOGLE/DYNAMICWORLD/V1` |
| Method | Late wet-season annual composite |
| Composite window | Sep 1 – Oct 31 (peak months: Sep + Oct) |
| Composite band | Mode of Dynamic World `label` band |
| Resolution | 10 m (native Sentinel-2 / Dynamic World) |
| Coverage | Kaduna State, 23 LGAs |
| Years | 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025 (8 years) |
| Admin level | LGA |
| Method version | `dw_latewet_mode_v1` |
| Django model | `LandCoverDataset` + `LandCoverSnapshot` |
| Total datasets | 8 (`late_wet_season`, one per year) |
| Total snapshots | 184 (23 LGAs × 8 years) |

---

## 2. Source

**Google Dynamic World V1** is a near-real-time 10 m land use / land cover product produced by Google and the World Resources Institute, derived from Sentinel-2 Surface Reflectance imagery using a deep neural network. It classifies each Sentinel-2 image pixel into one of 9 classes.

- GEE collection: `GOOGLE/DYNAMICWORLD/V1`
- Sentinel-2 first image: 2015-06-27
- Available for Kaduna State: 2015 onward (codebase currently validated for 2018–2025)
- Cloud masking: applied at pixel level by the Dynamic World algorithm; no scene-level pre-filter is applied

---

## 3. Method

### Composite approach

For each (LGA, year), a single GEE computation is issued:

1. Filter `GOOGLE/DYNAMICWORLD/V1` to the composite window (`YYYY-09-01` to `YYYY-11-01`, exclusive end)
2. Select the `label` band
3. Compute the per-pixel **mode** across all scenes in the window
4. Apply `unmask(-1)` to separate masked (cloud) pixels from classified pixels
5. Reduce over the LGA polygon using `frequencyHistogram`
6. A single `getInfo()` round-trip returns the histogram, scene count, and per-scene timestamps

### Quality assessment

Peak-season scene count is computed from scene timestamps for Sep and Oct specifically:

| Quality flag | Peak scene count | Interpretation |
|---|---|---|
| `high` | ≥ 5 | Composite well-anchored in peak vegetation period |
| `medium` | 2–4 | Some peak coverage; cross-year comparisons require caution |
| `low` | 0–1 | Negligible peak coverage; class proportions unreliable |

### Stored fields per snapshot

- `class_pct` — percentage per DW class (JSON); validated sum within [99.5, 100.5]
- `class_areas_km2` — km² per class at 10 m resolution (JSON)
- `pixel_count` — total classified (unmasked) pixels
- `masked_pixel_pct` — percentage of pixels excluded by cloud masking
- `metadata` — `quality_flag`, `peak_season_scene_count`, `source_image_count`, `monthly_scene_counts`, `method_version`, `gee_collection`, `composite_method`, `scale_m`

### Why late wet season (Sep–Oct)

The wet-season window (May–Oct) produced systematic low-quality results for Kaduna LGAs due to a persistent Jul–Aug cloud gap over the Guinea Savanna zone. Sep–Oct avoids this gap: vegetation remains at or near full canopy closure, and Sentinel-2 revisit over Kaduna is less impeded by cloud in this sub-window. The switch to `late_wet_season` was adopted as Phase 1 official methodology on 2026-06-30.

---

## 4. Coverage

All 23 Kaduna LGAs are present for all 8 years. Coverage is complete.

| Year | Snapshots | Complete |
|---|---|---|
| 2018 | 23/23 | ✓ |
| 2019 | 23/23 | ✓ |
| 2020 | 23/23 | ✓ |
| 2021 | 23/23 | ✓ |
| 2022 | 23/23 | ✓ |
| 2023 | 23/23 | ✓ |
| 2024 | 23/23 | ✓ |
| 2025 | 23/23 | ✓ |

**LGA codes covered:** 19001–19023 (all 23 Kaduna LGAs as defined in `kaduna_lga.geojson`)

---

## 5. Quality Summary

| Metric | Count |
|---|---|
| Total snapshots | 184 |
| High quality (peak ≥ 5) | 172 |
| Medium quality (peak 2–4) | 12 |
| Low quality (peak 0–1) | 0 |
| Class pct sum errors | 0 |
| Null / empty class_pct | 0 |
| Missing class_areas_km2 | 0 |

No low-quality records exist in the series. The `--min-peak-scenes 3` gate used in batches 1–4 prevented low-quality records from being written; a controlled gap-fill at `--min-peak-scenes 2` was applied to 5 specific LGA-year combinations (see Section 7).

---

## 6. High-Masked Caution Records

Five snapshots have `masked_pixel_pct ≥ 50%`, meaning cloud masking excluded more than half of the pixel area from the composite. These records are structurally valid (class_pct sums to 100%, quality_flag is `high` by scene count) but the classification reflects only the unmasked pixel fraction.

| Year | LGA | masked% | peak scenes | quality |
|---|---|---|---|---|
| 2018 | Sanga | 63.5% | 57 | high |
| 2022 | Giwa | 57.6% | 15 | high |
| 2023 | Jaba | 59.5% | 15 | high |
| 2023 | Kagarko | 75.1% | 7 | high |
| 2025 | Sanga | 57.2% | 27 | high |

**Interpretation note:** The `quality_flag` and `peak_season_scene_count` fields are scene-level metrics and are unaffected by per-pixel masking. A snapshot can have many scenes (high quality) while still having high masked area if persistent cloud systematically obscures the same ground pixels across scenes. Sanga shows this pattern in both 2018 and 2025, suggesting a recurring cloud-persistent location in the Sep–Oct window.

Do not use class percentages for these five LGA-year combinations as primary evidence without acknowledging the masking caveat.

---

## 7. Medium-Quality Records

Twelve snapshots have `quality_flag=medium` (peak Sep+Oct scene count 2–4). Five of these are gap-filled records written at `--min-peak-scenes 2` after the primary batch sync excluded them.

| Year | LGA | peak | total scenes | masked% | dominant class | gap-filled |
|---|---|---|---|---|---|---|
| 2018 | Kaduna North | 3 | 3 | 0.0% | built_area (69.7%) | — |
| 2018 | Kaduna South | 3 | 3 | 0.0% | built_area (80.6%) | — |
| 2019 | Kaduna North | 2 | 2 | 0.0% | built_area (78.2%) | Yes |
| 2019 | Kaduna South | 2 | 2 | 0.0% | built_area (86.6%) | Yes |
| 2020 | Kudan | 4 | 4 | 0.0% | crops (53.3%) | — |
| 2020 | Sabon Gari | 4 | 4 | 0.0% | crops (36.5%) | — |
| 2020 | Zaria | 4 | 4 | 0.0% | crops (38.8%) | — |
| 2022 | Kudan | 2 | 2 | 5.5% | crops (34.5%) | Yes |
| 2022 | Sabon Gari | 2 | 2 | 10.1% | grass (33.0%) | Yes |
| 2022 | Zaria | 2 | 2 | 16.0% | grass (28.1%) | Yes |
| 2024 | Kaduna North | 3 | 3 | 0.0% | built_area (79.3%) | — |
| 2024 | Kaduna South | 3 | 3 | 0.0% | built_area (84.5%) | — |

**Pattern notes:**

- Kaduna North and Kaduna South are small urban polygons. Their low scene counts (2–3) reflect the limited Sentinel-2 footprint over compact urban LGAs, not cloud cover — masked% is 0.0% for all. The `built_area` dominant class is consistent and plausible across all years they appear.
- Kudan, Sabon Gari, and Zaria appear as medium-quality in both 2020 (peak=4, organic) and 2022 (peak=2, gap-filled). Their dominant classes shift between years (crops/grass), which is within expected inter-annual agricultural variability for northern Kaduna.
- No medium-quality snapshot has masked% above 16%.

---

## 8. Public Status

| Check | Status |
|---|---|
| `is_public=True` datasets | 0 of 8 |
| `is_validated=True` datasets | 0 of 8 |
| Snapshots exposed via public API | 0 of 184 |
| Public dashboard exposure | None |

All 8 `LandCoverDataset` records and all 184 `LandCoverSnapshot` records carry `is_public=False` and `is_validated=False`. No LULC data is returned by any public API endpoint.

**Release gate:** Both `is_validated` and `is_public` must be explicitly set to `True` on a per-dataset basis by an authorised administrator before any data is exposed. This must follow a formal validation review; it cannot happen automatically.

---

## 9. Limitations

**Not survey-grade.**  
Dynamic World is a machine-learning classification of Sentinel-2 satellite imagery. It has not been validated against field surveys for Kaduna State. Class assignments reflect spectral signature patterns, not ground-truth verification.

**Sentinel-2 and cloud-mask dependent.**  
Composite quality is a function of Sentinel-2 revisit frequency and cloud conditions during Sep–Oct. Years and LGAs with fewer cloud-free scenes produce composites over a smaller sample of the vegetation period. Medium-quality records (peak scenes 2–4) and high-masked records (>50% pixel masking) are the primary expression of this dependency.

**LGA-level aggregation masks sub-LGA spatial variation.**  
Each snapshot stores a single class distribution for the entire LGA polygon. Spatial patterns within an LGA — forest fragments, wetland corridors, peri-urban fringe — are not resolvable from these records. Sub-LGA analysis requires the raw GEE tile imagery, not the stored summaries.

**Do not infer land-cover change without formal change-detection methodology.**  
The `LandCoverDerivedMetric` model (arithmetic difference between snapshot pairs) has not been computed. Raw comparison of `class_pct` values between years conflates genuine land-cover change with inter-annual variability in cloud conditions, composite timing, and classification uncertainty. Change claims require formal methodology, baseline selection, and uncertainty quantification before use.

**snow_ice class always zero.**  
The Dynamic World `snow_ice` class (code 8) is stored in every snapshot for schema completeness but is never expected to appear in Kaduna State. Its value is 0.0% in all 184 records.

**2016–2017 not yet synced.**  
Dynamic World V1 is available from 2015-06-27, but the 2016–2017 backfill has not been executed. The current series starts at 2018.

---

*Generated from database records. No GEE calls were made during QA. Source: `LandCoverDataset` + `LandCoverSnapshot` models, KCCC backend.*
