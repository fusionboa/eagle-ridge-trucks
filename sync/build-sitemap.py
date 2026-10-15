#!/usr/bin/env python3
"""Build all crawlable vehicle artifacts in one pass:

1. site/v/<slug>/index.html — 414 static VDP pages Google can actually read
   (the interactive vehicle.html?id=X renders client-side; Googlebot sees
   "Loading vehicle..." there — these prebuilt pages fix that).
2. site/sitemap-vehicles.xml — now points at the static /v/ pages.

Run before every Pages deploy (same command as before):
    python3 sync/build-sitemap.py

Fetches the live API (or falls back to /tmp/trucks.json), filters to
listed vehicles. Slug format: /v/<year-make-model-trim-stock-ID>/
Static pages are self-canonical; vehicle.html?id=X stays the interactive
variant. Generated pages land in site/v/ which is gitignored — they only
exist in pages-dist after the deploy copy.
"""
import html
import json
import os
import re
import sys
import urllib.request
import datetime

API = "https://eagle-ridge-trucks.fblister.workers.dev/api/trucks"
SITE = os.path.join(os.path.dirname(__file__), "..", "site")
OUT_SITEMAP = os.path.join(SITE, "sitemap-vehicles.xml")
OUT_PAGES = os.path.join(SITE, "v")

PHONE = "604-735-1396"
PHONE_HREF = "tel:6047351396"
BASE = "https://dangm.ca"


def esc(s):
    return html.escape(str(s or ""), quote=True)


def slugify(t):
    base = " ".join(
        str(t.get(k) or "").strip() for k in ("year", "make", "model", "trim")
    ).strip()
    s = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-") or "vehicle"
    stock = re.sub(r"[^a-z0-9]+", "-", str(t.get("id") or "").lower()).strip("-")
    return f"{s}-stock-{stock}"


