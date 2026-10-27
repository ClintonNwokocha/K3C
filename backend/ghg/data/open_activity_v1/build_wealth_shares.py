"""Kaduna LGA development indices relative to Nigeria, used to split residential oil into LPG and kerosene.

Usage: python -I build_wealth_shares.py <hdi.tif> <rwi_1km.tif> <nga_adm0.geojson> <kaduna_lga.geojson> <out.csv>

Layers written (share = LGA value relative to the Nigeria value, 1.0 = national average):
  hdi  Global high-resolution HDI v2 (Sherman et al., MOSAIKS + night lights, 0.1 deg,
       centred on Global Data Lab 2019 subnational HDI).  share = LGA mean / Nigeria mean.
  rwi  Meta Relative Wealth Index, 1 km.  Each cell is ranked against every Nigerian
       cell; share = LGA mean percentile / 0.5.
Means are over cells with estimates (settled areas); they are not population weighted.
"""
import csv
import json
import sys

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds
from shapely.geometry import shape

HDI, RWI = sys.argv[1], sys.argv[2]
NGA = json.load(open(sys.argv[3], encoding="utf-8"))["features"][0]["geometry"]
LGAS = json.load(open(sys.argv[4], encoding="utf-8"))["features"]
OUT = sys.argv[5]
SUPER = 10  # split 0.1 deg HDI cells across LGA boundaries


def read(path, geom, supersample=1):
    with rasterio.open(path) as src:
        win = from_bounds(*shape(geom).bounds, transform=src.transform).round_offsets().round_lengths()
        arr = src.read(1, window=win, boundless=True, fill_value=np.nan).astype("float64")
        if src.nodata is not None:
            arr[arr == src.nodata] = np.nan
        t = src.window_transform(win)
    if supersample > 1:
        arr = np.repeat(np.repeat(arr, supersample, axis=0), supersample, axis=1)
        t = rasterio.Affine(t.a / supersample, t.b, t.c, t.d, t.e / supersample, t.f)
    return arr, t


def masked(arr, transform, geom):
    inside = geometry_mask([geom], arr.shape, transform, invert=True)
    values = arr[inside]
    return values[np.isfinite(values)]


rows = []

hdi_nat = float(masked(*read(HDI, NGA), NGA).mean())
for f in LGAS:
    v = masked(*read(HDI, f["geometry"], SUPER), f["geometry"])
    lga = float(v.mean())
    rows.append({"layer": "hdi", "lgacode": f["properties"]["lgacode"], "lganame": f["properties"]["lganame"],
                 "lga_value": round(lga, 4), "nigeria_value": round(hdi_nat, 4), "share": lga / hdi_nat})

nat_cells = np.sort(masked(*read(RWI, NGA), NGA))
for f in LGAS:
    v = masked(*read(RWI, f["geometry"]), f["geometry"])
    pct = float((np.searchsorted(nat_cells, v, side="right") / len(nat_cells)).mean())
    rows.append({"layer": "rwi", "lgacode": f["properties"]["lgacode"], "lganame": f["properties"]["lganame"],
                 "lga_value": round(float(v.mean()), 4), "nigeria_value": round(float(nat_cells.mean()), 4),
                 "share": pct / 0.5})

for layer in ("hdi", "rwi"):
    print(layer)
    for r in sorted((r for r in rows if r["layer"] == layer), key=lambda r: -r["share"]):
        print(f"  {r['lganame']:16s} value {r['lga_value']:7.3f}  relative {r['share']:.2f}")

with open(OUT, "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
print("wrote", OUT, len(rows))
