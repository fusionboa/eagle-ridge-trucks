// ============================================================
// Eagle Ridge Trucks — Admin JS
// Google sign-in (email allowlist), truck management with
// Listed/Unlisted tabs, edit modal, bulk image download.
// ============================================================

// API_BASE is the worker ROOT (no trailing /api) — every fetch below appends its own /api path.
const API_BASE = (window.ADMIN_CONFIG?.apiBase || '').replace(/\/+$/, '');
let allTrucks = [];
let allBackups = [];
let authToken = localStorage.getItem('er_admin_token') || '';
let devMode = localStorage.getItem('er_dev_mode') === 'true';
const DEV_KEY = 'er-dev-2026-test';
let currentTab = 'listed';

// ─── Auth (Firebase, same project as FB Lister) ────────────
let firebaseAuth = null;

function initAuth() {
  const cfg = window.ADMIN_CONFIG?.firebase;
  if (!cfg) { document.getElementById('loginError').textContent = 'Missing firebase config'; return; }
  firebase.initializeApp(cfg);
  firebaseAuth = firebase.auth();

  firebaseAuth.onAuthStateChanged(async (user) => {
    if (user) {
      authToken = await user.getIdToken();
      localStorage.setItem('er_admin_token', authToken);
      showApp();
      // Auto-refresh token every 30 min (like FB Lister)
      setInterval(async () => {
        if (firebaseAuth.currentUser) {
          authToken = await firebaseAuth.currentUser.getIdToken(true);
          localStorage.setItem('er_admin_token', authToken);
        }
      }, 30 * 60 * 1000);
    } else {
      document.getElementById('loginGate').hidden = false;
      document.getElementById('app').hidden = true;
    }
  });
}

function signOut() {
  if (firebaseAuth) firebaseAuth.signOut();
  authToken = '';
  devMode = false;
  localStorage.removeItem('er_admin_token');
  localStorage.removeItem('er_dev_mode');
  location.reload();
}

// TEST MODE — skip Google login (worker must have DEV_MODE=true + DEV_KEY set)
function enterDevMode() {
  devMode = true;
  localStorage.setItem('er_dev_mode', 'true');
  authToken = DEV_KEY;
  document.getElementById('loginGate').hidden = true;
  document.getElementById('app').hidden = false;
  loadTrucks();
}

// ─── App boot ───────────────────────────────────────────────
function showApp() {
  document.getElementById('loginGate').hidden = true;
  document.getElementById('app').hidden = false;
  loadTrucks();
}

// ─── Load trucks ────────────────────────────────────────────
async function loadTrucks() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/trucks`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    allTrucks = data.trucks || [];
  } catch (e) {
    console.error(e);
    document.getElementById('truckList').innerHTML = '<div class="error">Failed to load inventory. Check the worker URL and auth.</div>';
    return;
  }
  renderStats();
  renderList();
  loadBackups();
}

// Headers for API calls — dev mode sends X-Dev-Key, real mode sends the Google token
function authHeaders(extra = {}) {
  if (devMode) {
    return { 'X-Dev-Key': authToken, ...extra };
  }
  return { 'Authorization': `Bearer ${authToken}`, ...extra };
}

// Load backups (published trucks that left the feed)
async function loadBackups() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/backups`, { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      allBackups = data.backups || [];
      if (currentTab === 'backups') renderList();
    }
  } catch (e) { console.error(e); }
}

async function restoreBackup(id) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/backup/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!res.ok) { alert('Restore failed'); return; }
    alert('Restored as an unlisted draft — review it, then List it.');
    loadTrucks();
  } catch (e) { alert('Restore failed'); }
}

// ─── Stats ──────────────────────────────────────────────────
function renderStats() {
  const listed = allTrucks.filter((t) => t.listed).length;
  const unlisted = allTrucks.length - listed;
  document.getElementById('statListed').textContent = listed;
  document.getElementById('statUnlisted').textContent = unlisted;
  document.getElementById('statTotal').textContent = allTrucks.length;
  document.getElementById('statLastSync').textContent = allTrucks.length ? 'ok' : '—';
}

