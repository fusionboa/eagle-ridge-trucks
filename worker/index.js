// =============================================================================
// Eagle Ridge Trucks — Cloudflare Worker
// Serves the truck API + admin API for the site. Runs entirely on Cloudflare
// (no bridge/Pixel needed) because it fetches the feed over HTTP/HTTPS.
//
// Endpoints:
//   GET  /api/trucks                → public list of LISTED trucks
//   GET  /api/admin/trucks          → admin: all trucks (auth)
//   POST /api/admin/truck/:id       → admin: update truck (listed, featured, details) (auth)
//   POST /api/admin/sync            → admin: trigger a sync now (auth)
//   GET  /api/health                → health check
//
// Scheduled (Cron Trigger): fetches the feed, upserts trucks, removes deleted.
//
// Env vars:
//   FEED_URL          → the HTTP/JSON/CSV feed of truck inventory
//   ADMIN_EMAILS      → comma-separated allowlist of admin emails
//   GOOGLE_CLIENT_ID  → for Google ID token verification
//   D1                → D1 database binding
// =============================================================================

// ─── Firebase ID token verification (same project as FB Lister) ─────────────
// FB Lister uses Firebase Auth with Google provider — tokens have aud='fblisterpro'.
// We accept the SAME Firebase project so the same Google login works here.
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

async function verifyGoogleToken(token, env) {
  try {
    // Decode JWT header/payload (unverified) to get kid + email
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token');
    const header = JSON.parse(base64url(parts[0]));
    const payload = JSON.parse(base64url(parts[1]));

    // Fetch Google's public keys (cache via KV or re-fetch; simple version re-fetches)
    const certsResp = await fetch(GOOGLE_CERTS_URL);
    const certs = await certsResp.json();
    const jwk = certs.keys.find((k) => k.kid === header.kid);
    if (!jwk) throw new Error('Unknown key id');

    // Verify signature using Web Crypto
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const sig = base64urlToBytes(parts[2]);
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
    if (!valid) throw new Error('Bad signature');

    // Check audience — Firebase project ID (same as FB Lister) + expiry
    const validAudiences = [env.FIREBASE_PROJECT_ID || 'fblisterpro'];
    if (!validAudiences.includes(payload.aud)) throw new Error('Wrong audience');
    if (payload.exp * 1000 < Date.now()) throw new Error('Token expired');

    return { email: (payload.email || '').toLowerCase(), name: payload.name || '', sub: payload.sub || '' };
  } catch (e) {
    return null;
  }
}

function base64url(s) {
  return decodeURIComponent(
    atob(s.replace(/-/g, '+').replace(/_/g, '/'))
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
}
function base64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ─── Auth helpers ───────────────────────────────────────────────────────────
async function authUser(request, env) {
  // TEST MODE: when DEV_MODE=true, a request carrying X-Dev-Key is treated as
  // an admin. This lets Jaden test the admin panel WITHOUT Google sign-in.
  // ⚠️ Remove DEV_MODE / DEV_KEY before going fully live.
  if (env.DEV_MODE === 'true') {
    const devKey = request.headers.get('X-Dev-Key') || '';
    if (devKey && env.DEV_KEY && devKey === env.DEV_KEY) {
      return { email: 'dev@test.local', name: 'Dev Test', sub: 'dev-test-mode', isDev: true };
    }
  }
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  return verifyGoogleToken(token, env);
}

function isAdmin(user, env) {
  if (!user || !user.email) return false;
  // Dev test mode bypasses the email allowlist
  if (user.isDev) return true;
  const allowed = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(user.email);
}

// ─── Feed parsing (CSV or JSON) ─────────────────────────────────────────────
function parseCSVLine(line) {
  // Minimal CSV parser handling quoted fields
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = parseCSVLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim(); });
    return row;
  });
}

