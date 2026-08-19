# Eagle Ridge Trucks — Changelog

## v0.1.0 — Initial build (Aug 18, 2026)

**Mission:** Get dad 10 truck sales → Legion arrives early. 🎄

### What was built
- **`sync/sync.js`** — Node FTP bridge (reuses FB Lister's FTP approach): downloads `feed.csv` from ftp.edealer.ca, parses trucks (handles quoted CSV fields), downloads images, pushes to the worker. Auto-removes trucks deleted from the feed. Runs hourly (or `--once`).
- **`worker/index.js`** — Cloudflare Worker:
  - `GET /api/trucks` — public, listed trucks only
  - `GET /api/admin/trucks` — all trucks (Google JWT + ADMIN_EMAILS gate)
  - `POST /api/admin/truck/:id` — edit details + listed/featured/customImages
  - `POST /api/bridge/upload` — receives pushed trucks from the bridge
  - `POST /api/admin/sync` — sync request placeholder
  - D1 storage, upsert preserves admin fields (listed/featured/customImages)
- **`site/`** — luxury storefront: dark theme + gold accent, hero with animated stats, smooth scroll reveals, search/filter/sort, truck cards, detail modal with gallery, contact form. Mobile responsive.
- **`admin/`** — email-gated dashboard: Google sign-in (allowlist), Listed/Unlisted/All tabs, edit modal, bulk image download + re-upload (Gemini image pipeline).
- **`worker/schema.sql`** + **`wrangler.toml`** — D1 setup + config.
- **`data/trucks.json`** + `site/data/trucks.json` — sample data for local preview.
- **`README.md`** — full architecture + setup docs.

### Verified
- All 4 JS files pass `node --check`
- CSV quoted-field parsing works
- Sample data has all required fields (4 trucks, all listed)
- Admin fields preserved on re-sync
- Site serves locally (index/css/js/data all 200)

### Remaining (next steps)
- [ ] Deploy worker + D1 (needs `wrangler d1 create`, real `database_id`, `GOOGLE_CLIENT_ID`)
- [ ] Test sync against the REAL Eagle Ridge FTP feed (confirm CSV column names)
- [ ] Get a Google ID token into the bridge (`WORKER_AUTH_TOKEN`) so pushes authenticate
- [ ] Gemini image pipeline (manual for now — download → edit → re-upload)
- [ ] SEO pass: per-truck landing pages, Vehicle schema, Google Business Profile, blog posts
- [ ] Deploy `site/` + `admin/` to Cloudflare Pages

## v0.1.1 — Inventory split (Aug 18, 2026)

**Jaden's feedback:** inventory moved to its own page; home page shows the most expensive (flagship) trucks.

- **`site/inventory.html`** — NEW full inventory page: page hero, search/filter/sort, all listed trucks. Nav links to it.
- **`site/index.html`** — home page now has a **Flagship section** ("The Flagships / Our Most Capable Trucks") showing the **top 3 most expensive** trucks, with a "Browse the full collection →" button.
- **`site/js/main.js`** — page-mode aware: `window.SITE_PAGE` → 'home' (flagships only) vs 'inventory' (full + filters). Shared `priceNum` helper. Filters only wire up on the inventory page.
- **`site/css/styles.css`** — flagship grid (3 cols), page-hero, active nav link, responsive fallback.

### Verified
- main.js syntax OK, both pages serve 200, data 200
- Flagship sort picks the right top 3 (F-250 $48,900 → F-150 Lariat $45,000 → Silverado $41,500) ✅

## v0.1.2 — Backup safety + GitHub Actions bridge (Aug 18, 2026)

**Jaden's requests:** (1) never silently lose published work if a truck leaves the feed, (2) keep a backup section in admin, (3) no Pixel needed — use a free cloud cron instead.

### Changes
- **Backup safety in worker sync:**
  - Truck leaves feed + **unlisted** → deleted (just a draft, gone)
  - Truck leaves feed + **listed (published)** → **copied to `backups` table**, removed from live, flagged `missingFromFeed` + `backedUpAt`
- **New `backups` table** in `worker/schema.sql`
- **Admin Backups tab (🗄️):** view all backed-up published trucks, **Restore** (brings back as unlisted draft for review), Edit
  - New endpoints: `GET /api/admin/backups`, `POST /api/admin/backup/:id`
- **GitHub Actions bridge (kills the Pixel):**
  - `.github/workflows/sync.yml` — runs `sync.js` hourly on GitHub's free servers (cron `0 * * * *` + manual dispatch)
  - Worker now accepts **`X-Bridge-Token`** shared secret for machine-to-machine uploads (`env.BRIDGE_TOKEN` via `wrangler secret put`)
  - `sync/sync.js` loads `.env` (tiny loader, no dotenv dep), sends `X-Bridge-Token`
- **Secrets handling:**
  - `sync/.env` — real FTP creds (Eagle Ridge, from FB Lister test-creds) — **gitignored**
  - `sync/.env.example` — template for GitHub Secrets / local
  - `.gitignore` — .env, node_modules, images, .wrangler

### Verified
- All JS syntax OK
- Backup logic: listed→backed up ✅ / unlisted→deleted ✅ / still-in-feed→untouched ✅

## v0.1.3 — Real FB Lister keys wired in (Aug 18, 2026)

**Jaden's request:** "just use those same keys from facebooklister!"

- **D1 database:** now points at FB Lister's real D1 (`fblister-prod-db`, id `10542189-fb0f-4a9b-9b86-19143bdc5418`) — our `trucks`/`backups` tables coexist fine (no name collisions with FB Lister's tables)
- **Auth:** switched from raw Google OAuth to **Firebase Auth (same project as FB Lister)** — `fblisterpro`, same apiKey/authDomain/appId, same Google popup login. Worker now verifies Firebase ID tokens with `aud=fblisterpro` (same as FB Lister's `validAudiences`)
- **Admin page:** loads Firebase compat SDKs + same `FIREBASE_CONFIG`, `signInWithPopup(GoogleAuthProvider)`, 30-min token refresh — literally the FB Lister login
- wrangler.toml now has real `database_id` + `FIREBASE_PROJECT_ID`; `GOOGLE_CLIENT_ID` removed (Firebase handles it)

### Verified
- Worker + admin JS syntax OK
- Firebase token (aud=fblisterpro) accepted; non-Firebase aud rejected ✅

### Key decisions
- **No DMS feed** — Eagle Ridge is FTP-only, so Cloudflare can't fetch it directly (Workers can't do raw FTP). The Node bridge translates FTP → HTTP and pushes to the worker. Pixel 2 stays as the FB Lister bridge, NOT this project's server.
- **Email-gated admin** — reuses FB Lister's Google JWT + ADMIN_EMAILS pattern.
- **Bulk image download** — admin can download all images for a truck, edit in Gemini (remove Eagle Ridge branding / enhance), then upload back.