// ─── List ───────────────────────────────────────────────────
function renderList() {
  const list = document.getElementById('truckList');

  // Backups tab shows published trucks that left the feed
  if (currentTab === 'backups') {
    if (!allBackups.length) {
      list.innerHTML = '<div class="empty">No backups — every published truck is safe in the live feed.</div>';
      return;
    }
    list.innerHTML = allBackups.map((t) => `
      <div class="truck-row is-backup" data-id="${t.id}">
        <div class="truck-row-img">${truckImage(t)}</div>
        <div class="truck-row-info">
          <div class="truck-row-title">${[t.year, t.make, t.model, t.trim].filter(Boolean).join(' ') || t.id}</div>
          <div class="truck-row-sub">${t.id} · left the feed · backed up ${t.backedUpAt ? new Date(t.backedUpAt).toLocaleString() : ''}</div>
        </div>
        <div class="truck-row-price">${t.price ? `$${Number(t.price).toLocaleString()}` : '—'}</div>
        <div class="truck-row-actions">
          <button class="btn btn-sm btn-primary" data-action="restore">↩ Restore</button>
          <button class="btn btn-sm btn-ghost" data-action="edit-backup">Edit</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.truck-row').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-action="restore"]').addEventListener('click', () => restoreBackup(id));
      row.querySelector('[data-action="edit-backup"]').addEventListener('click', () => {
        const t = allBackups.find((b) => b.id === id);
        if (t) openEditModal(id, t);
      });
    });
    return;
  }

  let filtered = allTrucks;
  if (currentTab === 'listed') filtered = allTrucks.filter((t) => t.listed);
  if (currentTab === 'unlisted') filtered = allTrucks.filter((t) => !t.listed);

  if (!filtered.length) {
    list.innerHTML = `<div class="empty">No trucks in "${currentTab}".</div>`;
    return;
  }

  list.innerHTML = filtered.map((t) => `
    <div class="truck-row ${t.listed ? 'is-listed' : ''}" data-id="${t.id}">
      <div class="truck-row-img">
        ${truckImage(t)}
      </div>
      <div class="truck-row-info">
        <div class="truck-row-title">${[t.year, t.make, t.model, t.trim].filter(Boolean).join(' ') || t.id}</div>
        <div class="truck-row-sub">${t.id} · ${t.mileage ? `${Number(t.mileage).toLocaleString()} km` : '—'} · ${t.exteriorColor || '—'}</div>
      </div>
      <div class="truck-row-price">${t.price ? `$${Number(t.price).toLocaleString()}` : '—'}</div>
      <div class="truck-row-actions">
        <button class="btn btn-sm ${t.listed ? 'btn-ghost' : 'btn-primary'}" data-action="toggle">${t.listed ? 'Unlist' : 'List'}</button>
        <button class="btn btn-sm btn-ghost" data-action="edit">Edit</button>
        <button class="btn btn-sm btn-ghost" data-action="images">Images</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.truck-row').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('[data-action="toggle"]').addEventListener('click', () => toggleListed(id));
    row.querySelector('[data-action="edit"]').addEventListener('click', () => openEditModal(id));
    row.querySelector('[data-action="images"]').addEventListener('click', () => openImagesModal(id));
  });
}

function truckImage(t) {
  const img = (t.customImages && t.customImages[0]) || (t.images && t.images[0]);
  if (!img) return '<div class="img-placeholder">📷</div>';
  return `<img src="${img}" alt="">`;
}

// ─── Toggle listed ──────────────────────────────────────────
async function toggleListed(id) {
  const truck = allTrucks.find((t) => t.id === id);
  if (!truck) return;
  const updated = await updateTruck(id, { listed: !truck.listed });
  if (updated) { loadTrucks(); }
}

// ─── Update truck ───────────────────────────────────────────
async function updateTruck(id, patch) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/truck/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) { alert('Update failed'); return false; }
    return true;
  } catch (e) { alert('Update failed'); return false; }
}

