"""Kaduna LGA shares of Nigeria totals from GLW3 (2010) livestock and GAEZ+ (2015) harvested-area rasters.

Usage: python -I lga_shares.py <raw_dir> <kaduna_lga.geojson> <out.csv>

Coarse (5 arc-minute) pixels are split across LGA boundaries by supersampling 10x,
so small urban LGAs still receive a fractional share.
"""
import csv
import json
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds
from shapely.geometry import shape

RAW = Path(sys.argv[1])
LGAS = json.load(open(sys.argv[2], encoding="utf-8"))["features"]
OUT = Path(sys.argv[3])
NGA = shape(json.load(open(RAW / "nga_adm0.geojson", encoding="utf-8"))["features"][0]["geometry"])

LAYERS = {
    "cattle": "GLW3_Ct_2010_Da.tif",
    "goats": "GLW3_Gt_2010_Da.tif",
    "sheep": "GLW3_Sh_2010_Da.tif",
    "swine": "GLW3_Pg_2010_Da.tif",
    "chickens": "GLW3_Ch_2010_Da.tif",
    "horses": "GLW3_Ho_2010_Da.tif",
    "rice": "GAEZAct2015_HarvArea_Rice_Total.tif",
    "maize": "GAEZAct2015_HarvArea_Maize_Total.tif",
    "sorghum": "GAEZAct2015_HarvArea_Sorghum_Total.tif",
    "millet": "GAEZAct2015_HarvArea_Millet_Total.tif",
}
ALL_CROPS = sorted(p.name for p in RAW.glob("GAEZAct2015_HarvArea_*_Total.tif"))
SUPER = 10


def clean(arr, nodata):
    arr = arr.astype("float64")
    if nodata is not None:
        arr[arr == nodata] = 0
    arr[~np.isfinite(arr)] = 0
    arr[arr < 0] = 0
    return arr


def national_total(src):
    win = from_bounds(*NGA.bounds, transform=src.transform).round_offsets().round_lengths()
    arr = clean(src.read(1, window=win, boundless=True, fill_value=0), src.nodata)
    mask = geometry_mask([NGA.__geo_interface__], arr.shape, src.window_transform(win), invert=True)
    return float(arr[mask].sum())


def lga_totals(src):
    minx = min(shape(f["geometry"]).bounds[0] for f in LGAS) - 0.2
    miny = min(shape(f["geometry"]).bounds[1] for f in LGAS) - 0.2
    maxx = max(shape(f["geometry"]).bounds[2] for f in LGAS) + 0.2
    maxy = max(shape(f["geometry"]).bounds[3] for f in LGAS) + 0.2
    win = from_bounds(minx, miny, maxx, maxy, transform=src.transform).round_offsets().round_lengths()
    arr = clean(src.read(1, window=win, boundless=True, fill_value=0), src.nodata)
    fine = np.repeat(np.repeat(arr, SUPER, axis=0), SUPER, axis=1) / (SUPER * SUPER)
    t = src.window_transform(win)
    fine_t = rasterio.Affine(t.a / SUPER, t.b, t.c, t.d, t.e / SUPER, t.f)
    out = {}
    for f in LGAS:
        m = geometry_mask([f["geometry"]], fine.shape, fine_t, invert=True)
        out[f["properties"]["lgacode"]] = float(fine[m].sum())
    return out


rows = []
for key, fname in list(LAYERS.items()) + [("all_crops", None)]:
    files = ALL_CROPS if fname is None else [fname]
    nat = 0.0
    per_lga = {f["properties"]["lgacode"]: 0.0 for f in LGAS}
    for fn in files:
        with rasterio.open(RAW / fn) as src:
            nat += national_total(src)
            for code, v in lga_totals(src).items():
                per_lga[code] += v
    for f in LGAS:
        code = f["properties"]["lgacode"]
        rows.append({
            "layer": key,
            "lgacode": code,
            "lganame": f["properties"]["lganame"],
            "lga_value": round(per_lga[code], 4),
            "nigeria_value": round(nat, 4),
            "share": per_lga[code] / nat if nat else 0,
        })
    print(f"{key:10s} Kaduna share of Nigeria = {sum(per_lga.values()) / nat:.4f}")

with open(OUT, "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
print("wrote", OUT, len(rows))
