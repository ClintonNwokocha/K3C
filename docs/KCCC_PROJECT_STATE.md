# KCCC Project State

Snapshot date: 2026-06-30

## Current Architecture

- Google Earth Engine
- Django/PostGIS
- Django REST API
- React public Climate Atlas

The required data flow remains:

Google Earth Engine -> Django/PostGIS -> Django REST API -> React

React must not call GEE directly.

## Public Routes

- `/public`
- `/public/climate-risk`
- `/public/climate-atlas`

## Public Navigation

- Home
- Climate Intelligence
- GHG Inventory
- Projects
- Reports
- Staff Login

## Atlas-Visible Layer Subset

- `rainfall`
- `ndvi`
- `ndvi_landsat`
- `lst`
- `rainfall_anomaly`
- `drought_index`

## Layer Data Ranges

Not every Atlas layer has the same start year. The approved coverage boundaries are:

| Layer | Source | Start year | Notes |
|---|---|---|---|
| rainfall | CHIRPS v2.0 Daily | 1981 (annual/wet), 1982 (dry) | Full annual coverage from 1981 |
| rainfall_anomaly | Derived from CHIRPS | 1981 (annual/wet), 1982 (dry) | 1991-2020 baseline |
| drought_index (SPI) | Derived from CHIRPS | 1981 (annual/wet), 1982 (dry) | 1991-2020 gamma baseline |
| ndvi | Sentinel-2 (unified) | 2018 | Landsat before 2018 via ndvi_landsat |
| ndvi_landsat | Landsat C2 L2 | 1985 | LT05/LE07/LC08, ends 2017 |
| lst | MODIS Terra MOD11A1 | 2001 | First complete seasonal year |
| lulc (Phase 1) | Dynamic World v1 | 2018 | Annual LULC snapshots only |

### Land Use / Land Cover — Phase Direction

**Phase 1 (current, in progress):** Annual Land Use / Land Cover snapshots.
- Provider: Dynamic World v1 (`GOOGLE/DYNAMICWORLD/V1`)
- Available years: 2018–present
- **Official method (adopted 2026-06-30):** `late_wet_season` composite, Sep 1–Oct 31
- Peak months: September + October
- method_version: `dw_latewet_mode_v1`
- No change analysis in Phase 1 public release
- Data is experimental and unpublished (`is_public=False`, `is_validated=False`)

Sep–Oct pilot rationale: The May–Oct `wet_season` window produced 5/5 low-quality snapshots
for all Kaduna LGAs in 2024 (0–1 Jul+Aug scenes) due to a systematic monsoon cloud gap.
The `late_wet_season` window (Sep–Oct) yields 4/5 high + 1/5 medium quality for 2024,
eliminates bare-ground cloud artefacts (Soba 10.3% → 0%, Zaria 11.7% → 0.3%),
and preserves dominant-class identity across all pilot LGAs.
Vegetation is at or near full canopy closure in Sep–Oct in Kaduna's Guinea Savanna zone.

**Phase 2 (future, not approved):** Historical Landsat LULC classification.
- Approximate coverage: 1984-2017
- Requires a separate Landsat-derived supervised or unsupervised classification workflow
- Not compatible with Dynamic World — different resolution, sensor, and classification scheme
- Do not attempt 1981 LULC with Dynamic World or any 10 m sensor

**1981 LULC is not supported** at Dynamic World or Sentinel-2 resolution. Historical LULC before 2018 requires a separate Landsat classification workflow (Phase 2).

## Scientific Wording

- Rainfall Total is CHIRPS accumulated rainfall.
- Rainfall Anomaly is percentage departure from the 1991-2020 local LGA baseline.
- SPI is precipitation-only meteorological drought/wetness, not agricultural, hydrological, groundwater, soil-moisture, or crop-stress drought.
- LST is land surface temperature, not air temperature. MODIS data begins 2001.
- Unified NDVI uses Landsat before 2018 and Sentinel-2 from 2018 onward.
- Annual Land Use / Land Cover uses Dynamic World v1 and is available from 2018 only.
- Historical LULC from 1984 requires a separate Landsat classification workflow (Phase 2).

## Current Release-State Table

| Layer | Active | Public | In `/api/layers/` | Atlas visible | Notes |
|---|---:|---:|---:|---:|---|
| rainfall | yes | yes | yes | yes | CHIRPS accumulated rainfall |
| ndvi | yes | yes | yes | yes | Unified UI routes by year |
| ndvi_landsat | yes | yes | yes | yes | Historical NDVI backfill |
| lst | yes | yes | yes | yes | Land surface temperature, not air temperature |
| rainfall_anomaly | yes | yes | yes | yes | Percentage departure from 1991-2020 baseline |
| drought_index | yes | yes | yes | yes | Precipitation-only SPI |
| lulc | no | no | no | no | Phase 1 experimental — unpublished |

## Known Release Risks

- The public remote-sensing catalog is broader than the Atlas selector.
- Atlas popup and legend copy are still key-based and partially hardcoded.
- Future catalog changes must not automatically expose unsupported layers.
- No public ranking or unsupported high-risk claims should be introduced.
- lulc data is experimental (`is_public=False`, `is_validated=False`) and must not be exposed until Phase 1 release is explicitly approved.

## Next Approved Work Sequence

1. Final visual review of SPI.
2. Confirm Rainfall Anomaly and SPI wording, legends, and popups.
3. Phase 1 LULC: `late_wet_season` adopted as official method (2026-06-30). ✓
   - Sep–Oct pilot confirmed: 4/5 high quality for 2024, wet_season cloud artefacts eliminated.
   - Next: visual QA of the 2024 full-23-LGA validation dataset (`lulc_dw_latewet_2024_23lga_validation`).
   - After QA passes: run full 2018–2024 backfill (7 years × 23 LGAs = 161 tasks).
   - Check GEE noncommercial quota before scheduling full backfill.
4. Phase 1 LULC public release only after explicit approval following full sync validation.
5. Phase 2 LULC (historical Landsat ~1984-2017) is separate future work — do not plan until Phase 1 is released.
6. Later: Flood Hazard, validation, reports, and automation.