// ─── Edit modal ─────────────────────────────────────────────
function openEditModal(id) {
  const truck = allTrucks.find((t) => t.id === id);
  if (!truck) return;
  const modal = document.getElementById('editModal');
  const body = document.getElementById('editBody');

  const field = (label, key, type = 'text') => `
    <label class="field">
      <span>${label}</span>
      <input type="${type}" data-key="${key}" value="${escapeHtml(truck[key] || '')}">
    </label>`;

  body.innerHTML = `
    <h2>Edit — ${[truck.year, truck.make, truck.model].filter(Boolean).join(' ') || truck.id}</h2>
    <div class="edit-form">
      ${field('Year', 'year')}
      ${field('Make', 'make')}
      ${field('Model', 'model')}
      ${field('Trim', 'trim')}
      ${field('Price', 'price', 'text')}  <!-- text, not number: prices come from the feed as "34544 CAD" strings -->
      ${field('Mileage', 'mileage', 'number')}
      ${field('Exterior Color', 'exteriorColor')}
      ${field('Interior Color', 'interiorColor')}
      ${field('Transmission', 'transmission')}
      ${field('Drivetrain', 'drivetrain')}
      ${field('Fuel', 'fuelType')}
      ${field('Engine', 'engine')}
      ${field('Body Style', 'bodyStyle')}
      <label class="field field-full">
        <span>Description</span>
        <textarea data-key="description" rows="4">${escapeHtml(truck.description || '')}</textarea>
      </label>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="saveEditBtn">Save changes</button>
      <button class="btn btn-ghost" data-close>Cancel</button>
    </div>
  `;

  modal.classList.add('open');

  document.getElementById('saveEditBtn').addEventListener('click', async () => {
    const patch = {};
    body.querySelectorAll('[data-key]').forEach((el) => {
      patch[el.dataset.key] = el.value;
    });
    if (await updateTruck(id, patch)) {
      closeModal();
      loadTrucks();
    }
  });
}

// ─── Images modal (bulk download + re-upload) ───────────────
function openImagesModal(id) {
  const truck = allTrucks.find((t) => t.id === id);
  if (!truck) return;
  const modal = document.getElementById('editModal');
  const body = document.getElementById('editBody');

  const imgs = (truck.customImages && truck.customImages.length ? truck.customImages : truck.images || []);
  const title = [truck.year, truck.make, truck.model].filter(Boolean).join(' ') || truck.id;

  body.innerHTML = `
    <h2>Images — ${title}</h2>
    <p class="hint">Download the originals, edit them (remove branding / enhance) in Gemini, then upload the edited versions back.</p>
    <div class="img-grid">
      ${imgs.map((im, i) => `
        <div class="img-cell">
          <img src="${im}" alt="">
          <span class="img-idx">#${i + 1}</span>
        </div>`).join('')}
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="downloadImgsBtn">⬇ Download all (${imgs.length})</button>
      <button class="btn btn-ghost" id="uploadImgsBtn">⬆ Upload edited images</button>
      <button class="btn btn-ghost" data-close>Close</button>
    </div>
  `;
  modal.classList.add('open');

  // Bulk download: fetch each image and save as a zip-less set (browser downloads each)
  document.getElementById('downloadImgsBtn').addEventListener('click', async () => {
    for (let i = 0; i < imgs.length; i++) {
      try {
        const res = await fetch(imgs[i]);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${id}-${i + 1}.jpg`;
        a.click();
        URL.revokeObjectURL(url);
        await new Promise((r) => setTimeout(r, 300));
      } catch (e) { console.warn(`Image ${i} failed`, e); }
    }
  });

  // Re-upload edited images: file picker → store as data URLs in customImages
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  document.getElementById('uploadImgsBtn').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const files = [...input.files];
    if (!files.length) return;
    const dataUrls = [];
    for (const f of files) {
      dataUrls.push(await fileToDataURL(f));
    }
    if (await updateTruck(id, { customImages: dataUrls })) {
      closeModal();
      loadTrucks();
      alert(`Uploaded ${dataUrls.length} image(s). They're now on the listing.`);
    }
  });
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Helpers ────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function closeModal() {
  document.querySelectorAll('.modal').forEach((m) => m.classList.remove('open'));
}

// ─── Wire up ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Firebase Google sign-in (same popup flow as FB Lister)
  document.getElementById('googleSignIn').addEventListener('click', async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await firebaseAuth.signInWithPopup(provider);
    } catch (e) {
      console.error('Sign in failed:', e);
      document.getElementById('loginError').textContent = 'Sign in failed — ' + e.message;
    }
  });

  document.getElementById('signOutBtn').addEventListener('click', signOut);

  // Test mode — skip Google login
  document.getElementById('devModeBtn').addEventListener('click', enterDevMode);
  document.getElementById('syncNowBtn').addEventListener('click', async () => {
    alert('Sync requested — the bridge on the server pulls from FTP hourly. If you just changed the feed, it will update on the next sync.');
  });

  // Tabs
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      renderList();
    });
  });

  // Modal close
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) closeModal(); });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // 🔧 TEST MODE: boot straight into the admin (no Google login).
  // Comment out enterDevMode() and uncomment initAuth() to go back to Google sign-in.
  enterDevMode();
  // initAuth();
});
