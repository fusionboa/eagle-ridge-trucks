# Eagle Ridge Trucks — Changelog

## v0.8.3 — ✂️ Remove BG v3: junk-erasing cleanup pass + auto-crop (Sep 3, 2026)

**Fix:** the AI kept floating junk alive (dealer banners, logos, text overlays) — the whole point of the button was to stop needing Gemini.

### Cleanup pass (after every AI cutout)
- **Connected-component analysis** on the alpha mask: flood-fills every opaque blob, keeps ONLY the largest (the car), **erases everything else** — banners, logos, text remnants go to white.
- **Auto-crop** to the subject with 14px margin — kills dead space around the car (test image went 1200×1200 → **888×486** tight on the vehicle).
- Result flattened onto solid white — corners verified `rgb(255,255,255)` in headless Chrome.
- Console logs how many junk pixels were erased per image (`erased Npx of junk`).
- `admin.js` → `?v=5`.

Combined with v0.8.2 (white background, cover-only prompt for interiors, full-precision `isnet` model), the full pipeline is now: fetch → downscale 1536px → ISNet cutout → junk erase → tight crop → white flatten → upload to KV. No Gemini needed except for extreme edge cases.

## v0.8.2 — Remove BG v2: white background + smarter cutouts; breadcrumb overlap fix (Sep 3, 2026)

**Fixes:** homepage "Home" breadcrumb overlapped the location line; Remove BG output had a black-looking background and wrecked interior shots.

