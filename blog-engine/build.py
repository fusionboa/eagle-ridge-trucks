#!/usr/bin/env python3
"""Blog engine: renders blog-engine/posts/*.py into static /blog/<slug>/ pages.

Independent from the main site build (sync/build-sitemap.py). Run:
    python3 blog-engine/build.py
Outputs: site/blog/<slug>/index.html + site/sitemap-blog.xml + refreshes the
cards in site/blog/index.html between <!--POSTS:START--> markers.
"""
import html, importlib.util, json, os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
POSTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "posts")
BASE = "https://dangm.ca"
TODAY = datetime.date.today().isoformat()

def esc(s): return html.escape(str(s), quote=True)

def load_post(path):
    spec = importlib.util.spec_from_file_location("post_" + os.path.basename(path)[:-3], path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.POST

def render_table(t):
    head = "".join(f"<th>{esc(h)}</th>" for h in t["headers"])
    rows = "".join("<tr>" + "".join(f"<td>{esc(c)}</td>" for c in r) + "</tr>" for r in t["rows"])
    return f'<div class="tbl-wrap"><table class="cmp-table"><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>'

def render_section(s):
    h2, blocks = s
    out = [f"<h2>{esc(h2)}</h2>"]
    for b in blocks:
        if isinstance(b, tuple) and b[0] == "ul":
            out.append("<ul>" + "".join(f"<li>{esc(i)}</li>" for i in b[1]) + "</ul>")
        elif isinstance(b, dict):
            out.append(render_table(b))
        elif isinstance(b, tuple) and b[0] == "raw":
            out.append(b[1])
        else:
            out.append(f"<p>{esc(b)}</p>")
    return "\n".join(out)

def render_post(p):
    slug, title, desc, h1 = p["slug"], p["title"], p["desc"], p["h1"]
    img = f"{BASE}/images/banners/{p['img']}"
    url = f"{BASE}/blog/{slug}/"
    article_ld = json.dumps({
        "@context": "https://schema.org", "@type": "Article",
        "headline": h1, "description": desc, "image": img,
        "datePublished": p.get("date", TODAY), "dateModified": TODAY,
        "mainEntityOfPage": url,
        "author": {"@type": "Person", "name": "Dan", "jobTitle": "Personal GM Consultant", "url": f"{BASE}/about"},
        "publisher": {"@type": "AutoDealer", "@id": f"{BASE}/#business", "name": "DanGM", "url": BASE, "telephone": "604-735-1396"},
    }, ensure_ascii=False)
    faq_ld = json.dumps({
        "@context": "https://schema.org", "@type": "FAQPage",
        "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in p["faq"]],
    }, ensure_ascii=False)
    bc_ld = json.dumps({
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{BASE}/"},
            {"@type": "ListItem", "position": 2, "name": "Car Buying Guides", "item": f"{BASE}/blog"},
            {"@type": "ListItem", "position": 3, "name": h1, "item": url},
        ],
    }, ensure_ascii=False)
    body = "\n".join(render_section(s) for s in p["sections"])
    faq_html = "\n".join(
        f'<details class="faq-item"><summary class="faq-q">{esc(q)}</summary><p class="faq-a">{esc(a)}</p></details>'
        for q, a in p["faq"])
    related = "\n".join(f'<li><a href="{esc(u)}">{esc(l)}</a></li>' for l, u in p["related"])
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" sizes="64x64" href="/images/favicon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="geo.region" content="CA-BC">
  <meta name="geo.placename" content="Metro Vancouver, BC">
  <link rel="alternate" hreflang="en-CA" href="{url.rstrip('/')}">
  <link rel="alternate" hreflang="x-default" href="{url.rstrip('/')}">
  <link rel="canonical" href="{url.rstrip('/')}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="DanGM">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(desc)}">
  <meta property="og:url" content="{url.rstrip('/')}">
  <meta property="og:image" content="{img}">
  <meta property="og:locale" content="en_CA">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(desc)}">
  <meta name="twitter:image" content="{img}">
  <script type="application/ld+json">{article_ld}</script>
  <script type="application/ld+json">{faq_ld}</script>
  <script type="application/ld+json">{bc_ld}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/styles.css?v=24">
