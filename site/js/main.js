// ============================================================
// Eagle Ridge Trucks — Storefront JS
// Loads trucks from the API, renders the grid with animations,
// handles search/filter/sort, and the truck detail modal.
// ============================================================

// Where the site gets its data. In production this is the Cloudflare
// Worker URL; when testing locally it can point at the local data file.
// API_BASE is the worker root (no trailing /api) — the fetch below appends its own path.
const API_BASE = (window.SITE_CONFIG?.apiBase || '').replace(/\/+$/, '');
const DATA_FALLBACK = 'data/trucks.json';

// Which page are we on?
//   'home'      → index.html: show only the most expensive trucks (flagships)
//   'inventory' → inventory.html: show ALL listed trucks with filters
const PAGE = window.SITE_PAGE || 'home';
// How many flagships to show on the home page
const FLAGSHIP_COUNT = 3;

let allTrucks = [];

// ─── Load trucks ───────────────────────────────────────────
async function loadTrucks() {
  try {
    const res = await fetch(`${API_BASE}/trucks`);
    if (!res.ok) throw new Error('API failed');
    const data = await res.json();
    allTrucks = normalizeTrucks(Array.isArray(data) ? data : data.trucks || []);
  } catch (e) {
    // Fallback: read the local JSON (for local testing without the worker)
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

// Normalize + only show listed trucks on the public site
function normalizeTrucks(trucks) {
  return trucks
    .filter((t) => t && t.listed !== false)
    .map((t) => ({
      id: t.id || t.stock || '',
      year: t.year || '',
      make: t.make || '',
      model: t.model || '',
      trim: t.trim || '',
      price: t.price || '',
      mileage: t.mileage || '',
      bodyStyle: t.bodyStyle || '',
      exteriorColor: t.exteriorColor || '',
      interiorColor: t.interiorColor || '',
      fuelType: t.fuelType || '',
      transmission: t.transmission || '',
      drivetrain: t.drivetrain || '',
      engine: t.engine || '',
      description: t.description || '',
      aiDescription: t.aiDescription || '',
      images: (t.customImages && t.customImages.length ? t.customImages : t.images || []).map(resolveImage),
    }));
}

// Resolve image paths (local files or full URLs)
function resolveImage(img) {
  if (/^https?:\/\//i.test(img)) return img;
  return `data/${img}`; // relative to the site
}

// ─── Render ────────────────────────────────────────────────
function renderAll() {
  if (PAGE === 'home') {
    // Home page: top N most expensive trucks
    const byPrice = [...allTrucks].sort((a, b) => priceNum(b.price) - priceNum(a.price));
    renderGrid(byPrice.slice(0, FLAGSHIP_COUNT), true);
    return;
  }
  // Inventory page: full list with filters
  populateMakes();
  const filtered = applyFilters(allTrucks);
  renderGrid(filtered);
}

function populateMakes() {
  const select = document.getElementById('makeFilter');
  const makes = [...new Set(allTrucks.map((t) => t.make).filter(Boolean))].sort();
  select.innerHTML = '<option value="">All Makes</option>' +
    makes.map((m) => `<option value="${m}">${m}</option>`).join('');
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

// Shared price helper (also used by the home page flagship sort)
function priceNum(p) {
  const n = parseFloat(String(p).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? -Infinity : n;
}

function renderGrid(list, isFlagship) {
  const grid = document.getElementById('truckGrid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty">No trucks match your search.</div>';
    return;
  }
  grid.innerHTML = list.map((t, i) => cardHTML(t, i)).join('');
  // Trigger reveal animations
  requestAnimationFrame(() => {
    grid.querySelectorAll('.truck-card').forEach((c) => c.classList.add('in-view'));
  });
  // Attach click handlers
  grid.querySelectorAll('.truck-card').forEach((card, idx) => {
    card.addEventListener('click', () => openModal(list[idx]));
  });
}

function cardHTML(t, i) {
  const img = t.images[0] || '';
  const title = [t.year, t.make, t.model, t.trim].filter(Boolean).join(' ');
  const price = t.price ? `$${priceNum(t.price).toLocaleString()}` : 'Call for price';
  return `
    <article class="truck-card reveal" style="transition-delay:${Math.min(i * 0.05, 0.4)}s">
      <div class="truck-card-img-wrap">
        ${img ? `<img class="truck-card-img" src="${img}" alt="${title}" loading="lazy">` : '<div class="truck-card-img"></div>'}
        ${t.bodyStyle ? `<span class="truck-badge">${t.bodyStyle}</span>` : ''}
      </div>
      <div class="truck-card-body">
        <h3 class="truck-card-title">${title}</h3>
        <p class="truck-card-sub">${t.exteriorColor || ''} · ${t.mileage ? `${Number(t.mileage).toLocaleString()} km` : ''}</p>
        <div class="truck-card-price">${price}</div>
        <div class="truck-card-meta">
          ${t.transmission ? `<span>⚙️ ${t.transmission}</span>` : ''}
          ${t.drivetrain ? `<span>🔗 ${t.drivetrain}</span>` : ''}
          ${t.fuelType ? `<span>⛽ ${t.fuelType}</span>` : ''}
        </div>
      </div>
    </article>`;
}

// ─── Modal ─────────────────────────────────────────────────
function openModal(t) {
  const modal = document.getElementById('truckModal');
  const body = document.getElementById('modalBody');
  const title = [t.year, t.make, t.model, t.trim].filter(Boolean).join(' ');
  const price = t.price ? `$${priceNum(t.price).toLocaleString()}` : 'Call for price';

  // Gallery (first image large, rest as thumbs)
  const imgs = t.images.filter(Boolean);
  const gallery = imgs.length ? `
    <div class="modal-gallery">
      <img class="modal-main-img" id="modalMainImg" src="${imgs[0]}" alt="${title}">
      ${imgs.length > 1 ? `<div class="modal-thumbs">${imgs.slice(1).map((im, i) => `<img class="modal-thumb" src="${im}" data-src="${im}" alt="">`).join('')}</div>` : ''}
    </div>` : '';

  const specs = [
    ['Year', t.year], ['Make', t.make], ['Model', t.model], ['Trim', t.trim],
    ['Body', t.bodyStyle], ['Color', t.exteriorColor], ['Interior', t.interiorColor],
    ['Mileage', t.mileage ? `${Number(t.mileage).toLocaleString()} km` : ''],
    ['Transmission', t.transmission], ['Drivetrain', t.drivetrain],
    ['Fuel', t.fuelType], ['Engine', t.engine], ['Stock', t.id],
  ].filter(([, v]) => v);

  body.innerHTML = `
    ${gallery}
    <h2 class="modal-title">${title}</h2>
    <div class="modal-price">${price}</div>
    <div class="modal-specs">
      ${specs.map(([k, v]) => `<div class="modal-spec"><div class="modal-spec-label">${k}</div><div class="modal-spec-value">${v}</div></div>`).join('')}
    </div>
    ${(t.aiDescription || t.description) ? `<p class="modal-desc">${t.aiDescription || t.description}</p>` : ''}
    <a href="#contact" class="btn btn-primary modal-cta" data-close>Enquire about this truck</a>
  `;

  // Thumb click → swap main image
  body.querySelectorAll('.modal-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      document.getElementById('modalMainImg').src = thumb.dataset.src;
    });
  });

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = document.getElementById('truckModal');
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

// ─── Nav scroll effect ─────────────────────────────────────
function initNav() {
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ─── Reveal on scroll (IntersectionObserver) ───────────────
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

// ─── Stat count ────────────────────────────────────────────
function updateStatCount() {
  const el = document.getElementById('statCount');
  if (el) el.textContent = allTrucks.length;
}

// ─── Wire up events ────────────────────────────────────────
function init() {
  initNav();
  initReveals();
  document.getElementById('year').textContent = new Date().getFullYear();

  // Inventory page filters only
  if (PAGE === 'inventory') {
    ['searchInput', 'makeFilter', 'sortFilter'].forEach((id) => {
      document.getElementById(id).addEventListener('input', renderAll);
    });
  }

  // Modal close
  document.getElementById('truckModal').addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close')) closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // Contact form (simple success message) — only exists on the home page
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