## v0.2.0 — DEPLOYED LIVE + TEST MODE (Aug 18, 2026)

**Jaden's request:** deploy it so he can test — and make the admin work WITHOUT Google login for now.

### Deployed to production 🚀
- **Worker LIVE:** `https://eagle-ridge-trucks.fblister.workers.dev` — D1 tables created in the REAL `fblister-prod-db` (trucks + backups, 11 tables total)
- **Site + Admin LIVE:** `https://eagle-ridge-trucks.pages.dev` (`/` = luxury storefront, `/admin/` = admin panel)
- **GitHub repo:** `fusionboa/eagle-ridge-trucks` — hourly Actions sync running (383 real trucks pulled from FTP)
- **Full pipeline verified end-to-end:** FTP → GitHub Actions → Worker → D1 (383 trucks) → public API

### Bugs fixed along the way
- `verifyGoogleToken` referenced `env` without it being passed in → admin auth would always fail. Fixed: env passed through.
- Worker deployed with a **stale version / tables missing from production D1** (`no such table: trucks`) → re-applied schema to the real prod D1 (`wrangler d1 execute --remote`).
- **Bridge 401 bug:** `/api/bridge/upload` was checked AFTER the admin gate, so it demanded a Google token before checking the bridge token. Moved bridge auth BEFORE the admin gate.
- `BRIDGE_TOKEN` mismatch: trailing newline (`0x0a`) in the stored secret vs GitHub's clean copy → re-set with no trailing newline.

### 🧪 TEST MODE (no Google login)
- **Worker:** `DEV_MODE` + `DEV_KEY` secrets. When `DEV_MODE=true`, a request with header `X-Dev-Key: er-dev-2026-test` is treated as an admin (bypasses both token check AND email allowlist).
- **Admin page:** auto-boots straight into the dashboard on open (no login screen) — sends `X-Dev-Key` on every API call.
- **How to revert to Google login later:**
  - `admin/js/admin.js` → comment out `enterDevMode();`, uncomment `initAuth();`
  - Remove `DEV_MODE` + `DEV_KEY` secrets (`npx wrangler secret delete DEV_MODE` / `DEV_KEY`)
  - Remove the dev bypass block in `worker/index.js` `authUser()`
