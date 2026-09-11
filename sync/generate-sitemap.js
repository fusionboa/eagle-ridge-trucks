#!/usr/bin/env node
// generate-sitemap.js — pulls all LISTED trucks from the live worker API and
// writes site/sitemap-vehicles.xml (one <url> per vehicle) + site/sitemap-index.xml
// (index of all three sitemaps). Run before every Pages deploy:
//   node sync/generate-sitemap.js
// Why: vehicle pages are client-rendered (?id=...) so Google can't discover
// them by crawling — the sitemap is the only way they get indexed.

const fs = require('fs');
const path = require('path');

const API = process.env.API_BASE || 'https://eagle-ridge-trucks.fblister.workers.dev/api';
const SITE = 'https://dangm.ca';
const OUT = path.join(__dirname, '..', 'site');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function main() {
  const res = await fetch(`${API}/trucks`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const { trucks } = await res.json();
  const listed = (trucks || []).filter((t) => t && t.listed !== false);
  const today = new Date().toISOString().slice(0, 10);

  const urls = listed
    .map((t) => {
      const id = encodeURIComponent(t.id);
      const title = [t.year, t.make, t.model, t.trim].filter(Boolean).join(' ');
      const img = t.images && t.images[0] ? t.images[0] : '';
      const imgTag = /^https?:\/\//i.test(img)
        ? `\n    <image:image><image:loc>${esc(img)}</image:loc><image:title>${esc(title)}</image:title></image:image>`
        : '';
      return `  <url>
    <loc>${SITE}/vehicle.html?id=${id}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
    <lastmod>${today}</lastmod>${imgTag}
  </url>`;
    })
    .join('\n');

  const vehiclesXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`;
  fs.writeFileSync(path.join(OUT, 'sitemap-vehicles.xml'), vehiclesXml);

  const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${SITE}/sitemap.xml</loc></sitemap>
  <sitemap><loc>${SITE}/sitemap-vehicles.xml</loc></sitemap>
  <sitemap><loc>${SITE}/sitemap-images.xml</loc></sitemap>
</sitemapindex>
`;
  fs.writeFileSync(path.join(OUT, 'sitemap-index.xml'), indexXml);

  console.log(`sitemap-vehicles.xml: ${listed.length} vehicle URLs`);
  console.log('sitemap-index.xml: 3 sitemaps indexed');
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
