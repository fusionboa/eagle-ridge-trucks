// ============================================================
// dangm.ca — Storefront JS
// Loads trucks from the API, renders the inventory list (dealership-
// style horizontal cards), the home flagship grid, and the vehicle
// detail page (VDP) with a payment calculator.
// ============================================================

// API_BASE is the worker root (no trailing /api) — fetches append their own path.
const API_BASE = (window.SITE_CONFIG?.apiBase || '').replace(/\/+$/, '');
const DATA_FALLBACK = 'data/trucks.json';

// Page mode: 'home' | 'inventory' | 'vehicle'
const PAGE = window.SITE_PAGE || 'home';
const FLAGSHIP_COUNT = 3;

let allTrucks = [];

// ─── Load trucks (home + inventory) ────────────────────────
async function loadTrucks() {
  try {
    const res = await fetch(`${API_BASE}/trucks`);
    if (!res.ok) throw new Error('API failed');
    const data = await res.json();
    allTrucks = normalizeTrucks(Array.isArray(data) ? data : data.trucks || []);
  } catch (e) {
    try {
      const res = await fetch(DATA_FALLBACK);
      const data = await res.json();
      allTrucks = normalizeTrucks(Object.values(data).filter((t) => t.listed));
    } catch (e2) {
      console.error('Could not load trucks', e2);
    }
  }
  renderAll();
  updateStatCount();
}

// ─── Load a single vehicle (VDP) ───────────────────────────
async function loadVehicle() {
  const id = new URLSearchParams(location.search).get('id');
  const el = document.getElementById('vehicleContent');
  if (!id) {
    el.innerHTML = '<div class="empty">No vehicle specified. <a href="inventory.html">Browse inventory</a></div>';
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/trucks/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    const t = normalizeTrucks([data.truck])[0];
    if (!t) throw new Error('not found');
    renderVehicle(t);
  } catch (e) {
    el.innerHTML = '<div class="empty">Vehicle not found. <a href="inventory.html">Browse inventory</a></div>';
  }
}

// Keep every field; just normalize the image list.
function normalizeTrucks(trucks) {
  return trucks
    .filter((t) => t && t.listed !== false)
    .map((t) => ({
      ...t,
      images: (t.customImages && t.customImages.length ? t.customImages : t.images || []).map(resolveImage),
    }));
}