function normalizeTruck(row) {
  const get = (...names) => {
    for (const n of names) {
      if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== '') return String(row[n]).trim();
    }
    return '';
  };
  const imagesRaw = get('Images', 'Image', 'Photo', 'Photos', 'ImageURL', 'ImageUrl', 'image', 'ImagesUrls');
  const images = imagesRaw.split(/[|;\n]/).map((s) => s.trim()).filter(Boolean);
  return {
    id: get('Stock', 'StockNo', 'Stock #', 'StockNumber', 'STOCK', 'id') || get('VIN', 'Vin') || `truck-${Math.random().toString(36).slice(2, 8)}`,
    vin: get('VIN', 'Vin'),
    year: get('Year', 'YR', 'ModelYear'),
    make: get('Make', 'Brand'),
    model: get('Model', 'ModelName'),
    trim: get('Trim', 'Badge', 'SubModel'),
    price: get('Price', 'AskPrice', 'AskingPrice', 'SellingPrice', 'MSRP'),
    mileage: get('Mileage', 'Kilometers', 'Odometer', 'KM'),
    bodyStyle: get('BodyStyle', 'BodyType', 'Category'),
    exteriorColor: get('ExteriorColor', 'Colour', 'Color'),
    interiorColor: get('InteriorColor', 'Interior'),
    fuelType: get('FuelType', 'Fuel'),
    transmission: get('Transmission', 'Trans'),
    drivetrain: get('Drivetrain', 'DriveType', 'Drive'),
    engine: get('Engine', 'EngineType'),
    description: get('Description', 'Comments', 'Details', 'AdText'),
    images,
    listed: false,
    featured: false,
    customImages: [],
    updatedAt: new Date().toISOString(),
  };
}

