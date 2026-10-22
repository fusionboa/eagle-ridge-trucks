#!/usr/bin/env python3
"""Bake the homepage hero: site/data/hero.json + optimised walk-around photos.

The hero vehicle is the most expensive listed truck, unless sync/hero-pin.txt exists (then the
committed hero stays as is). eDealer photos are
1.3-2 MB 1200x1200 PNGs with an Eagle Ridge banner on top and an AutoVerify
strip at the bottom, so this script downloads the first 5 (the walk-around:
front 3/4, front, side, rear 3/4, rear), crops to the truck and writes small
WebP files to site/images/hero/ (about 60-120 KB each instead of ~9 MB total).

The React hero (js/home-hero.js) reads hero.json first instead of pulling the
full ~1 MB inventory. Runs hourly in the Truck Feed Sync workflow.

Never fails the workflow: if the API is unreachable it keeps the existing
files, and if Pillow or an image download fails it falls back to the remote
eDealer URLs (the hero crops those in CSS).

    python3 sync/build-hero.py
"""
import hashlib
import io
import json
import os
import re
import sys
import urllib.request

API = "https://eagle-ridge-trucks.fblister.workers.dev/api/trucks"
SITE = os.path.join(os.path.dirname(__file__), "..", "site")
OUT = os.path.join(SITE, "data", "hero.json")
IMG_DIR = os.path.join(SITE, "images", "hero")
ORBIT = 5
WIDTHS = (1000, 640)
KEEP = ("id", "year", "make", "model", "trim", "price", "salePrice", "mileage",
        "mileageUnit", "exteriorColor", "engine", "drivetrain", "listed",
        "images", "customImages")

try:
    from PIL import Image
except Exception:  # Pillow missing: remote URLs still work
    Image = None


def price_num(t):
    m = re.search(r"[\d,]+(?:\.\d+)?", str(t.get("price") or ""))
    try:
        return float(m.group(0).replace(",", "")) if m else -1
    except ValueError:
        return -1


def photos(t):
    imgs = t.get("customImages") or t.get("images") or []
    return [u for u in imgs if isinstance(u, str) and u.startswith("http")]


def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "dangm-hero-builder/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def crop_box(im, stamped):
    w, h = im.size
    if stamped and (w, h) == (1200, 1200):
        # Truck band of the eDealer canvas (rows ~285..1005), zoomed in a touch
        # to show less of the step-and-repeat wall: 1016x610 = 5:3
        return (92, 340, 1108, 950)
    # Anything else: centred 5:3 crop
    tw, th = w, round(w * 3 / 5)
    if th > h:
        th, tw = h, round(h * 5 / 3)
    left, top = (w - tw) // 2, (h - th) // 2
    return (left, top, left + tw, top + th)


def bake_images(urls, stamped):
    """Returns [{"src", "srcset"}] for the walk-around, or None on any failure."""
    if Image is None:
        print("Pillow not installed; hero will use remote photos")
        return None
    os.makedirs(IMG_DIR, exist_ok=True)
    out, keep = [], set()
    for url in urls[:ORBIT]:
        key = hashlib.sha1(url.encode()).hexdigest()[:12]
        names = [f"{key}-{w}.webp" for w in WIDTHS]
        keep.update(names)
        if not all(os.path.exists(os.path.join(IMG_DIR, n)) for n in names):
            try:
                im = Image.open(io.BytesIO(fetch(url))).convert("RGB")
            except Exception as e:
                print(f"Photo download failed ({e}): {url}")
                return None
            im = im.crop(crop_box(im, stamped))
            for w, n in zip(WIDTHS, names):
                im2 = im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
                im2.save(os.path.join(IMG_DIR, n), "WEBP", quality=80, method=6)
        out.append({
            "src": f"images/hero/{names[0]}",
            "srcset": ", ".join(f"images/hero/{n} {w}w" for w, n in zip(WIDTHS, names)),
        })
    # Drop photos of previous hero trucks
    for f in os.listdir(IMG_DIR):
        if f.endswith(".webp") and f not in keep:
            os.remove(os.path.join(IMG_DIR, f))
    return out


PIN = os.path.join(os.path.dirname(__file__), "hero-pin.txt")


def main():
    if os.path.exists(PIN):
        print("Hero pinned (sync/hero-pin.txt): keeping site/data/hero.json and site/images/hero/ as committed")
        return 0
    try:
        d = json.loads(fetch(API, timeout=30))
    except Exception as e:
        print(f"API fetch failed ({e}); keeping existing hero.json")
        return 0

    trucks = d.get("trucks", d if isinstance(d, list) else [])
    pool = [t for t in trucks if t.get("listed") is not False and photos(t) and price_num(t) > 0]
    if not pool:
        print("No listed trucks with photos and a price; keeping existing hero.json")
        return 0

    top = max(pool, key=price_num)
    hero = {k: top.get(k) for k in KEEP if k in top}
    hero["images"] = (hero.get("images") or [])[:8]
    hero["customImages"] = (hero.get("customImages") or [])[:8]
    baked = bake_images(photos(top), stamped=not top.get("customImages"))
    if baked:
        hero["heroImages"] = baked

    with open(OUT, "w") as f:
        json.dump({"truck": hero}, f, separators=(",", ":"))
    print(f"hero.json -> {top.get('year')} {top.get('make')} {top.get('model')} {top.get('trim')} "
          f"({top.get('price')}), {len(baked) if baked else 0} optimised photos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
