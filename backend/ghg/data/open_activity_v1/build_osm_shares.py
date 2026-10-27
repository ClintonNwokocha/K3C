"""Kaduna LGA shares of Nigeria totals from the Geofabrik OpenStreetMap extract (2019-06-04).

Usage: python -I build_osm_shares.py <osm_shp_dir> <nga_adm0.geojson> <kaduna_lga.geojson> <out.csv>

Layers written:
  roads_weighted   road length x traffic weight (ROAD_WEIGHTS), share of Nigeria
  industrial_area  OSM landuse=industrial area, excluding energy facilities
                   (refinery, power plants, depots: those are 1.A.1), share of Nigeria
Cross-checks printed (not written): unweighted major- and minor-road length.
The 2019 extract has no fuel stations in Kaduna and ~16k buildings, too sparse to use.

Lines are cut at LGA boundaries; Nigeria totals use every feature whose
representative point falls inside the national boundary.
"""
import csv
import json
import sys
from pathlib import Path

import geopandas as gpd
from shapely.geometry import shape

OSM = Path(sys.argv[1])
NGA = shape(json.load(open(sys.argv[2], encoding="utf-8"))["features"][0]["geometry"])
LGAS = gpd.read_file(sys.argv[3])[["lgacode", "lganame", "geometry"]].to_crs(4326)
OUT = Path(sys.argv[4])
METRIC = 32632  # UTM 32N covers most of Nigeria; length error < 1% at the edges

# Relative vehicle-km per km of road.  Residential and unclassified roads carry
# little traffic and are mapped far more completely in the north (polio and
# eHealth campaigns), so they get a small weight.
ROAD_WEIGHTS = {
    "motorway": 10, "motorway_link": 10,
    "trunk": 8, "trunk_link": 8,
    "primary": 5, "primary_link": 5,
    "secondary": 3, "secondary_link": 3,
    "tertiary": 2, "tertiary_link": 2,
    "unclassified": 0.25, "residential": 0.25, "living_street": 0.25,
}
MAJOR = {k for k, w in ROAD_WEIGHTS.items() if w >= 2}
ENERGY_FACILITY = r"(?i)refiner|power|substation|depot|tank farm|petroleum"


def read(name, columns, bbox=None):
    return gpd.read_file(OSM / f"{name}.shp", columns=columns, bbox=bbox, engine="pyogrio")


def per_lga(gdf, measure):
    """Sum 'length' or 'area' (x weight) of gdf features cut by LGA."""
    cut = gpd.overlay(gdf, LGAS, how="intersection", keep_geom_type=True).to_crs(METRIC)
    size = cut.geometry.length if measure == "length" else cut.geometry.area
    return (size * cut.get("weight", 1)).groupby(cut["lgacode"]).sum()


def national(gdf, measure):
    gdf = gdf[gdf.geometry.representative_point().within(NGA)]
    m = gdf.to_crs(METRIC)
    size = m.geometry.length if measure == "length" else m.geometry.area
    return float((size * gdf.get("weight", 1)).sum())


def share_rows(layer, lga_values, nat):
    rows = []
    for _, lga in LGAS.iterrows():
        v = float(lga_values.get(lga.lgacode, 0.0))
        rows.append({"layer": layer, "lgacode": lga.lgacode, "lganame": lga.lganame,
                     "lga_value": round(v, 4), "nigeria_value": round(nat, 4),
                     "share": v / nat if nat else 0})
    print(f"{layer:18s} Kaduna share of Nigeria = {sum(r['share'] for r in rows):.4f}")
    return rows


kaduna_bbox = tuple(LGAS.total_bounds)
rows = []

roads = read("gis_osm_roads_free_1", ["fclass"])
roads = roads[roads.fclass.isin(ROAD_WEIGHTS)].copy()
roads["weight"] = roads.fclass.map(ROAD_WEIGHTS).astype(float)
kroads = roads.cx[kaduna_bbox[0]:kaduna_bbox[2], kaduna_bbox[1]:kaduna_bbox[3]]
rows += share_rows("roads_weighted", per_lga(kroads, "length"), national(roads, "length"))

major = roads[roads.fclass.isin(MAJOR)].assign(weight=1.0)
kmajor = major.cx[kaduna_bbox[0]:kaduna_bbox[2], kaduna_bbox[1]:kaduna_bbox[3]]
share_rows("check:major_km", per_lga(kmajor, "length"), national(major, "length"))
minor = roads[~roads.fclass.isin(MAJOR)].assign(weight=1.0)
kminor = minor.cx[kaduna_bbox[0]:kaduna_bbox[2], kaduna_bbox[1]:kaduna_bbox[3]]
share_rows("check:minor_km", per_lga(kminor, "length"), national(minor, "length"))
del roads, major, minor

landuse = read("gis_osm_landuse_a_free_1", ["fclass", "name"])
industrial = landuse[(landuse.fclass == "industrial")
                     & ~landuse.name.fillna("").str.contains(ENERGY_FACILITY)][["geometry"]]
kind = industrial.cx[kaduna_bbox[0]:kaduna_bbox[2], kaduna_bbox[1]:kaduna_bbox[3]]
rows += share_rows("industrial_area", per_lga(kind, "area"), national(industrial, "area"))

with open(OUT, "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
print("wrote", OUT, len(rows))
