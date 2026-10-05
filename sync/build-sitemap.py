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
    return e[:40].rstrip() if e else ""


def name_str(t):
    return clean_text(" ".join(str(t.get(k) or "").strip() for k in ("year", "make", "model", "trim")))


def title_str(t):
    # Google truncates ~60 chars; the " for Sale in BC | dangm.ca" suffix is 27.
    # Drop the trim when the full name would overflow.
    name = name_str(t)
    if len(name) + 27 > 65:
        name = clean_text(" ".join(str(t.get(k) or "").strip() for k in ("year", "make", "model")))
    return f"{name} for Sale in BC | dangm.ca"


def seo_text(t):
    price = price_str(t)
    km = f" {int(t['mileage']):,} km." if t.get("mileage") else ""
    eng = f" {engine_short(t)}." if engine_short(t) else ""
    return (
        f"{name_str(t)} for sale at dangm.ca in Coquitlam, BC. {price}{eng}{km} "
        f"Inspected and ready for the road. Call {PHONE}."
    )


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
        ("Stock #", t.get("id")),
    ]
    return [(k, v) for k, v in rows if v]


def vehicle_jsonld(t, page_url, title, desc, img):
    mileage = (
        {"@type": "QuantitativeValue", "value": str(t["mileage"]), "unitText": "KM"}
        if t.get("mileage")
        else None
    )
    ld = {
        "@context": "https://schema.org",
        "@type": "Vehicle",
        "name": title.split(" | ")[0],
        "description": desc,
        "image": img or "",
        "offers": {
            "@type": "Offer",
            "price": str(price_num(t) or ""),
            "priceCurrency": "CAD",
            "availability": "https://schema.org/InStock",
        },
        "vehicleIdentificationNumber": t.get("vin") or "",
        "productionDate": str(t.get("year") or ""),
        "mileageFromOdometer": mileage,
        "vehicleEngine": {"name": t["engine"]} if t.get("engine") else None,
        "vehicleTransmission": t.get("transmission") or "",
        "fuelType": t.get("fuelType") or "",
        "color": t.get("exteriorColor") or "",
        "seller": {
            "@type": "LocalBusiness",
            "@id": f"{BASE}/#business",
            "name": "DanGM",
            "telephone": PHONE,
            "address": {
                "@type": "PostalAddress",
                "streetAddress": "2595 Barnet Hwy",
                "addressRegion": "BC",
                "addressLocality": "Coquitlam",
                "postalCode": "V3E 1K9",
                "addressCountry": "CA",
            },
        },
    }
    ld = {k: v for k, v in ld.items() if v not in (None, "")}
    return json.dumps(ld, ensure_ascii=False)


BREADCRUMB_LD = json.dumps(
    {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{BASE}/"},
            {"@type": "ListItem", "position": 2, "name": "Inventory", "item": f"{BASE}/inventory"},
            {"@type": "ListItem", "position": 3, "name": "Vehicle"},
        ],
    },
    ensure_ascii=False,
)


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
  <meta property="og:site_name" content="dangm.ca">
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
  <link rel="stylesheet" href="{base_rel}css/styles.css?v=24">
</head>
<body class="page-vehicle">
  <nav class="nav scrolled">
    <div class="nav-inner">
      <a href="{base_rel}index.html" class="nav-logo">
        <img class="logo-mark logo-img" src="{base_rel}images/logo.png" alt="dangm.ca logo">
        <span class="logo-text">dangm<em>.ca</em></span>
      </a>
      <div class="nav-links">
        <a href="{base_rel}index.html">Home</a>
        <a href="{base_rel}inventory.html" class="active">Inventory</a>
        <a href="{base_rel}forum.html">Forum</a>
        <a href="{base_rel}about.html">About</a>
      </div>
      <a href="{base_rel}inventory.html" class="nav-cta">View Inventory</a>
    </div>
  </nav>
  <main class="vehicle-main">
    <div class="vdp-hero">
      <a href="{base_rel}inventory.html" class="vdp-back">&larr; Back to inventory</a>
      <h1 class="vdp-title">{h1}</h1>
      <div class="vdp-price">{price}</div>
    </div>
    <div class="vdp-layout">
      <div class="vdp-gallery-col">
        <img src="{img}" alt="{h1} at dangm.ca, Coquitlam BC" loading="lazy" style="width:100%;border-radius:12px;">
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
          <a href="{base_rel}vehicle.html?id={stock}" class="btn">Open interactive gallery</a>
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
      <nav class="footer-links" style="display:flex;flex-wrap:wrap;gap:1.5rem;justify-content:center;margin-top:14px" aria-label="Footer">
        <a href="{base_rel}inventory.html">Inventory</a>
        <a href="{base_rel}locations/surrey/">Car Financing Surrey</a>
        <a href="{base_rel}blog/">Car Buying Guides</a>
        <a href="{base_rel}forum.html">Forum</a>
        <a href="{base_rel}about.html">About</a>
      </nav>
    </div>
  </footer>
</body>
</html>
"""


def render_page(t, slug, today):
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
    desc_block = (
        f'    <div class="vdp-desc"><h2>About this vehicle</h2><p>{esc(clean_text(t.get("description")))}</p></div>'
        if t.get("description")
        else ""
    )
    return PAGE_TMPL.format(
        base_rel="../../",
        title=esc(title),
        desc=esc(desc),
        page_url=esc(slug_url),
        img=esc(img),
        vehicle_ld=vehicle_jsonld(t, slug_url, title, desc, img),
        breadcrumb_ld=BREADCRUMB_LD.replace(
            '{"@type": "ListItem", "position": 3, "name": "Vehicle"}',
            f'{{"@type": "ListItem", "position": 3, "name": {json.dumps(h1)}, "item": {json.dumps(slug_url)}}}',
        ),
        h1=esc(h1),
        price=esc(price),
        rows=rows,
        phone=PHONE,
        phone_href=PHONE_HREF,
        stock=esc(str(t.get("id"))),
        desc_block=desc_block,
        year_now=today[:4],
    )


def main():
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    trucks = [t for t in load_trucks() if t.get("listed") is not False and t.get("id")]
    if limit:
        trucks = trucks[:limit]
    today = datetime.date.today().isoformat()

    os.makedirs(OUT_PAGES, exist_ok=True)
    written = 0
    urls = []
    for t in trucks:
        slug = slugify(t)
        page_dir = os.path.join(OUT_PAGES, slug)
        os.makedirs(page_dir, exist_ok=True)
        with open(os.path.join(page_dir, "index.html"), "w") as f:
            f.write(render_page(t, slug, today))
        img = cover_image(t)
        image_tag = (
            "    <image:image>\n"
            f"      <image:loc>{html.escape(img)}</image:loc>\n"
            "    </image:image>\n"
        ) if img else ""
        urls.append(
            f"  <url>\n"
            f"    <loc>{BASE}/v/{slug}/</loc>\n"
            f"    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n"
            f"    <lastmod>{today}</lastmod>\n"
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

    with_img = sum(1 for t in trucks if cover_image(t))
    print(f"Wrote {written} /v/ pages → {os.path.abspath(OUT_PAGES)}")
    print(f"Wrote {len(trucks)} vehicle URLs ({with_img} with cover images) → {os.path.abspath(OUT_SITEMAP)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