// ─── Sync: accept pushed trucks from the bridge → upsert → remove deleted ───
// The FTP bridge (Node script on the Pixel 2 / local machine) downloads the CSV
// from FTP and POSTs the parsed trucks here (Cloudflare can't do raw FTP).
async function runSync(env, trucks) {
  if (!Array.isArray(trucks) || !trucks.length) return { ok: false, error: 'No trucks provided' };

  const db = env.D1;
  const now = new Date().toISOString();
  const incomingIds = [];

  for (const t of trucks) {
    incomingIds.push(t.id);
    const existing = await db.prepare('SELECT data FROM trucks WHERE id = ?').bind(t.id).first();
    if (existing) {
      // Preserve admin fields (listed, featured, customImages)
      const prev = JSON.parse(existing.data);
      const merged = {
        ...t,
        listed: prev.listed === true,
        featured: prev.featured === true,
        customImages: Array.isArray(prev.customImages) ? prev.customImages : [],
        updatedAt: now,
      };
      await db.prepare('UPDATE trucks SET data = ?, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify(merged), now, t.id).run();
    } else {
      await db.prepare('INSERT INTO trucks (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .bind(t.id, JSON.stringify(t), now, now).run();
    }
  }

  // Remove trucks that disappeared from the feed — but NEVER lose published work:
  //   • unlisted (drafts)  → delete outright
  //   • listed (published) → copy into backups, then remove from live (flagged, restorable)
  const all = await db.prepare('SELECT id, data FROM trucks').all();
  const missing = (all.results || []).filter((r) => !incomingIds.includes(r.id));
  let removed = 0;
  let backedUp = 0;
  for (const r of missing) {
    const t = JSON.parse(r.data);
    if (t.listed === true) {
      // Backup the published listing before removing it from live
      const backup = { ...t, listed: false, missingFromFeed: true, backedUpAt: now };
      await db.prepare('INSERT INTO backups (id, data, backed_up_at) VALUES (?, ?, ?)')
        .bind(t.id, JSON.stringify(backup), now).run();
      backedUp++;
    }
    await db.prepare('DELETE FROM trucks WHERE id = ?').bind(r.id).run();
    removed++;
  }

  return { ok: true, count: trucks.length, removed, backedUp };
}

// ─── Router ─────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const db = env.D1;

    // CORS
    if (request.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    };
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });

    // Health
    if (path === '/api/health') return json({ ok: true, service: 'eagle-ridge-trucks' });

    // DEBUG (commented out — remove later): inspect env for test-mode debugging
    // if (path === '/api/debug') {
    //   return json({
    //     devMode: env.DEV_MODE || null,
    //     devKeyLen: env.DEV_KEY ? env.DEV_KEY.length : 0,
    //     devKeyFirst: env.DEV_KEY ? env.DEV_KEY.slice(0, 4) : null,
    //   });
    // }

    // PUBLIC: list listed trucks
    if (path === '/api/trucks' && request.method === 'GET') {
      try {
        const all = await db.prepare('SELECT data FROM trucks').all();
        const trucks = (all.results || [])
          .map((r) => JSON.parse(r.data))
          .filter((t) => t.listed === true);
        return json({ trucks });
      } catch (e) {
        return json({ error: 'DB error: ' + e.message }, 500);
      }
    }

    // BRIDGE: receive pushed trucks from the sync job (BEFORE the admin gate —
    // it uses its own shared-secret auth, not Google login)
    if (path === '/api/bridge/upload' && request.method === 'POST') {
      const bridgeToken = request.headers.get('X-Bridge-Token') || '';
      if (!env.BRIDGE_TOKEN || bridgeToken !== env.BRIDGE_TOKEN) {
        return json({ error: 'Forbidden — bad bridge token' }, 403);
      }
      const body = await request.json().catch(() => ({}));
      const trucks = body.trucks;
      if (!Array.isArray(trucks)) return json({ error: 'trucks array required' }, 400);
      const result = await runSync(env, trucks);
      return json(result, result.ok ? 200 : 500);
    }

    // ─── Admin (all below require auth + admin email) ───
    const user = await authUser(request, env);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (!isAdmin(user, env)) return json({ error: 'Forbidden — not an admin email' }, 403);

    // Admin: all trucks
    if (path === '/api/admin/trucks' && request.method === 'GET') {
      const all = await db.prepare('SELECT id, data, updated_at FROM trucks').all();
      const trucks = (all.results || []).map((r) => ({ id: r.id, ...JSON.parse(r.data), updatedAt: r.updated_at }));
      return json({ trucks });
    }

    // Admin: update a truck
    if (path.startsWith('/api/admin/truck/') && request.method === 'POST') {
      const id = decodeURIComponent(path.slice('/api/admin/truck/'.length));
      const body = await request.json().catch(() => ({}));
      const existing = await db.prepare('SELECT data FROM trucks WHERE id = ?').bind(id).first();
      if (!existing) return json({ error: 'Truck not found' }, 404);
      const truck = JSON.parse(existing.data);
      // Allow updating details + admin fields
      const editable = ['listed', 'featured', 'price', 'description', 'year', 'make', 'model', 'trim', 'mileage', 'exteriorColor', 'interiorColor', 'transmission', 'drivetrain', 'fuelType', 'engine', 'bodyStyle', 'customImages'];
      for (const k of editable) {
        if (body[k] !== undefined) truck[k] = body[k];
      }
      truck.updatedAt = new Date().toISOString();
      await db.prepare('UPDATE trucks SET data = ?, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify(truck), truck.updatedAt, id).run();
      return json({ ok: true, truck });
    }

    // Admin: view backups (published trucks that left the feed)
    if (path === '/api/admin/backups' && request.method === 'GET') {
      const all = await db.prepare('SELECT id, data, backed_up_at FROM backups ORDER BY backed_up_at DESC').all();
      const backups = (all.results || []).map((r) => ({ id: r.id, ...JSON.parse(r.data), backedUpAt: r.backed_up_at }));
      return json({ backups });
    }

    // Admin: restore a backup back into live inventory (as unlisted draft)
    if (path.startsWith('/api/admin/backup/') && request.method === 'POST') {
      const id = decodeURIComponent(path.slice('/api/admin/backup/'.length));
      const existing = await db.prepare('SELECT data FROM backups WHERE id = ?').bind(id).first();
      if (!existing) return json({ error: 'Backup not found' }, 404);
      const truck = JSON.parse(existing.data);
      delete truck.missingFromFeed;
      delete truck.backedUpAt;
      truck.listed = false; // restored as a draft — admin reviews before re-listing
      const now = new Date().toISOString();
      await db.prepare('INSERT INTO trucks (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .bind(id, JSON.stringify(truck), now, now).run();
      await db.prepare('DELETE FROM backups WHERE id = ?').bind(id).run();
      return json({ ok: true, truck });
    }

    // Admin: trigger sync now (tell the bridge to pull + push)
    if (path === '/api/admin/sync' && request.method === 'POST') {
      return json({ ok: true, message: 'Sync requested — the bridge will pull from FTP and push here.' });
    }

    return json({ error: 'Not found' }, 404);
  },
};