function resolveImage(img) {
  if (/^https?:\/\//i.test(img)) return img;
  return `data/${img}`;
}

// Shared price helper ("34544 CAD" → 34544)
function priceNum(p) {
  const n = parseFloat(String(p).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? -Infinity : n;
}
function formatPrice(p) {
  const n = priceNum(p);
  return n <= 0 ? 'Call for price' : `$${n.toLocaleString()}`;
}

// ─── Attribute tags (the dealership pill-style spec chips) ──
function buildTags(t) {
  const tags = [];
  if (t.mileage) tags.push(`${Number(t.mileage).toLocaleString()} km`);
  if (t.bodyStyle) tags.push(t.bodyStyle);
  if (t.transmission) tags.push(t.transmission);
  if (t.drivetrain) tags.push(t.drivetrain);
  if (t.engine) tags.push(t.engine);
  if (t.fuelType) tags.push(t.fuelType);
  if (t.exteriorColor) tags.push(t.exteriorColor);
  return tags;
}
function tagsHTML(t, extraClass = '') {
  const tags = buildTags(t);
  if (!tags.length) return '';
  return `<div class="tags ${extraClass}">${tags.map((x) => `<span class="tag">${escapeHtml(x)}</span>`).join('')}</div>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Strip em/en dashes (AI prose loves them; they read unprofessional) → comma.
function cleanText(s) {
  return String(s || '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Static VDP path for a vehicle — MUST match sync/build-sitemap.py slugify():
// base = year make model trim (lowercased, non-alnum → dash), then "-stock-<id>".
// Cards link here so Googlebot can crawl into every VDP without the sitemap.
function vdpHref(t) {
  const base = [t.year, t.make, t.model, t.trim].map((v) => String(v || '').trim()).join(' ').trim();
  const stock = String(t.id || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const name = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'vehicle';
  return `v/${name}-stock-${stock}/`;
}

// ─── Dynamic SEO meta tag updater ──────────────────────────
function updateMeta(name, content) {
  // Try property first (OG), then name (standard meta, twitter)
  let el = document.querySelector(`meta[property="${name}"]`);
  if (!el) el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    if (name.startsWith('og:')) el.setAttribute('property', name);
    else el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

// ─── Vehicle JSON-LD structured data ───────────────────────
function addVehicleJSONLD(t, title, price, desc, imgs, vin, year) {
  const existing = document.querySelector('script[type="application/ld+json"][data-dynamic="vehicle"]');
  if (existing) existing.remove();
  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.setAttribute('data-dynamic', 'vehicle');
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Vehicle',
    name: title,
    description: desc,
    image: imgs.length ? imgs[0] : '',
    offers: {
      '@type': 'Offer',
      price: priceNum(t.price).toString(),
      priceCurrency: 'CAD',
      availability: 'https://schema.org/InStock'
    },
    vehicleIdentificationNumber: vin || '',
    productionDate: year ? String(year) : '',
    mileageFromOdometer: t.mileage ? { '@type': 'QuantitativeValue', value: String(t.mileage), unitText: 'KM' } : undefined,
    vehicleEngine: t.engine ? { name: t.engine } : undefined,
    vehicleTransmission: t.transmission || '',
    fuelType: t.fuelType || '',
    color: t.exteriorColor || '',
    seller: {
      '@type': 'LocalBusiness',
      '@id': 'https://dangm.ca/#business',
      name: 'DanGM',
      telephone: '604-735-1396',
      address: { '@type': 'PostalAddress', streetAddress: '2595 Barnet Hwy', 'addressRegion': 'BC', 'addressLocality': 'Coquitlam', postalCode: 'V3E 1K9', 'addressCountry': 'CA' }
    }
  });
  document.head.appendChild(ld);
}

// ─── Related Vehicles (internal linking for SEO) ─────────────
function renderRelatedVehicles(current) {
  if (!allTrucks.length) return '';
  const sameMake = allTrucks.filter((t) => t.make === current.make && String(t.id) !== String(current.id));
  const related = (sameMake.length >= 3 ? sameMake : allTrucks.filter((t) => String(t.id) !== String(current.id))).slice(0, 3);
  if (!related.length) return '';
  return `
    <section class="related section">
      <div class="section-head">
        <p class="eyebrow">You may also like</p>
        <h2 class="section-title">Similar Vehicles</h2>
      </div>
      <div class="truck-grid">
        ${related.map((r) => {
          const rTitle = [r.year, r.make, r.model, r.trim].filter(Boolean).join(' ');
          const rImg = (r.images || [])[0] || '';
          return `
            <a href="${vdpHref(r)}" class="truck-card-small">
              ${rImg ? `<img src="${rImg}" alt="${escapeHtml(rTitle)}" loading="lazy" class="related-img">` : '<div class="related-noimg">📷</div>'}
              <div class="related-info">
                <span class="related-title">${escapeHtml(rTitle)}</span>
                <span class="related-price">${formatPrice(r.price)}</span>
              </div>
            </a>`;
        }).join('')}
      </div>
    </section>`;
}

// ─── Render (home vs inventory) ────────────────────────────
function renderAll() {
  if (PAGE === 'home') {
    const byPrice = [...allTrucks].sort((a, b) => priceNum(b.price) - priceNum(a.price));
    renderGrid(byPrice.slice(0, FLAGSHIP_COUNT), true);
    return;
  }
  buildFiltersOnce();   // build dropdowns/chips/price-list ONCE (rebuilding wipes selections!)
  syncFilterUI();       // highlight chips/price rows from the CURRENT state every render
  const filtered = applyFilters(allTrucks);
  renderGrid(filtered, viewMode === 'grid');
  updateResultCount(filtered.length);
}

// ─── Makes: the GM family gets its own entries, everything else = Other ──
const CORE_MAKES = ['Chevrolet', 'GMC', 'Buick', 'Cadillac'];
const IS_CORVETTE = (t) => /corvette/i.test(`${t.make} ${t.model}`);

function makeGroupOf(t) {
  if (IS_CORVETTE(t)) return 'Corvette';
  if (CORE_MAKES.includes(t.make)) return t.make;
  return 'Other';
}

// Used detection: real odometer kilometres = used. New feed vehicles show
// delivery km (≤100). Works even when the feed's condition column is junk
// (this one only has GOOD/OTHER).
function isUsed(t) {
  const km = parseFloat(String(t.mileage || '').replace(/[^0-9.]/g, ''));
  return !isNaN(km) && km > 100;
}

function conditionGroupOf(t) {
  return isUsed(t) ? 'Used' : 'New';
}

let filtersBuilt = false;

function buildFiltersOnce() {
  if (filtersBuilt) return;
  filtersBuilt = true;
  buildMakeDropdown();
  buildTypeDropdown();
  buildConditionDropdown();
  buildMakeChips();
  buildPriceRanges();
}

// Re-highlight chips + price rows from the current filter state (every render)
function syncFilterUI() {
  const sel = document.getElementById('makeFilter');
  const current = sel ? sel.value : '';
  const chips = document.getElementById('makeChips');
  if (chips) {
    chips.querySelectorAll('.chip').forEach((c) =>
      c.classList.toggle('chip-active', c.dataset.make === current));
  }
  const list = document.getElementById('priceRanges');
  if (list) {
    list.querySelectorAll('.price-range').forEach((b) => {
      const lo = Number(b.dataset.lo);
      const hi = b.dataset.hi === 'inf' ? Infinity : Number(b.dataset.hi);
      b.classList.toggle('price-active', !!activePrice && activePrice.lo === lo && activePrice.hi === hi);
    });
  }
}

function buildMakeDropdown() {
  const select = document.getElementById('makeFilter');
  if (!select) return;
  const otherNames = [...new Set(
    allTrucks.filter((t) => makeGroupOf(t) === 'Other' && t.make).map((t) => t.make)
  )].sort();
  // Dropdown: All Makes / Chevrolet / GMC / Buick / Corvette / Other (Audi, BMW, …)
  select.innerHTML = '<option value="">All Makes</option>' +
    ['Chevrolet', 'GMC', 'Buick', 'Corvette', 'Other'].map((m) =>
      `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('') +
    otherNames.map((m) =>
      `<option value="other:${escapeHtml(m)}">&nbsp;&nbsp;└ ${escapeHtml(m)}</option>`).join('');
}

function buildTypeDropdown() {
  const typeSel = document.getElementById('typeFilter');
  if (!typeSel) return;
  const types = [...new Set(allTrucks.map((t) => prettyType(t.bodyStyle)).filter(Boolean))].sort();
  typeSel.innerHTML = '<option value="">All Types</option>' +
    types.map((tp) => `<option value="${escapeHtml(tp)}">${escapeHtml(tp)}</option>`).join('');
}

function buildConditionDropdown() {
  const condSel = document.getElementById('conditionFilter');
  if (!condSel) return;
  const nUsed = allTrucks.filter(isUsed).length;
  condSel.innerHTML =
    '<option value="">New & Used</option>' +
    `<option value="New">New (${allTrucks.length - nUsed})</option>` +
    `<option value="Used">Used (${nUsed})</option>`;
}

function buildMakeChips() {
  const chips = document.getElementById('makeChips');
  if (!chips) return;
  chips.innerHTML = '<button class="chip" data-make="">All</button>' +
    ['Chevrolet', 'GMC', 'Buick', 'Corvette', 'Other'].map((m) =>
      `<button class="chip" data-make="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join('');
  chips.querySelectorAll('.chip').forEach((c) => {
    c.addEventListener('click', () => {
      const sel = document.getElementById('makeFilter');
      if (sel) sel.value = c.dataset.make;
      renderAll();
    });
  });
}

// ─── Price range sidebar (Amazon-style) ────────────────────
function priceBuckets(trucks) {
  const prices = trucks.map((t) => priceNum(t.price)).filter((n) => n > 0).sort((a, b) => a - b);
  if (!prices.length) return [];
  const edges = [0, 25000, 50000, 75000, 100000, 150000, Infinity];
  const buckets = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i], hi = edges[i + 1];
    const count = prices.filter((p) => p >= lo && p < hi).length;
    if (!count) continue;
    buckets.push({
      lo, hi,
      label: hi === Infinity ? `$${fmtK(lo)}+` : `$${fmtK(lo)} – $${fmtK(hi)}`,
      count,
    });
  }
  return buckets;
}
function fmtK(n) { return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n); }

let activePrice = null; // {lo, hi} or null

function buildPriceRanges() {
  const list = document.getElementById('priceRanges');
  if (!list) return;
  const buckets = priceBuckets(allTrucks);
  list.innerHTML = buckets.map((b) => `
    <button class="price-range" data-lo="${b.lo}" data-hi="${b.hi === Infinity ? 'inf' : b.hi}">
      <span>${escapeHtml(b.label)}</span><span class="price-count">${b.count}</span>
    </button>`).join('');
  list.querySelectorAll('.price-range').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lo = Number(btn.dataset.lo);
      const hi = btn.dataset.hi === 'inf' ? Infinity : Number(btn.dataset.hi);
      // Click again = clear
      activePrice = activePrice && activePrice.lo === lo && activePrice.hi === hi ? null : { lo, hi };
      renderAll();
    });
  });
}

// "Sport Utility Vehicle" → "SUV / Crossover", etc.
function prettyType(t) {
  const s = String(t).toLowerCase();
  if (/suv|crossover|sport utility/.test(s)) return 'SUV / Crossover';
  if (/pickup|truck/.test(s)) return 'Truck';
  if (/sedan/.test(s)) return 'Sedan';
  if (/hatchback/.test(s)) return 'Hatchback';
  if (/wagon/.test(s)) return 'Wagon';
  if (/van|minivan/.test(s)) return 'Van';
  if (/coupe/.test(s)) return 'Coupe';
  if (/convertible/.test(s)) return 'Convertible';
  return t;
}

// ─── Smart fuzzy search ──────────────────────────────────────────
// Goal: "sierra", "seira", "silverado", "silvrrado", "eqinox", " Terrain
// Denalli" all find their trucks. Handles typos, wrong order, and extra
// words. Every word the user typed must fuzzy-match SOME part of the
// vehicle's searchable text (AND logic so more words = narrower results).

// Damerau-Levenshtein distance: true edit distance incl. transpositions
// ("seira" → "sierra" is one swap = distance 1). No deps, ~25 lines.
function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,       // deletion
        d[i][j - 1] + 1,       // insertion
        d[i - 1][j - 1] + cost // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // transposition
      }
    }
  }
  return d[m][n];
}

// Fuzzy token match: a short query word matches a haystack word if it's a
// prefix, a substring (4+ chars, e.g. "silver" ⊂ "silverado"), or within a
// typo budget that scales with word length (1 typo ≤4 chars, 2 ≤8, else 3).
function fuzzyWord(q, word) {
  if (!q) return true;
  if (word.startsWith(q) || word.includes(q)) return true;
  const budget = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
  if (Math.abs(q.length - word.length) > budget) return false;
  return editDistance(q, word) <= budget;
}

// Does ONE query token fuzzy-match anything in this vehicle's text?
function tokenMatches(q, hayWords) {
  for (const w of hayWords) {
    if (fuzzyWord(q, w)) return true;
  }
  return false;
}

function searchHaystackWords(t) {
  return `${t.year || ''} ${t.make || ''} ${t.model || ''} ${t.trim || ''} ${t.bodyStyle || ''} ${t.exteriorColor || ''} ${t.interiorColor || ''} ${t.engine || ''} ${t.fuelType || ''} ${t.transmission || ''} ${t.drivetrain || ''} ${t.condition || ''}`
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter(Boolean);
}

// Memoize haystacks per truck object (they're rebuilt on every keystroke)
const hayCache = new WeakMap();
function haystackFor(t) {
  let w = hayCache.get(t);
  if (!w) { w = searchHaystackWords(t); hayCache.set(t, w); }
  return w;
}

function applyFilters(list) {
  const q = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  const makeRaw = (document.getElementById('makeFilter') || {}).value || '';
  const type = (document.getElementById('typeFilter') || {}).value || '';
  const cond = (document.getElementById('conditionFilter') || {}).value || '';
  const sort = document.getElementById('sortFilter')?.value || 'price-high';

  // Make groups: "Other" catches every non-GM brand; "other:Audi" targets one
  let matchesMake = null; // null = no make filter
  if (makeRaw.startsWith('other:')) {
    matchesMake = (t) => t.make === makeRaw.slice(6);
  } else if (makeRaw === 'Other') {
    matchesMake = (t) => makeGroupOf(t) === 'Other';
  } else if (makeRaw === 'Corvette') {
    matchesMake = IS_CORVETTE;
  } else if (makeRaw) {
    matchesMake = (t) => makeGroupOf(t) === makeRaw;
  }

  // Pre-split the query once (same tokenizer the haystacks use)
  const qTokens = q.split(/[^a-z0-9.]+/).filter(Boolean);

  let out = list.filter((t) => {
    const matchesQ = !qTokens.length || (() => {
      const hayWords = haystackFor(t);
      // Every query word must fuzzy-match something in the vehicle text.
      return qTokens.every((tok) => tokenMatches(tok, hayWords));
    })();
    const inMake = matchesMake ? matchesMake(t) : true;
    // Type groups: compare on the normalized friendly name
    const inType = !type || prettyType(t.bodyStyle) === type;
    const inCond = !cond || conditionGroupOf(t) === cond;
    const p = priceNum(t.price);
    const inPrice = !activePrice || (p >= activePrice.lo && p < activePrice.hi);
    return matchesQ && inMake && inType && inCond && inPrice;
  });

  if (sort === 'price-low') out.sort((a, b) => priceNum(a.price) - priceNum(b.price));
  else out.sort((a, b) => priceNum(b.price) - priceNum(a.price)); // default: price high → low

  return out;
}

// ─── Grid / cards ──────────────────────────────────────────
function renderGrid(list, isFlagship) {
  const grid = document.getElementById('truckGrid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty">No vehicles match your search.</div>';
    return;
  }
  // Inventory grid view renders vertical cards (like the home flagship cards)
  if (PAGE === 'inventory' && viewMode === 'grid') {
    grid.classList.add('grid-view');
    grid.innerHTML = list.map((t, i) => gridCardHTML(t, i)).join('');
  } else {
    grid.classList.remove('grid-view');
    grid.innerHTML = list.map((t, i) => cardHTML(t, i, isFlagship)).join('');
  }
  requestAnimationFrame(() => {
    grid.querySelectorAll('.truck-card').forEach((c) => c.classList.add('in-view'));
  });
}

// ─── Result count + view toggle (grid ⨯ list) ──────────────
let viewMode = localStorage.getItem('dgView') || 'list'; // inventory layout preference

function updateResultCount(n) {
  const el = document.getElementById('resultCount');
  if (el) el.textContent = `${n} vehicle${n === 1 ? '' : 's'} available`;
  const wrap = document.getElementById('viewToggleWrap');
  if (wrap) {
    wrap.querySelectorAll('.view-btn').forEach((b) =>
      b.classList.toggle('view-active', b.dataset.view === viewMode));
  }
  // Show/hide the clear-price button
  const clear = document.getElementById('priceClear');
  if (clear) clear.style.display = activePrice ? 'inline-block' : 'none';
}

function initViewToggle() {
  const wrap = document.getElementById('viewToggleWrap');
  if (!wrap) return;
  wrap.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      viewMode = btn.dataset.view;
      localStorage.setItem('dgView', viewMode);
      renderAll();
    });
  });
}

// Rebuild the view toggle + result count active state (called once on boot)
function updateViewToggleUI() {
  const wrap = document.getElementById('viewToggleWrap');
  if (!wrap) return;
  wrap.querySelectorAll('.view-btn').forEach((b) =>
    b.classList.toggle('view-active', b.dataset.view === viewMode));
}

// Vertical card variant for grid view on the inventory page
function gridCardHTML(t, i) {
  const img = t.images[0] || '';
  const title = [t.year, t.make, t.model, t.trim].filter(Boolean).join(' ');
  const price = formatPrice(t.price);
  const href = vdpHref(t);
  return `
    <a class="truck-card reveal" href="${href}" style="transition-delay:${Math.min(i * 0.04, 0.3)}s">
      <div class="truck-card-img-wrap">
        ${img ? `<img class="truck-card-img" src="${img}" alt="${escapeHtml(title)} for sale in Coquitlam BC" loading="lazy">` : '<div class="truck-card-img"></div>'}
        ${t.bodyStyle ? `<span class="truck-badge">${escapeHtml(t.bodyStyle)}</span>` : ''}
      </div>
      <div class="truck-card-body">
        <h3 class="truck-card-title">${escapeHtml(title)}</h3>
        <p class="truck-card-sub">${escapeHtml(t.exteriorColor || '')}${t.exteriorColor && t.mileage ? ' · ' : ''}${t.mileage ? `${Number(t.mileage).toLocaleString()} km` : ''}</p>
        <div class="truck-card-price">${escapeHtml(price)}</div>
        ${tagsHTML(t)}
        <span class="truck-card-cta">View Details →</span>
      </div>
    </a>`;
}

function cardHTML(t, i, isFlagship) {
  const img = t.images[0] || '';
  const title = [t.year, t.make, t.model, t.trim].filter(Boolean).join(' ');
  const price = formatPrice(t.price);
  const href = vdpHref(t);

  if (isFlagship) {
    // Home page — vertical flagship card
    return `
      <a class="truck-card reveal" href="${href}" style="transition-delay:${Math.min(i * 0.05, 0.4)}s">
        <div class="truck-card-img-wrap">
          ${img ? `<img class="truck-card-img" src="${img}" alt="${escapeHtml(title)} for sale in Coquitlam BC" loading="lazy">` : '<div class="truck-card-img"></div>'}
          ${t.bodyStyle ? `<span class="truck-badge">${escapeHtml(t.bodyStyle)}</span>` : ''}
        </div>
        <div class="truck-card-body">
          <h3 class="truck-card-title">${escapeHtml(title)}</h3>
          <p class="truck-card-sub">${escapeHtml(t.exteriorColor || '')}${t.exteriorColor && t.mileage ? ' · ' : ''}${t.mileage ? `${Number(t.mileage).toLocaleString()} km` : ''}</p>
          <div class="truck-card-price">${escapeHtml(price)}</div>
          ${tagsHTML(t)}
          <span class="truck-card-cta">View Details →</span>
        </div>
      </a>`;
  }

  // Inventory page — horizontal list card (image left, details right)
  return `
    <a class="truck-card truck-card-list reveal" href="${href}" style="transition-delay:${Math.min(i * 0.04, 0.3)}s">
      <div class="truck-card-img-wrap list-img">
        ${img ? `<img class="truck-card-img" src="${img}" alt="${escapeHtml(title)} for sale in Coquitlam BC" loading="lazy">` : '<div class="truck-card-img"></div>'}
        ${t.bodyStyle ? `<span class="truck-badge">${escapeHtml(t.bodyStyle)}</span>` : ''}
      </div>
      <div class="truck-card-body list-body">
        <div class="list-top">
          <div class="list-info">
            <h3 class="truck-card-title">${escapeHtml(title)}</h3>
            <p class="truck-card-sub">Stock #${escapeHtml(t.id)}</p>
          </div>
          <div class="list-price">
            <div class="truck-card-price">${escapeHtml(price)}</div>
            <span class="truck-card-cta">View Details →</span>
          </div>
        </div>
        ${tagsHTML(t)}
      </div>
    </a>`;
}

// Split the feed's comma-separated feature list into individual items.
function splitFeatures(desc) {
  if (!desc) return [];
  return desc
    .split(',')
    .map((s) => s.trim())
    .map((s) => s.replace(/^and\s+/i, '').replace(/\.$/, ''))
    .filter((s) => s.length > 1);
}

// ─── Vehicle detail page (VDP) ─────────────────────────────
function renderVehicle(t) {
  const title = [t.year, t.make, t.model, t.trim].filter(Boolean).join(' ');
  const price = formatPrice(t.price);
  const imgs = (t.images || []).filter(Boolean);
  const desc = cleanText(t.aiDescription || ''); // catchy prose (Workers AI)
  const features = splitFeatures(t.description); // full equipment list

  const gallery = imgs.length ? `
    <div class="vdp-gallery">
      <div class="vdp-main-wrap">
        <img class="vdp-main" id="vdpMain" src="${imgs[0]}" alt="${escapeHtml(title)} for sale in Coquitlam BC">
        ${imgs.length > 1 ? `<button class="vdp-nav vdp-prev" data-dir="-1" aria-label="Previous image">‹</button>
        <button class="vdp-nav vdp-next" data-dir="1" aria-label="Next image">›</button>
        <span class="vdp-count" id="vdpCount">1 / ${imgs.length}</span>` : ''}
      </div>
      ${imgs.length > 1 ? `<div class="vdp-thumbs">${imgs.map((im, i) => `<img class="vdp-thumb ${i === 0 ? 'active' : ''}" src="${im}" data-idx="${i}" alt="${escapeHtml(title)} — photo ${i + 1}">`).join('')}</div>` : ''}
    </div>` : '<div class="vdp-noimg">📷</div>';

  // Full vehicle details (dealership-style label:value list)
  const details = [
    ['Body Style', t.bodyStyle],
    ['Engine', t.engine],
    ['Exterior Colour', t.exteriorColor],
    ['Interior Colour', t.interiorColor],
    ['Transmission', t.transmission],
    ['Drivetrain', t.drivetrain],
    ['Fuel Type', t.fuelType],
    ['Mileage', t.mileage ? `${Number(t.mileage).toLocaleString()} km` : ''],
    ['VIN', t.vin],
    ['Stock #', t.id],
  ].filter(([, v]) => v);

  // ─── Dynamic SEO: title, meta, OG, JSON-LD, breadcrumb ───
  const fullTitle = `${title} | Cars & Trucks for Sale in Vancouver, BC | dangm.ca`;
  document.title = fullTitle;
  const seoDesc = `${t.year} ${t.make} ${t.model}${t.trim ? ' ' + t.trim : ''} for sale at dangm.ca in Coquitlam, BC. ${price}${t.engine ? '. ' + t.engine + '.' : ''}${t.mileage ? ' ' + Number(t.mileage).toLocaleString() + ' km.' : ''} Inspected and ready for the road. Call 604-735-1396.`;
  updateMeta('description', seoDesc);
  updateMeta('og:title', fullTitle);
  updateMeta('og:description', seoDesc);
  if (imgs[0]) updateMeta('og:image', imgs[0]);
  updateMeta('twitter:title', fullTitle);
  updateMeta('twitter:description', seoDesc);
  if (imgs[0]) updateMeta('twitter:image', imgs[0]);
  const canon = document.querySelector('link[rel="canonical"]');
  // Canonical/og:url = the CLEAN static /v/ page (vdpHref matches build-sitemap.py).
  // vehicle.html?id=X is the interactive variant; raw location.href would leak
  // tracking params (fbclid/utm_*) into canonicals and split ranking signals.
  const vdpUrl = `https://dangm.ca/${vdpHref(t)}`;
  if (canon) canon.href = vdpUrl;
  updateMeta('og:url', vdpUrl);
  // Breadcrumb
  const bc = document.getElementById('breadcrumbVehicle');
  if (bc) bc.textContent = title;
  // Vehicle JSON-LD
  addVehicleJSONLD(t, title, price, seoDesc, imgs, t.vin, t.year);

  document.getElementById('vehicleContent').innerHTML = `
    <div class="vdp-hero">
      <a href="inventory.html" class="vdp-back">← Back to inventory</a>
      <h1 class="vdp-title">${escapeHtml(title)}</h1>
      <div class="vdp-price">${escapeHtml(price)}</div>
      ${tagsHTML(t, 'vdp-tags')}
    </div>
    <div class="vdp-layout">
      <div class="vdp-gallery-col">${gallery}</div>
      <div class="vdp-info-col">
        <div class="vdp-details">
          <h2>Vehicle Details</h2>
          <dl>
            ${details.map(([k, v]) => `<div class="detail-row"><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}
          </dl>
        </div>
        <div class="vdp-actions">
          <a href="tel:6047351396" class="btn btn-primary">Call 604-735-1396</a>
        </div>
      </div>
    </div>
    ${desc ? `<div class="vdp-desc"><h2>About this vehicle</h2><p>${escapeHtml(desc)}</p></div>` : ''}
    ${features.length ? `
      <section class="vdp-features">
        <div class="section-head">
          <p class="eyebrow">Standard Equipment</p>
          <h2 class="section-title">Features & Options</h2>
        </div>
        <ul class="feature-grid">
          ${features.map((f) => `<li class="feature"><span class="feature-check">✓</span>${escapeHtml(f)}</li>`).join('')}
        </ul>
      </section>` : ''}
    <section class="vdp-contact" id="vdp-contact">
      <div class="section-head">
        <p class="eyebrow">Get in touch</p>
        <h2 class="section-title">Take the next step</h2>
        <p class="section-sub">Call us for pricing, availability, and test drives. No pressure, no gimmicks — just honest deals.</p>
      </div>
      <div class="vdp-contact-actions">
        <a href="tel:6047351396" class="btn btn-primary">Call 604-735-1396</a>
        <a href="inventory.html" class="btn btn-ghost">Back to inventory</a>
      </div>
    </section>
    ${renderRelatedVehicles(t)}
  `;

  // Image carousel: prev/next buttons + thumbnail click
  let cur = 0;
  const showImage = (i) => {
    if (!imgs.length) return;
    cur = (i + imgs.length) % imgs.length;
    document.getElementById('vdpMain').src = imgs[cur];
    const count = document.getElementById('vdpCount');
    if (count) count.textContent = `${cur + 1} / ${imgs.length}`;
    const thumbEls = document.querySelectorAll('.vdp-thumb');
    thumbEls.forEach((x, idx) => x.classList.toggle('active', idx === cur));
    // Auto-scroll the thumbnail strip so the active thumb is always visible
    const active = thumbEls[cur];
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };
  document.querySelectorAll('.vdp-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => showImage(parseInt(thumb.dataset.idx, 10)));
  });
  document.querySelectorAll('.vdp-nav').forEach((btn) => {
    btn.addEventListener('click', () => showImage(cur + parseInt(btn.dataset.dir, 10)));
  });
}

// ─── Nav scroll effect + mobile menu ──────────────────────
function initNav() {
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const toggle = document.getElementById('navToggle');
  if (toggle) toggle.addEventListener('click', () => nav.classList.toggle('open'));
  // Close the mobile menu when a link is tapped
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => nav.classList.remove('open')));
}

// ─── Reveal on scroll ──────────────────────────────────────
function initReveals() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

function updateStatCount() {
  const el = document.getElementById('statCount');
  if (!el) return;
  if (allTrucks.length > 0) {
    // API resolved: override the static premium fallback with the live count
    el.textContent = allTrucks.length;
  } else {
    // API failed/timed out: never drop to "0" (Googlebot indexes the initial
    // DOM). Keep the static fallback and point the label at live inventory.
    el.textContent = '400+';
    const label = el.parentElement && el.parentElement.querySelector('.stat-label');
    if (label) label.textContent = 'Browse Live Inventory';
  }
}

// ─── Lead capture form ────────────────────────────────────
function initLeadForm() {
  const form = document.getElementById('leadForm');
  if (!form) return;
  const err = document.getElementById('leadError');
  const btn = document.getElementById('leadSubmit');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const data = {
      name: (f.name.value || '').trim(),
      phone: (f.phone.value || '').trim(),
      email: (f.email.value || '').trim(),
      interest: f.interest.value || '',
      website: f.website.value || '', // honeypot — must stay empty
    };
    const showErr = (msg) => {
      err.textContent = msg;
      err.hidden = false;
    };
    err.hidden = true;
    if (!data.name || !data.phone || !data.interest) {
      showErr('Please fill in your name, phone number, and how we can help.');
      return;
    }
    if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) {
      showErr('That email address does not look right — mind checking it?');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      const res = await fetch(`${API_BASE}/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) {
        // Pass the server's specific message through (e.g. phone format) —
        // anything else (network, 5xx) gets the friendly generic text.
        throw Object.assign(new Error(out.error || 'GENERIC'), { friendly: !!out.error });
      }
      form.innerHTML = `
        <div class="lead-thanks">
          <h3>Got it, ${escapeHtml(data.name.split(' ')[0])} 🎉</h3>
          <p>Dan will call you personally at ${escapeHtml(data.phone)} shortly.<br>Zero pressure — just real answers.</p>
        </div>`;
    } catch (ex) {
      console.error('Lead submit failed', ex);
      btn.disabled = false;
      btn.textContent = 'Get Started with Dan';
      showErr(ex.friendly ? ex.message : 'Something went wrong sending that. Try again, or call us at 604-735-1396.');
    }
  });
}

