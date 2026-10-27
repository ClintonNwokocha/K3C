"""Kaduna LGA shares of Nigeria totals from the Geofabrik OpenStreetMap extract (2019-06-04).

Usage: python -I build_osm_shares.py <osm_shp_dir> <nga_adm0.geojson> <kaduna_lga.geojson> <out.csv>

Layers written:
  roads_weighted   road length x traffic weight (ROAD_WEIGHTS), share of Nigeria
  road_vkm.<group> the same weighted length for one road class group (ROAD_GROUPS);
                   the loader uses the class mix to set each LGA's diesel share
  industrial_area  OSM landuse=industrial area, excluding energy facilities
                   (refinery, power plants, depots: those are 1.A.1), share of Nigeria
  rail_km.<line>   railway=rail track length for each line in RAIL_LINES (traced as the
                   shortest path between its stations), the rest as rail_km.other;
                   share of Nigeria's track.  The loader turns km into train-km
Cross-checks printed (not written): unweighted major- and minor-road length.
The 2019 extract has no fuel stations in Kaduna and ~16k buildings, too sparse to use.

Lines are cut at LGA boundaries; Nigeria totals use every feature whose
representative point falls inside the national boundary.
"""
import csv
import heapq
import json
import sys
from collections import defaultdict
from pathlib import Path

import geopandas as gpd
from shapely.geometry import shape
from shapely.ops import unary_union

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
ROAD_GROUPS = {
    "trunk": {"motorway", "motorway_link", "trunk", "trunk_link"},
    "primary": {"primary", "primary_link"},
    "secondary": {"secondary", "secondary_link"},
    "tertiary": {"tertiary", "tertiary_link"},
    "minor": {"unclassified", "residential", "living_street"},
}
ENERGY_FACILITY = r"(?i)refiner|power|substation|depot|tank farm|petroleum"
# Lines with regular traffic through Kaduna, as (lat, lon) stations in order.
RAIL_LINES = {
    "abuja_kaduna_sgr": [(9.050, 7.337), (10.544, 7.354)],               # Idu - Rigasa
    "lagos_kano_narrow": [(9.612, 6.547), (10.490, 7.417),               # Minna - Kaduna Junction
                          (11.108, 7.723), (12.000, 8.520)],              # - Zaria - Kano
}


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
for group, classes in ROAD_GROUPS.items():
    rows += share_rows(f"road_vkm.{group}", per_lga(kroads[kroads.fclass.isin(classes)], "length"),
                       national(roads[roads.fclass.isin(classes)], "length"))

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


def trace(pieces, stations):
    """Indices of the noded pieces on the shortest path through stations in order."""
    lengths = pieces.to_crs(METRIC).length.to_numpy()
    graph = defaultdict(list)
    for i, line in enumerate(pieces.geometry):
        a, b = line.coords[0], line.coords[-1]
        graph[a].append((b, i))
        graph[b].append((a, i))
    nodes = list(graph)

    def nearest(lat, lon):
        return min(nodes, key=lambda n: (n[0] - lon) ** 2 + (n[1] - lat) ** 2)

    used = set()
    stops = [nearest(*s) for s in stations]
    for start, end in zip(stops, stops[1:]):
        best, prev, queue = {start: 0.0}, {}, [(0.0, start)]
        while queue:
            d, node = heapq.heappop(queue)
            if node == end:
                break
            if d > best[node]:
                continue
            for nxt, i in graph[node]:
                if d + lengths[i] < best.get(nxt, float("inf")):
                    best[nxt], prev[nxt] = d + lengths[i], (node, i)
                    heapq.heappush(queue, (best[nxt], nxt))
        node = end
        while node != start:
            node, i = prev[node]
            used.add(i)
    return used


# Mainline track only; light rail, tram and monorail are in Lagos and Abuja.
rail = read("gis_osm_railways_free_1", ["fclass"])
rail = rail[rail.fclass == "rail"]
pieces = gpd.GeoDataFrame(geometry=list(unary_union(list(rail.geometry)).geoms), crs=rail.crs)
pieces["line"] = "other"
for line, stations in RAIL_LINES.items():
    pieces.loc[sorted(trace(pieces, stations)), "line"] = line
nat_rail = national(pieces, "length")
kpieces = pieces.cx[kaduna_bbox[0]:kaduna_bbox[2], kaduna_bbox[1]:kaduna_bbox[3]]
for line in [*RAIL_LINES, "other"]:
    rows += share_rows(f"rail_km.{line}", per_lga(kpieces[kpieces.line == line][["geometry"]], "length"), nat_rail)

with open(OUT, "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
print("wrote", OUT, len(rows))
