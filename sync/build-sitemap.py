#!/usr/bin/env python3
"""Generate site/sitemap-vehicles.xml — one <url> per listed vehicle.

Run before every Pages deploy so Google can discover all VDPs:
    python3 sync/build-sitemap.py

Fetches the live API (or falls back to /tmp/trucks.json) and writes
VDP URLs like https://dangm.ca/vehicle.html?id=<id> with today's lastmod.
"""
import json, os, sys, urllib.request, datetime

API = "https://eagle-ridge-trucks.fblister.workers.dev/api/trucks"
OUT = os.path.join(os.path.dirname(__file__), "..", "site", "sitemap-vehicles.xml")

def load_trucks():
    try:
        req = urllib.request.Request(API, headers={"User-Agent": "dangm-sitemap-builder/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
    except Exception as e:
        print(f"API fetch failed ({e}); falling back to /tmp/trucks.json")
        d = json.load(open("/tmp/trucks.json"))
    return d.get("trucks", d if isinstance(d, list) else [])

def main():
    trucks = [t for t in load_trucks() if t.get("listed") is not False and t.get("id")]
    today = datetime.date.today().isoformat()
    urls = "\n".join(
        f"  <url>\n    <loc>https://dangm.ca/vehicle.html?id={t['id']}</loc>\n"
        f"    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n"
        f"    <lastmod>{today}</lastmod>\n  </url>"
        for t in trucks
    )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{urls}\n</urlset>\n"
    )
    with open(OUT, "w") as f:
        f.write(xml)
    print(f"Wrote {len(trucks)} vehicle URLs → {os.path.abspath(OUT)}")

if __name__ == "__main__":
    sys.exit(main())