// ─── Forum (comparison posts) ─────────────────────────────
async function loadForum() {
  const el = document.getElementById('forumList');
  try {
    const res = await fetch(`${API_BASE}/forum`);
    if (!res.ok) throw new Error('failed');
    const data = await res.json();
    const posts = data.posts || [];
    if (!posts.length) {
      el.innerHTML = '<div class="empty">No posts yet. Check back soon.</div>';
      return;
    }
    el.innerHTML = posts.map((p) => forumCardHTML(p)).join('');
    // Cards render AFTER initReveals() ran (async fetch), so the reveal
    // observer never saw them — without this they'd sit at opacity:0
    // (invisible). Same trick renderGrid uses for truck cards.
    requestAnimationFrame(() => {
      el.querySelectorAll('.forum-card').forEach((c) => c.classList.add('in-view'));
    });
  } catch (e) {
    el.innerHTML = '<div class="empty">Could not load posts.</div>';
  }
}

function forumCardHTML(p) {
  const title = p.title || 'Untitled';
  const full = String(p.body || '');
  const body = full.replace(/\n/g, ' ').slice(0, 160);
  const img = p.image
    ? `<div class="forum-card-img-wrap"><img class="forum-card-img" src="${p.image}" alt="${escapeHtml(title)} for sale in Coquitlam BC" loading="lazy"></div>`
    : '';
  return `
    <a class="forum-card reveal" href="forum-post.html?id=${encodeURIComponent(p.id)}">
      ${img}
      <div class="forum-card-body">
        <h2 class="forum-card-title">${escapeHtml(title)}</h2>
        <p class="forum-card-sub">${escapeHtml(body)}${full.length > 160 ? '…' : ''}</p>
        <span class="forum-card-cta">Read more →</span>
      </div>
    </a>`;
}

