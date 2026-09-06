// ============================================================
// AI-Clean Photos — per-truck button + Do-All batch runner
// (loaded by admin/index.html after admin.js)
//
// How it works:
//   • Each click loops the truck's ORIGINAL feed images one at a
//     time, POSTing each to /api/admin/gemini-one (~$0.04/image).
//   • The worker endpoint is IDEMPOTENT: if a slot is already a
//     cleaned KV image it returns {skipped:true} without calling
//     Gemini — so re-runs and double-clicks cost $0.
//   • Only ORIGINAL feed URLs get cleaned (skips anything already
//     under /images/img-), so no cleaned image is ever re-sent.
//   • Live progress bar + per-image status + running cost.
//   • The public site prefers customImages — results appear on
//     dangm.ca immediately after each image.
// ============================================================

(function () {
  if (!window.API_BASE) return; // admin.js not loaded

  const COST_PER_IMAGE = 0.04;
  let running = false; // one job at a time across the whole panel

  const authHeaders = () => (typeof window.authHeaders === 'function' ? window.authHeaders() : {});

  // Pull the truck list fresh from the worker (admin.js cache can be stale)
  async function fetchTrucks() {
    const res = await fetch(`${window.API_BASE}/api/admin/trucks`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`failed to load trucks (HTTP ${res.status})`);
    const data = await res.json();
    return data.trucks || [];
  }

  function ensureBar() {
    let bar = document.getElementById('aiCleanBar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'aiCleanBar';
    bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:9999;' +
      'background:#15171c;color:#e8eaed;border:1px solid #2c2f36;border-radius:12px;padding:12px 16px;' +
      'width:min(560px,92vw);box-shadow:0 8px 30px rgba(0,0,0,.45);font-size:13px;display:none';
    bar.innerHTML = `
      <div id="aiCleanTitle" style="font-weight:600;margin-bottom:6px">AI-Clean</div>
      <div style="height:6px;background:#2c2f36;border-radius:3px;overflow:hidden">
        <div id="aiCleanFill" style="height:100%;width:0;background:#4f8cff;transition:width .3s"></div>
      </div>
      <div id="aiCleanStatus" style="margin-top:6px;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
      <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center">
        <span id="aiCleanCost" style="opacity:.8"></span>
        <button id="aiCleanStop" class="btn btn-ghost btn-sm">Stop</button>
      </div>`;
    document.body.appendChild(bar);
    document.getElementById('aiCleanStop').addEventListener('click', () => { running = false; });
    return bar;
  }

  const setUI = (fill, status, cost) => {
    if (fill !== null) document.getElementById('aiCleanFill').style.width = `${fill}%`;
    if (status !== null) document.getElementById('aiCleanStatus').textContent = status;
    if (cost !== null) document.getElementById('aiCleanCost').textContent = cost;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Clean one truck: loop its ORIGINAL feed images through gemini-one.
  async function cleanTruck(truck, bar) {
    const feed = Array.isArray(truck.images) ? truck.images : [];
    if (!feed.length) return { done: 0, skipped: 0, failed: 0, note: 'no feed images' };

    const total = feed.length;
    let done = 0, skipped = 0, failed = 0, spent = 0;

    for (let i = 0; i < total; i++) {
      if (!running) break;
      const src = feed[i];
      // Safety: never send an already-cleaned KV image back to Gemini
      if (!src || /\/images\/img-/.test(src)) { skipped++; continue; }

      setUI((i / total) * 100, `${truck.title || truck.id} — image ${i + 1}/${total}`, `$${spent.toFixed(2)} spent this run`);
      try {
        const res = await fetch(`${window.API_BASE}/api/admin/gemini-one`, {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ truckId: truck.id, index: i, imageUrl: src }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          if (data.skipped) { skipped++; }
          else { done++; spent += COST_PER_IMAGE; }
        } else if (res.status === 503) {
          // Gemini busy — retry this image once after a pause
          await sleep(4000);
          const r2 = await fetch(`${window.API_BASE}/api/admin/gemini-one`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ truckId: truck.id, index: i, imageUrl: src }),
          });
          const d2 = await r2.json().catch(() => ({}));
          if (r2.ok && d2.ok && !d2.skipped) { done++; spent += COST_PER_IMAGE; }
          else if (r2.ok && d2.ok) { skipped++; }
          else failed++;
        } else {
          failed++;
          console.warn('gemini-one failed:', truck.id, i, data.error || res.status);
        }
      } catch (e) {
        failed++;
        console.warn('gemini-one network error:', truck.id, i, e.message);
      }
      setUI(((i + 1) / total) * 100, null, `$${spent.toFixed(2)} spent this run`);
      await sleep(400); // polite pacing
    }
    return { done, skipped, failed, spent };
  }

  // ─── Per-truck button (delegated: works with re-renders) ───
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="ai-clean"]');
    if (!btn || running) return;
    const row = btn.closest('.truck-row');
    const id = row && row.dataset.id;
    if (!id) return;

    let trucks;
    try { trucks = await fetchTrucks(); }
    catch (err) { alert('Could not load trucks: ' + err.message); return; }
    const truck = trucks.find((t) => String(t.id) === String(id));
    if (!truck) return alert('Truck not found');

    const feed = (truck.images || []).filter((u) => !/\/images\/img-/.test(u));
    if (!feed.length) return alert('This truck has no feed images to clean.');
    if (!confirm(`AI-clean ${feed.length} image(s) for\n${truck.title || truck.id}?\n\n≈ $${(feed.length * COST_PER_IMAGE).toFixed(2)}\nAlready-clean images are skipped for free.`)) return;

    running = true;
    const bar = ensureBar();
    bar.style.display = 'block';
    document.getElementById('aiCleanTitle').textContent = '✨ AI-Clean — one truck';
    btn.disabled = true;
    btn.textContent = 'Cleaning…';
    try {
      const r = await cleanTruck(truck, bar);
      setUI(100, `Done — ${r.done} cleaned, ${r.skipped} skipped, ${r.failed} failed`, `$${r.spent.toFixed(2)} spent`);
    } finally {
      running = false;
      btn.disabled = false;
      btn.textContent = '✨ AI-Clean';
      setTimeout(() => { bar.style.display = 'none'; }, 4000);
      if (typeof window.loadTrucks === 'function') window.loadTrucks(); // refresh thumbnails
    }
  });

  // ─── Do-All button (topbar) ───
  document.addEventListener('DOMContentLoaded', () => {
    const slot = document.querySelector('.topbar-right');
    if (!slot || document.getElementById('aiCleanAllBtn')) return;
    const b = document.createElement('button');
    b.className = 'btn btn-ghost btn-sm';
    b.id = 'aiCleanAllBtn';
    b.textContent = '✨ AI-Clean all listed';
    slot.insertBefore(b, slot.firstChild);

    b.addEventListener('click', async () => {
      if (running) return;
      let trucks;
      try { trucks = await fetchTrucks(); }
      catch (err) { return alert('Could not load trucks: ' + err.message); }

      const listed = trucks.filter((t) => t.listed === true);
      if (!listed.length) return alert('No LISTED trucks.\n\nList the trucks you want on the site first (List button), then run AI-Clean all listed.');
      // Only images that still need cleaning determine the cost
      const todoImages = listed.reduce((n, t) => n + (t.images || []).filter((u) => u && !/\/images\/img-/.test(u)).length, 0);
      if (!todoImages) return alert('Every listed truck is already clean. $0 needed 🎉');

      const est = (todoImages * COST_PER_IMAGE).toFixed(2);
      if (!confirm(`AI-Clean ALL LISTED trucks?\n\n${listed.length} trucks · ${todoImages} images to clean\nEstimated: $${est} (skipped images are free)\n\nRuns in the background of this tab — keep it open.`)) return;

      running = true;
      const bar = ensureBar();
      bar.style.display = 'block';
      document.getElementById('aiCleanTitle').textContent = '✨ AI-Clean — all listed';
      b.disabled = true;
      let totalDone = 0, totalSkipped = 0, totalFailed = 0, totalSpent = 0;
      try {
        for (let i = 0; i < listed.length; i++) {
          if (!running) break;
          setUI((i / listed.length) * 100, `Truck ${i + 1}/${listed.length}: ${listed[i].title || listed[i].id}`, `$${totalSpent.toFixed(2)} spent`);
          const r = await cleanTruck(listed[i], bar);
          totalDone += r.done; totalSkipped += r.skipped; totalFailed += r.failed; totalSpent += r.spent || 0;
        }
        setUI(100, `ALL DONE — ${totalDone} cleaned, ${totalSkipped} skipped, ${totalFailed} failed across ${listed.length} trucks`, `$${totalSpent.toFixed(2)} spent total`);
      } finally {
        running = false;
        b.disabled = false;
        setTimeout(() => { bar.style.display = 'none'; }, 6000);
        if (typeof window.loadTrucks === 'function') window.loadTrucks();
      }
    });
  });
})();
