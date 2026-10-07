#!/usr/bin/env python3
"""Build crawlable forum artifacts (hub-and-spoke) in one pass.

The forum is dynamic (D1 table `forum_posts`, served by /api/forum). A single
client-rendered page cannot rank per thread, so every post gets its own static
landing page with its own title, description and JSON-LD:

    site/forum/index.html          hub list (static, crawlable cards)
    site/forum/<slug>/index.html   one independent landing page per thread
    site/sitemap-forum.xml         one URL per thread

Run before every Pages deploy (same spot as build-sitemap.py):
    python3 sync/build-forum.py

Generated under site/forum/, which is gitignored: it only exists in pages-dist
after the deploy copy, exactly like the /v/ vehicle pages.
"""
import html
import json
import os
import re
import sys
import urllib.request
import datetime

API = "https://eagle-ridge-trucks.fblister.workers.dev/api/forum"
SITE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site")
OUT_HUB = os.path.join(SITE, "forum", "index.html")
OUT_THREADS = os.path.join(SITE, "forum")
OUT_SITEMAP = os.path.join(SITE, "sitemap-forum.xml")

BASE = "https://dangm.ca"
PHONE = "604-735-1396"
PHONE_HREF = "tel:6047351396"
TODAY = datetime.date.today().isoformat()
CSS_V = "25"
JS_V = "25"


def esc(s):
    return html.escape(str(s or ""), quote=True)


def clean_text(s):
    """House style: no em/en dashes (matches cleanText() in main.js + build-sitemap.py)."""
    return re.sub(r"\s{2,}", " ", re.sub(r"\s*[\u2014\u2013]\s*", ", ", str(s or ""))).strip()


def slugify(post):
    raw = str(post.get("id") or post.get("title") or "post").lower()
    return re.sub(r"[^a-z0-9]+", "-", raw).strip("-") or "post"


def load_posts():
    req = urllib.request.Request(API, headers={"User-Agent": "dangm-forum-builder/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    posts = d.get("posts", d if isinstance(d, list) else [])
    # Newest first (API already sorts, but be defensive) and keep only usable rows.
    posts = [p for p in posts if p.get("title")]
    return posts


def excerpt(body, n=150):
    t = clean_text(body).replace("\n", " ")
    return (t[:n].rstrip() + "…") if len(t) > n else t


def meta_title(p):
    return f"{clean_text(p.get('title'))} - Lower Mainland Auto Forum | DanGM"


def meta_desc(p):
    body = clean_text(p.get("body"))
    if body:
        return excerpt(body, 150)
    return (
        f"Join the discussion on '{clean_text(p.get('title'))}'. Expert automotive insights, "
        f"credit rebuilding, and financing tips for drivers in Metro Vancouver and the Tri-Cities."
    )


def body_paragraphs(body):
    return "".join(
        f"<p>{esc(clean_text(par))}</p>"
        for par in re.split(r"\n+", str(body or ""))
        if par.strip()
    )


def thread_jsonld(p, slug, url, title, desc, img):
    ld = {
        "@context": "https://schema.org",
        "@type": "DiscussionForumPosting",
        "@id": f"{url}#post",
        "url": url,
        "headline": clean_text(p.get("title")),
        "text": clean_text(p.get("body")),
        "description": desc,
        "image": img,
        "datePublished": (p.get("created_at") or TODAY)[:10],
        "dateModified": (p.get("updated_at") or p.get("created_at") or TODAY)[:10],
        "inLanguage": "en-CA",
        "author": {"@type": "Person", "name": "Dan", "jobTitle": "Personal GM Consultant", "url": f"{BASE}/about.html"},
        "publisher": {"@type": "AutoDealer", "@id": f"{BASE}/#business", "name": "DanGM", "url": BASE, "telephone": PHONE},
        "isPartOf": {"@type": "WebPage", "@id": f"{BASE}/forum/", "name": "Lower Mainland Auto Forum"},
        "about": {"@type": "Thing", "name": "Car buying and auto financing in Coquitlam, BC"},
    }
    return json.dumps(ld, ensure_ascii=False)


def breadcrumb_jsonld(title, url):
    return json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{BASE}/"},
                {"@type": "ListItem", "position": 2, "name": "Lower Mainland Auto Forum", "item": f"{BASE}/forum/"},
                {"@type": "ListItem", "position": 3, "name": clean_text(title), "item": url},
            ],
        },
        ensure_ascii=False,
    )