async function loadForumPost() {
  const id = new URLSearchParams(location.search).get('id');
  const el = document.getElementById('forumPost');
  if (!id) {
    el.innerHTML = '<div class="empty">No post specified. <a href="forum.html">Browse the forum</a></div>';
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/forum/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    const p = data.post;
    if (!p) throw new Error('not found');
    // SEO: put the comparison title + local intent into the page title.
    document.title = `${p.title} near you | dangm.ca`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', `${p.title} near you. Compare vehicles, specs, and pricing at dangm.ca in Vancouver and the Tri-Cities.`);
    el.innerHTML = `
      <div class="forum-post">
        <a href="forum.html" class="vdp-back">← Back to forum</a>
        <h1 class="forum-post-title">${escapeHtml(p.title)}</h1>
        ${p.image ? `<img class="forum-post-img" src="${p.image}" alt="${escapeHtml(p.title)}">` : ''}
        <div class="forum-post-body">${formatPostBody(p.body)}</div>
        <div class="forum-post-cta">
          <a href="inventory.html" class="btn btn-primary">Browse Inventory</a>
          <a href="tel:6047351396" class="btn btn-ghost">Call 604-735-1396</a>
        </div>
      </div>`;
  } catch (e) {
    el.innerHTML = '<div class="empty">Post not found. <a href="forum.html">Browse the forum</a></div>';
  }
}

