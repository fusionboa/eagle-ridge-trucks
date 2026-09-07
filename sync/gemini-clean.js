#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// gemini-clean.js — batch background/branding removal for dangm.ca inventory
//
// For each truck's photo (from data/images/, downloaded by sync.js), it:
//   1. Sends the image to Gemini image editing ("remove background +
//      dealership branding, keep the vehicle pixel-perfect")
//   2. Uploads the cleaned image to the worker → Cloudflare KV
//   3. Records it in the truck's customImages (which the site prefers over
//      feed images), keeping unprocessed feed images after the cleaned ones
//
// Safety rails:
//   • HARD BUDGET CAP — refuses to spend past --budget USD (default $35)
//   • PAY-ONCE CACHE — state file remembers every processed image; re-runs
//     and re-syncs never re-pay for done work
//   • RESUME — crash-safe: state is written after every single image
//
// Usage:
//   node gemini-clean.js --dry-run              # show plan + est. cost, do nothing
//   node gemini-clean.js --covers               # cover photo per truck (~$0.04 each)
//   node gemini-clean.js --covers --limit 25    # first 25 trucks only
//   node gemini-clean.js --full --limit 10      # all images for 10 trucks
//   node gemini-clean.js --covers --budget 16
//
// Requires in sync/.env: GEMINI_API_KEY=...  (plus existing WORKER_URL / BRIDGE_TOKEN)
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

// ─── Load .env (same tiny loader as sync.js) ────────────────────────────────
(() => {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const CONFIG = {
  workerUrl: (process.env.WORKER_URL || '').replace(/\/$/, ''),
  bridgeToken: process.env.BRIDGE_TOKEN || '',
  apiKey: process.env.GEMINI_API_KEY || '',
  model: process.env.GEMINI_MODEL || '', // optional override; auto-discovered if empty
  trucksFile: path.join(__dirname, '..', 'data', 'trucks.json'),
  imagesDir: path.join(__dirname, '..', 'data', 'images'),
  stateFile: path.join(__dirname, '..', 'data', 'gemini-state.json'),
};

// Cost model: each generated image ≈ 1,290 output tokens at $30/1M → ~$0.04.
// Input side (~1-2k tokens incl. the photo) is ~$0.001 — folded into the 0.04.
const COST_PER_IMAGE = 0.04;

// The one prompt, Jaden-proven: remove background → pure white. SIMPLE beats
// clever — background removal already wipes all dealership branding (it lives
// in the background) and avoids Gemini refusing "remove watermark" wording.
// Overlay line = banners/stickers baked ON the car; refusals are free skips.
const PROMPT = [
  'Edit this vehicle photo: remove the background completely and make it pure white.',
  'If there are any text banners, stickers, badges, or overlay graphics in the photo, remove those too.',
  'Keep the vehicle itself exactly as it is — same angle, same color, same wheels,',
  'nothing redrawn, nothing added, fully in frame.',
  'Output only the edited image.',
].join('\n');

// ─── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const numArg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def;
};

const MODE = has('--full') ? 'full' : 'covers';
const LIMIT = numArg('--limit', Infinity);
const BUDGET = numArg('--budget', Number(process.env.GEMINI_BUDGET_USD) || 35);
const DRY = has('--dry-run');

if (!CONFIG.apiKey) {
  console.error('✗ GEMINI_API_KEY missing — add it to sync/.env (GEMINI_API_KEY=...)');
  process.exit(1);
}
if (!CONFIG.workerUrl || !CONFIG.bridgeToken) {
  console.error('✗ WORKER_URL / BRIDGE_TOKEN missing — they should already be in sync/.env');
  process.exit(1);
}

// ─── State (pay-once cache + spend ledger) ──────────────────────────────────
let state = { model: '', spend: 0, calls: 0, ok: 0, failed: 0, trucks: {} };
if (fs.existsSync(CONFIG.stateFile)) {
  try { state = JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8')); } catch { /* fresh */ }
}
const saveState = () => fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 1));

