# Climate Hazard Assessment and Risk Tracking: hazard method

Four climate hazards are assessed for each of Kaduna's 23 LGAs, every year from 1981 to 2025. Each LGA is compared with its own 1991–2020 normal.

| Hazard | Indicators | Seasons | Data |
|---|---|---|---|
| Extreme heat | Hot days (above the LGA's 90th percentile of daily maximum); heatwave days (3+ hot days in a row); days at or above 40 °C; hottest day | Annual; hot season (Mar–May) | ERA5-Land daily maximum air temperature (~9 km) |
| Flood | Wettest day; wettest 5 days; very wet days (above the LGA's 95th percentile of wet days) | Annual; wet season (May–Oct) | CHIRPS v2.0 daily rainfall (~5.5 km) |
| Drought | Standardized Precipitation Index (gamma fit, 1991–2020) | Annual; wet; dry (Nov–Mar) | CHIRPS v2.0 rainfall totals |
| Erratic rainfall | Onset date; end date; season length; longest dry spell; dry spells of 10+ days | Rainy season | CHIRPS v2.0 daily rainfall |

## Scoring

1. Each indicator: `z = (value − LGA 1991–2020 mean) / standard deviation`, signed so that positive is the hazardous direction (a later onset, an earlier end, more hot days). Spreads have small floors so that a single extra day of a rare event is not reported as extreme.
2. Each hazard: the mean of its indicator z's (the composite) is standardized against the LGA's own 1991–2020 composites. Drought uses −SPI directly. The indicator with the largest z is reported as the driver.
3. Class: z ≥ 1 Moderate, ≥ 1.5 Severe, ≥ 2 Extreme (the SPI convention). In 1991–2020, 14–16% of LGA-years are Moderate or worse, as expected.
4. Score (0–100): the normal percentile of z. 50 is typical; 84, 93 and 98 are the class thresholds.

Rainy season (AGRHYMET style): onset is the first day from 1 April with at least 20 mm in 3 days and no dry spell over 7 days in the following 30. The end is the last rain day from 1 September that is followed by 20 dry days. No onset by 31 July is a failed season, classed Extreme.

## Risk profile (`compute_climate_risk_profiles`)

- **Hazard scores:** the mean hazard score over the last 10 years (heat annual, flood annual, drought wet season, erratic rainfall wet season).
- **Exposure:** GHSL population, as a percentile rank within Kaduna.
- **Vulnerability:** 100 minus the percentile rank of the Meta Relative Wealth Index.
- **Adaptive capacity:** the percentile rank of the high-resolution HDI.
- **Overall score:** flood 20%, drought 15%, heat 15%, erratic rainfall 10%, exposure 20%, vulnerability 15%, adaptive-capacity gap 5%.
- **Erosion:** kept for manually supplied evidence only. It is not part of the overall score.

These scores replace the development seed values.

## Urgent Climate Action Signal

Hazard evidence is the four hazard classes: Moderate counts as adverse, and Severe or Extreme as severe. Vegetation (NDVI) is stress evidence only. The decision rules are unchanged:
- **Urgent:** a High or Very High risk level, a strong hazard signal, and exposure or vulnerability evidence.
- **Elevated:** a High or Very High risk level with at least one adverse hazard.
- **Monitor:** any adverse hazard or vegetation stress.

## Limitations

- LGA-average rainfall smooths local cloudbursts, so the flood indicators understate local extremes. The flood hazard is about rainfall triggers, not mapped flood extent.
- The drought hazard is rainfall only: it does not cover soil moisture, crops or groundwater.
- ERA5-Land is a reanalysis, not station data. Urban heat islands are not resolved.
- A warming trend since 1991–2020 raises recent heat classes. That is the intended signal, but it is not a forecast.
- Hazard classes are relative to each LGA's own normal. Risk scores compare LGAs only within Kaduna.

## Commands

```
python manage.py sync_daily_climate --years 1981-2025      # Earth Engine, about 30 minutes
python manage.py build_climate_hazards --years 1981-2025   # no Earth Engine
python manage.py compute_climate_risk_profiles --year 2025
```