NAV = """  <nav class="nav scrolled" id="nav">
    <div class="nav-inner">
      <a href="/index.html" class="nav-logo">
        <img class="logo-mark logo-img" src="/images/logo.png" alt="DanGM logo, personal GM consultant in Coquitlam BC">
        <span class="logo-text">dangm<em>.ca</em></span>
      </a>
      <div class="nav-links">
        <a href="/index.html">Home</a>
        <a href="/inventory.html">Inventory</a>
        <a href="/blog/">Guides</a>
        <a href="/forum/" class="active">Forum</a>
        <a href="/about.html">About</a>
      </div>
      <button class="nav-toggle" id="navToggle" aria-label="Menu">☰</button>
      <a href="/inventory.html" class="nav-cta">View Inventory</a>
    </div>
  </nav>
"""

FOOTER = """  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <img class="logo-mark logo-img" src="/images/logo.png" alt="DanGM logo, personal GM consultant in Coquitlam BC">
        <span class="logo-text">dangm<em>.ca</em></span>
      </div>
      <p>© <span id="year"></span> dangm.ca. All rights reserved.</p>
      <nav class="footer-links" style="display:flex;flex-wrap:wrap;gap:1.5rem;justify-content:center;margin-top:14px" aria-label="Footer">
        <a href="/inventory.html">Inventory</a>
        <a href="/locations/">Locations</a>
        <a href="/locations/surrey/">Car Financing Surrey</a>
        <a href="/blog/">Car Buying Guides</a>
        <a href="/forum/">Forum</a>
        <a href="/about.html">About</a>
      </nav>
    </div>
  </footer>
"""

BOOT = """  <script>
    window.SITE_PAGE = 'landing';
    window.SITE_CONFIG = { apiBase: 'https://eagle-ridge-trucks.fblister.workers.dev/api' };
  </script>
  <script src="/js/main.js?v=%s"></script>
""" % JS_V


THREAD_TMPL = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" sizes="64x64" href="/images/favicon.png">
  <link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta name="keywords" content="Lower Mainland auto forum, car buying Coquitlam, bad credit car loans BC, new to Canada car financing, Tri-Cities, Vancouver, dangm.ca">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="geo.region" content="CA-BC">
  <meta name="geo.placename" content="Tri-Cities (Coquitlam, Port Coquitlam, Port Moody), Greater Vancouver, BC">
  <meta name="geo.position" content="49.2872;-122.8131">
  <meta name="ICBM" content="49.2872, -122.8131">
  <link rel="alternate" hreflang="en-CA" href="{url_rstrip}">
  <link rel="alternate" hreflang="x-default" href="{url_rstrip}">
  <link rel="canonical" href="{url_rstrip}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="DanGM">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:url" content="{url_rstrip}">
  <meta property="og:image" content="{img}">
  <meta property="og:locale" content="en_CA">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{desc}">
  <meta name="twitter:image" content="{img}">
  <script type="application/ld+json">{thread_ld}</script>
  <script type="application/ld+json">{breadcrumb_ld}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/styles.css?v={css_v}">
