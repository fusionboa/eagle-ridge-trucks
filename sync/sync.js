// =============================================================================
// Eagle Ridge Trucks — FTP Sync
// Pulls truck inventory from the Eagle Ridge GM FTP feed (reuses FB Lister's
// FTP bridge approach) and stores it locally as JSON + downloads images.
//
// Features:
//   - Downloads the CSV feed from FTP (same creds as FB Lister bridge)
//   - Parses trucks + downloads their images
//   - Hourly auto-sync (setInterval)
//   - Auto-removes trucks that disappeared from the feed (sold/deleted)
//   - Writes a clean trucks.json the site + admin read from
//
// Usage:  node sync.js            (runs once, then stays on hourly loop)
//         node sync.js --once     (sync once and exit)
// =============================================================================

const ftp = require('ftp');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { parse: parseCSV } = require('csv-parse/sync');

// ─── Load .env (tiny loader, no dotenv dep) ───────────────────────────────
function loadEnv() {
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return;
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ─── Config ──────────────────────────────────────────────────────────────────
const CONFIG = {
  // FTP credentials — same feed as FB Lister (Eagle Ridge GM)
  host: process.env.FTP_HOST || 'ftp.edealer.ca',
  username: process.env.FTP_USER || 'FBEagleRidgeGM',
  password: process.env.FTP_PASS || 'f=k8vnGy4P5BC87W',
  port: process.env.FTP_PORT ? parseInt(process.env.FTP_PORT) : 21,
  path: process.env.FTP_PATH || '/',

  // Where the CSV lives on the FTP (default root; override if needed)
  // Real Eagle Ridge feed file (confirmed on ftp.edealer.ca):
  csvFile: process.env.CSV_FILE || 'EagleRidgeChevroletBuickGMC-all.csv',

  // Cloudflare Worker — where we push the parsed trucks
  workerUrl: process.env.WORKER_URL || 'https://eagle-ridge-trucks.YOUR_SUBDOMAIN.workers.dev',
  // Bridge token — shared secret that must match the worker's BRIDGE_TOKEN
  bridgeToken: process.env.BRIDGE_TOKEN || '',

  // Groq AI (same key as FB Lister) — used for SEO descriptions. Never committed;
  // passed as a GitHub Actions secret / local env var.
  groqApiKey: process.env.GROQ_API_KEY || '',
  aiModel: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',

  // Enrichment tuning
  vinDecodeThrottle: 250,                          // ms between VPIC calls (stay under 5 req/s)
  aiDescCap: parseInt(process.env.AI_DESC_CAP || '25', 10), // max AI descriptions per run

  // Local storage (also kept for offline fallback)
  dataDir: path.join(__dirname, '..', 'data'),
  trucksFile: path.join(__dirname, '..', 'data', 'trucks.json'),
  imagesDir: path.join(__dirname, '..', 'data', 'images'),

  // Sync interval (ms) — default 1 hour
  syncInterval: parseInt(process.env.SYNC_INTERVAL || (60 * 60 * 1000)),

  // Download images locally? Default OFF — the feed gives image URLs that the
  // site shows directly. Only needed for the Gemini editing workflow, which
  // the admin does on demand. Enable with DOWNLOAD_IMAGES=1.
  downloadImages: process.env.DOWNLOAD_IMAGES === '1',
};

// ─── Ensure dirs ─────────────────────────────────────────────────────────────
fs.mkdirSync(CONFIG.dataDir, { recursive: true });
fs.mkdirSync(CONFIG.imagesDir, { recursive: true });

// ─── Simple fetch (Node 18+ compatible, no deps) ────────────────────────────
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === 'https:' ? https : http;
    const req = mod.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirects
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
      file.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
  });
}

// ─── Download CSV from FTP (reuses FB Lister bridge's ftp approach) ─────────
function downloadCSVFromFTP() {
  return new Promise((resolve, reject) => {
    const client = new ftp();
    client.on('ready', () => {
      console.log(`   ✅ Connected to ${CONFIG.host}`);
      client.get(CONFIG.csvFile, (err, stream) => {
        if (err) {
          client.end();
          return reject(new Error(`Could not get ${CONFIG.csvFile}: ${err.message}`));
        }
        let data = '';
        stream.on('data', (chunk) => (data += chunk));
        stream.on('end', () => { client.end(); resolve(data); });
        stream.on('error', (e) => { client.end(); reject(e); });
      });
    });
    client.on('error', reject);
    client.connect({
      host: CONFIG.host,
      user: CONFIG.username,
      password: CONFIG.password,
      port: CONFIG.port,
    });
  });
}

