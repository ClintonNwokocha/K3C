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

The IEA balance has no product split, so the loader splits two of the flows by LGA:
- **Road: gasoline and diesel.** Each road class group carries a diesel share of fuel energy (`ROAD_DIESEL_BY_CLASS`: trunk 40%, primary 25%, secondary 15%, tertiary 10%, minor 5%). These shares are scaled so Nigeria's own traffic mix gives `ROAD_DIESEL_SHARE_NATIONAL` (15%). Each LGA's diesel share then follows its OSM class mix, and Kaduna comes out at about 18% because of the Abuja–Kaduna–Kano trunk corridor.
- **Residential: LPG and kerosene.** The national LPG share (`RESIDENTIAL_LPG_SHARE_NATIONAL`, 60%) is multiplied by the mean of the LGA's relative HDI and RWI (`wealth_shares.csv`), then clamped to 5–95%.

All industry oil is treated as gas/diesel oil. The national shares and class profile are on the VERIFY list.

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
| road_vkm.trunk / primary / secondary / tertiary / minor | The same weighted length for each road class group; it sets each LGA's diesel share. Kaduna holds 9.2% of Nigeria's trunk traffic. |
| industrial_area | `landuse=industrial`, excluding refinery, power plant and depot polygons (those belong to 1.A.1), as a share of Nigeria. Only used to place industry oil *within* Kaduna. Kaduna's share of national industry oil comes from GHSL population, because industrial land is too patchily mapped nationally (12k ha in all of Nigeria). |

The 2019 extract has no fuel stations in Kaduna and about 16k buildings, which is too sparse to use as a proxy.

## `wealth_shares.csv`
Built by `build_wealth_shares.py`. Each LGA's development relative to Nigeria, where 1.0 is the national average:

| layer | source |
|---|---|
| hdi | Global High Resolution HDI v2 (Sherman et al., MOSAIKS and night lights, 0.1°), centred on Global Data Lab 2019 subnational HDI. LGA mean ÷ Nigeria mean. |
| rwi | Meta Relative Wealth Index, 1 km. Mean national percentile of the LGA's cells ÷ 0.5. |

Means are over settled cells only and are not population weighted.

## Power plants
Open Infrastructure Map (`openinframap.org/stats/area/Nigeria/plants`) lists one fossil plant in Kaduna: Kudenda, 215 MW oil/gas (OSM way 485733022). The Federal Ministry of Power reported it about 80% complete in January 2022, so 1.A.1.a is reported as NO.

## Limits
The livestock and crop maps are fixed in time (2010 and 2015), so year-to-year change at LGA level only follows the national totals. All allocated values are `confidence=low`.