</head>
<body class="page-vehicle">
{nav}
  <main class="vehicle-main" id="forumPost">
    <article class="forum-post">
      <a href="/forum/" class="vdp-back">&larr; Back to the Lower Mainland Auto Forum</a>
      <p class="eyebrow">LOWER MAINLAND AUTO FORUM · COQUITLAM &amp; TRI-CITIES, BC</p>
      <h1 class="forum-post-title">{h1}</h1>
      <p class="lead-note">Asked and answered by Dan · Personal GM Consultant, Coquitlam BC · Updated {today}</p>
      <div class="forum-post-body">
        {body}
      </div>
      <div class="forum-post-cta">
        <a href="{phone_href}" class="btn btn-primary">Call {phone}</a>
        <a href="/#lead" class="btn btn-ghost">Apply for financing approval</a>
      </div>
      <p>Want a straight answer about your own situation in the Tri-Cities or Metro Vancouver? <a href="/#lead">Ask Dan directly</a>, or browse the <a href="/inventory.html">current Eagle Ridge GM inventory</a> in Coquitlam first.</p>
      <h2>More from the Lower Mainland Auto Forum</h2>
      <ul>
        {related}
      </ul>
      <p>DanGM is a personal GM consultant working in partnership with <a href="https://eagleridgegm.com" rel="noopener">Eagle Ridge GM</a> at 2595 Barnet Hwy, Coquitlam, BC. Serving Coquitlam, Port Coquitlam, Port Moody, Burnaby, New Westminster, Surrey, and Vancouver.</p>
    </article>
  </main>
{footer}
{boot}
</body>
</html>
"""

HUB_TMPL = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" sizes="64x64" href="/images/favicon.png">
  <link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lower Mainland Auto Forum, Car Buying &amp; Credit Q&amp;A | DanGM</title>
  <meta name="description" content="Real answers to Lower Mainland car buying questions: bad credit financing, bankruptcy, new-to-Canada programs, and trade-ins in Coquitlam, the Tri-Cities, and Metro Vancouver. Call 604-735-1396.">
  <meta name="keywords" content="Lower Mainland auto forum, car buying Coquitlam, bad credit car financing BC, new to Canada car loans, bankruptcy car loan, Tri-Cities, Vancouver, dangm.ca">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="geo.region" content="CA-BC">
  <meta name="geo.placename" content="Tri-Cities (Coquitlam, Port Coquitlam, Port Moody), Greater Vancouver, BC">
  <meta name="geo.position" content="49.2872;-122.8131">
  <meta name="ICBM" content="49.2872, -122.8131">
  <link rel="alternate" hreflang="en-CA" href="{BASE}/forum/">
  <link rel="alternate" hreflang="x-default" href="{BASE}/forum/">
  <link rel="canonical" href="{BASE}/forum/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="DanGM">
  <meta property="og:title" content="Lower Mainland Auto Forum, Car Buying &amp; Credit Q&amp;A | DanGM">
  <meta property="og:description" content="Real answers to Lower Mainland car buying questions: bad credit, bankruptcy, new-to-Canada programs, and trade-ins in Coquitlam and the Tri-Cities.">
  <meta property="og:url" content="{BASE}/forum/">
  <meta property="og:image" content="{BASE}/images/banners/zero-pressure-used-car-buying-coquitlam.svg">
  <meta property="og:locale" content="en_CA">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Lower Mainland Auto Forum, Car Buying &amp; Credit Q&amp;A | DanGM">
  <meta name="twitter:description" content="Real answers to Lower Mainland car buying questions in Coquitlam and the Tri-Cities.">
  <meta name="twitter:image" content="{BASE}/images/banners/zero-pressure-used-car-buying-coquitlam.svg">
  <script type="application/ld+json">{itemlist_ld}</script>
  <script type="application/ld+json">{breadcrumb_ld}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/styles.css?v={css_v}">
</head>
<body class="page-inventory">
{nav}
  <header class="page-hero" id="top">
    <div class="page-hero-bg"></div>
    <div class="page-hero-content">
      <p class="hero-eyebrow reveal visible">CAR BUYING &amp; CREDIT Q&amp;A · VANCOUVER &amp; TRI-CITIES, BC</p>
      <h1 class="page-hero-title reveal visible">The Lower Mainland Auto Forum</h1>
      <p class="page-hero-sub reveal visible">Straight answers to the car buying and financing questions drivers ask most in Coquitlam, the Tri-Cities, and Metro Vancouver.</p>
    </div>
  </header>

  <section class="inventory" id="forum">
    <div class="forum-grid" id="forumList">
      {cards}
    </div>
    <div style="text-align:center;margin:36px auto 0;max-width:820px">
      <img src="/images/banners/zero-pressure-used-car-buying-coquitlam.svg" alt="zero-pressure-used-car-buying-coquitlam" width="800" height="450" style="max-width:100%;height:auto;border-radius:16px" loading="lazy">
      <p style="margin-top:24px">Have a question that is not answered here? <a href="/#lead">Ask Dan directly</a> or call 604-735-1396. Zero pressure, honest answers, every time.</p>
    </div>
  </section>
{footer}
{boot}
</body>
</html>
"""


