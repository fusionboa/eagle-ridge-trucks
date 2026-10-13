#!/usr/bin/env python3
"""Turn the Gemini art in /assets into web-ready layers for the homepage hero.

Inputs (green-screen PNGs, 1376x768):
  assets/layer-sky.png  layer-far.png  layer-near.png  layer-road.png
  assets/truck-1-front34.png ... truck-5-rear.png   (walk-around order)

Outputs:
  site/images/scene/*.webp   (alpha WebP: green keyed out, green spill removed)
  hero/src/art.json          (sizes + measured horizon/ground lines, bundled)

Pure Pillow (no numpy). Re-run after replacing any asset, then `npm run build`
and bump home-hero.js?v= in site/index.html.

    python3 hero/tools/process-art.py
"""
import json
import os
from PIL import Image, ImageChops

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
SRC = os.path.join(ROOT, "assets")
OUT = os.path.join(ROOT, "site", "images", "scene")
MANIFEST = os.path.join(ROOT, "hero", "src", "art.json")
TRUCKS = ["truck-1-front34", "truck-2-front", "truck-3-side", "truck-4-rear34", "truck-5-rear"]
TRUCK_HEIGHTS = (640, 360)  # px; trucks are normalised to the same height
SPARKLE = 150               # Gemini's corner mark lives in the bottom-right ~150px


def key_green(im, lo=28, hi=80):
    """Chroma key: alpha from how much G exceeds max(R, B); then despill."""
    r, g, b = im.convert("RGB").split()
    rb = ImageChops.lighter(r, b)
    excess = ImageChops.subtract(g, rb)                      # G - max(R,B), clamped at 0
    alpha = excess.point(lambda v: 255 if v <= lo else 0 if v >= hi else int(255 * (hi - v) / (hi - lo)))
    g2 = ImageChops.darker(g, rb.point(lambda v: min(255, v + 6)))  # kill green fringe
    return Image.merge("RGBA", (r, g2, b, alpha))


def clear_corner(im):
    """Drop the corner sparkle if it is separate from the subject."""
    a = im.getchannel("A")
    W, H = im.size
    box = (W - SPARKLE, H - SPARKLE, W, H)
    masked = a.copy()
    masked.paste(0, box)
    bb = masked.point(lambda v: 255 if v > 200 else 0).getbbox()
    overlaps = bb and bb[2] > box[0] and bb[3] > box[1]
    if not overlaps:
        a.paste(0, box)
        im.putalpha(a)
    return im


def vgrad(size, top, bottom, y0=0, y1=None):
    """Vertical RGB gradient image from colour `top` at y0 to `bottom` at y1."""
    W, H = size
    y1 = H if y1 is None else y1
    col = Image.new("RGB", (1, H))
    px = col.load()
    for y in range(H):
        t = min(1, max(0, (y - y0) / max(1, y1 - y0)))
        px[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
    return col.resize((W, H))


def grade(im, multiply=None, top=None, bottom=None, y0=0, y1=None, sat=1.0, warm_glow=None):
    """Dusk grade an RGBA layer: desaturate, multiply by a (gradient) tint,
    optionally screen a warm glow around a point. Alpha is preserved."""
    from PIL import ImageEnhance, ImageDraw, ImageFilter
    a = im.getchannel("A")
    rgb = ImageEnhance.Color(im.convert("RGB")).enhance(sat)
    if multiply:
        rgb = ImageChops.multiply(rgb, Image.new("RGB", im.size, multiply))
    if top and bottom:
        rgb = ImageChops.multiply(rgb, vgrad(im.size, top, bottom, y0, y1))
    if warm_glow:
        (cx, cy, rx, ry, colour) = warm_glow
        glow = Image.new("RGB", im.size, (0, 0, 0))
        ImageDraw.Draw(glow).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=colour)
        glow = glow.filter(ImageFilter.GaussianBlur(min(rx, ry) * 0.6))
        rgb = ImageChops.screen(rgb, glow)
    out = rgb.convert("RGBA")
    out.putalpha(a)
    return out


def save(im, name, **kw):
    path = os.path.join(OUT, name)
    im.save(path, "WEBP", quality=kw.get("quality", 84), method=6, exact=True)
    return os.path.getsize(path)


def first_opaque_row(a, x0, x1, thresh=200):
    W, H = a.size
    px = a.load()
    for y in range(H):
        if sum(1 for x in range(x0, x1) if px[x, y] > thresh) > (x1 - x0) * 0.5:
            return y
    return H


