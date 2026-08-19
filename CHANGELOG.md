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

## v0.2.1 — ADMIN FIXED (Aug 19, 2026)

**Jaden reported: the admin page "just doesn't do anything" / the test-mode button appears dead.**

### Root cause (real bug, not browser cache)
- The admin sends a custom **`X-Dev-Key`** header on every API call, but the worker's CORS preflight only allowed `Content-Type, Authorization`.
- The browser's OPTIONS preflight got rejected → **every fetch died silently** → page looked dead even though the code was deployed correctly.
- curl tests passed because curl doesn't do CORS preflight — that's why it looked fine server-side.

### Fix
- `worker/index.js`: `Access-Control-Allow-Headers` now includes **`X-Dev-Key, X-Bridge-Token`** → redeployed (version `8a66686b`).
- Verified: preflight returns the new headers; `/api/admin/trucks` with dev key + browser Origin returns all 383 trucks ✅

### Also logged (Aug 19)
- **Fusion AI specialist-model family idea** added to `~/Desktop/context.md` (Library AI section) — one small model per domain (Fusion AI Programmer, Fusion AI Kernel Dev, ...) each with its own growing library + a router.