def render_thread(p, slug, related):
    url = f"{BASE}/forum/{slug}/"
    title = meta_title(p)
    desc = meta_desc(p)
    img = p.get("image") or f"{BASE}/images/banners/zero-pressure-used-car-buying-coquitlam.svg"
    rel_html = "\n        ".join(
        f'<li><a href="/forum/{r_slug}/">{esc(clean_text(r["title"]))}</a></li>'
        for r_slug, r in related
    ) or "<li>No other threads yet.</li>"
    return THREAD_TMPL.format(
        title=esc(title),
        desc=esc(desc),
        url_rstrip=url.rstrip("/"),
        img=esc(img),
        thread_ld=thread_jsonld(p, slug, url, title, desc, img),
        breadcrumb_ld=breadcrumb_jsonld(p.get("title"), url),
        nav=NAV,
        h1=esc(clean_text(p.get("title"))),
        body=body_paragraphs(p.get("body")),
        today=TODAY,
        phone=PHONE,
        phone_href=PHONE_HREF,
        related=rel_html,
        footer=FOOTER,
        boot=BOOT,
        css_v=CSS_V,
    )


def render_hub(posts, slugs):
    cards = "\n      ".join(
        f'<a class="forum-card reveal in-view" href="/forum/{slugs[i]}/">\n'
        + (f'        <div class="forum-card-img-wrap"><img class="forum-card-img" src="{esc(p.get("image"))}" alt="{esc(clean_text(p.get("title")))}" loading="lazy"></div>\n' if p.get("image") else "")
        + '        <div class="forum-card-body">\n'
        f'          <h2 class="forum-card-title">{esc(clean_text(p.get("title")))}</h2>\n'
        f'          <p class="forum-card-sub">{esc(excerpt(p.get("body"), 160))}</p>\n'
        '          <span class="forum-card-cta">Read the thread →</span>\n'
        '        </div>\n      </a>'
        for i, p in enumerate(posts)
    )
    itemlist_ld = json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "name": clean_text(p.get("title")), "url": f"{BASE}/forum/{slugs[i]}/"}
                for i, p in enumerate(posts)
            ],
        },
        ensure_ascii=False,
    )
    breadcrumb_ld = json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{BASE}/"},
                {"@type": "ListItem", "position": 2, "name": "Lower Mainland Auto Forum", "item": f"{BASE}/forum/"},
            ],
        },
        ensure_ascii=False,
    )
    return HUB_TMPL.format(
        BASE=BASE,
        css_v=CSS_V,
        nav=NAV,
        cards=cards,
        itemlist_ld=itemlist_ld,
        breadcrumb_ld=breadcrumb_ld,
        footer=FOOTER,
        boot=BOOT,
    )


def main():
    try:
        posts = load_posts()
    except Exception as e:
        # Non-fatal: the forum is a progressive enhancement. A transient API
        # blip must never fail the hourly inventory deploy, so exit 0 and skip.
        print(f"Forum API fetch failed ({e}); skipping forum page build this run")
        return 0

    slugs = [slugify(p) for p in posts]
    os.makedirs(OUT_THREADS, exist_ok=True)

    urls = []
    written = 0
    for i, p in enumerate(posts):
        slug = slugs[i]
        # Pick 3 other threads for internal linking (wrap around the list).
        related = [(slugs[j], posts[j]) for j in range(len(posts)) if j != i][:3]
        d = os.path.join(OUT_THREADS, slug)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(render_thread(p, slug, related))
        urls.append(
            f"  <url>\n    <loc>{BASE}/forum/{slug}/</loc>\n"
            f"    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n"
            f"    <lastmod>{TODAY}</lastmod>\n  </url>"
        )
        written += 1

    with open(OUT_HUB, "w", encoding="utf-8") as f:
        f.write(render_hub(posts, slugs))

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>\n"
    )
    with open(OUT_SITEMAP, "w", encoding="utf-8") as f:
        f.write(xml)

    print(f"Wrote {written} forum threads + hub -> {os.path.abspath(OUT_THREADS)}")
    print(f"Wrote {len(posts)} forum URLs -> {os.path.abspath(OUT_SITEMAP)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
