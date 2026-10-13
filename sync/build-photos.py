#!/usr/bin/env python3
"""Bake fast web copies of every vehicle photo (cards + car-page galleries).

eDealer photos are 1.3-2 MB 1200x1200 PNGs from a slow host, which made
inventory cards and the gallery arrows crawl. For every listed vehicle this
downloads each photo once and writes a full-frame (never cropped), resized and
compressed WebP to site/images/photos/<fnv1a32(url)>.webp.

The filename is a hash of the photo URL, so js/main.js, js/vdp-gallery.js and
sync/build-sitemap.py all derive the same name with no lookup file; any photo
that isn't baked yet falls back to the original eDealer URL automatically.

Order: every cover photo first (cards speed up soonest), then the rest of
each gallery. Runs hourly in the Truck Feed Sync workflow inside a time
budget; the folder is kept between runs with actions/cache, so the first
backlog (~8,000 photos) spreads over a few runs and afterwards only new
arrivals are downloaded. Photos of vehicles no longer listed are deleted.
Never fails the workflow.

    python3 sync/build-photos.py [--budget SECONDS] [--max N]
"""
import concurrent.futures as cf
import io
import json
import os
import sys
import time
import urllib.request

API = "https://eagle-ridge-trucks.fblister.workers.dev/api/trucks"
OUT = os.path.join(os.path.dirname(__file__), "..", "site", "images", "photos")
WIDTH = 960
WORKERS = 6
BUDGET = 480  # seconds per run; the rest is picked up next run

try:
    from PIL import Image
except Exception:
    Image = None


def fnv1a32(s):
    """Must match photoKey() in site/js/main.js and js/vdp-gallery.js."""
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def photo_name(url):
    return f"{fnv1a32(url)}.webp"


def photos(t):
    out = []
    for img in (t.get("customImages") or t.get("images") or []):
        if isinstance(img, str) and img.startswith("http") and img not in out:
            out.append(img)
    return out


def fetch(url, timeout=45):
    req = urllib.request.Request(url, headers={"User-Agent": "dangm-photos/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def bake(url, path):
    # The full photo, never cropped (owner's rule): only resized + compressed.
    im = Image.open(io.BytesIO(fetch(url))).convert("RGB")
    if im.width > WIDTH:
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    tmp = path + ".tmp"
    im.save(tmp, "WEBP", quality=76, method=4)
    os.replace(tmp, path)  # never leave a half-written file behind


def main():
    budget = int(sys.argv[sys.argv.index("--budget") + 1]) if "--budget" in sys.argv else BUDGET
    cap = int(sys.argv[sys.argv.index("--max") + 1]) if "--max" in sys.argv else None
    if Image is None:
        print("Pillow not installed; pages keep using the original photos")
        return 0
    try:
        d = json.loads(fetch(API, timeout=30))
    except Exception as e:
        print(f"API fetch failed ({e}); keeping existing photos")
        return 0
    trucks = [t for t in d.get("trucks", d if isinstance(d, list) else []) if t.get("listed") is not False]

    covers, rest = {}, {}
    for t in trucks:
        for i, u in enumerate(photos(t)):
            (covers if i == 0 else rest).setdefault(photo_name(u), u)
    want = {**covers, **rest}

    os.makedirs(OUT, exist_ok=True)
    have = {f for f in os.listdir(OUT) if f.endswith(".webp")}
    for f in os.listdir(OUT):
        if f.endswith(".tmp") or (f.endswith(".webp") and f not in want):
            os.remove(os.path.join(OUT, f))
    todo = [(f, u) for f, u in list(covers.items()) + list(rest.items()) if f not in have]
    if cap is not None:
        todo = todo[:cap]

    start = time.time()
    done = failed = 0
    it = iter(todo)
    with cf.ThreadPoolExecutor(WORKERS) as pool:
        futs = set()

        def submit_next():
            if time.time() - start > budget:
                return
            nxt = next(it, None)
            if nxt:
                futs.add(pool.submit(bake, nxt[1], os.path.join(OUT, nxt[0])))

        for _ in range(WORKERS):
            submit_next()
        while futs:
            finished, _ = cf.wait(futs, return_when=cf.FIRST_COMPLETED)
            for fu in finished:
                futs.discard(fu)
                try:
                    fu.result()
                    done += 1
                except Exception as e:
                    failed += 1
                    if failed <= 5:
                        print(f"  skipped a photo ({e.__class__.__name__}: {str(e)[:80]})")
                submit_next()

    cached = len(have & set(want))
    print(f"photos: {len(want)} listed ({len(covers)} covers), {cached} already baked, {done} new, "
          f"{failed} failed, {len(todo) - done - failed} left for next run ({time.time() - start:.0f}s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