- Debug endpoint `/api/debug` was added for troubleshooting then **commented out** (left in the file, inert).

### Verified
- Dev key → `/api/admin/trucks` returns the real 383 trucks ✅
- No key → 401 ✅ / wrong key → 401 ✅ / bridge token still required for sync ✅
- Public site + admin page both 200 ✅

### Remaining (next steps)
- [ ] SEO pass: per-truck landing pages, Vehicle schema, Google Business Profile, blog posts
- [ ] Gemini image pipeline (manual for now — download → edit → re-upload)
- [ ] Remove test mode + restore Google-only admin before "real" launch
- [ ] Dad's dealership website / blog ideas for max sales

## v0.2.1 — ADMIN FIXED FOR REAL (Aug 19, 2026)

**Jaden reported: the admin page "just doesn't do anything" / the test-mode button appears dead.** Caught and reproduced with headless Chrome (console showed `Error: Failed to load` in a real browser while curl passed).

### Root cause #1 — DOUBLE `/api` in the request URL (the real killer)
- `ADMIN_CONFIG.apiBase` was set to `https://eagle-ridge-trucks.fblister.workers.dev/api` and every fetch in `admin.js` appends its own `/api/...` path → requests went to **`/api/api/admin/trucks`** → the worker route never matched → non-2xx → `Failed to load`.
- curl tests missed it because they hit the correct `/api/admin/trucks` path directly.
- **Fix:** `apiBase` now points at the worker ROOT (no trailing `/api`); `admin.js` strips any trailing slash from `API_BASE`. Same fix applied to the public site (`main.js` + added missing `window.SITE_CONFIG` to `index.html`/`inventory.html` — the site was silently falling back to local sample data instead of the worker).

