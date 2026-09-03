// ============================================================
// Eagle Ridge Trucks — Admin JS
// Google sign-in (email allowlist), truck management with
// Listed/Unlisted tabs, edit modal, bulk image download.
// ============================================================

// API_BASE is the worker ROOT (no trailing /api) — every fetch below appends its own /api path.
const API_BASE = (window.ADMIN_CONFIG?.apiBase || '').replace(/\/+$/, '');
let allTrucks = [];
let allBackups = [];
let forumPosts = [];
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
        <div class="truck-row-price">${formatPrice(t.price)}</div>
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

  // Forum tab: comparison posts ("GMC Acadia vs ...")
  if (currentTab === 'forum') {
    if (!forumPosts.length) {
      list.innerHTML = '<div class="empty">No posts yet. Click "+ New post" to write your first comparison.</div>';
      return;
    }
    list.innerHTML = forumPosts.map((p) => `
      <div class="truck-row" data-id="${p.id}">
        <div class="truck-row-img">${p.image ? `<img src="${p.image}" alt="">` : '<div class="img-placeholder">📝</div>'}</div>
        <div class="truck-row-info">
          <div class="truck-row-title">${escapeHtml(p.title)}</div>
          <div class="truck-row-sub">${escapeHtml(String(p.body || '').slice(0, 140))}</div>
        </div>
        <div class="truck-row-actions">
          <button class="btn btn-sm btn-ghost" data-action="edit-post">Edit</button>
          <button class="btn btn-sm btn-ghost" data-action="delete-post">Delete</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.truck-row').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-action="edit-post"]').addEventListener('click', () => {
        const p = forumPosts.find((x) => x.id === id);
        if (p) openForumModal(p);
      });
      row.querySelector('[data-action="delete-post"]').addEventListener('click', () => deleteForumPost(id));
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
      <div class="truck-row-price">${formatPrice(t.price)}</div>
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
    <h2>Images: ${title}</h2>
    <p class="hint">Download the originals, edit them (remove branding / enhance) in Gemini, then upload the edited versions back.</p>
    <div class="img-grid">
      ${imgs.map((im, i) => `
        <div class="img-cell">
          <img src="${im}" alt="">
          <span class="img-idx">#${i + 1}</span>
          ${i === 0
            ? '<span class="img-cover-badge" title="Cover photo">⭐ Cover</span>'
            : `<button class="img-cover-btn" data-cover="${i}" title="Make this the cover photo">Set cover</button>`}
          <button class="img-copy" data-copy="${i}" title="Copy this image to clipboard">📋 Copy</button>
        </div>`).join('')}
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="saveImgsBtn">💾 Save images (${imgs.length})</button>
      <button class="btn btn-ghost" id="downloadImgsBtn">⬇ Download ZIP</button>
      <button class="btn btn-ghost" id="uploadImgsBtn">⬆ Upload images</button>
      <button class="btn btn-ghost" id="uploadFolderBtn">📁 Upload folder</button>
      <button class="btn btn-ghost" id="dragImgsBtn" draggable="true" title="DRAG this button into the Gemini window and drop it there — all images upload as real files">🚀 Drag to Gemini</button>
      <button class="btn btn-ghost" data-close>Close</button>
    </div>
  `;
  modal.classList.add('open');

  // Hover-to-copy: each thumbnail shows a 📋 button on hover; clicking copies
  // that ONE image to the clipboard as a real PNG. Single-image clipboard IS
  // supported by Chrome (only copying MANY images at once isn't), so this
  // pastes straight into Gemini/etc. — the true "Ctrl+C an image" behaviour.
  document.querySelectorAll('.img-copy').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.copy);
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳';
      try {
        if (!navigator.clipboard || !window.ClipboardItem) throw new Error('unsupported');
        const blob = await fetchImageBlob(imgs[idx]);
        if (!blob) throw new Error('fetch failed');
        const png = await toPngBlob(blob);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
        btn.textContent = '✓';
      } catch (err) {
        btn.textContent = '⚠';
      } finally {
        setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1200);
      }
    });
  });

  // 🚀 Drag-to-Gemini: browsers can't put files on the clipboard, but a DRAG
  // can carry real files across windows. On pointerdown we pre-fetch every
  // image (through the CORS proxy) as actual File objects; on dragstart they're
  // attached to the drag — drop the button inside Gemini's prompt and ALL the
  // images upload at once. The image FILES travel, never the links.
  const dragBtn = document.getElementById('dragImgsBtn');
  let dragFiles = null; // ready File objects
  let dragPrefetching = false;
  const prefetchDragFiles = async () => {
    if (dragFiles || dragPrefetching) return;
    dragPrefetching = true;
    const original = dragBtn.textContent;
    dragBtn.textContent = '⏳ Preparing…';
    const files = [];
    for (let i = 0; i < imgs.length; i++) {
      dragBtn.textContent = `⏳ ${i + 1}/${imgs.length}…`;
      try {
        const blob = await fetchImageBlob(imgs[i]);
        if (!blob) continue;
        const png = await toPngBlob(blob);
        files.push(new File([png], `${id}-${String(i + 1).padStart(2, '0')}.png`, { type: 'image/png' }));
      } catch (e) { console.error('drag prefetch failed:', e); }
    }
    dragFiles = files;
    dragPrefetching = false;
    dragBtn.textContent = files.length ? `🚀 Drag ${files.length} images →` : original;
  };
  dragBtn.addEventListener('pointerdown', prefetchDragFiles); // starts preparing the moment you reach for it
  dragBtn.addEventListener('keydown', prefetchDragFiles);
  dragBtn.addEventListener('dragstart', (e) => {
    if (!dragFiles || !dragFiles.length) {
      e.preventDefault();
      alert('Still preparing the images — give it a second, then drag again.');
      return;
    }
    e.dataTransfer.effectAllowed = 'copy';
    for (const f of dragFiles) e.dataTransfer.items.add(f); // real files, not links
    e.dataTransfer.setData('text/plain', `${dragFiles.length} vehicle images`); // fallback if drop target ignores files
    e.dataTransfer.setDragImage(dragBtn, 20, 20);
  });
  dragBtn.addEventListener('dragend', () => { dragFiles = null; dragBtn.textContent = '🚀 Drag to Gemini'; });

  // Set cover: the first image in customImages is the cover photo. Moving a
  // chosen image to the front changes the cover on the site + admin instantly.
  document.querySelectorAll('.img-cover-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.cover);
      const list = [...imgs];
      const [img] = list.splice(idx, 1);
      list.unshift(img);
      if (await updateTruck(id, { customImages: list })) {
        await loadTrucks();
        openImagesModal(id);
      }
    });
  });

  // Bulk download → bundle every image into a folder ZIP (single download).
  // Images are fetched through the worker's CORS proxy (/api/image) because
  // images.edealer.ca doesn't send CORS headers.
  document.getElementById('downloadImgsBtn').addEventListener('click', async () => {
    const btn = document.getElementById('downloadImgsBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Downloading…';
    try {
      if (typeof JSZip === 'undefined') throw new Error('JSZip not loaded');
      const zip = new JSZip();
      const folder = zip.folder(`${id}-images`);
      let ok = 0;
      for (let i = 0; i < imgs.length; i++) {
        const src = imgs[i];
        const proxyUrl = `${API_BASE}/api/image?url=${encodeURIComponent(src)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) continue;
        const blob = await res.blob();
        const ext = (src.match(/\.(jpg|jpeg|png|webp|gif)/i) || ['', 'jpg'])[1].toLowerCase();
        folder.file(`${i + 1}.${ext}`, blob);
        ok++;
      }
      if (!ok) throw new Error('no images fetched');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = `${id}-images.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      btn.textContent = `✓ Downloaded ${ok} images`;
    } catch (e) {
      alert('Download failed: ' + e.message);
      btn.textContent = originalText;
    } finally {
      btn.disabled = false;
    }
  });

  // Save images → write the actual image FILES into a folder you pick
  // (Chrome/Edge via the File System Access API) so you get real files to
  // copy/drag into Gemini. Falls back to a ZIP download elsewhere.
  document.getElementById('saveImgsBtn').addEventListener('click', async () => {
    const btn = document.getElementById('saveImgsBtn');
    const originalText = btn.textContent;
    btn.disabled = true;

    // Pick the folder FIRST — it needs this click's user-activation.
    let dir = null;
    if (window.showDirectoryPicker) {
      try {
        dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (e) {
        if (e.name === 'AbortError') { btn.disabled = false; return; } // user cancelled
        dir = null; // fall through to ZIP
      }
    }

    btn.textContent = dir ? '⏳ Saving…' : '⏳ Downloading…';
    try {
      let ok = 0;
      if (dir) {
        for (let i = 0; i < imgs.length; i++) {
          const blob = await fetchImageBlob(imgs[i]);
          if (!blob) continue;
          const name = `${String(i + 1).padStart(2, '0')}.${extOf(imgs[i])}`;
          const fh = await dir.getFileHandle(name, { create: true });
          const w = await fh.createWritable();
          await w.write(blob);
          await w.close();
          ok++;
        }
        btn.textContent = `✓ Saved ${ok} images to folder`;
      } else {
        if (typeof JSZip === 'undefined') throw new Error('JSZip not loaded');
        const zip = new JSZip();
        const folder = zip.folder(`${id}-images`);
        for (let i = 0; i < imgs.length; i++) {
          const blob = await fetchImageBlob(imgs[i]);
          if (!blob) continue;
          folder.file(`${String(i + 1).padStart(2, '0')}.${extOf(imgs[i])}`, blob);
          ok++;
        }
        if (!ok) throw new Error('no images fetched');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(zipBlob);
        a.download = `${id}-images.zip`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        btn.textContent = `✓ Downloaded ${ok} images (ZIP)`;
      }
      setTimeout(() => { btn.textContent = originalText; }, 3000);
    } catch (e) {
      if (e.name !== 'AbortError') alert('Save failed: ' + e.message);
      btn.textContent = originalText;
    } finally {
      btn.disabled = false;
    }
  });

  // Upload: accepts either hand-picked files or an entire folder.
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;

  const folderInput = document.createElement('input');
  folderInput.type = 'file';
  folderInput.accept = 'image/*';
  folderInput.multiple = true;
  folderInput.webkitdirectory = true;

  document.getElementById('uploadImgsBtn').addEventListener('click', () => fileInput.click());
  document.getElementById('uploadFolderBtn').addEventListener('click', () => folderInput.click());

  const handleFiles = async (files) => {
    const imgs = [...files].filter((f) => f.type && f.type.startsWith('image/'));
    if (!imgs.length) { alert('No image files found.'); return; }
    // Upload each image as raw bytes to KV (NOT base64 — D1 rows cap at 2MB).
    const urls = [];
    let ok = 0;
    for (const f of imgs) {
      try {
        const res = await fetch(`${API_BASE}/api/admin/upload-image`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': f.type || 'image/jpeg' }),
          body: f,
        });
        if (!res.ok) { console.error('image upload failed:', res.status); continue; }
        const data = await res.json();
        if (data.url) { urls.push(data.url); ok++; }
      } catch (e) { console.error(e); }
    }
    if (!ok) { alert('Upload failed — no images uploaded.'); return; }
    if (await updateTruck(id, { customImages: urls })) {
      closeModal();
      loadTrucks();
      alert(`Uploaded ${ok} image(s). They're now on the listing.`);
    }
  };
  fileInput.addEventListener('change', () => handleFiles(fileInput.files));
  folderInput.addEventListener('change', () => handleFiles(folderInput.files));
}

// Fetch an image through the worker's CORS proxy and return its blob (null on failure).
async function fetchImageBlob(src) {
  try {
    const res = await fetch(`${API_BASE}/api/image?url=${encodeURIComponent(src)}`);
    if (!res.ok) return null;
    return await res.blob();
  } catch (e) { return null; }
}
function extOf(src) {
  return (src.match(/\.(jpg|jpeg|png|webp|gif)/i) || ['', 'jpg'])[1].toLowerCase();
}

// Convert any image blob to PNG — the only format ClipboardItem reliably supports.
function toPngBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

// ─── Helpers ────────────────────────────────────────────────
// Parse prices like "34544 CAD" → 34544 (the feed ships price as a string with currency)
function priceNum(p) {
  const n = parseFloat(String(p || '').replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}
function formatPrice(p) {
  const n = priceNum(p);
  return n === null ? '—' : `$${n.toLocaleString()}`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function closeModal() {
  document.querySelectorAll('.modal').forEach((m) => m.classList.remove('open'));
}

// ─── Forum posts ────────────────────────────────────────────
async function loadForumPosts() {
  try {
    const res = await fetch(`${API_BASE}/api/forum`);
    if (res.ok) {
      const data = await res.json();
      forumPosts = data.posts || [];
      if (currentTab === 'forum') renderList();
    }
  } catch (e) { console.error(e); }
}

function openForumModal(post) {
  const modal = document.getElementById('editModal');
  const body = document.getElementById('editBody');
  const p = post || {};
  body.innerHTML = `
    <h2>${post ? 'Edit post' : 'New forum post'}</h2>
    <div class="edit-form">
      <label class="field field-full">
        <span>Title</span>
        <input type="text" id="forumTitle" value="${escapeHtml(p.title || '')}" placeholder="e.g. GMC Acadia vs Chevrolet Traverse">
      </label>
      <label class="field field-full">
        <span>Body</span>
        <textarea id="forumBody" rows="8" placeholder="Write the comparison...">${escapeHtml(p.body || '')}</textarea>
      </label>
      <label class="field field-full">
        <span>Image (optional)</span>
        <input type="file" id="forumImageInput" accept="image/*">
        ${p.image ? `<div class="hint">Current image:</div><img src="${p.image}" style="max-height:80px;border-radius:6px;margin-top:8px">` : ''}
      </label>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="saveForumBtn">Save post</button>
      <button class="btn btn-ghost" data-close>Cancel</button>
    </div>
  `;
  modal.classList.add('open');

  document.getElementById('saveForumBtn').addEventListener('click', async () => {
    const title = document.getElementById('forumTitle').value.trim();
    const bodyText = document.getElementById('forumBody').value.trim();
    if (!title) { alert('Title is required'); return; }
    const btn = document.getElementById('saveForumBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Saving…';
    try {
      let image = p.image || '';
      const fileInput = document.getElementById('forumImageInput');
      if (fileInput.files && fileInput.files[0]) {
        const f = fileInput.files[0];
        const up = await fetch(`${API_BASE}/api/admin/upload-image`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': f.type || 'image/jpeg' }),
          body: f,
        });
        if (up.ok) {
          const upJson = await up.json();
          image = upJson.url || image;
        }
      }
      const res = await fetch(`${API_BASE}/api/admin/forum`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: p.id, title, body: bodyText, image }),
      });
      if (!res.ok) { alert('Save failed'); btn.disabled = false; btn.textContent = 'Save post'; return; }
      closeModal();
      loadForumPosts();
    } catch (e) {
      alert('Save failed: ' + e.message);
      btn.disabled = false;
      btn.textContent = 'Save post';
    }
  });
}

async function deleteForumPost(id) {
  if (!confirm('Delete this post?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/admin/forum/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) { alert('Delete failed'); return; }
    loadForumPosts();
  } catch (e) { alert('Delete failed'); }
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
  document.getElementById('newPostBtn').addEventListener('click', () => openForumModal());

  // Tabs
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      if (currentTab === 'forum') loadForumPosts();
      else renderList();
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
