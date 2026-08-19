# Eagle Ridge Trucks 🚛

A luxurious truck dealership website for **Eagle Ridge GM** (Jaden's dad) — built to get those **10 sales** so the Legion arrives early. 😤🔥

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  FTP (ftp.edealer.ca) — the ONLY feed (no DMS/HTTP)      │
│  CSV of trucks + image URLs                              │
└──────────────────────────┬───────────────────────────────┘
                           │ (Node FTP bridge — sync/sync.js)
                           ▼
┌──────────────────────────────────────────────────────────┐
│  Cloudflare Worker (worker/)                             │
│  • /api/bridge/upload — receives pushed trucks           │
│  • /api/trucks         — public, listed only             │
│  • /api/admin/*        — email-gated CRUD                │
│  • D1 database stores truck JSON                         │
└──────────────────────────┬───────────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        ▼                                     ▼
┌──────────────────┐              ┌──────────────────────┐
│  PUBLIC SITE      │              │  ADMIN (email-gated) │
│  site/            │              │  admin/              │
│  luxury, animated │              │  listed/unlisted,    │
│  truck showcase   │              │  edit, bulk images   │
└──────────────────┘              └──────────────────────┘
```

**Key design decision:** Cloudflare Workers can't do raw FTP, so a small Node bridge (runs on the Pixel 2 or any always-on machine) downloads the CSV from FTP hourly and pushes the parsed trucks to the Worker. The Worker does all the serving + admin — free, no Pixel needed for serving.

## The flow

1. **Sync** (`sync/sync.js`) — connects to FTP, downloads `feed.csv`, parses trucks, downloads images, pushes to worker. Auto-removes trucks deleted from the feed. Runs hourly.
2. **Admin** (`admin/`) — Google sign-in, email allowlist (`ADMIN_EMAILS`), tabs for Listed/Unlisted, edit truck details, bulk-download images.
3. **Gemini step (manual)** — download images → remove Eagle Ridge branding / enhance → upload edited versions back via the admin Images modal.
4. **Public site** (`site/`) — shows only LISTED trucks, luxury dark theme, smooth animations, search/filter/sort, truck detail modal.

## Setup

### 1. Worker (Cloudflare)
```bash
cd worker
npm i -g wrangler           # or use npx
wrangler d1 create eagle-ridge-trucks   # note the database_id
wrangler d1 execute eagle-ridge-trucks --file=./schema.sql
# Edit wrangler.toml: database_id, ADMIN_EMAILS, GOOGLE_CLIENT_ID
wrangler deploy
```

### 2. Sync bridge (Pixel 2 or local machine)
```bash
cd sync
npm install
# Set env vars:
#   FTP_HOST, FTP_USER, FTP_PASS  (Eagle Ridge FTP creds)
#   WORKER_URL                    (your worker URL)
#   WORKER_AUTH_TOKEN             (Google ID token from an admin login)
node sync.js                     # runs hourly
# or: node sync.js --once
```

### 3. Admin + site config
- `admin/index.html` → set `ADMIN_CONFIG.apiBase` + `googleClientId`
- Deploy `site/` + `admin/` to Cloudflare Pages (or serve from the worker)

## Local preview (no worker needed)
```bash
cd site
python3 -m http.server 8000
# open http://localhost:8000 — reads data/trucks.json (sample data)
```

## Status
- ✅ Sync script (FTP → parse → push, hourly, auto-remove)
- ✅ Worker (public API + admin CRUD + bridge upload, email-gated)
- ✅ Luxury storefront (dark theme, animations, search/filter/sort, modal)
- ✅ Admin page (Google sign-in, tabs, edit, bulk image download/upload)
- ⬜ Deploy worker + D1 (needs real FTP test)
- ⬜ Test against real Eagle Ridge FTP feed
- ⬜ Gemini image pipeline (manual for now)
- ⬜ SEO pass (title tags, Vehicle schema, Google Business Profile)
