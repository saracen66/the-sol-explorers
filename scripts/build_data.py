#!/usr/bin/env python3
"""
Sol Atlas data pipeline
=======================

Pulls real NASA / USGS Mars data from the public USGS Astrogeology S3 bucket
(asc-pds-services) and bakes web-ready textures + heightmaps into public/data/.

Nothing here is hand-painted: every pixel comes from a NASA mission dataset.

  Global (orbit view)
    - Viking MDIM 2.1 colour mosaic (NASA Ames recolour)       -> g_color_*.jpg
    - MGS MOLA 128/64 ppd elevation                            -> g_normal_4k.jpg, g_topo_4k.jpg, g_elev.bin
    - Mars Odyssey THEMIS night-IR controlled mosaic (100 m)   -> g_thermal_4k.jpg
  Region (Isidis / Jezero, 12 x 12 deg decal on the globe)
    - same three sources at full resolution                    -> r_*.jpg
  Crater (Jezero, ~89 x 101 km)
    - Mars 2020 Science Investigation CTX ortho mosaic (5 m)   -> c_visible.jpg
    - Mars 2020 Science Investigation CTX DEM (20 m)           -> c_height.bin, c_normal.png, c_slope.png
    - THEMIS night IR                                          -> c_thermal.jpg
  Site (Marswalk zone around the landing site / Three Forks, 5 x 5 km)
    - Mars 2020 TRN HiRISE ortho mosaic (25 cm)                -> s_visible.jpg
    - Mars 2020 TRN HiRISE DTM (1 m)                           -> s_height.bin, s_normal.png, s_slope.png
    - THEMIS night IR                                          -> s_thermal.jpg

Usage:
    pip install rasterio numpy pillow scipy
    python3 scripts/build_data.py            # everything
    python3 scripts/build_data.py crater     # one stage (global|region|crater|site)
"""

import json
import math
import os
import sys
import time
import urllib.request

import numpy as np
import rasterio
from PIL import Image
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
os.environ.setdefault("GDAL_CACHEMAX", "1024")
os.environ.setdefault("VSI_CACHE", "TRUE")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data")
CACHE = os.path.join(ROOT, ".cache")
S3 = "https://asc-pds-services.s3.us-west-2.amazonaws.com/"
VSI = "/vsicurl/" + S3

R_MARS = 3396190.0  # IAU Mars 2000 sphere (m)

SRC = {
    "color": "wms_basemaps/Mars/MDIM21_AMESColor/MDIM21_AMES_recolor_dd360_jpeg_cog.tif",
    "mola": "wms_basemaps/Mars/MOLA/mola128_mola64_merge_90Nto90S_SimpleC_clon0_cog.tif",
    "themis_night": "wms_basemaps/Mars/THEMIS_USGS/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018_cog.tif",
    "ctx_ortho": "mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXortho_mosaic_5m.tif",
    "ctx_dem": "mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif",
    "hirise_ortho": "mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif",
    "hirise_dtm": "mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif",
}

# Local metric grid used for the crater + site terrain: the same equirectangular
# projection JPL used for the Mars 2020 science maps (true scale at 18.4663 N).
LAT_TS = 18.4663
LOCAL_CRS = CRS.from_proj4(
    f"+proj=eqc +lat_ts={LAT_TS} +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R={R_MARS} +units=m +no_defs"
)
KX = R_MARS * math.cos(math.radians(LAT_TS)) * math.pi / 180.0  # metres per degree lon
KY = R_MARS * math.pi / 180.0  # metres per degree lat

# Jezero crater tile = extent of the JPL CTX DEM
CRATER_BOUNDS = (4328999.999999998, 1042080.0000000028, 4418119.999999998, 1143420.0000000028)
# Marswalk site tile: 5 x 5 km box around Octavia E. Butler Landing + Three Forks depot
SITE_CENTER = (18.4450, 77.4620)  # lat, lon
SITE_SIZE = 5000.0

