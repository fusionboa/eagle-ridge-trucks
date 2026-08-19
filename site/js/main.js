// ============================================================
// Eagle Ridge Trucks — Storefront JS
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

// ─── Render (home vs inventory) ────────────────────────────
function renderAll() {
  if (PAGE === 'home') {
    const byPrice = [...allTrucks].sort((a, b) => priceNum(b.price) - priceNum(a.price));
    renderGrid(byPrice.slice(0, FLAGSHIP_COUNT), true);
    return;
  }
  populateMakes();
  const filtered = applyFilters(allTrucks);
  renderGrid(filtered);
}

function populateMakes() {
  const select = document.getElementById('makeFilter');
  if (!select) return;
  const makes = [...new Set(allTrucks.map((t) => t.make).filter(Boolean))].sort();
  select.innerHTML = '<option value="">All Makes</option>' +
    makes.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
}

function applyFilters(list) {
  const q = (document.getElementById('searchInput').value || '').toLowerCase();
  const make = document.getElementById('makeFilter').value;
  const sort = document.getElementById('sortFilter').value;

  let out = list.filter((t) => {
    const hay = `${t.year} ${t.make} ${t.model} ${t.trim} ${t.bodyStyle}`.toLowerCase();
    const matchesQ = !q || hay.includes(q);
    const matchesMake = !make || t.make === make;
    return matchesQ && matchesMake;
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
    grid.innerHTML = '<div class="empty">No trucks match your search.</div>';
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
  const desc = t.aiDescription || '';         // catchy prose (Workers AI)
  const features = splitFeatures(t.description); // full equipment list

  const gallery = imgs.length ? `
    <div class="vdp-gallery">
      <img class="vdp-main" id="vdpMain" src="${imgs[0]}" alt="${escapeHtml(title)}">
      ${imgs.length > 1 ? `<div class="vdp-thumbs">${imgs.map((im, i) => `<img class="vdp-thumb ${i === 0 ? 'active' : ''}" src="${im}" data-src="${im}" alt="">`).join('')}</div>` : ''}
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
          <a href="#vdp-contact" class="btn btn-primary">Confirm Availability</a>
          <a href="#vdp-contact" class="btn btn-ghost">Request More Info</a>
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
    ${paymentCalculatorHTML(priceNum(t.price))}
    <section class="vdp-contact" id="vdp-contact">
      <div class="section-head">
        <p class="eyebrow">Get in touch</p>
        <h2 class="section-title">Take the next step</h2>
      </div>
      <div class="vdp-form-grid">
        <form class="vdp-form" data-form="testdrive">
          <h3>Book a Test Drive</h3>
          <input type="text" placeholder="First name" required>
          <input type="text" placeholder="Last name" required>
          <input type="tel" placeholder="Phone number" required>
          <input type="email" placeholder="Email" required>
          <input type="date" placeholder="Preferred date">
          <button type="submit" class="btn btn-primary">Book Test Drive</button>
        </form>
        <form class="vdp-form" data-form="info">
          <h3>Request More Info</h3>
          <input type="text" placeholder="Name" required>
          <input type="tel" placeholder="Phone number" required>
          <input type="email" placeholder="Email" required>
          <textarea placeholder="What would you like to know?" rows="4" required></textarea>
          <button type="submit" class="btn btn-ghost">Request Info</button>
        </form>
      </div>
    </section>
  `;

  // Thumbnail click → swap main image
  document.querySelectorAll('.vdp-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      document.getElementById('vdpMain').src = thumb.dataset.src;
      document.querySelectorAll('.vdp-thumb').forEach((x) => x.classList.remove('active'));
      thumb.classList.add('active');
    });
  });

  // Forms → simple success message (no backend yet)
  document.querySelectorAll('.vdp-form').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = form.querySelector('button');
      btn.textContent = '✓ Sent';
      setTimeout(() => { btn.textContent = form.dataset.form === 'testdrive' ? 'Book Test Drive' : 'Request Info'; form.reset(); }, 2500);
    });
  });

  wirePaymentCalculator(priceNum(t.price));
}

// ─── Payment calculator ────────────────────────────────────
function paymentCalculatorHTML(price) {
  if (!price || price <= 0) return '';
  return `
    <section class="vdp-payment">
      <div class="section-head">
        <p class="eyebrow">Financing</p>
        <h2 class="section-title">Unlock Payment Options</h2>
      </div>
      <div class="pay-card">
        <div class="pay-grid">
          <label class="pay-field"><span>Down Payment</span><input type="number" id="payDown" value="0" min="0"></label>
          <label class="pay-field"><span>Term (months)</span><input type="number" id="payTerm" value="72" min="12" max="96"></label>
          <label class="pay-field"><span>Interest Rate %</span><input type="number" id="payRate" value="4.9" min="0" step="0.1"></label>
          <label class="pay-field"><span>Frequency</span>
            <select id="payFreq">
              <option value="12">Monthly</option>
              <option value="26" selected>Bi-weekly</option>
              <option value="52">Weekly</option>
            </select>
          </label>
        </div>
        <div class="pay-result">
          <span class="pay-result-label">Estimated payment</span>
          <span class="pay-result-value" id="payAmount">—</span>
          <span class="pay-result-freq" id="payFreqLabel">bi-weekly</span>
        </div>
        <p class="pay-disclaimer">For illustration only. Taxes, fees and licence extra. OAC.</p>
      </div>
    </section>`;
}

function computePayment(price, down, termMonths, rate, freq) {
  const amount = Math.max(0, price - down);
  if (amount <= 0) return 0;
  const r = (rate / 100) / freq;
  const n = Math.max(1, Math.round((termMonths / 12) * freq));
  if (r === 0) return amount / n;
  return (amount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function wirePaymentCalculator(price) {
  const el = document.getElementById('payAmount');
  if (!el) return;
  const inputs = ['payDown', 'payTerm', 'payRate', 'payFreq'].map((id) => document.getElementById(id));
  const freqLabels = { 12: 'monthly', 26: 'bi-weekly', 52: 'weekly' };
  const update = () => {
    const down = parseFloat(inputs[0].value) || 0;
    const term = parseFloat(inputs[1].value) || 72;
    const rate = parseFloat(inputs[2].value) || 0;
    const freq = parseInt(inputs[3].value, 10) || 26;
    const pmt = computePayment(price, down, term, rate, freq);
    el.textContent = `$${Math.round(pmt).toLocaleString()}`;
    document.getElementById('payFreqLabel').textContent = freqLabels[freq] || 'bi-weekly';
  };
  inputs.forEach((inp) => inp.addEventListener('input', update));
  update();
}

// ─── Nav scroll effect ─────────────────────────────────────
function initNav() {
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
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

// ─── Boot ──────────────────────────────────────────────────
function init() {
  initNav();
  document.getElementById('year').textContent = new Date().getFullYear();

  if (PAGE === 'vehicle') {
    loadVehicle();
    return;
  }

  if (PAGE === 'inventory') {
    ['searchInput', 'makeFilter', 'sortFilter'].forEach((id) => {
      document.getElementById(id).addEventListener('input', renderAll);
    });
  }

  const contactForm = document.getElementById('contactForm');
  if (contactForm) contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.textContent = '✓ Message sent';
    setTimeout(() => { btn.textContent = 'Send Message'; e.target.reset(); }, 2500);
  });

  loadTrucks();
}

document.addEventListener('DOMContentLoaded', init);