// ─── Parse CSV into truck objects ───────────────────────────────────────────
function parseTrucks(csvText) {
  const rows = parseCSV(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  return rows.map((row, i) => {
    // Accept a bunch of common column names from dealership feeds
    const get = (...names) => {
      for (const n of names) {
        if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== '') return String(row[n]).trim();
      }
      return '';
    };

    // Images: the feed has image[N].url columns (up to 20) — collect them all
    const images = [];
    for (let n = 0; n < 20; n++) {
      const img = get(`image[${n}].url`);
      if (img) images.push(img);
    }
    // Also try single-column fallbacks
    if (!images.length) {
      const imagesRaw = get('Images', 'Image', 'Photo', 'Photos', 'ImageURL', 'ImageUrl', 'image');
      images.push(...imagesRaw.split(/[|;\n]/).map((s) => s.trim()).filter(Boolean));
    }

    return {
      id: get('vehicle_id', 'Stock', 'StockNo', 'Stock #', 'StockNumber', 'STOCK', 'id') || `truck-${i}`,
      vin: get('vin', 'VIN', 'Vin'),
      year: get('year', 'Year', 'YR', 'ModelYear'),
      make: get('make', 'Make', 'Brand'),
      model: get('model', 'Model', 'ModelName'),
      trim: get('trim', 'Trim', 'Badge', 'SubModel'),
      title: get('title'),
      url: get('url'),
      price: get('price', 'sale_price', 'Price', 'AskPrice', 'AskingPrice', 'SellingPrice', 'MSRP'),
      salePrice: get('sale_price'),
      mileage: get('mileage.value', 'Mileage', 'Kilometers', 'Odometer', 'KM'),
      mileageUnit: get('mileage.unit'),
      bodyStyle: get('body_style', 'BodyStyle', 'BodyType', 'Category'),
      exteriorColor: get('exterior_color', 'ExteriorColor', 'Colour', 'Color'),
      interiorColor: get('interior_color', 'InteriorColor', 'Interior'),
      fuelType: get('fuel_type', 'FuelType', 'Fuel'),
      transmission: get('transmission', 'Transmission', 'Trans'),
      drivetrain: get('drivetrain', 'Drivetrain', 'DriveType', 'Drive'),
      engine: get('engine', 'Engine', 'EngineType') || extractEngine(get('description', 'Description', 'Comments', 'Details', 'AdText')),
      condition: get('condition'),
      address: get('address'),
      dealerName: get('dealer_name'),
      dealerPhone: get('dealer_phone'),
      description: get('description', 'Description', 'Comments', 'Details', 'AdText'),
      images,
      // Admin-controlled fields (not from FTP)
      listed: false,
      featured: false,
      customImages: [],
      updatedAt: new Date().toISOString(),
    };
  });
}

// The edealer feed has NO engine column — pull displacement out of the description when possible
function extractEngine(desc) {
  if (!desc) return '';
  const m = String(desc).match(/(\d+(?:\.\d+)?L(?:\s*[VWI]\d+)?)/i);
  return m ? m[1].toUpperCase() : '';
}

// ─── Enrichment: VIN decoding + AI descriptions ───────────────────────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// NHTSA VPIC — the proper, free VIN decoder (no key). Groq can't decode VINs,
// so this is the authoritative source for engine + spec fields.
async function decodeVin(vin) {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const r = data.Results && data.Results[0];
  if (!r) return null;
  return {
    make: r.Make || '',
    model: r.Model || '',
    year: r.ModelYear || '',
    trim: r.Trim || '',
    bodyStyle: r.BodyClass || '',
    fuelType: r.FuelTypePrimary || '',
    drivetrain: r.DriveType || '',
    transmission: r.TransmissionStyle || '',
    cylinders: r.EngineCylinders || '',
    config: r.EngineConfiguration || '',
    displacement: r.EngineDisplacementL || '',
    engineModel: r.EngineModel || '',
  };
}

// Build a human-readable engine string from VPIC fields, e.g. "1.2L In-Line 3-cyl (L3T)"
function buildEngine(v) {
  const parts = [];
  if (v.displacement) parts.push(`${v.displacement}L`);
  if (v.config) parts.push(v.config);
  if (v.cylinders) parts.push(`${v.cylinders}-cyl`);
  if (v.engineModel) parts.push(`(${v.engineModel})`);
  return parts.join(' ').trim();
}