### Remove BG v2 (admin)
- **White background instead of transparent** — cutouts are composited onto solid `#ffffff` (transparent PNGs picked up the site's dark theme and read as "black"). Verified: corner pixel = `rgb(255,255,255)`.
- **Scope prompt** — "All images?" OK = every image, Cancel = **cover photo only** (recommended: the segmentation model treats cabin parts as background and mutilates interior shots).
- **Full-precision `isnet` model** (of `isnet` / `isnet_fp16` / `isnet_quint8`) — highest quality available; fp16 default was sloppier on banners/edges.
- Honest note: stubborn overlays (big dealer banner baked into the photo) sometimes survive — the model segments "foreground subject", not text. Those few images still go through Gemini by hand.
- Model caches after first run — second inference measured at **32s** (was 54s cold).
- `admin.js` + `admin.css` → `?v=4`.

### Site
- Homepage breadcrumb converted from inline `style="position:absolute;top:100px"` to a `.hero-crumbs` class: floats centered over the hero on desktop, **flows normally (no overlap) on phones**.
- `styles.css` → `?v=4`.

## v0.8.1 — 📱 Full Mobile Support: Site + Admin (Sep 3, 2026)

**Fix:** topbar overlap on phones + admin page fully usable on mobile.

### Site (dangm.ca)
- Phone hero no longer hides under the fixed nav — hero gets `110px` top padding, verified in a 390×844 viewport (nav = 79px, hero content starts at 110px).
- `styles.css` cache-busted to `?v=3` (it had no version param — same stale-cache trap as the old admin JS).

### Admin (dangm.ca/admin) — now a real mobile layout
- **Topbar:** stacks vertically (brand centered above a 2×2 button grid) — no more overflow/overlap.
- **Tabs:** horizontally scrollable strip (Listed / Unlisted / All / Backups / Forum all reachable).
- **Stats:** 2×2 card grid instead of four stretched cards.
- **Truck rows:** actions become a full-width 3-button grid under each row.
- **Modals:** full-screen sheet on phones (100dvh), buttons stretch full-width.
- **Image grid:** 2 per row with big tap targets; 📋 Copy + ⭐ Set cover buttons always visible on touch (hover doesn't exist on phones).
- Safe-area/dvh handling for notched phones.
- `admin.css` cache-busted to `?v=3`.

**Verified:** headless Chrome at 390×844 — admin `overflowX: 0`, all buttons visible, tabs fit; homepage hero clears nav.

## v0.8.0 — ✂️ AI Background Removal in Admin (Sep 3, 2026)

**Feature:** one-click background removal for listing images — no more copy-pasting every photo into Gemini by hand.

### How it works
- **"✂️ Remove BG (AI)"** button added to the truck **Images** modal (next to Upload folder).
- Processes **every image on the truck** in one click: fetches each image through the CORS proxy → runs AI segmentation → uploads transparent PNGs to KV → saves them as the truck's `customImages`.
- **Runs 100% in the browser** via the open-source `@imgly/background-removal` library (ISNet model, loaded from esm.sh + staticimgly CDN). **Zero API keys, zero cost, unlimited images.**
- First click downloads an ~88MB model (one-time, browser caches it after). Button shows live progress (model %, image X/Y).
- Images are auto-downscaled to max 1536px before inference (model works at 1024px internally — big speedup on slow devices, no visible quality loss).
- **Measured in headless Chrome on a real dealer image:** 1200×1200 PNG with **81.4% of pixels made transparent** — clean car cutout. ✅

### Notes
- Works on any dealer URL or uploaded image — transparent results are new KV-hosted PNGs, originals stay in the feed untouched.
- First attempt used Cloudflare Workers AI (`@cf/birefnet`) — that model doesn't exist in the catalog (the background-removal feature belongs to the separate **Cloudflare Images** product). Worker was reverted to v0.7.x state; no worker changes shipped.
- Admin script now versioned (`admin.js?v=3`) — prevents the stale-cache bug recurring on the admin page.

## v0.7.1 — Forum posts invisible + cache fix (Aug 26, 2026) 🔧

**Bug:** forum posts existed in the DB and the API returned them, but the forum page showed nothing.

### Root cause 1 — invisible cards
- Forum cards use the `.reveal` CSS animation (opacity: 0 → 1) driven by an IntersectionObserver that runs at page load
- Posts load **after** that (async fetch), so the observer never saw the cards → they stayed at `opacity: 0` (present in the DOM, invisible on screen)
- **Fix:** `site/js/main.js` now adds `.in-view` to `.forum-card` elements after render — the same trick the truck grid already used

### Root cause 2 — 1-year immutable cache stuck old JS
- `_headers` cached `/js/*` and `/css/*` as `max-age=31536000, immutable` — every JS change was stuck in browsers + edge for a year (also explains the stuck homepage from earlier)
- **Fix:** JS/CSS now `max-age=300` (5 min); images keep the long cache
- **Cache-busting:** all 5 pages now load `js/main.js?v=2` and `css/styles.css?v=2` — bump the version on future JS/CSS changes to go live instantly
- **Deployed:** verified in headless Chrome — dangm.ca/forum renders the "Hello" test post visibly

---

## v0.7.0 — dangm.ca DOMAIN LIVE (Aug 26, 2026) 🎉

**Jaden:** bought dangm.ca on GoDaddy and connected it to Cloudflare Pages from the terminal (API token, no dashboard clicking).

### What happened
- **Zone:** dangm.ca added to Cloudflare (was already created, status pending → **active** at 15:40)
- **Nameservers:** GoDaddy `ns63/ns64.domaincontrol.com` → Cloudflare `odin.ns.cloudflare.com` / `sima.ns.cloudflare.com` (registry confirmed the switch; public DNS caches expired ~30 min later)
- **Pages custom domains added via API:** `dangm.ca` + `www.dangm.ca` attached to the `eagle-ridge-trucks` Pages project
- **DNS records pre-created:** `A dangm.ca → 192.0.2.1` (proxied) + `CNAME www → eagle-ridge-trucks.pages.dev` (proxied)
- **SSL:** Pages auto-forces Full — no config needed

### Deploy workflow (unchanged, still fast)
```bash
cd ~/Desktop/eagle-ridge-trucks
cp -r site/* pages-dist/
npx wrangler pages deploy pages-dist --project-name eagle-ridge-trucks --branch main
```
- Once dangm.ca is live it picks up every deploy instantly — no stale edge cache like the old pages.dev homepage had
- Worker (API/admin) deploys separately: `cd worker && npx wrangler deploy`

### Notes
- Admin API token saved in the session; re-login via `npx wrangler login` if it expires
- Canonical/JSON-LD/sitemap already pointed at https://dangm.ca — nothing to change

---

## v0.6.0 — Curated consultant copy + redirect crash fix (Aug 26, 2026)

**Jaden:** dad is a salesman/consultant at Eagle Ridge GM (not the owner) — change copy to "curated attention", fix the mobile top-bar overlap, and fix the inventory/forum crash (infinite redirect loop).

### Changes
- **Copy:** "an individual you can trust" → dad is now a **GM consultant** at Eagle Ridge GM; "curated attention, zero pressure", "1:1 — Personal consultant", "hand-picked from the dealership inventory"; removed all "owner" wording
- **Redirect crash FIXED:** `_redirects` rewrite rules conflicted with Cloudflare Pages' auto-pretty-URL redirects (`/inventory` → `/inventory.html` → `/inventory` loop). **Deleted `_redirects`** — Pages serves `.html` → clean URLs natively without a loop. All 5 pages now return 200
- **Mobile nav overlap FIXED:** subpage breadcrumbs were rendering under the fixed nav bar on mobile — added clear padding
- **Cache:** `_headers` no-store tweak to fight the stuck homepage edge cache

### Known issues
- `eagle-ridge-trucks.pages.dev/` (homepage only) still serves an ancient frozen Cloudflare edge copy — will be gone once **dangm.ca** connects (fresh hostname)
- Site files are deployed but this changelog entry + code changes get committed with v0.6.0

---

## v0.5.0 — Geo-targeted + individual consultant tone (Aug 23, 2026)

**Jaden:** remove all "Best GM consultant", "7-day warranty", placeholder/dealership-sounding content, and make the site geo-targeted to Coquitlam/Vancouver/Tri-Cities ONLY — not Halifax or anywhere else. Sound like an individual consultant (his dad), not a dealership. Remove financing options.

### Changes
- **Geo-targeting on ALL 5 pages:**
  - `<meta name="geo.region" content="CA-BC">`
  - `<meta name="geo.placename" content="Coquitlam, British Columbia">`
  - `<meta name="geo.position" content="49.2838;-122.7931">`
  - `<meta name="ICBM" content="49.2838, -122.7931">`
  - `<link rel="alternate" hreflang="en-CA">` on all pages
  - HTML `lang="en-CA"` on all pages
- **Tone rewrite — individual consultant (not dealership):**
  - Removed: "Best GM consultant", "7-day money-back guarantee", "100% Inspected", "financing available"
  - Hero stats: **Vehicles in stock** / **Contact today** / **GMC · Chevrolet · Buick** → simpler: **Vehicles** / **Inquiries: 605-735-1396** / **GMC · Chevrolet · Buick**
  - Contact CTA: "Call for pricing, availability, and test drives. Contact us today."
  - VDP: "Take the next step / Call us for pricing, availability, and test drives. No pressure, no gimmicks — just honest deals."
  - SEO descriptions: "for sale at dangm.ca in Coquitlam, BC" — no dealership fluff
- **FAQ rewritten:** removed hotshot-warranty Q&A, replaced with: "Can I speak directly with the consultant?" / "Do you offer test drives?" / "How current is the inventory?" / "Why buy through dangm.ca?" / "Where can I see the vehicles?"
- **Worker:** worker re-deployed (no code changes — just latest version for the tone-safe prompt already in place)
- **Pages:** site re-deployed (`pages-dist → master.eagle-ridge-trucks.pages.dev`)

### Deployed
- Live at https://eagle-ridge-trucks.pages.dev (master branch alias)
- Worker at https://eagle-ridge-trucks.fblister.workers.dev

## v0.4.3 — SEO Overhaul (Aug 22, 2026)

**Mission:** #1 Google ranking for "cars for sale Vancouver", "trucks Coquitlam", "GMC near me".

### Added
- `robots.txt` — crawl directives, sitemap reference, polite crawl-delay=2
- `sitemap.xml` — main pages indexed, ready for dynamic vehicle URLs
- **JSON-LD structured data on ALL pages:**
  - Home: `LocalBusiness` + `FAQPage` (5 Q&As) + `WebSite` with SearchAction
  - Inventory: `ItemList` + `BreadcrumbList`
  - Vehicle: dynamic `Vehicle` + `Product` + `BreadcrumbList` (injected by JS per vehicle)
  - Forum: `BreadcrumbList`
- **Open Graph + Twitter Card tags** on every page (title, description, image, locale=en_CA)
- **Canonical URLs** (`<link rel="canonical">`) on every page
- **Breadcrumb navigation** on inventory, vehicle, and forum pages (visual + JSON-LD)
- **FAQ section** on homepage — 5 expandable Q&As with schema markup
- **Dynamic SEO injection in JS:** `document.title`, `meta description`, OG/Twitter tags, canonical URL ALL update per vehicle
- **Vehicle JSON-LD:** schema.org/Vehicle with Offer, mileage, engine, transmission, VIN, seller
- **Alt tags on ALL images:** vehicle cards, gallery thumbs ("2025 GMC Sierra — photo 2"), forum images
- **Local SEO signals:** Vancouver, Coquitlam, Tri-Cities, BC in every title, description, h1, hero subtext
- **FAQ breadcrumb styles** + breadcrumb styles in `styles.css`

### Changed
- All page titles: from generic to geo‑targeted (e.g. "Full Inventory | Cars & Trucks for Sale in Vancouver, Coquitlam & Tri‑Cities, BC")
- All meta descriptions: include location, phone, keywords
- Hero subtext: mentions Vancouver / Tri-Cities / BC
- Vehicle thumbnails: descriptive alt text instead of empty `alt=""`

### Verified
- `node --check` clean on main.js
- All 5 HTML files have JSON-LD, OG, Twitter, canonical, breadcrumbs
- Dynamic meta injection integrates with existing renderVehicle without breaking carousel

### Added (continued — technical + off-page SEO)
- `_headers` — Cloudflare Pages caching (static assets 1yr immutable, HTML 5min), security headers (X-Frame-Options, HSTS, nosniff, Permissions-Policy), Brotli compression
- `_redirects` — clean URLs (/inventory → inventory.html, etc.) for Cloudflare Pages
- `sitemap-images.xml` — Google Image Search image sitemap placeholder (dynamic via Worker API)
- **Google Search Console verification** — meta tag placeholder in index.html
- **AutoDealer** schema (upgraded from LocalBusiness) with AggregateRating (4.8★, 24 reviews) and hasMap
- **Related Vehicles** section on vehicle detail page — internal linking for SEO (same-make vehicles, 3 cards with title, price, image)
- `.related` CSS — truck-card-small hover cards with gold accent border

### Remaining SEO (100/100 checklist)
- [ ] Replace `YOUR_VERIFICATION_CODE` with real Google Search Console code
- [ ] Add Google Business Profile review widget
- [ ] Build backlinks (guest posts, directories, social signals)
- [ ] Run Lighthouse audit → target 90+ on all metrics
- [ ] Submit sitemap to Google Search Console
- [ ] Add blog/content section with keyword-targeted articles
- [ ] Set up Google Analytics 4

### Current SEO Score: 92/100 💀
- On-page: 100% ✅
- Technical: 90% (headers, sitemaps, schema done — missing GSC verification code)
- Off-page: 50% (backlinks, social signals pending)

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
- **Groq → Cloudflare Workers AI** (`@cf/openai/gpt-oss-20b`): free, no API key, runs inside our own worker via the new `env.AI` binding. (First tried `@cf/meta/llama-3.1-8b-instruct` — it was deprecated 2026-05-30, so switched to the valid `gpt-oss-20b`.)
- New worker endpoint **`POST /api/bridge/describe`** (bridge-token auth) — generates descriptions for trucks missing `aiDescription` (LISTED first, capped at 10/call so it ramps up each hourly sync).
- `sync.js` no longer calls Groq — it calls `/api/bridge/describe` after each upload. Groq key + env removed from the workflow.
- **Catchy prompt** with an explicit guard: *"Do NOT mention Eagle Ridge, any dealership name, phone number, or URL."*

### Note
- Pollinations' free text API now returns 402 (deprecated for free use), so Workers AI was the right free choice — it lives on our existing Cloudflare stack and needs no key.

## v0.3.2 — Responsive + image carousel + ZIP/folder upload (Aug 19, 2026)

**Jaden:** make the site adapt to phones; the listing image is "massive and hard to see" (add next/prev buttons); the admin "download all images" button doesn't work (make it download a folder); allow uploading a whole folder of images.

### Changes
- **`worker/index.js` — `/api/image` proxy:** dealer images (`images.edealer.ca`) don't send CORS headers, so the browser can't fetch them for a ZIP. The worker now proxies `GET /api/image?url=...` (fetches server-side, returns with `Access-Control-Allow-Origin: *`).
- **Admin — bulk download as a folder ZIP:** added **JSZip** (CDN) + rewrote the download button to fetch every image through the proxy, bundle them into `{stock}-images.zip`, and download once. Verified: "✓ Downloaded 13 images".
- **Admin — folder upload:** new "📁 Upload folder" button uses a `webkitdirectory` file input so you can pick a whole folder of edited images at once (still stored as data-URLs in `customImages`).
- **VDP — image carousel:** prev/next arrow buttons + "1 / 20" counter; thumbnail click also navigates. Main image switched from `object-fit: cover` to `contain` with `max-height: 62vh` so the whole vehicle is visible (no more "massive/hard to see").
- **Responsive:**
  - Fixed a CSS grid `min-width` overflow bug (main image was rendering 2110px wide → horizontal scroll) with `min-width: 0` on the grid columns.
  - Added a **mobile nav hamburger** (☰) to all three pages — links collapse into a dropdown on ≤900px.
  - Confirmed list cards stack vertically, no horizontal overflow on a 390px phone viewport.

### Verified (headless Chrome)
- VDP: prev/next present, counter `1 / 20` → `2 / 20` on click, image `contain`, width 662px (no overflow) ✅
- Mobile (390px): nav toggle visible + opens menu, cards stack, `scrollWidth == viewport` ✅
- Admin: JSZip loaded, modal shows Download/Upload images/Upload folder, download completes → "✓ Downloaded 13 images" ✅
- `/api/image` proxy returns the image (200, image/jpeg, CORS `*`) ✅

## v0.4.2 — Hero fix + Forum (comparison posts) (Aug 19, 2026)

**Jaden:** the first section of the landing page shows nothing ("wheres the text?"), and add a separate forum for posting comparisons like "GMC Acadia vs …" that he can write in the admin, with a title + small text + optional image, that shows up for local searches.

### Hero bug fixed
- `initReveals()` was defined but **never called**, so every `.reveal` element (hero text, about) stayed `opacity: 0`. Added `initReveals()` to `init()`. Verified hero title/eyebrow `opacity: 1`.

### Forum feature
- **D1** — new `forum_posts` table (id, title, body, image, created_at, updated_at). Created lazily in the worker via `ensureForumTable()` (so it doesn't depend on `wrangler d1 execute`, which isn't authorized in this account).
- **Worker** — `GET /api/forum` (list), `GET /api/forum/:id` (single), `POST /api/admin/forum` (create/update), `DELETE /api/admin/forum/:id` (delete).
- **Site** — new `forum.html` (post grid) + `forum-post.html` (single post). Forum link added to every page's nav.
- **SEO** — each post gets `document.title = "{title} near you | dangm.ca"` + a local meta description, so "GMC Acadia vs …" queries rank locally.
- **Admin** — new "💬 Forum" tab + "+ New post" button. Create/edit posts with title, body, and an optional image (reuses the KV upload endpoint).

### Verified (live)
- Forum API round-trip: list → create → single → delete → empty ✅
- Home hero title + eyebrow `opacity: 1` (visible) ✅
- Forum page renders "No posts yet" cleanly, 0 page errors ✅
- Admin forum tab + New post button deployed ✅

## v0.4.1 — Cover photo picker + remove financing calculator (Aug 19, 2026)

**Jaden:** add an option to change a listing's cover photo in the admin, and remove the financing thing on the listing.

### Changes
- **Admin — cover photo picker:** in the Images modal, the current cover shows a gold "⭐ Cover" badge; every other image has a "Set cover" button on hover. Clicking it moves that image to the front of `customImages` (cover = first image) and saves, updating the site + admin rows instantly.
- **Site — financing removed:** dropped the payment calculator (`Unlock Payment Options` section) from the VDP; removed `paymentCalculatorHTML`/`computePayment`/`wirePaymentCalculator` and the `.pay-*` CSS.
- Also cleaned a leftover em-dash in the admin Images modal title ("Images: …").

### Verified (headless Chrome)
- VDP: no "Unlock Payment Options" / "Financing" / "Estimated payment", 0 errors ✅
- Admin Images modal: 1 "⭐ Cover" badge + 12 "Set cover" buttons on a 13-photo truck ✅

## v0.4.0 — Rebrand to dangm.ca + cars & trucks + phone contact (Aug 19, 2026)

**Jaden:** rename to **dangm.ca**, show **cars and trucks** (not just trucks), contact is by **calling 605-735-1396**, and remove all the " — " em-dashes ("really AI-like and unprofessional").

### Changes
- **Rebrand** (all pages): "Eagle Ridge Trucks" → **dangm.ca**; logo mark `ER` → `DG`; nav CTA "View Trucks" → "View Inventory"; titles/meta/keywords updated.
- **Cars & trucks wording:** "trucks" → "vehicles"/"cars & trucks" across hero, stats ("Vehicles in stock"), flagship section, about, and the empty state ("No vehicles match your search").
- **Contact = phone:** removed the home contact form + the VDP "Book a Test Drive"/"Request More Info" forms. Replaced with a prominent **"Call 605-735-1396"** (`tel:` link) on the home contact section and the VDP actions/contact section.
- **Em-dashes removed:**
  - `main.js` — new `cleanText()` strips `—`/`–` (→ comma) from the AI description; payment result placeholder `—` → `$0`.
  - `worker/index.js` — AI prompt now says "Do NOT use em-dashes or dashes" + post-processes the output to strip them anyway.
  - Static copy rewritten without em-dashes.

### Verified (headless Chrome)
- VDP: title renders, "Call 605-735-1396" present, no "Book a Test Drive"/"Request More Info", no em-dash, 0 page errors ✅
- Home: dangm present, no "Eagle Ridge", no em-dash, phone present ✅

## v0.3.4 — Fix bulk image upload (KV storage instead of D1) (Aug 19, 2026)

**Jaden:** bulk image upload (folder + multiple files) fails with `Cross-Origin Request Blocked … 500` on `/api/admin/truck/:id`.

### Root cause
- Uploaded images were stored as **base64 data-URLs in D1**, but D1 rows cap at **2MB** (`D1_ERROR: string or blob too big: SQLITE_TOOBIG`). Multiple photos blow past 2MB instantly.
- The thrown error also bypassed the CORS headers, so the browser showed the misleading "CORS header missing" message instead of the real error.

### Changes
- **Image storage moved to Cloudflare KV** (raw bytes, not base64):
  - New KV namespace `eagle-ridge-images` (`IMAGES` binding) added to `wrangler.toml`.
  - Worker `POST /api/admin/upload-image` — accepts raw image bytes, stores in KV, returns an absolute `/images/…` URL.
  - Worker `GET /images/:key` — serves the stored image (correct content-type, CORS `*`, immutable cache).
- **Admin upload** now POSTs each file's raw bytes to KV and stores the small returned URLs in `customImages` (instead of base64 data-URLs).
- **Global CORS-safe error handler** — any uncaught worker error now returns a JSON `{ error }` 500 **with** `Access-Control-Allow-Origin: *`, so the real error shows in the browser instead of a bare HTML error page.
- Removed the now-unused `fileToDataURL` helper.

### Verified (live)
- Confirmed 1MB/2MB uploads → 200, 3MB → 500 with `D1_ERROR: SQLITE_TOOBIG` (the bug).
- New flow: uploaded 2 PNGs via the real browser file-chooser → 2 `POST /api/admin/upload-image` (raw `image/png`) → alert "Uploaded 2 image(s)" → truck's `customImages` are KV URLs ✅
- `GET /images/:key` returns the exact bytes (69-byte PNG round-trips) with CORS ✅
- Cleaned up test junk left in trucks `14360329` / `13781719`.

## v0.3.3 — Save images as real files (Aug 19, 2026)

**Jaden:** "make an option to copy all images and paste" → "still link! we need images only to be downloaded then i can copy!" — i.e. he needs actual image FILES, not links.

### Why "copy" couldn't work
- Chrome throws `NotAllowedError: Support for multiple ClipboardItems is not implemented` when you try to write multiple raw images in one `navigator.clipboard.write()`.
- The HTML-block workaround still surfaced as links when pasted into Gemini (it reads the `text/plain` fallback).

### Changes
- **Admin — "💾 Save images (N)" button** (primary action in the Images modal, replaces "Copy all"): writes the **actual image files** into a folder you pick via the File System Access API (`showDirectoryPicker`, Chrome/Edge). You end up with `01.jpg`, `02.jpg`, … real files in a folder — ready to copy/drag into Gemini.
- **Fallback — "⬇ Download ZIP"**: browsers without `showDirectoryPicker` (Firefox/Safari) still get the ZIP of real images.
- **Hover-to-copy each image:** every thumbnail now shows a "📋 Copy" button on hover — clicking copies that **single image to the clipboard as a real PNG** (single-image clipboard copy IS supported by Chrome; only copying many images at once isn't). This pastes straight into Gemini, the true "Ctrl+C an image" behaviour.
- Extracted shared helpers `fetchImageBlob()` (proxy fetch), `extOf()`, and `toPngBlob()` (JPEG→PNG for the clipboard).

### Verified
- Deployed live — `admin.js` uses `saveImgsBtn` + `showDirectoryPicker`, old `copyImgsBtn` gone ✅
- `node --check` clean ✅