// ─── Build the work plan ─────────────────────────────────────────────────────
function localImageIndexes(truckId) {
  // files look like <id>-<n>.jpeg — collect which n exist locally
  const out = [];
  for (const f of fs.readdirSync(CONFIG.imagesDir)) {
    const m = f.match(new RegExp(`^${truckId}-(\\d+)\\.jpe?g$`, 'i'));
    if (m) out.push({ idx: Number(m[1]), file: path.join(CONFIG.imagesDir, f) });
  }
  out.sort((a, b) => a.idx - b.idx);
  return out;
}

const rawTrucks = JSON.parse(fs.readFileSync(CONFIG.trucksFile, 'utf8'));
const trucks = Array.isArray(rawTrucks) ? rawTrucks : Object.values(rawTrucks);
// Listed trucks first, then the rest — dad's active inventory gets cleaned first.
trucks.sort((a, b) => (b.listed === true) - (a.listed === true));

let plan = [];
for (const t of trucks) {
  if (plan.length >= LIMIT) break;
  const files = localImageIndexes(t.id);
  if (!files.length) continue;
  const wanted = MODE === 'covers' ? files.slice(0, 1) : files;
  const st = state.trucks[t.id] || { done: {} };
  const todo = wanted.filter((w) => !st.done[w.idx]);
  plan.push({ truck: t, todo, files });
}
plan = plan.filter((p) => p.todo.length);

const plannedCalls = plan.reduce((n, p) => n + p.todo.length, 0);
const plannedCost = plannedCalls * COST_PER_IMAGE;

console.log(`mode=${MODE}  trucks-in-scope=${plan.length}  images-to-clean=${plannedCalls}`);
console.log(`already spent: $${state.spend.toFixed(2)}  budget cap: $${BUDGET.toFixed(2)}`);
console.log(`estimated new spend: $${plannedCost.toFixed(2)}`);
if (state.spend + plannedCost > BUDGET) {
  console.log(`⚠ plan exceeds budget — will process until the cap hits, then stop cleanly.`);
}
if (DRY) {
  console.log('\n(dry run — nothing will be called. Sample:)');
  for (const p of plan.slice(0, 5)) {
    console.log(`  ${p.truck.id}  ${p.truck.year} ${p.truck.make} ${p.truck.model} ${p.truck.trim}  → ${p.todo.length} img`);
  }
  process.exit(0);
}

// ─── Gemini: model discovery + edit call ─────────────────────────────────────
const API = 'https://generativelanguage.googleapis.com/v1beta';

async function resolveModel() {
  if (CONFIG.model) return CONFIG.model;
  if (state.model) return state.model;
  const r = await fetch(`${API}/models?key=${CONFIG.apiKey}`);
  if (!r.ok) throw new Error(`model list failed: HTTP ${r.status}`);
  const data = await r.json();
  const names = (data.models || []).map((m) => m.name.replace(/^models\//, ''));
  const pick = names.find((n) => /image/.test(n) && /flash/.test(n)) || names.find((n) => /image/.test(n));
  if (!pick) throw new Error('no image-capable model visible to this key');
  state.model = pick;
  saveState();
  console.log(`using model: ${pick}`);
  return pick;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geminiEdit(model, imgB64) {
  const body = {
    contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: imgB64 } }, { text: PROMPT }] }],
  };
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(`${API}/models/${model}:generateContent?key=${CONFIG.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.status === 429 || r.status >= 500) {
      await sleep(2000 * attempt);
      continue;
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(data.error && data.error.message) || 'unknown'}`);
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p) => p.inline_data || p.inlineData);
    if (!imgPart) {
      const why = data.candidates?.[0]?.finishReason || parts.find((p) => p.text)?.text || 'no image in response';
      throw new Error(`no output image (${String(why).slice(0, 120)})`);
    }
    const inl = imgPart.inline_data || imgPart.inlineData;
    return { mime: inl.mime_type || inl.mimeType || 'image/png', data: inl.data };
  }
  throw new Error('rate-limited after retries');
}

