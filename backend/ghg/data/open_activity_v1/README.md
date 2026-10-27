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

IEA World Energy Balances (`api.iea.org/stats/?series=BALANCES&countries=NIGERIA`), oil products final consumption in TJ, 2018–2024:

| key | IEA flow |
|---|---|
| transport_oil_tj | Transport (road plus domestic aviation and navigation; the API gives no mode split) |
| residential_oil_tj | Residential (kerosene and LPG) |
| industry_oil_tj | Industry |

The IEA balance has no product split, so `tier1/factors.py` assumes a fuel mix for each flow (ROAD_FUEL_MIX, RESIDENTIAL_OIL_MIX, INDUSTRY_OIL_MIX). Those values are on the VERIFY list.

2025 reuses 2024 values, flagged `carried_forward` in the activity metadata.

## `lga_shares.csv`
Each LGA's share of the Nigeria total, built by `build_lga_shares.py` with the Nigeria boundary from geoBoundaries ADM0:

| layer | source |
|---|---|
| cattle, goats, sheep, swine, chickens, horses | FAO Gridded Livestock of the World 3, 2010, dasymetric (Harvard Dataverse) |
| rice, maize, sorghum, millet, all_crops | GAEZ+ 2015 harvested area (Harvard Dataverse `doi:10.7910/DVN/KAGRFI`) |

Dairy cattle, camels and asses use the cattle share. Synthetic nitrogen uses `all_crops`. Wood fuel and charcoal are allocated by the GHSL population share (`sync_inventory_activity --layers population`), not from this file.

## `osm_shares.csv`
Built by `build_osm_shares.py` from the Geofabrik OpenStreetMap Nigeria extract of 2019-06-04 (ODbL):

| layer | how it is used |
|---|---|
| roads_weighted | Road length × traffic weight (motorway 10, trunk 8, primary 5, secondary 3, tertiary 2, residential and unclassified 0.25), as a share of Nigeria. Allocates IEA transport oil. Kaduna holds 5.35% (unweighted major roads: 5.0%). |
| industrial_area | `landuse=industrial`, excluding refinery, power plant and depot polygons (those belong to 1.A.1), as a share of Nigeria. Only used to place industry oil *within* Kaduna. Kaduna's share of national industry oil comes from GHSL population, because industrial land is too patchily mapped nationally (12k ha in all of Nigeria). |

The 2019 extract has no fuel stations in Kaduna and about 16k buildings, which is too sparse to use as a proxy.

## Limits
The livestock and crop maps are fixed in time (2010 and 2015), so year-to-year change at LGA level only follows the national totals. All allocated values are `confidence=low`.
