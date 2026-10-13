// Picks the hero vehicle: the most expensive listed truck.
// 1. data/hero.json, baked hourly by sync/build-hero.py (tiny, fast, cacheable)
// 2. live API fallback (the full ~1 MB inventory, only if hero.json is missing)

const API_BASE = (window.SITE_CONFIG?.apiBase || '').replace(/\/+$/, '');

// eDealer photos are 1200x1200 PNGs with an Eagle Ridge banner on top and an
// AutoVerify strip at the bottom. sync/build-hero.py bakes cropped WebP copies
// (heroImages); if those are missing the raw photos are cropped in CSS
// (.xh-img--stamped in home.css). Admin-cleaned customImages are left as-is.

export function priceNum(p) {
  const n = parseFloat(String(p ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : -Infinity;
}

export function formatPrice(p) {
  const n = priceNum(p);
  return n > 0 ? `$${Math.round(n).toLocaleString('en-CA')}` : 'Call for price';
}

// MUST match main.js vdpHref() and sync/build-sitemap.py slugify().
export function vdpHref(t) {
  const base = [t.year, t.make, t.model, t.trim].map((v) => String(v || '').trim()).join(' ').trim();
  const stock = String(t.id || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const name = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'vehicle';
  return `v/${name}-stock-${stock}/`;
}

function titleCase(s) {
  return String(s || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function shapeTruck(t) {
  if (!t) return null;
  const custom = Array.isArray(t.customImages) && t.customImages.length ? t.customImages : null;
  const all = (custom || t.images || []).filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));
  const baked = Array.isArray(t.heroImages) && t.heroImages.length
    ? t.heroImages.filter((p) => p && typeof p.src === 'string').slice(0, 5)
    : null;
  if (!all.length && !baked) return null;
  const km = parseInt(String(t.mileage || '').replace(/[^0-9]/g, ''), 10);
  return {
    id: t.id,
    year: t.year,
    make: t.make,
    model: t.model,
    trim: t.trim,
    name: [t.year, t.make, t.model].filter(Boolean).join(' '),
    price: formatPrice(t.price),
    engine: String(t.engine || '').replace(/V-Shaped\s*(\d+)-cyl/i, 'V$1').trim(),
    drivetrain: String(t.drivetrain || '').trim().toUpperCase(),
    color: titleCase(t.exteriorColor),
    mileage: Number.isFinite(km) ? (km < 100 ? 'Brand new' : `${km.toLocaleString('en-CA')} km`) : '',
    // Dealer photo order is a walk-around: front 3/4, front, side, rear 3/4, rear.
    // Prefer the optimised WebP crops baked by sync/build-hero.py.
    orbit: baked || all.slice(0, 5).map((src) => ({ src })),
    href: vdpHref(t),
    stamped: !custom && !baked,
  };
}

function pickTop(list) {
  return list
    .filter((t) => t && t.listed !== false)
    .reduce((best, t) => (priceNum(t.price) > priceNum(best?.price) ? t : best), null);
}

async function getJSON(url, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function loadHeroTruck() {
  try {
    const d = await getJSON('data/hero.json', 5000);
    const t = shapeTruck(d.truck);
    if (t) return t;
  } catch (_) { /* fall through to the live API */ }
  try {
    const d = await getJSON(`${API_BASE}/trucks`, 12000);
    return shapeTruck(pickTop(Array.isArray(d) ? d : d.trucks || []));
  } catch (_) {
    return null;
  }
}

export const PHOTO_SIZES = '(max-width: 820px) 92vw, min(54vw, 820px)';

// Resolves when the image is decoded (or failed: never blocks the page).
// Uses the same srcset/sizes as the <img>, so the browser caches the very
// candidate the page will ask for.
export function preload(photo, sizes = PHOTO_SIZES) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    if (photo.srcset) { img.sizes = sizes; img.srcset = photo.srcset; }
    img.onload = () => (img.decode ? img.decode().catch(() => {}).then(() => resolve(true)) : resolve(true));
    img.onerror = () => resolve(false);
    img.src = photo.src;
  });
}

// The Gemini illustration only stands in for the listing photos while the
// hero truck is the model it depicts (see hero/tools/process-art.py).
export function matchesArt(t, match) {
  if (!t || !match) return false;
  const has = (v, want) => String(v || '').toLowerCase().includes(String(want).toLowerCase());
  return has(t.make, match.make) && has(t.model, match.model) && has(t.trim, match.trim) && has(t.color, match.color);
}