// ─── Worker bridge: upload bytes + set final order ───────────────────────────
async function uploadToWorker(buf, mime) {
  const r = await fetch(`${CONFIG.workerUrl}/api/bridge/image`, {
    method: 'POST',
    headers: { 'X-Bridge-Token': CONFIG.bridgeToken, 'Content-Type': mime },
    body: buf,
  });
  if (!r.ok) throw new Error(`bridge upload HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
  return (await r.json()).url;
}

async function setCustomImages(truckId, urls) {
  const r = await fetch(`${CONFIG.workerUrl}/api/bridge/images/${encodeURIComponent(truckId)}`, {
    method: 'POST',
    headers: { 'X-Bridge-Token': CONFIG.bridgeToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: urls }),
  });
  if (!r.ok) throw new Error(`order HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
  return r.json();
}

// ─── Main loop ───────────────────────────────────────────────────────────────
(async () => {
  const model = await resolveModel();
  let doneCalls = 0;

  for (const job of plan) {
    const t = job.truck;
    const st = (state.trucks[t.id] = state.trucks[t.id] || { done: {} });
    const label = `${t.year} ${t.make} ${t.model} ${t.trim}`.trim();
    const processed = []; // { idx, url }
    let stopped = false;

    for (const w of job.todo) {
      if (state.spend + COST_PER_IMAGE > BUDGET) {
        console.log(`\n🛑 budget cap reached ($${state.spend.toFixed(2)} of $${BUDGET.toFixed(2)}) — stopping cleanly. Re-run later to continue.`);
        stopped = true;
        break;
      }
      process.stdout.write(`  ${t.id} img${w.idx} (${label}) … `);
      try {
        const b64 = fs.readFileSync(w.file).toString('base64');
        const out = await geminiEdit(model, b64);
        const url = await uploadToWorker(Buffer.from(out.data, 'base64'), out.mime);
        st.done[w.idx] = url;
        processed.push({ idx: w.idx, url });
        state.spend += COST_PER_IMAGE;
        state.calls += 1;
        state.ok += 1;
        console.log(`ok  ($${state.spend.toFixed(2)} spent)`);
      } catch (e) {
        state.failed += 1;
        console.log(`FAILED: ${e.message}`);
        if (/no output image|safety|block/i.test(e.message)) {
          st.done[w.idx] = 'SKIP'; // don't retry hopeless ones forever
        }
      }
      saveState();
      doneCalls++;
      await sleep(300); // be polite
    }

    // Update the truck's image list: cleaned URLs in original order first,
    // then any remaining feed URLs (so nothing disappears from the listing).
    if (processed.length) {
      const feed = Array.isArray(t.images) ? t.images : [];
      const cleaned = job.files
        .map((f) => ({ idx: f.idx, url: st.done[f.idx] }))
        .filter((x) => x.url && x.url !== 'SKIP')
        .map((x) => x.url);
      const cleanedSet = new Set(cleaned);
      const rest = feed.filter((u) => !cleanedSet.has(u));
      try {
        await setCustomImages(t.id, [...cleaned, ...rest]);
        console.log(`  ✓ ${t.id}: customImages set (${cleaned.length} clean + ${rest.length} feed)`);
      } catch (e) {
        console.log(`  ✗ ${t.id}: order update failed: ${e.message}`);
      }
    }
    if (stopped) break;
  }

  console.log(`\ndone: ${state.ok} cleaned, ${state.failed} failed, $${state.spend.toFixed(2)} spent total this key.`);
  if (state.spend < BUDGET && doneCalls > 0) console.log(`re-run the same command any time — done images are skipped automatically.`);
})();