// Groq AI — generate a clean, SEO-friendly dealership description.
async function generateAiDescription(truck, groqKey) {
  const title = [truck.year, truck.make, truck.model, truck.trim].filter(Boolean).join(' ');
  const facts = [
    truck.engine ? `Engine: ${truck.engine}` : '',
    truck.transmission ? `Transmission: ${truck.transmission}` : '',
    truck.drivetrain ? `Drivetrain: ${truck.drivetrain}` : '',
    truck.fuelType ? `Fuel: ${truck.fuelType}` : '',
    truck.bodyStyle ? `Body: ${truck.bodyStyle}` : '',
    truck.exteriorColor ? `Exterior: ${truck.exteriorColor}` : '',
    truck.mileage ? `Mileage: ${truck.mileage} ${truck.mileageUnit || 'km'}` : '',
  ].filter(Boolean).join(' | ');
  const prompt = `Write a polished, SEO-friendly dealership description for this vehicle. 2-3 sentences, plain text (no markdown, no hashtags, no emoji), warm premium tone, no pricing, no invented specs:
\n${title}\n${facts}`;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: CONFIG.aiModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 220,
      }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    return (data.choices?.[0]?.message?.content || '').trim();
  } catch (e) {
    return '';
  }
}

// Enrich the freshly-parsed trucks:
//   1. VIN-decode (fill engine + missing specs) — skips trucks the worker already has
//   2. Groq AI descriptions — capped per run, skips trucks already described
async function enrichTrucks(trucks) {
  // Read the worker's current enrichment state so we don't redo work every hour
  let stateMap = {};
  if (CONFIG.workerUrl && CONFIG.bridgeToken) {
    try {
      const res = await fetch(`${CONFIG.workerUrl}/api/bridge/state`, {
        headers: { 'X-Bridge-Token': CONFIG.bridgeToken },
      });
      if (res.ok) {
        const data = await res.json();
        for (const t of data.trucks || []) stateMap[t.id] = t;
      }
    } catch (e) {
      console.warn(`   ⚠️ Couldn't read bridge state: ${e.message}`);
    }
  }

  // 1. VIN decode for trucks missing an engine
  let decoded = 0;
  for (const truck of trucks) {
    const alreadyHasEngine = (stateMap[truck.id] && stateMap[truck.id].engine) || truck.engine;
    if (!alreadyHasEngine && truck.vin && truck.vin.length === 17) {
      const v = await decodeVin(truck.vin);
      if (v) {
        truck.engine = buildEngine(v);
        if (!truck.transmission && v.transmission) truck.transmission = v.transmission;
        if (!truck.drivetrain && v.drivetrain) truck.drivetrain = v.drivetrain;
        if (!truck.fuelType && v.fuelType) truck.fuelType = v.fuelType;
        if (!truck.bodyStyle && v.bodyStyle) truck.bodyStyle = v.bodyStyle;
        if (!truck.make && v.make) truck.make = v.make;
        if (!truck.model && v.model) truck.model = v.model;
        if (!truck.year && v.year) truck.year = v.year;
        if (!truck.trim && v.trim) truck.trim = v.trim;
        decoded++;
      }
      await sleep(CONFIG.vinDecodeThrottle);
    }
  }
  if (decoded) console.log(`   🔧 VIN-decoded ${decoded} truck(s) (engine + missing specs)`);

  // 2. Groq AI descriptions (capped, skip already-done)
  if (CONFIG.groqApiKey) {
    let generated = 0;
    for (const truck of trucks) {
      if (generated >= CONFIG.aiDescCap) break;
      const alreadyHasDesc = (stateMap[truck.id] && stateMap[truck.id].aiDescription) || truck.aiDescription;
      if (alreadyHasDesc) continue;
      const desc = await generateAiDescription(truck, CONFIG.groqApiKey);
      if (desc) { truck.aiDescription = desc; generated++; }
      await sleep(300); // be gentle on Groq rate limits
    }
    if (generated) console.log(`   ✨ Generated ${generated} AI description(s)`);
  } else {
    console.log('   ⚠️ No GROQ_API_KEY set — skipping AI descriptions.');
  }

  return trucks;
}