REGION = dict(lon0=71.5, lon1=83.5, lat0=12.4, lat1=24.4)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def cached(key):
    """Download a (moderately sized) source file once into .cache/."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, os.path.basename(SRC[key]))
    if not os.path.exists(path):
        log("downloading", SRC[key])
        tmp = path + ".part"
        urllib.request.urlretrieve(S3 + SRC[key], tmp)
        os.replace(tmp, path)
    return path


def remote(key):
    return VSI + SRC[key]


# --------------------------------------------------------------------------- colour maps
def lut(stops, n=256):
    """Piecewise-linear colour ramp. stops = [(t, (r,g,b)), ...] with t in 0..1."""
    t = np.linspace(0, 1, n)
    out = np.zeros((n, 3))
    xs = [s[0] for s in stops]
    for c in range(3):
        out[:, c] = np.interp(t, xs, [s[1][c] for s in stops])
    return out.astype(np.float32) / 255.0


# Elevation: single-hue sequential blue (dark = low, light = high)
TOPO = lut([
    (0.00, (13, 54, 107)), (0.20, (24, 79, 149)), (0.40, (42, 120, 214)),
    (0.60, (85, 152, 231)), (0.80, (158, 197, 244)), (1.00, (238, 246, 255)),
])
# THEMIS night IR (thermal-inertia proxy): single-hue sequential orange.
# dark = cools fast at night (dust, fine sand), light = stays warm (rock, coarse grains)
THERMAL = lut([
    (0.00, (58, 26, 6)), (0.22, (122, 53, 16)), (0.45, (192, 90, 28)),
    (0.68, (236, 138, 69)), (0.86, (249, 199, 154)), (1.00, (255, 240, 224)),
])


MARS_TINT = np.array([1.32, 0.93, 0.66], np.float32)
MARS_TINT = MARS_TINT / (MARS_TINT @ np.array([0.299, 0.587, 0.114]))


def equalise(a, mask, bins=4096):
    """Histogram equalisation of the valid pixels (0..1 out)."""
    v = a[mask]
    hist, edges = np.histogram(v, bins=bins)
    cdf = np.cumsum(hist).astype(np.float64)
    cdf /= cdf[-1]
    out = np.interp(a, edges[1:], cdf)
    out[~mask] = 0
    return out


def apply_lut(x, table):
    x = np.clip(x, 0, 1)
    idx = (x * (len(table) - 1)).astype(np.int32)
    return table[idx]


def stretch(a, lo=1, hi=99, mask=None):
    v = a[mask] if mask is not None else a[np.isfinite(a)]
    p0, p1 = np.percentile(v, [lo, hi])
    return np.clip((a - p0) / max(p1 - p0, 1e-6), 0, 1), float(p0), float(p1)


def save_rgb(arr01, name, quality=88):
    img = Image.fromarray((np.clip(arr01, 0, 1) * 255 + 0.5).astype(np.uint8))
    path = os.path.join(OUT, name)
    if name.endswith(".png"):
        img.save(path, optimize=True)
    else:
        img.save(path, quality=quality, subsampling=0 if quality >= 90 else 2, optimize=True, progressive=True)
    log("wrote", name, img.size, f"{os.path.getsize(path) / 1e6:.2f} MB")


def hillshade(h, dx, dy, az=315.0, alt=40.0, z=1.0):
    gy, gx = np.gradient(h * z, dy, dx)  # rows = north->south
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    azr, altr = math.radians(360 - az + 90), math.radians(alt)
    hs = np.sin(altr) * np.cos(slope) + np.cos(altr) * np.sin(slope) * np.cos(azr - aspect)
    return np.clip(hs, 0, 1)


def normal_map(h, dx, dy, exag=1.0):
    """Tangent/object-space normal map for a north-up raster: R=east, G=north, B=up."""
    gy, gx = np.gradient(h * exag, dy, dx)  # gy is d/d(row) = -d/dnorth
    nx, ny, nz = -gx, gy, np.ones_like(h)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.dstack([nx / n, ny / n, nz / n]) * 0.5 + 0.5


def slope_deg(h, dx, dy):
    gy, gx = np.gradient(h, dy, dx)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def fill_nodata(a, mask):
    """Nearest-neighbour fill of masked cells."""
    if not mask.any():
        return a
    idx = ndimage.distance_transform_edt(mask, return_distances=False, return_indices=True)
    return a[tuple(idx)]


def warp_cached(tag, *a, **k):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, tag + ".npy")
    if os.path.exists(p):
        return np.load(p)
    r = warp(*a, **k)
    np.save(p, r)
    return r


def warp(src_path, dst_shape, dst_transform, dst_crs=LOCAL_CRS, resampling=Resampling.average,
         dtype=np.float32, src_nodata=None):
    with rasterio.open(src_path) as src:
        dst = np.full(dst_shape, np.nan, dtype=np.float32)
        reproject(
            source=rasterio.band(src, 1), destination=dst,
            dst_transform=dst_transform, dst_crs=dst_crs,
            src_nodata=src_nodata if src_nodata is not None else src.nodata,
            dst_nodata=np.nan, resampling=resampling, num_threads=4,
            warp_mem_limit=2048,
        )
    return dst.astype(dtype)


def save_heights(h, name):
    """uint16-quantised heightfield + metadata."""
    lo, hi = float(np.nanmin(h)), float(np.nanmax(h))
    q = np.round((h - lo) / (hi - lo) * 65535).astype("<u2")
    q.tofile(os.path.join(OUT, name))
    log("wrote", name, h.shape, f"{lo:.1f}..{hi:.1f} m")
    return dict(file=name, width=int(h.shape[1]), height=int(h.shape[0]), min=lo, max=hi)


def read_manifest():
    p = os.path.join(OUT, "manifest.json")
    return json.load(open(p)) if os.path.exists(p) else {}


def write_manifest(m):
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(m, f, indent=2)


# --------------------------------------------------------------------------- stages
def stage_global(m):
    log("GLOBAL colour")
    with rasterio.open(remote("color")) as d:
        a = d.read(out_shape=(3, 4096, 8192), resampling=Resampling.average)
    a = np.roll(a, 4096, axis=2)  # 0..360E -> -180..180E (prime meridian in the centre)
    col = np.transpose(a, (1, 2, 0)).astype(np.float32) / 255.0
    save_rgb(col, "g_color_8k.jpg", 86)
    save_rgb(np.asarray(Image.fromarray(a.transpose(1, 2, 0)).resize((2048, 1024), Image.LANCZOS)) / 255.0,
             "g_color_2k.jpg", 86)

    log("GLOBAL MOLA")
    with rasterio.open(remote("mola")) as d:
        h = d.read(1, out_shape=(2048, 4096), resampling=Resampling.average, masked=True).filled(0).astype(np.float32)
    lat = np.radians(90 - (np.arange(2048) + 0.5) * 180 / 2048)[:, None]
    dy = R_MARS * math.pi / 2048
    dx = np.maximum(R_MARS * np.cos(lat) * 2 * math.pi / 4096, 1000.0)
    # gradient with per-row dx
    gy, gx = np.gradient(h, dy, axis=0), np.gradient(h, axis=1) / dx
    ex = 18.0
    nx, ny, nz = -gx * ex, gy * ex, np.ones_like(h)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    save_rgb(np.dstack([nx / n, ny / n, nz / n]) * 0.5 + 0.5, "g_normal_4k.jpg", 92)
    t = (h + 8200.0) / (21200.0 + 8200.0)
    t = np.clip(t, 0, 1) ** 0.6  # spend more of the ramp on the lowlands
    hs = np.clip(np.einsum("ijk,k->ij", np.dstack([nx / n, ny / n, nz / n]), np.array([-0.5, 0.5, 0.7])), 0, 1)
    save_rgb(apply_lut(t, TOPO) * (0.55 + 0.6 * hs[..., None]), "g_topo_4k.jpg", 86)
    small = h.reshape(512, 4, 1024, 4).mean(axis=(1, 3)).astype("<i2")
    small.tofile(os.path.join(OUT, "g_elev.bin"))

    log("GLOBAL THEMIS night IR")
    with rasterio.open(remote("themis_night")) as d:
        rows = int(round(4096 * d.height / d.width))
        th = d.read(1, out_shape=(rows, 4096), resampling=Resampling.average, masked=True)
    top = int(round((90 - 65) / 180 * 2048))
    canvas = np.zeros((2048, 4096), np.float32)
    valid = np.zeros((2048, 4096), bool)
    canvas[top:top + rows] = th.filled(0)
    valid[top:top + rows] = ~np.ma.getmaskarray(th)
    lat = 90 - (np.arange(2048) + 0.5) * 180 / 2048
    valid &= (np.abs(lat) < 54)[:, None] & (canvas > 8)
    # THEMIS controlled mosaics are normalised image-by-image, so a global
    # stretch is meaningless; equalise so every region shows its contrast.
    sm = ndimage.gaussian_filter(ndimage.median_filter(canvas, 3), 0.8)
    s, _, _ = stretch(sm, 3, 97, valid)
    s = 1 / (1 + np.exp(-6 * (s - 0.5)))  # gentle S-curve
    rgb = apply_lut(s * 0.9 + 0.05, THERMAL)
    fade = np.clip((54 - np.abs(lat)) / 4.0, 0, 1)[:, None, None]
    rgb = rgb * fade + 0.03 * (1 - fade)
    rgb[~valid] = 0.03
    save_rgb(rgb, "g_thermal_4k.jpg", 86)
    m["global"] = dict(topoRange=[-8200, 21200], elev=dict(file="g_elev.bin", width=1024, height=512))


def geo_grid(lon0, lon1, lat0, lat1, w, h):
    return from_bounds(lon0, lat0, lon1, lat1, w, h)


GEO_CRS = CRS.from_proj4(f"+proj=longlat +R={R_MARS} +no_defs")


def stage_region(m):
    r = REGION
    W = H = 2048
    tr = geo_grid(r["lon0"], r["lon1"], r["lat0"], r["lat1"], W, H)
    log("REGION colour")
    with rasterio.open(remote("color")) as src:
        bands = []
        for b in (1, 2, 3):
            dst = np.zeros((H, W), np.float32)
            reproject(rasterio.band(src, b), dst, dst_transform=tr, dst_crs=GEO_CRS,
                      resampling=Resampling.average, num_threads=4)
            bands.append(dst)
    save_rgb(np.dstack(bands) / 255.0, "r_color.jpg", 88)

    log("REGION MOLA")
    h = warp(remote("mola"), (H, W), tr, GEO_CRS, Resampling.cubic)
    h = fill_nodata(np.nan_to_num(h), np.isnan(h))
    dx = (r["lon1"] - r["lon0"]) / W * KX
    dy = (r["lat1"] - r["lat0"]) / H * KY
    nm = normal_map(ndimage.gaussian_filter(h, 1.0), dx, dy, exag=6.0)
    save_rgb(nm, "r_normal.jpg", 92)
    t = np.clip((h + 8200.0) / (21200.0 + 8200.0), 0, 1) ** 0.6
    hs = hillshade(h, dx, dy, z=4.0)
    save_rgb(apply_lut(t, TOPO) * (0.55 + 0.6 * hs[..., None]), "r_topo.jpg", 88)

    log("REGION THEMIS")
    th = warp(remote("themis_night"), (H, W), tr, GEO_CRS, Resampling.average)
    ok = np.isfinite(th) & (th > 0)
    # Use the same stretch as the global mosaic so the decal blends in
    s, _, _ = stretch(np.nan_to_num(th), 1, 99.5, ok)
    rgb = apply_lut(s, THERMAL)
    save_rgb(rgb, "r_thermal.jpg", 88)
    m["region"] = dict(lon=[r["lon0"], r["lon1"]], lat=[r["lat0"], r["lat1"]])


def colourise(gray01, bounds, shape, sat=1.15, tint=0.45):
    """Tint a greyscale orbital image with the (low-res) Viking/AMES colour of the same ground."""
    x0, y0, x1, y1 = bounds
    ch, cw = max(64, shape[0] // 16), max(64, shape[1] // 16)
    tr = from_bounds(x0, y0, x1, y1, cw, ch)
    with rasterio.open(remote("color")) as src:
        bands = []
        for b in (1, 2, 3):
            dst = np.zeros((ch, cw), np.float32)
            reproject(rasterio.band(src, b), dst, dst_transform=tr, dst_crs=LOCAL_CRS,
                      resampling=Resampling.average, num_threads=4)
            bands.append(ndimage.gaussian_filter(dst, 2.0))
    c = np.dstack(bands) / 255.0
    lum = (c @ np.array([0.299, 0.587, 0.114]))[..., None]
    chroma = c / np.maximum(lum, 1e-3)
    chroma = 1 + (chroma - 1) * sat
    # Viking/AMES colour is slightly magenta in the dark basalt; pull it toward
    # the butterscotch that rover Mastcam-Z images show on the ground.
    chroma = (1 - tint) * chroma + tint * MARS_TINT
    chroma = np.asarray(Image.fromarray(np.clip(chroma * 100, 0, 255).astype(np.uint8)).resize(
        (shape[1], shape[0]), Image.BICUBIC)).astype(np.float32) / 100.0
    return np.clip(gray01[..., None] * chroma, 0, 1)


def terrain_products(prefix, h, dx, dy, mesh_w, bounds, normal_w=2048, slope_w=2048):
    """heights (mesh), normal map, slope map for a north-up metric heightfield."""
    H, W = h.shape
    mesh_h = int(round(mesh_w * H / W))
    hm = np.asarray(Image.fromarray(h.astype(np.float32)).resize((mesh_w, mesh_h), Image.BILINEAR))
    meta = save_heights(hm, f"{prefix}_height.bin")

    nw, nh = normal_w, int(round(normal_w * H / W))
    hn = np.asarray(Image.fromarray(h.astype(np.float32)).resize((nw, nh), Image.BILINEAR))
    ndx, ndy = dx * W / nw, dy * H / nh
    save_rgb(normal_map(hn, ndx, ndy), f"{prefix}_normal.jpg", 92)

    sl = slope_deg(h, dx, dy)
    sw, sh = slope_w, int(round(slope_w * H / W))
    sl = np.asarray(Image.fromarray(sl.astype(np.float32)).resize((sw, sh), Image.BILINEAR))
    Image.fromarray(np.clip(sl * 4, 0, 255).astype(np.uint8)).save(os.path.join(OUT, f"{prefix}_slope.png"), optimize=True)
    log("wrote", f"{prefix}_slope.png", (sw, sh), f"median {np.median(sl):.1f} deg, p99 {np.percentile(sl, 99):.1f} deg")

    x0, y0, x1, y1 = bounds
    meta.update(
        bounds=dict(x0=x0, y0=y0, x1=x1, y1=y1),
        lon=[x0 / KX, x1 / KX], lat=[y0 / KY, y1 / KY],
        sizeM=[x1 - x0, y1 - y0],
    )
    return meta


def stage_crater(m):
    x0, y0, x1, y1 = CRATER_BOUNDS
    log("CRATER DEM")
    with rasterio.open(cached("ctx_dem")) as d:
        h = d.read(1, masked=True)
        mask = np.ma.getmaskarray(h) | (h.filled(0) < -9000)
        h = fill_nodata(h.filled(0).astype(np.float32), mask)
        dx, dy = d.res
    meta = terrain_products("c", h, dx, dy, 1024, CRATER_BOUNDS)

    log("CRATER CTX ortho")
    W = 4096
    H = int(round(W * (y1 - y0) / (x1 - x0)))
    tr = from_bounds(x0, y0, x1, y1, W, H)
    g = warp_cached("crater_ortho", cached("ctx_ortho"), (H, W), tr, resampling=Resampling.average, src_nodata=0)
    ok = np.isfinite(g) & (g > 0)
    g = fill_nodata(np.nan_to_num(g), ~ok)
    s, _, _ = stretch(g, 0.5, 99.7)
    s = s ** 0.9
    rgb = colourise(s, CRATER_BOUNDS, (H, W))
    save_rgb(rgb, "c_visible.jpg", 84)
    save_rgb(np.asarray(Image.fromarray((rgb * 255).astype(np.uint8)).resize((2048, int(2048 * H / W)), Image.LANCZOS)) / 255.0,
             "c_decal.jpg", 86)

    log("CRATER THEMIS")
    tw = int((x1 - x0) / 100)
    th_ = int((y1 - y0) / 100)
    th = warp(remote("themis_night"), (th_, tw), from_bounds(x0, y0, x1, y1, tw, th_), resampling=Resampling.average)
    ok = np.isfinite(th) & (th > 0)
    th = fill_nodata(np.nan_to_num(th), ~ok)
    s, p0, p1 = stretch(th, 1, 99.5)
    save_rgb(apply_lut(s, THERMAL), "c_thermal.jpg", 90)

    meta.update(visible="c_visible.jpg", decal="c_decal.jpg", normal="c_normal.jpg",
                slope="c_slope.png", thermal="c_thermal.jpg", slopeScale=0.25)
    m["crater"] = meta


def site_bounds():
    lat, lon = SITE_CENTER
    cx, cy = lon * KX, lat * KY
    hs = SITE_SIZE / 2
    return (cx - hs, cy - hs, cx + hs, cy + hs)


def stage_site(m):
    b = site_bounds()
    x0, y0, x1, y1 = b
    log("SITE HiRISE DTM", b)
    N = 2048
    tr = from_bounds(x0, y0, x1, y1, N, N)
    t = time.time()
    h = warp_cached("site_dtm", remote("hirise_dtm"), (N, N), tr, resampling=Resampling.average)
    log("  dtm read", f"{time.time() - t:.0f}s", np.nanmin(h), np.nanmax(h), np.isnan(h).mean())
    bad = ~np.isfinite(h) | (h < -9000)
    if bad.any():
        # fall back to CTX DEM where HiRISE has gaps
        with rasterio.open(cached("ctx_dem")) as d:
            ctx = np.full((N, N), np.nan, np.float32)
            reproject(rasterio.band(d, 1), ctx, dst_transform=tr, dst_crs=LOCAL_CRS,
                      resampling=Resampling.cubic, dst_nodata=np.nan)
        h[bad] = ctx[bad]
        h = fill_nodata(np.nan_to_num(h), ~np.isfinite(h))
    d = SITE_SIZE / N
    meta = terrain_products("s", h, d, d, 1024, b)

    log("SITE HiRISE ortho (this is the big one)")
    W = 4096
    tr = from_bounds(x0, y0, x1, y1, W, W)
    t = time.time()
    g = warp_cached("site_ortho", remote("hirise_ortho"), (W, W), tr, resampling=Resampling.average, src_nodata=0)
    log("  ortho read", f"{time.time() - t:.0f}s")
    ok = np.isfinite(g) & (g > 0)
    if (~ok).any():
        ctx = warp(cached("ctx_ortho"), (W, W), tr, resampling=Resampling.bilinear, src_nodata=0)
        # match CTX brightness to HiRISE before filling
        both = ok & np.isfinite(ctx)
        if both.any():
            a = np.polyfit(ctx[both][::97], g[both][::97], 1)
            g[~ok] = np.polyval(a, np.nan_to_num(ctx[~ok]))
        g = fill_nodata(np.nan_to_num(g), ~np.isfinite(g))
    # flatten HiRISE strip-to-strip brightness seams (keep 40% of the large-scale albedo)
    low = ndimage.gaussian_filter(g, 120)
    g = g / np.maximum(low, 1) ** 0.6 * np.mean(low) ** 0.6
    s, _, _ = stretch(g, 0.3, 99.8)
    rgb = colourise(s ** 0.95, b, (W, W), sat=0.8, tint=0.75)
    save_rgb(rgb, "s_visible.jpg", 84)

    log("SITE THEMIS")
    th = warp(remote("themis_night"), (256, 256), from_bounds(x0, y0, x1, y1, 256, 256), resampling=Resampling.bilinear)
    th = fill_nodata(np.nan_to_num(th), ~(np.isfinite(th) & (th > 0)))
    # use the crater-wide stretch so colours mean the same thing at both scales
    craterth = warp(remote("themis_night"), (200, 180), from_bounds(*CRATER_BOUNDS, 180, 200), resampling=Resampling.average)
    ok = np.isfinite(craterth) & (craterth > 0)
    p0, p1 = np.percentile(craterth[ok], [1, 99.5])
    save_rgb(apply_lut(np.clip((th - p0) / (p1 - p0), 0, 1), THERMAL), "s_thermal.jpg", 90)

    meta.update(visible="s_visible.jpg", normal="s_normal.jpg", slope="s_slope.png",
                thermal="s_thermal.jpg", slopeScale=0.25)
    m["site"] = meta


STAGES = dict(global_=stage_global, region=stage_region, crater=stage_crater, site=stage_site)

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    want = sys.argv[1:] or ["global", "region", "crater", "site"]
    man = read_manifest()
    man.update(localCrs=dict(latTs=LAT_TS, R=R_MARS, kx=KX, ky=KY))
    for s in want:
        STAGES["global_" if s == "global" else s](man)
        write_manifest(man)
    log("done")
