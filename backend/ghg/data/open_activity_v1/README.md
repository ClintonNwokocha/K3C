# Open activity data, v1 (`tier1_open_v1`)

National statistics for Nigeria, plus each Kaduna LGA's share of the national total. `load_open_activity_data` multiplies the two to give LGA activity data for 2018–2025.

## `nigeria_national.csv`
FAOSTAT bulk downloads (`bulks-faostat.fao.org/production/`), Nigeria, 2018–2024:

| key | FAOSTAT item / element |
|---|---|
| cattle, sheep, goats, swine, camels, horses, asses, chickens | Production_Crops_Livestock: Stocks (chickens converted from 1000 head) |
| dairy_cattle | Raw milk of cattle: Milk Animals |
| rice_area_ha | Rice: Area harvested |
| synthetic_n_t | Inputs_FertilizersNutrient: Nutrient nitrogen N (total), Agricultural Use |
| woodfuel_m3, charcoal_t | Forestry: Wood fuel, Charcoal, Production |

2025 reuses 2024 values, flagged `carried_forward` in the activity metadata.

## `lga_shares.csv`
Each LGA's share of the Nigeria total, built by `build_lga_shares.py` with the Nigeria boundary from geoBoundaries ADM0:

| layer | source |
|---|---|
| cattle, goats, sheep, swine, chickens, horses | FAO Gridded Livestock of the World 3, 2010, dasymetric (Harvard Dataverse) |
| rice, maize, sorghum, millet, all_crops | GAEZ+ 2015 harvested area (Harvard Dataverse `doi:10.7910/DVN/KAGRFI`) |

Dairy cattle, camels and asses use the cattle share. Synthetic nitrogen uses `all_crops`. Wood fuel and charcoal are allocated by the GHSL population share (`sync_inventory_activity --layers population`), not from this file.

## Limits
The livestock and crop maps are fixed in time (2010 and 2015), so year-to-year change at LGA level only follows the national totals. All allocated values are `confidence=low`.