function formatPostBody(body) {
  return String(body || '')
    .split(/\n+/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para)}</p>`)
    .join('');
}

// ─── Boot ──────────────────────────────────────────────────
function init() {
  initNav();
  initReveals();
  initLeadForm();
  document.getElementById('year').textContent = new Date().getFullYear();

  // Static pages (location landing pages, blog guides): nav + reveals + lead
  // form only. Return before loadTrucks() so pages without a truck grid
  // don't hit null-element crashes in renderAll/applyFilters.
  if (PAGE === 'landing') return;

  if (PAGE === 'vehicle') {
    loadVehicle();
    return;
  }

  if (PAGE === 'forum') {
    loadForum();
    return;
  }

  if (PAGE === 'forum-post') {
    loadForumPost();
    return;
  }

  if (PAGE === 'inventory') {
    ['searchInput', 'makeFilter', 'typeFilter', 'conditionFilter', 'sortFilter'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', renderAll);
    });
    initViewToggle();
    const clear = document.getElementById('priceClear');
    if (clear) clear.addEventListener('click', () => {
      activePrice = null;
      document.querySelectorAll('.price-range').forEach((x) => x.classList.remove('price-active'));
      clear.style.display = 'none';
      renderAll();
    });
  }

  loadTrucks();
}

document.addEventListener('DOMContentLoaded', init);
