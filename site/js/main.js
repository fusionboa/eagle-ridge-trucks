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
      name: 'dangm.ca',
      telephone: '604-735-1396',
      address: { '@type': 'PostalAddress', 'addressRegion': 'BC', 'addressLocality': 'Coquitlam', 'addressCountry': 'CA' }
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
            <a href="vehicle.html?id=${encodeURIComponent(r.id)}" class="truck-card-small">
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
  populateMakes();
  populateTypes();
  const filtered = applyFilters(allTrucks);
  renderGrid(filtered);
}

function populateMakes() {
  const select = document.getElementById('makeFilter');
  if (!select) return;
  const makes = [...new Set(allTrucks.map((t) => t.make).filter(Boolean))].sort();
  select.innerHTML = '<option value="">All Makes</option>' +
    makes.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');

  // Vehicle type filter — friendly names for the body styles we carry
  const typeSel = document.getElementById('typeFilter');
  if (typeSel) {
    const types = [...new Set(allTrucks.map((t) => t.bodyStyle).filter(Boolean))].sort();
    typeSel.innerHTML = '<option value="">All Types</option>' +
      types.map((tp) => `<option value="${escapeHtml(tp)}">${escapeHtml(prettyType(tp))}</option>`).join('');
  }

  // Quick-pick make chips above the grid (All / GMC / Chevrolet / ...)
  const chips = document.getElementById('makeChips');
  if (chips) {
    chips.innerHTML = '<button class="chip chip-active" data-make="">All</button>' +
      makes.map((m) => `<button class="chip" data-make="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join('');
    chips.querySelectorAll('.chip').forEach((c) => {
      c.addEventListener('click', () => {
        chips.querySelectorAll('.chip').forEach((x) => x.classList.remove('chip-active'));
        c.classList.add('chip-active');
        const sel = document.getElementById('makeFilter');
        if (sel) sel.value = c.dataset.make;
        renderAll();
      });
    });
  }
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
  const make = document.getElementById('makeFilter').value;
  const type = (document.getElementById('typeFilter') || {}).value || '';
  const sort = document.getElementById('sortFilter').value;

  // Pre-split the query once (same tokenizer the haystacks use)
  const qTokens = q.split(/[^a-z0-9.]+/).filter(Boolean);

  let out = list.filter((t) => {
    const matchesQ = !qTokens.length || (() => {
      const hayWords = haystackFor(t);
      // Every query word must fuzzy-match something in the vehicle text.
      return qTokens.every((tok) => tokenMatches(tok, hayWords));
    })();
    const matchesMake = !make || t.make === make;
    const matchesType = !type || (t.bodyStyle || '').toLowerCase().includes(type.toLowerCase());
    return matchesQ && matchesMake && matchesType;
  });

  if (sort === 'price-low') out.sort((a, b) => priceNum(a.price) - priceNum(b.price));
  else if (sort === 'price-high') out.sort((a, b) => priceNum(b.price) - priceNum(a.price));
  else out.sort((a, b) => String(b.year).localeCompare(String(a.year)));

  return out;
}

// ─── Grid / cards ──────────────────────────────────────────
function renderGrid(list, isFlagship) {
  const grid = document.getElementById('truckGrid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty">No vehicles match your search.</div>';
    return;
  }
  grid.innerHTML = list.map((t, i) => cardHTML(t, i, isFlagship)).join('');
  requestAnimationFrame(() => {
    grid.querySelectorAll('.truck-card').forEach((c) => c.classList.add('in-view'));
  });
}

function cardHTML(t, i, isFlagship) {
  const img = t.images[0] || '';
  const title = [t.year, t.make, t.model, t.trim].filter(Boolean).join(' ');
  const price = formatPrice(t.price);
  const href = `vehicle.html?id=${encodeURIComponent(t.id)}`;

  if (isFlagship) {
    // Home page — vertical flagship card
    return `
      <a class="truck-card reveal" href="${href}" style="transition-delay:${Math.min(i * 0.05, 0.4)}s">
        <div class="truck-card-img-wrap">
          ${img ? `<img class="truck-card-img" src="${img}" alt="${escapeHtml(title)}" loading="lazy">` : '<div class="truck-card-img"></div>'}
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
        ${img ? `<img class="truck-card-img" src="${img}" alt="${escapeHtml(title)}" loading="lazy">` : '<div class="truck-card-img"></div>'}
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
        <img class="vdp-main" id="vdpMain" src="${imgs[0]}" alt="${escapeHtml(title)}">
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
  updateMeta('og:url', location.href);
  if (imgs[0]) updateMeta('og:image', imgs[0]);
  updateMeta('twitter:title', fullTitle);
  updateMeta('twitter:description', seoDesc);
  if (imgs[0]) updateMeta('twitter:image', imgs[0]);
  const canon = document.querySelector('link[rel="canonical"]');
  if (canon) canon.href = location.href;
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
    document.querySelectorAll('.vdp-thumb').forEach((x, idx) => x.classList.toggle('active', idx === cur));
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
  if (el) el.textContent = allTrucks.length;
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
    ? `<div class="forum-card-img-wrap"><img class="forum-card-img" src="${p.image}" alt="${escapeHtml(title)}" loading="lazy"></div>`
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
  document.getElementById('year').textContent = new Date().getFullYear();

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
    ['searchInput', 'makeFilter', 'typeFilter', 'sortFilter'].forEach((id) => {
      document.getElementById(id).addEventListener('input', renderAll);
    });
  }

  loadTrucks();
}

document.addEventListener('DOMContentLoaded', init);