### Root cause #2 — CORS preflight rejected `X-Dev-Key`
- The admin sends a custom `X-Dev-Key` header, but the worker only allowed `Content-Type, Authorization` in `Access-Control-Allow-Headers` → any browser preflight failed (curl doesn't preflight, so it hid this too).
- **Fix:** `worker/index.js` now allows `X-Dev-Key, X-Bridge-Token` → redeployed (version `8a66686b`).

### Verified (real browser, headless Chrome)
- No console errors; admin boots straight to the dashboard with **383/383 trucks** (all unlisted, as designed) ✅
- Browser requests `/api/admin/trucks` (correct, single `/api`) and gets 200 ✅
- Preflight returns the new allowed headers ✅

### Also logged (Aug 19)
- **Fusion AI specialist-model family idea** added to `~/Desktop/context.md` (Library AI section) — one small model per domain (Fusion AI Programmer, Fusion AI Kernel Dev, ...) each with its own growing library + a router.

## v0.2.2 — SITE + ADMIN UI FIXES (Aug 19, 2026, late night)

**Jaden reported:** site throws `TypeError at main.js:257`, trucks show no price/engine, admin still shows the login thing on top, and the edit modal's Cancel/× buttons don't close it.

### Fixes
- **`site/js/main.js` — inventory page crashed:** `init()` called `document.getElementById('contactForm').addEventListener(...)` but `inventory.html` has no contact form → TypeError → `loadTrucks()` never ran → page showed zero trucks. Fixed: guard `if (contactForm)`.
- **`site/js/main.js` — "$NaN" prices:** prices come from the feed as `"34544 CAD"` strings, so `Number(t.price)` = NaN. Cards + modal now use the existing `priceNum()` helper → `$34,544`. Verified live: flagship shows `$106,823`.
- **Modal close buttons never worked (site + admin):** handlers checked `e.target.dataset.close`, but `data-close=""` is an empty string (falsy) → × / Cancel / backdrop clicks did nothing. Switched to `e.target.hasAttribute('data-close')` in both `main.js` and `admin.js`. Verified: modal closes.
- **`admin/css/admin.css` — login gate floated on top of the app:** `.login { display: grid }` overrode the browser's default `[hidden]` rule, so `loginGate.hidden = true` didn't visually hide it. Added `[hidden] { display: none !important; }`. Verified: gate display:none, app visible.
- **`admin/js/admin.js` — price field showed empty in Edit modal:** input was `type="number"` but prices are `"34544 CAD"` strings (browser can't parse → empty + console warning). Switched to `type="text"`.
- **`sync/sync.js` — engine always empty:** confirmed the edealer feed has NO engine column (52 columns, zero engine/motor/cyl). Added `extractEngine()` — pulls displacement from the description (e.g. `6.2L`, `2.0L Turbo`) when available.

### Verified (headless Chrome click-through)
- Home page: flagship shows with real price ✅
- Inventory page: no crash, trucks render with prices ✅
- Truck modal: opens, shows price, × closes ✅
- Admin: login gate hidden, 383 trucks, Edit modal opens, Cancel closes ✅
- Zero console errors ✅

### Notes
- All trucks remain **unlisted** (clean state — test listings unlisted after each test).
- One mystery left: truck `13781719` (2017 Silverado) lost its price (`""` in D1 after the hourly sync) — 1 of 383, revisit later.

## v0.2.3 — NaN price fix + VIN decoder + AI descriptions (Aug 19, 2026)

**Jaden reported:** admin dashboard shows "NaN" at price (edit shows it fine), and engine is still missing. Asked to use the **proper VIN decoder** (NOT Groq — Groq can't decode VINs) + the **Groq API from FB Lister** for other enrichment.

### Fixes / features
- **`admin/js/admin.js` — NaN price:** dashboard rows used `Number(t.price)` on `"34544 CAD"` strings → `NaN`. Added `priceNum()` + `formatPrice()` helpers and used them in both the main list and the backups list → `$34,544`.
- **`sync/sync.js` — VIN decoder (proper):** new `decodeVin()` hits the free NHTSA **VPIC** API (`vpic.nhtsa.dot.gov/.../DecodeVinValues/{VIN}`) for trucks with empty engine. Builds a readable engine string (e.g. `In-Line 3-cyl (L3T)`) via `buildEngine()` and back-fills missing transmission/drivetrain/fuelType/bodyStyle/make/model/year/trim. Throttled 250ms (under VPIC's 5 req/s).
- **`sync/sync.js` — Groq AI descriptions:** new `generateAiDescription()` writes a 2-3 sentence, SEO-friendly, premium-tone description per truck (`aiDescription` field). Capped at `AI_DESC_CAP` (default 25) per run and skips trucks already described. **Model switched to `openai/gpt-oss-20b`** — Groq deprecated `llama-3.1-8b-instant` (returns 404 model_not_found); verified `openai/gpt-oss-20b` returns clean prose (no leaked reasoning).
- **`sync/sync.js` — skip already-done work:** `enrichTrucks()` reads the worker's new `/api/bridge/state` (id → engine/aiDescription) so the hourly job doesn't re-decode / re-describe trucks every hour.
- **`worker/index.js`:** (1) `runSync()` now **preserves `engine` + `aiDescription`** when the fresh feed value is empty (so enrichment survives re-syncs), (2) new **`GET /api/bridge/state`** endpoint (bridge-token auth) returns enrichment state, (3) `aiDescription` added to the admin-editable fields.
- **`site/js/main.js`:** truck detail modal now prefers `aiDescription` (falls back to feed `description`).
- **`.github/workflows/sync.yml`:** passes `GROQ_API_KEY` secret to the sync job.
- **GitHub secret `GROQ_API_KEY`** added (same key as FB Lister).

### Resolved from v0.2.2
- The `13781719` "lost price" mystery: it was my own edit-test artifact (number input couldn't hold `"19995 CAD"`, saved `""`); the hourly sync re-pulled fresh data and healed it. Confirmed **0 empty prices** in D1 now.

### Verified
- NHTSA VPIC decodes the real VIN `KL4AMBSL4SB169810` → 2025 Buick Encore GX, 3-cyl In-Line, L3T, FWD, Gasoline ✅
- Groq `openai/gpt-oss-20b` returns a clean description (status 200); `qwen3.6-27b` leaks `<think>` reasoning so it's NOT used ✅
- Public `/api/trucks` returns the listed truck; inventory page renders it with `$34,544` (headless Chrome, 0 console errors) ✅
- All 4 JS files pass `node --check` ✅

## v0.2.4 — TRUCKS WERE INVISIBLE (opacity: 0) — the real "doesn't show" bug (Aug 19, 2026)

**Jaden reported (repeatedly):** "does not show on the inventory page still." The truck was listed, the API returned it, the DOM had the card — but it was **invisible**.

### Root cause
- `renderGrid()` adds the `in-view` class to each truck card (staggered fade-in via `requestAnimationFrame`).
- But the CSS only had `.reveal.visible { opacity: 1 }` — there was **no `.reveal.in-view` rule**.
- So every card rendered with `.reveal` (which is `opacity: 0`) + `.in-view` (no effect) → **stayed at opacity 0 forever**.
- Headless-Chrome tests checked the DOM (`cardCount: 1`, correct HTML), not the *computed* style, so it kept "passing" while the user saw a blank grid. Classic.

### Fix
- `site/css/styles.css` — added `.reveal.in-view { opacity: 1; transform: translateY(0); }`.

### Verified (computed style, not DOM)
- `/inventory` and `/` both now show the card at **computed `opacity: 1`**, `visible: true`, price `$34,544` ✅
- 0 console errors ✅

## v0.3.0 — Dealership-style layout + Vehicle Detail Page (Aug 19, 2026)

**Jaden's request:** copy the layout from Eagle Ridge GM's real site (he saved the VLP + VDP HTML from the dealership) — how they show cars — but keep our dark/gold luxury look. Clicking a listing should open a dedicated page, not a modal.

### New layout
- **Inventory list → horizontal cards** (image left, details right), mirroring the dealership's VLP:
  - Title (year make model trim) + Stock #
  - Big gold price
  - **Attribute tag pills** (the dealership's spec chips): mileage, body style, transmission, drivetrain, engine, fuel, exterior colour
  - "View Details →" CTA
  - Whole card is a link → `vehicle.html?id=<stock>`
- **New Vehicle Detail Page (`site/vehicle.html`)** — replaces the old detail modal:
  - Hero title + price + tags
  - Image gallery (main + thumbnail strip, click-to-swap)
  - Full spec grid (mileage, body, transmission, drivetrain, engine, fuel, colours, stock #, VIN)
  - "About this vehicle" description (AI `aiDescription` → falls back to feed `description`)
  - CTAs: Confirm Availability / Request More Info (→ home contact form)
  - **Payment calculator** (the dealership's "Unlock Payment Options"): down payment, term, interest rate, frequency (weekly/bi-weekly/monthly) → live estimated payment (standard amortization formula)
- **Home flagships** now also link to the VDP and show tags + CTA.

### Supporting changes
- **`worker/index.js`** — new public `GET /api/trucks/:id` (single *listed* truck) for the VDP.
- **`main.js`** — `PAGE === 'vehicle'` mode (`loadVehicle`/`renderVehicle`), `buildTags()`/`tagsHTML()` tag chips, `paymentCalculatorHTML()`/`computePayment()`, cards link to the VDP instead of opening a modal. Modal code + modal divs removed from the two HTML pages.
- **`styles.css`** — list-card, tag pill, VDP, and payment-calculator styles + responsive fallbacks.

### Verified (headless Chrome)
- Inventory: horizontal card, `opacity: 1`, tags `[10 km, SUV, AUTOMATIC, FWD, In-Line 3-cyl (L3T), GASOLINE, White]`, href → `vehicle.html?id=13969015` ✅
- VDP: title/price/gallery (20 thumbs)/9 specs/AI description/payment calc all render; default $256 bi-weekly → $219 after $5,000 down ✅
- Home flagships still render + link to VDP ✅
- 0 console errors across all three pages ✅

## v0.3.1 — Full VDP info + Workers AI descriptions (Aug 19, 2026)

**Jaden:** "the full info when you click on car isnt there — make it like the HTML I sent" + "add a different free AI to gen the description, make it catchy, don't mention Eagle Ridge".

### VDP — now matches the dealership's detail page
- **Vehicle Details** — proper label:value list (Body Style, Engine, Exterior/Interior Colour, Transmission, Drivetrain, Fuel Type, Mileage, VIN, Stock #).
- **Features & Options ("Standard Equipment")** — NEW: the feed's `description` field is actually a comma-separated feature list, so `splitFeatures()` breaks it into checkmarked items (e.g. "✓ LED exterior lighting", "✓ heated power side mirrors"…). 23 features rendered for the listed truck.
- **Book a Test Drive + Request More Info** — NEW forms (mirroring the dealership) with a simple "✓ Sent" success state.
- Description now shows the catchy prose (`aiDescription`) separately from the feature list.

### AI descriptions — switched to a DIFFERENT free AI
- **Groq → Cloudflare Workers AI** (`@cf/meta/llama-3.1-8b-instruct`): free, no API key, runs inside our own worker via the new `env.AI` binding.
- New worker endpoint **`POST /api/bridge/describe`** (bridge-token auth) — generates descriptions for trucks missing `aiDescription` (LISTED first, capped at 10/call so it ramps up each hourly sync).
- `sync.js` no longer calls Groq — it calls `/api/bridge/describe` after each upload. Groq key + env removed from the workflow.
- **Catchy prompt** with an explicit guard: *"Do NOT mention Eagle Ridge, any dealership name, phone number, or URL."*

### Note
- Pollinations' free text API now returns 402 (deprecated for free use), so Workers AI was the right free choice — it lives on our existing Cloudflare stack and needs no key.
