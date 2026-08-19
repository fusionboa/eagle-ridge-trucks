-- Eagle Ridge Trucks — D1 schema
-- Trucks table: full truck data stored as JSON in `data`.
-- Backups table: published trucks that left the feed — never silently lost.

CREATE TABLE IF NOT EXISTS trucks (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,            -- JSON blob of truck fields + admin fields
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trucks_updated ON trucks (updated_at);

-- Published trucks that left the feed (sold/removed) — kept as backups,
-- restorable from the admin.
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,            -- JSON blob of the published listing
  backed_up_at TEXT DEFAULT (datetime('now'))
);