</head>
<body class="page-vehicle">
  <nav class="nav scrolled" id="nav">
    <div class="nav-inner">
      <a href="/index.html" class="nav-logo">
        <img class="logo-mark logo-img" src="/images/logo.png" alt="DanGM logo, personal GM consultant in Coquitlam BC">
        <span class="logo-text">dangm<em>.ca</em></span>
      </a>
      <div class="nav-links">
        <a href="/index.html">Home</a>
        <a href="/inventory.html">Inventory</a>
        <a href="/blog/" class="active">Guides</a>
        <a href="/forum.html">Forum</a>
        <a href="/about.html">About</a>
      </div>
      <button class="nav-toggle" id="navToggle" aria-label="Menu">☰</button>
      <a href="/inventory.html" class="nav-cta">View Inventory</a>
    </div>
  </nav>

  <main class="vehicle-main">
    <article class="forum-post">
      <a href="/blog/" class="vdp-back">&larr; All car buying guides</a>
      <p class="eyebrow">CAR BUYING GUIDE · {esc(p.get("kicker", "COMPARISON"))}</p>
      <h1 class="forum-post-title">{esc(h1)}</h1>
      <p class="lead-note">By Dan · Personal GM Consultant, Coquitlam BC · Updated {TODAY}</p>
      <img class="forum-post-img" src="{img}" alt="{esc(p.get("img_alt", h1))}" width="800" height="450" style="max-width:100%;height:auto;border-radius:16px" loading="lazy">
      <div class="forum-post-body">
        <p>{esc(p["hook"])}</p>
        {body}
        <div class="vdp-details" style="margin-top:28px"><h2>The verdict, in one line</h2><p><strong>{esc(p["verdict_line"])}</strong></p></div>
        <div class="forum-post-cta">
          <a href="tel:6047351396" class="btn btn-primary">Call 604-735-1396</a>
          <a href="/#lead" class="btn btn-ghost">Apply for Financing Approval</a>
        </div>
        <h2>Frequently asked questions</h2>
        <div class="faq-grid">{faq_html}</div>
        <h2>Keep reading</h2>
        <ul>{related}</ul>
        <p>Every vehicle mentioned here is live in the <a href="/inventory.html">current Eagle Ridge GM inventory</a>. Want the short version for your situation? <a href="/#lead">Ask Dan directly</a>, or call 604-735-1396.</p>
      </div>
    </article>
  </main>

  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <img class="logo-mark logo-img" src="/images/logo.png" alt="DanGM logo, personal GM consultant in Coquitlam BC">
        <span class="logo-text">dangm<em>.ca</em></span>
      </div>
      <p>© <span id="year"></span> dangm.ca. All rights reserved.</p>
      <nav class="footer-links" style="display:flex;flex-wrap:wrap;gap:1.5rem;justify-content:center;margin-top:14px" aria-label="Footer">
        <a href="/inventory.html">Inventory</a>
        <a href="/locations/surrey/">Car Financing Surrey</a>
        <a href="/blog/">Car Buying Guides</a>
        <a href="/forum.html">Forum</a>
        <a href="/about.html">About</a>
      </nav>
    </div>
  </footer>

  <script>
    window.SITE_PAGE = 'landing';
    window.SITE_CONFIG = {{ apiBase: 'https://eagle-ridge-trucks.fblister.workers.dev/api' }};
  </script>
  <script src="/js/main.js?v=24"></script>
</body>
</html>
'''

def main():
    posts = sorted(
        (load_post(os.path.join(POSTS_DIR, f)) for f in os.listdir(POSTS_DIR) if f.endswith(".py") and not f.startswith("_")),
        key=lambda x: x.get("order", 0))
    urls, cards = [], []
    for p in posts:
        d = os.path.join(SITE, "blog", p["slug"])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(render_post(p))
        urls.append(f"  <url>\n    <loc>{BASE}/blog/{p['slug']}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n    <lastmod>{TODAY}</lastmod>\n  </url>")
        cards.append(
            f'      <a class="forum-card reveal" href="/blog/{p["slug"]}/">\n'
            f'        <div class="forum-card-img-wrap"><img class="forum-card-img" src="/images/banners/{p["img"]}" alt="{esc(p.get("img_alt", p["h1"]))}" loading="lazy"></div>\n'
            f'        <div class="forum-card-body">\n'
            f'          <h2 class="forum-card-title">{esc(p["h1"])}</h2>\n'
            f'          <p class="forum-card-sub">{esc(p["card_blurb"])}</p>\n'
            f'          <span class="forum-card-cta">Read the comparison →</span>\n'
            f'        </div>\n      </a>')
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           + "\n".join(urls) + "\n</urlset>\n")
    with open(os.path.join(SITE, "sitemap-blog.xml"), "w", encoding="utf-8") as f:
        f.write(xml)
    idx_path = os.path.join(SITE, "blog", "index.html")
    idx = open(idx_path, encoding="utf-8").read()
    block = "<!--POSTS:START-->\n" + "\n".join(cards) + "\n      <!--POSTS:END-->"
    if "<!--POSTS:START-->" in idx:
        idx = re.sub(r"<!--POSTS:START-->.*?<!--POSTS:END-->", block.replace("\\", "\\\\"), idx, flags=re.S)
    else:
        idx = idx.replace('<div class="forum-grid" id="guideList">', '<div class="forum-grid" id="guideList">\n' + block)
    with open(idx_path, "w", encoding="utf-8") as f:
        f.write(idx)
    print(f"Built {len(posts)} posts, sitemap-blog.xml, refreshed blog index cards")

if __name__ == "__main__":
    sys.exit(main())