def main():
    os.makedirs(OUT, exist_ok=True)
    art = {
        "stage": None, "layers": {}, "trucks": [],
        # The art is an illustration of one model; it only replaces the real
        # listing photos while the hero truck matches it (else: photo frame).
        "match": {"make": "GMC", "model": "Sierra 3500", "trim": "Denali Ultimate", "color": "Black"},
        "label": "2026 GMC Sierra 3500HD Denali Ultimate",
    }

    sky = Image.open(os.path.join(SRC, "layer-sky.png")).convert("RGB")
    W, H = sky.size
    art["stage"] = {"w": W, "h": H}
    art["layers"]["sky"] = {"src": "images/scene/sky.webp", "bytes": save(sky, "sky.webp", quality=92)}

    # Gemini lit each layer differently; grade them all to the dusk sky
    grades = {
        "far": dict(multiply=(236, 226, 240)),
        "near": dict(sat=0.8, top=(150, 150, 196), bottom=(70, 76, 112), y0=120, y1=H),
        "road": dict(sat=0.62, top=(214, 168, 160), bottom=(70, 74, 112), y0=340, y1=H,
                     warm_glow=(W // 2, 352, 260, 40, (110, 66, 34))),
    }

    for name in ("far", "road"):  # the forest is used as two cut-out stands (below)
        im = clear_corner(key_green(Image.open(os.path.join(SRC, f"layer-{name}.png"))))
        im = grade(im, **grades[name])
        a = im.getchannel("A")
        bb = a.point(lambda v: 255 if v > 200 else 0).getbbox()
        info = {"src": f"images/scene/{name}.webp", "bbox": bb}
        if name == "road":
            info["horizon"] = first_opaque_row(a, W // 2 - 200, W // 2 + 200)
        if name == "near":
            info["valley"] = first_opaque_row(a, W // 2 - 60, W // 2 + 60)
        info["bytes"] = save(im, f"{name}.webp")
        art["layers"][name] = info

    # Two stands of tall pines cut from the forest layer's edges. They stand on
    # the fields beside the road (in front of it, behind the truck), with the
    # base faded into a soft ground shadow so they read as rooted, not floating.
    from PIL import ImageDraw, ImageFilter
    # lighter than the old full-forest grade: these trees are near and should read as trees
    near = grade(clear_corner(key_green(Image.open(os.path.join(SRC, "layer-near.png")))),
                 sat=0.85, top=(190, 188, 222), bottom=(118, 122, 160), y0=110, y1=565)
    art["stands"] = []
    for side, box in (("left", (0, 110, 340, 565)), ("right", (1040, 110, 1376, 565))):
        stand = near.crop(box)
        sw, sh = stand.size
        fade, pad = 46, 34
        a = stand.getchannel("A")
        ramp = Image.linear_gradient("L").resize((sw, fade)).point(lambda v: 255 - v)
        a.paste(ImageChops.multiply(a.crop((0, sh - fade, sw, sh)), ramp), (0, sh - fade))
        # Feather the inner (road-side) edge so the forest thins out instead
        # of ending in a straight cut; the lower body fades further in than
        # the treetops, so the stand tapers toward the road like a tree line.
        edge = 150
        hmask = Image.new("L", (sw, sh), 255)
        hp = hmask.load()
        for y in range(sh):
            depth = edge * (0.35 + 0.65 * (y / sh))          # wider fade lower down
            for x in range(sw):
                d = (sw - 1 - x) if side == "left" else x     # distance from inner edge
                if d < depth:
                    hp[x, y] = int(255 * (d / depth) ** 1.6)
        a = ImageChops.multiply(a, hmask)
        stand.putalpha(a)
        canvas = Image.new("RGBA", (sw, sh + pad), (0, 0, 0, 0))
        shadow = Image.new("L", (sw, sh + pad), 0)
        x0, x1 = (0, sw - edge // 2) if side == "left" else (edge // 2, sw)
        ImageDraw.Draw(shadow).rectangle((x0, sh - 30, x1, sh + 8), fill=150)
        shadow = shadow.filter(ImageFilter.GaussianBlur(14))
        canvas.paste((10, 10, 18, 255), (0, 0), shadow)
        canvas.alpha_composite(stand)
        fn = f"trees-{side}.webp"
        save(canvas, fn)
        art["stands"].append({"side": side, "src": f"images/scene/{fn}", "w": sw, "h": sh + pad, "base": sh})

    for i, name in enumerate(TRUCKS):
        im = clear_corner(key_green(Image.open(os.path.join(SRC, f"{name}.png"))))
        bb = im.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
        im = im.crop(bb)
        entry = {"aspect": round(im.width / im.height, 4), "srcset": []}
        for h in TRUCK_HEIGHTS:
            w = round(im.width * h / im.height)
            fn = f"{name}-{h}.webp"
            save(im.resize((w, h), Image.LANCZOS), fn, quality=86)
            entry["srcset"].append([f"images/scene/{fn}", w])
        entry["src"] = entry["srcset"][0][0]
        art["trucks"].append(entry)

    with open(MANIFEST, "w") as f:
        json.dump(art, f, indent=1)
    print(json.dumps(art, indent=1))


if __name__ == "__main__":
    main()