def load_trucks():
    try:
        req = urllib.request.Request(API, headers={"User-Agent": "dangm-sitemap-builder/2.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
    except Exception as e:
        print(f"API fetch failed ({e}); falling back to /tmp/trucks.json")
        with open("/tmp/trucks.json") as f:
            d = json.load(f)
    return d.get("trucks", d if isinstance(d, list) else [])


# 1x1 transparent placeholder for thumbnails until vdp-gallery.js loads them
PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="


def all_images(truck):
    imgs = truck.get("customImages") or truck.get("images") or []
    out = []
    for img in imgs:
        if isinstance(img, str) and img.startswith("http") and img not in out:
            out.append(img)
    return out


PHOTOS_DIR = os.path.join(SITE, "images", "photos")


def photo_name(url):
    """FNV-1a 32 of the photo URL; must match build-photos.py and photoKey() in js."""
    h = 0x811C9DC5
    for b in url.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}.webp"


def fast_photo(url):
    """Baked full-frame WebP from sync/build-photos.py when it exists, else the original."""
    name = photo_name(url)
    return f"/images/photos/{name}" if os.path.exists(os.path.join(PHOTOS_DIR, name)) else url


def gallery_html(truck, h1, fallback):
    """Interactive photo gallery, server-rendered: every photo is in the HTML
    (Google can index them); js/vdp-gallery.js adds arrows/thumbs/keys/swipe.
    Same classes as the interactive vehicle.html gallery."""
    imgs = all_images(truck)
    alt = esc(f"{h1} for sale in Coquitlam BC")
    if not imgs:
        return f'        <img class="vdp-main" src="{esc(fallback)}" alt="{alt}" style="border-radius:12px">'
    n = len(imgs)
    parts = [f'        <div class="vdp-gallery" data-static-gallery>',
             '          <div class="vdp-main-wrap">',
             f'            <img class="vdp-main" src="{esc(fast_photo(imgs[0]))}" data-orig="{esc(imgs[0])}" alt="{alt}, photo 1 of {n}" data-alt="{alt}" fetchpriority="high">']
    if n > 1:
        parts += ['            <button class="vdp-nav vdp-prev" data-dir="-1" aria-label="Previous photo">&lsaquo;</button>',
                  '            <button class="vdp-nav vdp-next" data-dir="1" aria-label="Next photo">&rsaquo;</button>',
                  f'            <span class="vdp-count" aria-live="polite">1 / {n}</span>']
    parts.append('          </div>')
    if n > 1:
        rows = []
        for i, u in enumerate(imgs):
            first = i == 0
            rows.append(
                f'            <img class="vdp-thumb{" active" if first else ""}" src="{PIXEL}" data-src="{esc(fast_photo(u))}" data-full="{esc(fast_photo(u))}" data-orig="{esc(u)}" '
                f'alt="{alt}, photo {i + 1}" decoding="async" tabindex="0" role="button"'
                + (' aria-current="true"' if first else "") + ">"
            )
        thumbs = "\n".join(rows)
        parts += ['          <div class="vdp-thumbs">', thumbs, '          </div>']
    parts.append('        </div>')
    return "\n".join(parts)


def cover_image(truck):
    imgs = truck.get("customImages") or truck.get("images") or []
    for img in imgs:
        if isinstance(img, str) and img.startswith("http"):
            return img
    return None


def price_num(t):
    """Numeric CAD price. Feed strings look like '19995 CAD' or '19995'."""
    m = re.search(r"[\d,]+(?:\.\d+)?", str(t.get("price") or ""))
    if not m:
        return None
    try:
        return int(float(m.group(0).replace(",", "")))
    except ValueError:
        return None


def price_str(t):
    n = price_num(t)
    return f"${n:,}" if n is not None else ""


def clean_text(s):
    """House style: no em/en dashes (matches cleanText() in main.js)."""
    return re.sub(r"\s{2,}", " ", re.sub(r"\s*[\u2014\u2013]\s*", ", ", str(s or ""))).strip()


def engine_short(t):
    e = clean_text(t.get("engine")).split("(")[0].strip().rstrip(".,;")
    e = re.sub(r"V-Shaped\s*(\d+)-cyl", r"V\1", e, flags=re.I)  # "V-Shaped 8-cyl" -> "V8"
    return e[:40].rstrip() if e else ""


def name_str(t):
    return clean_text(" ".join(str(t.get(k) or "").strip() for k in ("year", "make", "model", "trim")))


def car_name(t):
    """Year + Make + Model, no trim."""
    return clean_text(" ".join(str(t.get(k) or "").strip() for k in ("year", "make", "model")))


def km_num(t):
    try:
        return int(float(str(t.get("mileage") or "").replace(",", "")))
    except ValueError:
        return None


def is_used(t):
    """Same rule as isUsed() in js/main.js: over 100 km = used."""
    km = km_num(t)
    return km is not None and km > 100


def km_str(t):
    km = km_num(t)
    return f"{km:,} km" if km is not None else ""


BODY_NAMES = {"SUV": "SUV", "TRUCK": "pickup truck", "VAN": "van", "SEDAN": "sedan",
              "HATCHBACK": "hatchback", "COUPE": "coupe", "WAGON": "wagon", "CONVERTIBLE": "convertible"}


def body_name(t):
    return BODY_NAMES.get(str(t.get("bodyStyle") or "").upper(), "")


def nice(v):
    """Feed enums are SHOUTY ("AUTOMATIC", "DIESEL"); keep acronyms like 4X4/AWD."""
    v = clean_text(v)
    if not v or v.upper() == "OTHER":
        return ""
    return v if (len(v) <= 4 and v.isupper()) else v.title()


def title_str(t):
    """Unique per unit: trim + price (+ km for used), still hyper-local."""
    bits = [name_str(t), "for Sale in Coquitlam"]
    tail = [x for x in (price_str(t), km_str(t) if is_used(t) else "") if x]
    return f"{bits[0]} {bits[1]} | {', '.join(tail)} | DanGM" if tail else f"{bits[0]} {bits[1]} | DanGM"


def seo_text(t):
    cond = "Used" if is_used(t) else "New"
    color = nice(t.get("exteriorColor"))
    specs = ", ".join(x for x in (engine_short(t), nice(t.get("drivetrain"))) if x)
    parts = [f"{cond} {name_str(t)}"]
    if color:
        parts[0] += f" in {color}"
    if is_used(t) and km_str(t):
        parts.append(f"{km_str(t)}")
    if specs:
        parts.append(specs)
    price = price_str(t)
    lead = ", ".join(parts) + (f", {price}" if price else "")
    return f"{lead}. At Eagle Ridge GM, Coquitlam. Financing for all credit. Call {PHONE}."


def summary_text(t):
    """Factual, unit-specific overview built only from feed data."""
    cond = "used" if is_used(t) else "new"
    name = name_str(t)
    color, inner = nice(t.get("exteriorColor")), nice(t.get("interiorColor"))
    s1 = f"This {cond} {name}"
    if color:
        s1 += f" is finished in {color}" + (f" with a {inner} interior" if inner else "")
    s1 += "."
    spec = [x for x in (
        (f"{km_str(t)} on the odometer" if km_str(t) else ""),
        (f"a {engine_short(t)} engine" if engine_short(t) else ""),
        (f"{nice(t.get('transmission')).lower()} transmission" if nice(t.get("transmission")) else ""),
        (nice(t.get("drivetrain")) if nice(t.get("drivetrain")) else ""),
        (f"{nice(t.get('fuelType')).lower()} fuel" if nice(t.get("fuelType")) else ""),
    ) if x]
    s2 = f" It has {', '.join(spec[:-1]) + ' and ' + spec[-1] if len(spec) > 1 else spec[0]}." if spec else ""
    price = price_str(t)
    s3 = (f" Listed at {price}" if price else " Available") + (f" (stock #{t.get('stockNumber')})" if t.get("stockNumber") else "") + f" at Eagle Ridge GM, 2595 Barnet Hwy in Coquitlam."
    s4 = f" Financing is available for every credit situation, including new-to-Canada buyers. Call Dan at {PHONE} to check approval or book a test drive."
    return clean_text(s1 + s2 + s3 + s4)


# The dealer feed's equipment text is sometimes copied from an SUV onto a
# pickup (e.g. "power-folding third row" on a Sierra 3500HD). Drop equipment
# that no pickup has, so the page never advertises features it can't have.
PICKUP_IMPOSSIBLE = re.compile(r"third[- ]row|second[- ]row bucket|liftgate|rear (?:seat )?media|rear-seat entertainment|captain'?s chair", re.I)


def feature_text(t):
    text = clean_text(t.get("description"))
    if str(t.get("bodyStyle") or "").upper() == "TRUCK" and text:
        text = ", ".join(x for x in re.split(r",\s*", text) if not PICKUP_IMPOSSIBLE.search(x))
    return text


def details_rows(t):
    rows = [
        ("Body Style", t.get("bodyStyle")),
        ("Engine", t.get("engine")),
        ("Exterior Colour", t.get("exteriorColor")),
        ("Interior Colour", t.get("interiorColor")),
        ("Transmission", t.get("transmission")),
        ("Drivetrain", t.get("drivetrain")),
        ("Fuel Type", t.get("fuelType")),
        ("Mileage", f"{int(t['mileage']):,} km" if t.get("mileage") else ""),
        ("VIN", t.get("vin")),
        ("Stock #", t.get("stockNumber")),
    ]
    return [(k, v) for k, v in rows if v]


DRIVE_CONFIG = {
    "4X4": "https://schema.org/FourWheelDriveConfiguration",
    "AWD": "https://schema.org/AllWheelDriveConfiguration",
    "FWD": "https://schema.org/FrontWheelDriveConfiguration",
    "RWD": "https://schema.org/RearWheelDriveConfiguration",
    "4X2": "https://schema.org/RearWheelDriveConfiguration",
}
DEALER_PLACE = {
    "@type": "AutoDealer",
    "@id": f"{BASE}/#dealer",
    "name": "Eagle Ridge GM",
    "address": {
        "@type": "PostalAddress",
        "streetAddress": "2595 Barnet Hwy",
        "addressLocality": "Coquitlam",
        "addressRegion": "BC",
        "postalCode": "V3E 1K9",
        "addressCountry": "CA",
    },
}


def vehicle_jsonld(t, page_url, title, desc, img):
    condition = "https://schema.org/UsedCondition" if is_used(t) else "https://schema.org/NewCondition"
    km = km_num(t)
    price = price_num(t)
    valid = (datetime.date.today() + datetime.timedelta(days=30)).isoformat()
    ld = {
        "@context": "https://schema.org",
        "@type": ["Car", "Vehicle"],
        "@id": f"{page_url}#vehicle",
        "url": page_url,
        "name": name_str(t),
        "description": summary_text(t),
        "sku": str(t.get("stockNumber") or t.get("id") or ""),
        "image": ([img] + [u for u in all_images(t) if u != img]) if img else "",
        "brand": {"@type": "Brand", "name": t.get("make") or ""},
        "model": t.get("model") or "",
        "vehicleConfiguration": t.get("trim") or "",
        "vehicleModelDate": str(t.get("year") or ""),
        "itemCondition": condition,
        "bodyType": body_name(t),
        "color": nice(t.get("exteriorColor")),
        "vehicleInteriorColor": nice(t.get("interiorColor")),
        "vehicleIdentificationNumber": t.get("vin") or "",
        "mileageFromOdometer": {"@type": "QuantitativeValue", "value": km, "unitCode": "KMT"} if km is not None else None,
        "vehicleEngine": {"@type": "EngineSpecification", "name": clean_text(t["engine"])} if t.get("engine") else None,
        "vehicleTransmission": nice(t.get("transmission")),
        "driveWheelConfiguration": DRIVE_CONFIG.get(str(t.get("drivetrain") or "").upper()),
        "fuelType": nice(t.get("fuelType")),
        "offers": {
            "@type": "Offer",
            "price": price,
            "priceCurrency": "CAD",
            "priceValidUntil": valid,
            "availability": "https://schema.org/InStock",
            "itemCondition": condition,
            "url": page_url,
            "seller": {"@id": f"{BASE}/#business"},
            "availableAtOrFrom": DEALER_PLACE,
        } if price else None,
    }
    ld = {k: v for k, v in ld.items() if v not in (None, "")}
    return json.dumps(ld, ensure_ascii=False)


PAGE_TMPL = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" sizes="64x64" href="{base_rel}images/favicon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="geo.region" content="CA-BC">
  <meta name="geo.placename" content="Tri-Cities (Coquitlam, Port Coquitlam, Port Moody), Greater Vancouver, BC">
  <link rel="canonical" href="{page_url}">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="DanGM">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:url" content="{page_url}">
  <meta property="og:image" content="{img}">
  <meta property="og:locale" content="en_CA">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{desc}">
  <meta name="twitter:image" content="{img}">
  <script type="application/ld+json">
  {vehicle_ld}
  </script>
  <script type="application/ld+json">
  {breadcrumb_ld}
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="{base_rel}css/styles.css?v=26">
  <link rel="stylesheet" href="{base_rel}css/glass.css?v=5">
  <script src="{base_rel}js/glass.js?v=2" defer></script>
  <script src="{base_rel}js/vdp-gallery.js?v=2" defer></script>
</head>
<body class="page-vehicle glass">
  <nav class="nav scrolled" id="nav">
    <div class="nav-inner">
      <a href="/" class="nav-logo">
        <img class="logo-mark logo-img" src="{base_rel}images/logo.png" alt="dangm.ca logo">
        <span class="logo-text">dangm<em>.ca</em></span>
      </a>
      <div class="nav-links">
        <a href="/">Home</a>
        <a href="/inventory" class="active">Inventory</a>
        <a href="/locations/">Locations</a>
        <a href="/blog/">Guides</a>
        <a href="/forum/">Forum</a>
        <a href="/about">About</a>
        <a href="/#contact">Contact</a>
      </div>
      <button class="nav-toggle" id="navToggle" aria-label="Menu">☰</button>
      <a href="/inventory" class="nav-cta">View Inventory</a>
    </div>
  </nav>
  <main class="vehicle-main">
    <div class="vdp-hero">
      <a href="/inventory" class="vdp-back">&larr; Back to inventory</a>
      <h1 class="vdp-title">{h1}</h1>
      <div class="vdp-price">{price}</div>
      <p class="vdp-summary">{summary}</p>
    </div>
    <div class="vdp-layout">
      <div class="vdp-gallery-col">
{gallery}
      </div>
      <div class="vdp-info-col">
        <div class="vdp-details">
          <h2>Vehicle Details</h2>
          <dl>
            {rows}
          </dl>
        </div>
        <div class="vdp-actions">
          <a href="{phone_href}" class="btn btn-primary">Call {phone}</a>
          <a href="/#lead" class="btn btn-ghost">Get pre-approved</a>
        </div>
      </div>
    </div>
    {desc_block}
  </main>
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <img class="logo-mark logo-img" src="{base_rel}images/logo.png" alt="dangm.ca logo">
        <span class="logo-text">dangm<em>.ca</em></span>
      </div>
      <p>&copy; {year_now} dangm.ca. All rights reserved.</p>
      <p class="footer-disclosure" style="font-size:12px;opacity:.7;margin-top:6px">Vehicles are sold and financed through Eagle Ridge Chevrolet Buick GMC, a licensed motor dealer in British Columbia. Financing subject to lender approval.</p>
      <nav class="footer-links" style="display:flex;flex-wrap:wrap;gap:1.5rem;justify-content:center;margin-top:14px" aria-label="Footer">
        <a href="/inventory">Inventory</a>
        <a href="/locations/">Locations</a>
        <a href="/locations/surrey/">Car Financing Surrey</a>
        <a href="/blog/">Car Buying Guides</a>
        <a href="/forum/">Forum</a>
        <a href="/about">About</a>
      </nav>
    </div>
  </footer>
  <script>window.SITE_PAGE = 'landing';</script>
  <script src="/js/main.js?v=29"></script>
</body>
</html>
"""


def render_page(t, slug, today, categories=()):
    slug_url = f"{BASE}/v/{slug}/"
    title = title_str(t)
    desc = seo_text(t)
    img = cover_image(t) or f"{BASE}/images/og-logo.png"
    h1 = name_str(t)
    price = price_str(t)
    rows = "\n".join(
        f'            <div class="detail-row"><dt>{esc(k)}</dt><dd>{esc(v)}</dd></div>'
        for k, v in details_rows(t)
    )
    features = feature_text(t)
    desc_block = (
        f'    <div class="vdp-desc"><h2>Equipment and features</h2><p>{esc(features)}</p></div>'
        if features
        else ""
    )
    # Breadcrumb: Home > Inventory > {make page, when one exists} > this vehicle
    crumbs = [("Home", f"{BASE}/"), ("Inventory", f"{BASE}/inventory")]
    make_cat = next((c for c in categories if c.get("make") and c["make"] == str(t.get("make") or "")), None)
    if make_cat:
        crumbs.append((make_cat["crumb"], f"{BASE}/inventory/{make_cat['slug']}/"))
    crumbs.append((h1, slug_url))
    breadcrumb_ld = json.dumps({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(crumbs)
        ],
    }, ensure_ascii=False)
    return PAGE_TMPL.format(
        base_rel="../../",
        title=esc(title),
        desc=esc(desc),
        page_url=esc(slug_url),
        img=esc(img),
        gallery=gallery_html(t, h1, img),
        vehicle_ld=vehicle_jsonld(t, slug_url, title, desc, img),
        breadcrumb_ld=breadcrumb_ld,
        h1=esc(h1),
        price=esc(price),
        summary=esc(summary_text(t)),
        rows=rows,
        phone=PHONE,
        phone_href=PHONE_HREF,
        stock=esc(str(t.get("stockNumber") or "")),
        desc_block=desc_block,
        year_now=today[:4],
    )


# ─── Inventory category pages (/inventory/<slug>/) ─────────────
# Static, crawlable listing pages for the searches people actually make
# ("used trucks Coquitlam"): the main /inventory page filters client-side on
# one URL, so it can't rank for those. Only categories with 3+ vehicles.
def _body(t):
    return str(t.get("bodyStyle") or "").upper()


CATEGORIES = [
    {"slug": "used-trucks", "h1": "Used Trucks for Sale in Coquitlam, BC", "crumb": "Used trucks", "label": "used pickup trucks",
     "test": lambda t: _body(t) == "TRUCK" and is_used(t)},
    {"slug": "new-trucks", "h1": "New GM Trucks for Sale in Coquitlam, BC", "crumb": "New trucks", "label": "new pickup trucks",
     "test": lambda t: _body(t) == "TRUCK" and not is_used(t)},
    {"slug": "used-suvs", "h1": "Used SUVs for Sale in Coquitlam, BC", "crumb": "Used SUVs", "label": "used SUVs",
     "test": lambda t: _body(t) == "SUV" and is_used(t)},
    {"slug": "new-suvs", "h1": "New GM SUVs for Sale in Coquitlam, BC", "crumb": "New SUVs", "label": "new SUVs",
     "test": lambda t: _body(t) == "SUV" and not is_used(t)},
    {"slug": "used-cars", "h1": "Used Cars and Vans for Sale in Coquitlam, BC", "crumb": "Used cars and vans", "label": "used cars, vans and hatchbacks",
     "test": lambda t: _body(t) not in ("TRUCK", "SUV") and is_used(t)},
    {"slug": "chevrolet", "h1": "Chevrolet Inventory in Coquitlam, BC", "crumb": "Chevrolet", "label": "Chevrolet vehicles", "make": "Chevrolet",
     "test": lambda t: t.get("make") == "Chevrolet"},
    {"slug": "gmc", "h1": "GMC Inventory in Coquitlam, BC", "crumb": "GMC", "label": "GMC vehicles", "make": "GMC",
     "test": lambda t: t.get("make") == "GMC"},
    {"slug": "buick", "h1": "Buick Inventory in Coquitlam, BC", "crumb": "Buick", "label": "Buick vehicles", "make": "Buick",
     "test": lambda t: t.get("make") == "Buick"},
]
OUT_CATS = os.path.join(SITE, "inventory")
OUT_CAT_SITEMAP = os.path.join(SITE, "sitemap-inventory.xml")
OUT_SNAPSHOT = os.path.join(SITE, "data", "inventory.json")
INVENTORY_HTML = os.path.join(SITE, "inventory.html")
SNAPSHOT_FIELDS = ("id", "stockNumber", "year", "make", "model", "trim", "price", "salePrice", "mileage", "mileageUnit",
                   "bodyStyle", "transmission", "drivetrain", "engine", "fuelType", "exteriorColor",
                   "interiorColor", "condition", "vin", "listed", "featured", "updatedAt")


def card_html(t, slug):
    img = cover_image(t)
    name = name_str(t)
    sub = " · ".join(x for x in (nice(t.get("exteriorColor")), km_str(t)) if x)
    body = body_name(t)
    return (
        f'      <a class="truck-card" href="/v/{slug}/">\n'
        f'        <div class="truck-card-img-wrap">'
        + (f'<img class="truck-card-img" src="{esc(fast_photo(img))}" data-orig="{esc(img)}" onerror="this.onerror=null;this.src=this.dataset.orig" alt="{esc(name)} for sale in Coquitlam BC" loading="lazy" decoding="async">' if img else '<div class="truck-card-img"></div>')
        + (f'<span class="truck-badge">{esc(body.upper())}</span>' if body else "")
        + '</div>\n'
        f'        <div class="truck-card-body">\n'
        f'          <h3 class="truck-card-title">{esc(name)}</h3>\n'
        f'          <p class="truck-card-sub">{esc(sub)}</p>\n'
        f'          <div class="truck-card-price">{esc(price_str(t) or "Call for price")}</div>\n'
        f'          <span class="truck-card-cta">View Details →</span>\n'
        f'        </div>\n      </a>'
    )


def category_page(c, items, slugs, today):
    url = f"{BASE}/inventory/{c['slug']}/"
    prices = sorted(p for p in (price_num(t) for t in items) if p)
    makes = {}
    for t in items:
        makes[t.get("make")] = makes.get(t.get("make"), 0) + 1
    make_txt = ", ".join(f"{m} ({n})" for m, n in sorted(makes.items(), key=lambda x: -x[1]) if m)
    n = len(items)
    rng = f", priced from ${prices[0]:,} to ${prices[-1]:,}" if prices else ""
    intro = (f"{n} {c['label']} in stock right now at Eagle Ridge GM, 2595 Barnet Hwy in Coquitlam{rng}."
             + (f" By make: {make_txt}." if not c.get("make") and make_txt else "")
             + f" Every one can be financed through Dan, including with bad credit, a past bankruptcy or no Canadian credit history."
             + f" This list updates every hour from the live inventory.")
    title = f"{c['h1']} | {n} in Stock | DanGM"
    desc = clean_text(f"{n} {c['label']} for sale in Coquitlam{rng}. Financing for all credit, trade-ins welcome. Call {PHONE}.")
    others = " · ".join(f'<a href="/inventory/{o["slug"]}/">{esc(o["crumb"])}</a>' for o in CATEGORIES if o is not c and o.get("_count", 0) >= 3)
    item_list = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": f"{url}#page",
        "url": url,
        "name": c["h1"],
        "description": desc,
        "isPartOf": {"@id": f"{BASE}/#website"},
        "mainEntity": {
            "@type": "ItemList",
            "numberOfItems": n,
            "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "url": f"{BASE}/v/{slugs[t['id']]}/", "name": name_str(t)}
                for i, t in enumerate(items)
            ],
        },
    }
    crumbs = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{BASE}/"},
            {"@type": "ListItem", "position": 2, "name": "Inventory", "item": f"{BASE}/inventory"},
            {"@type": "ListItem", "position": 3, "name": c["crumb"], "item": url},
        ],
    }
    cards = "\n".join(card_html(t, slugs[t["id"]]) for t in items)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" sizes="64x64" href="/images/favicon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="{url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="DanGM">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(desc)}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{esc(cover_image(items[0]) or BASE + '/images/og-logo.png')}">
  <meta property="og:locale" content="en_CA">
  <script type="application/ld+json">{json.dumps(item_list, ensure_ascii=False)}</script>
  <script type="application/ld+json">{json.dumps(crumbs, ensure_ascii=False)}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/styles.css?v=26">
  <link rel="stylesheet" href="/css/glass.css?v=5">
  <script src="/js/glass.js?v=2" defer></script>
</head>
<body class="page-inventory glass">
  <nav class="nav scrolled" id="nav">
    <div class="nav-inner">
      <a href="/" class="nav-logo">
        <img class="logo-mark logo-img" src="/images/logo.png" alt="dangm.ca logo">
        <span class="logo-text">dangm<em>.ca</em></span>
      </a>
      <div class="nav-links">
        <a href="/">Home</a>
        <a href="/inventory" class="active">Inventory</a>
        <a href="/locations/">Locations</a>
        <a href="/blog/">Guides</a>
        <a href="/forum/">Forum</a>
        <a href="/about">About</a>
        <a href="/#contact">Contact</a>
      </div>
      <button class="nav-toggle" id="navToggle" aria-label="Menu">☰</button>
      <a href="/inventory" class="nav-cta">View Inventory</a>
    </div>
  </nav>
  <header class="page-hero" id="top">
    <div class="page-hero-bg"></div>
    <div class="page-hero-content">
      <p class="hero-eyebrow">INVENTORY · COQUITLAM · TRI-CITIES, BC</p>
      <h1 class="page-hero-title">{esc(c['h1'])}</h1>
      <p class="page-hero-sub">{esc(intro)}</p>
      <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:22px">
        <a href="/#lead" class="btn btn-primary">Get pre-approved</a>
        <a href="{PHONE_HREF}" class="btn btn-ghost">Call {PHONE}</a>
      </div>
    </div>
  </header>
  <section class="inventory" aria-label="{esc(c['crumb'])} in stock">
    <div class="truck-grid flagship-grid">
{cards}
    </div>
    <p style="text-align:center;margin-top:36px;color:var(--text-muted)">More inventory: {others} · <a href="/inventory">Search everything</a></p>
  </section>
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <img class="logo-mark logo-img" src="/images/logo.png" alt="dangm.ca logo">
        <span class="logo-text">dangm<em>.ca</em></span>
      </div>
      <p>&copy; {today[:4]} dangm.ca. All rights reserved.</p>
      <p class="footer-disclosure" style="font-size:12px;opacity:.7;margin-top:6px">Vehicles are sold and financed through Eagle Ridge Chevrolet Buick GMC, a licensed motor dealer in British Columbia. Financing subject to lender approval.</p>
      <nav class="footer-links" style="display:flex;flex-wrap:wrap;gap:1.5rem;justify-content:center;margin-top:14px" aria-label="Footer">
        <a href="/inventory">Inventory</a>
        <a href="/locations/">Locations</a>
        <a href="/blog/">Car Buying Guides</a>
        <a href="/forum/">Forum</a>
        <a href="/about">About</a>
      </nav>
    </div>
  </footer>
  <script>window.SITE_PAGE = 'landing';</script>
  <script src="/js/main.js?v=29"></script>
</body>
</html>
"""


def inventory_index_html(trucks, slugs):
    """Crawlable links baked into /inventory (its grid is rendered by JS)."""
    cats = " · ".join(f'<a href="/inventory/{c["slug"]}/">{esc(c["crumb"])} ({c["_count"]})</a>'
                      for c in CATEGORIES if c.get("_count", 0) >= 3)
    items = "\n".join(
        f'          <li><a href="/v/{slugs[t["id"]]}/">{esc(name_str(t))}</a> <span>{esc(price_str(t))}</span></li>'
        for t in sorted(trucks, key=lambda t: (str(t.get("make")), str(t.get("model")), -(price_num(t) or 0)))
    )
    return (
        '  <section class="inventory inventory-index" aria-label="Browse all vehicles">\n'
        f'    <p class="inventory-cats"><strong>Browse by category:</strong> {cats}</p>\n'
        '    <details class="inventory-az">\n'
        f'      <summary>All {len(trucks)} vehicles in stock, A to Z</summary>\n'
        '        <ul>\n' + items + '\n        </ul>\n'
        '    </details>\n'
        '  </section>'
    )


def main():
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    trucks = [t for t in load_trucks() if t.get("listed") is not False and t.get("id")]
    if limit:
        trucks = trucks[:limit]
    today = datetime.date.today().isoformat()
    trucks.sort(key=lambda t: -(price_num(t) or 0))
    slugs = {t["id"]: slugify(t) for t in trucks}

    # categories first: vehicle breadcrumbs link to the make pages
    for c in CATEGORIES:
        c["_items"] = [t for t in trucks if c["test"](t)]
        c["_count"] = len(c["_items"])
    live_cats = [c for c in CATEGORIES if c["_count"] >= 3]

    os.makedirs(OUT_PAGES, exist_ok=True)
    written = 0
    urls = []
    for t in trucks:
        slug = slugs[t["id"]]
        page_dir = os.path.join(OUT_PAGES, slug)
        os.makedirs(page_dir, exist_ok=True)
        with open(os.path.join(page_dir, "index.html"), "w") as f:
            f.write(render_page(t, slug, today, live_cats))
        img = cover_image(t)
        image_tag = (
            "    <image:image>\n"
            f"      <image:loc>{html.escape(img)}</image:loc>\n"
            "    </image:image>\n"
        ) if img else ""
        urls.append(
            f"  <url>\n"
            f"    <loc>{BASE}/v/{slug}/</loc>\n"
            f"    <lastmod>{str(t.get('updatedAt') or today)[:10]}</lastmod>\n"
            f"{image_tag}"
            f"  </url>"
        )
        written += 1

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
        '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
        f"{chr(10).join(urls)}\n</urlset>\n"
    )
    with open(OUT_SITEMAP, "w") as f:
        f.write(xml)

    # category pages + their sitemap
    cat_urls = []
    for c in live_cats:
        d = os.path.join(OUT_CATS, c["slug"])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w") as f:
            f.write(category_page(c, c["_items"], slugs, today))
        last = max(str(t.get("updatedAt") or today)[:10] for t in c["_items"])
        cat_urls.append(f"  <url>\n    <loc>{BASE}/inventory/{c['slug']}/</loc>\n    <lastmod>{last}</lastmod>\n  </url>")
    with open(OUT_CAT_SITEMAP, "w") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                + "\n".join(cat_urls) + "\n</urlset>\n")

    # fast inventory snapshot for js/main.js (no long descriptions)
    os.makedirs(os.path.dirname(OUT_SNAPSHOT), exist_ok=True)
    snap = []
    for t in trucks:
        row = {k: t[k] for k in SNAPSHOT_FIELDS if t.get(k) not in (None, "")}
        imgs = all_images(t)
        if imgs:
            row["images"] = imgs[:1]
        snap.append(row)
    with open(OUT_SNAPSHOT, "w") as f:
        json.dump({"trucks": snap, "builtAt": today}, f, separators=(",", ":"), ensure_ascii=False)

    # crawlable links inside /inventory (between the INVENTORY-INDEX markers)
    try:
        with open(INVENTORY_HTML) as f:
            inv = f.read()
        start, end = "<!-- INVENTORY-INDEX:START -->", "<!-- INVENTORY-INDEX:END -->"
        if start in inv and end in inv:
            a, b = inv.index(start) + len(start), inv.index(end)
            inv = inv[:a] + "\n" + inventory_index_html(trucks, slugs) + "\n  " + inv[b:]
            with open(INVENTORY_HTML, "w") as f:
                f.write(inv)
    except OSError as e:
        print(f"inventory index not written ({e})")

    with_img = sum(1 for t in trucks if cover_image(t))
    print(f"Wrote {written} /v/ pages → {os.path.abspath(OUT_PAGES)}")
    print(f"Wrote {len(trucks)} vehicle URLs ({with_img} with cover images) → {os.path.abspath(OUT_SITEMAP)}")
    print(f"Wrote {len(live_cats)} category pages: " + ", ".join(f"{c['slug']} ({c['_count']})" for c in live_cats))
    print(f"Wrote inventory snapshot ({len(snap)} vehicles) → {os.path.abspath(OUT_SNAPSHOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