// ─── Download all images for a truck ────────────────────────────────────────
async function downloadTruckImages(truck) {
  const results = [];
  for (let i = 0; i < truck.images.length; i++) {
    const url = truck.images[i];
    // Only handle http(s) URLs; skip data: or placeholders we can't fetch
    if (!/^https?:\/\//i.test(url)) continue;
    try {
      const ext = path.extname(new URL(url).pathname).split('?')[0] || '.jpg';
      const safeExt = /^\.(jpg|jpeg|png|webp|gif)$/i.test(ext) ? ext : '.jpg';
      const dest = path.join(CONFIG.imagesDir, `${truck.id}-${i}${safeExt}`);
      await downloadFile(url, dest);
      results.push({ original: url, local: path.relative(CONFIG.dataDir, dest) });
    } catch (e) {
      console.warn(`   ⚠️ Image ${i} for ${truck.id} failed: ${e.message}`);
    }
  }
  return results;
}

// ─── Main sync ──────────────────────────────────────────────────────────────
async function sync() {
  const started = Date.now();
  console.log(`\n🔄 [${new Date().toISOString()}] Eagle Ridge Trucks — syncing...`);

  try {
    // 1. Download the CSV
    console.log(`   📡 Downloading ${CONFIG.csvFile} from ${CONFIG.host}...`);
    const csvText = await downloadCSVFromFTP();
    console.log(`   ✅ Got CSV (${(csvText.length / 1024).toFixed(1)} KB)`);

    // 2. Parse trucks
    const trucks = parseTrucks(csvText);
    console.log(`   🚛 Found ${trucks.length} trucks in feed`);

    // 2b. Enrich: VIN-decode engines/specs + generate AI descriptions
    await enrichTrucks(trucks);

    // 3. Load existing state (preserve admin fields like listed/featured)
    let existing = {};
    if (fs.existsSync(CONFIG.trucksFile)) {
      try {
        existing = JSON.parse(fs.readFileSync(CONFIG.trucksFile, 'utf8'));
      } catch { existing = {}; }
    }

    // 4. Merge: keep admin fields, mark new/changed, drop removed
    const newState = {};
    for (const truck of trucks) {
      const prev = existing[truck.id];
      newState[truck.id] = {
        ...truck,
        // Preserve admin state
        listed: prev ? !!prev.listed : false,
        featured: prev ? !!prev.featured : false,
        customImages: prev && Array.isArray(prev.customImages) ? prev.customImages : [],
        // Track if details changed since last sync
        changed: prev && JSON.stringify(prev.vehicleData) !== JSON.stringify(truck),
      };
    }

    // 5. Detect removed trucks (sold/deleted from feed)
    const removed = Object.keys(existing).filter((id) => !newState[id]);
    if (removed.length) {
      console.log(`   🗑️ ${removed.length} truck(s) removed from feed: ${removed.join(', ')}`);
    }

    // 6. Optionally download images locally (only for the Gemini workflow —
    //    the site shows the feed's image URLs directly, so default is OFF)
    let downloaded = 0;
    if (CONFIG.downloadImages) {
      for (const truck of Object.values(newState)) {
        const hasLocalImages = truck.customImages.length > 0;
        if (!hasLocalImages && truck.images.length) {
          const imgs = await downloadTruckImages(truck);
          if (imgs.length) {
            truck.customImages = imgs.map((im) => im.local);
            downloaded += imgs.length;
          }
        }
      }
      if (downloaded) console.log(`   🖼️ Downloaded ${downloaded} image(s)`);
    } else {
      console.log('   🖼️ Image download OFF (site uses feed URLs). Set DOWNLOAD_IMAGES=1 for Gemini workflow.');
    }

    // 7. Write state locally (offline fallback)
    fs.writeFileSync(CONFIG.trucksFile, JSON.stringify(newState, null, 2));
    fs.writeFileSync(
      path.join(CONFIG.dataDir, 'sync-meta.json'),
      JSON.stringify({ lastSync: new Date().toISOString(), count: trucks.length, removed }, null, 2)
    );

    // 8. Push to the Cloudflare Worker (the public site reads from here)
    if (CONFIG.workerUrl && CONFIG.bridgeToken) {
      try {
        console.log(`   ☁️ Pushing ${trucks.length} trucks to worker...`);
        const pushRes = await fetch(`${CONFIG.workerUrl}/api/bridge/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Bridge-Token': CONFIG.bridgeToken,
          },
          body: JSON.stringify({ trucks: Object.values(newState) }),
        });
        if (!pushRes.ok) {
          const err = await pushRes.json().catch(() => ({}));
          console.warn(`   ⚠️ Worker push failed (${pushRes.status}): ${err.error || 'unknown'}`);
        } else {
          const res = await pushRes.json();
          console.log(`   ✅ Worker updated (${res.count} trucks${res.removed ? `, ${res.removed} removed` : ''}${res.backedUp ? `, ${res.backedUp} backed up` : ''})`);
        }
      } catch (e) {
        console.warn(`   ⚠️ Worker unreachable: ${e.message}`);
      }
    } else {
      console.log('   ⚠️ No WORKER_URL/BRIDGE_TOKEN set — local file only');
    }

    console.log(`   ✅ Sync complete in ${((Date.now() - started) / 1000).toFixed(1)}s — ${trucks.length} trucks`);
  } catch (e) {
    console.error(`   ❌ Sync failed: ${e.message}`);
  }
}

// ─── Run ────────────────────────────────────────────────────────────────────
const isOnce = process.argv.includes('--once');

sync().then(() => {
  if (isOnce) process.exit(0);
  console.log(`\n   ⏰ Auto-sync every ${CONFIG.syncInterval / 60000} minutes. Ctrl+C to stop.`);
  setInterval(sync, CONFIG.syncInterval);
});
