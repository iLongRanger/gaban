import Database from 'better-sqlite3';
import path from 'node:path';

let _db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id TEXT UNIQUE NOT NULL,
  business_name TEXT NOT NULL,
  type TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  email TEXT,
  rating REAL,
  reviews_count INTEGER,
  photo_count INTEGER,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  distance_km REAL NOT NULL,
  subtypes TEXT,
  working_hours TEXT,
  business_status TEXT,
  reviews_data TEXT,
  instagram TEXT,
  facebook TEXT,
  total_score INTEGER NOT NULL,
  factor_scores TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  week TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outreach_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  style TEXT NOT NULL,
  email_subject TEXT NOT NULL,
  email_body TEXT NOT NULL,
  dm TEXT NOT NULL,
  edited_email_body TEXT,
  edited_dm TEXT,
  selected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(lead_id, style)
);

CREATE TABLE IF NOT EXISTS lead_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  location TEXT NOT NULL,
  radius_km INTEGER NOT NULL DEFAULT 50,
  office_lat REAL NOT NULL,
  office_lng REAL NOT NULL,
  categories TEXT NOT NULL,
  top_n INTEGER NOT NULL DEFAULT 4,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preset_id INTEGER REFERENCES presets(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  phase TEXT,
  leads_found INTEGER,
  log TEXT DEFAULT '',
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preset_id INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
  cron TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL,
  preset_id          INTEGER NOT NULL REFERENCES presets(id),
  status             TEXT NOT NULL DEFAULT 'draft',
  daily_cap          INTEGER NOT NULL DEFAULT 10,
  start_date         TEXT,
  end_date           TEXT,
  timezone           TEXT NOT NULL DEFAULT 'America/Vancouver',
  send_window_start  TEXT NOT NULL DEFAULT '09:00',
  send_window_end    TEXT NOT NULL DEFAULT '17:00',
  send_days          TEXT NOT NULL DEFAULT 'mon,tue,wed,thu,fri',
  touch_styles       TEXT NOT NULL DEFAULT '["curious_neighbor","value_lead","compliment_question"]',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_leads (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id    INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id        INTEGER NOT NULL REFERENCES leads(id),
  status         TEXT NOT NULL DEFAULT 'queued',
  touch_count    INTEGER NOT NULL DEFAULT 0,
  added_at       TEXT NOT NULL,
  last_touch_at  TEXT,
  completed_at   TEXT,
  outcome        TEXT,
  UNIQUE(campaign_id, lead_id)
);

CREATE TABLE IF NOT EXISTS email_sends (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_lead_id   INTEGER NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  touch_number       INTEGER NOT NULL,
  template_style     TEXT NOT NULL,
  subject            TEXT NOT NULL,
  body               TEXT NOT NULL,
  recipient_email    TEXT NOT NULL,
  gmail_message_id   TEXT,
  gmail_thread_id    TEXT,
  scheduled_for      TEXT NOT NULL,
  sent_at            TEXT,
  status             TEXT NOT NULL DEFAULT 'scheduled',
  error_message      TEXT,
  created_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  send_id      INTEGER NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  detected_at  TEXT NOT NULL,
  raw_payload  TEXT
);

CREATE TABLE IF NOT EXISTS suppression_list (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash  TEXT UNIQUE,
  domain      TEXT,
  reason      TEXT NOT NULL,
  source      TEXT NOT NULL,
  added_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_lead_id  INTEGER NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  scheduled_for     TEXT NOT NULL,
  kind              TEXT NOT NULL,
  notes             TEXT,
  completed         INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contracts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_lead_id  INTEGER NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  signed_date       TEXT NOT NULL,
  value_monthly     REAL,
  notes             TEXT,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
`;

export function initDb(dbPath) {
  const resolvedPath = dbPath || path.resolve(process.cwd(), 'data/gaban.sqlite');
  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  _db = db;
  return db;
}

export function getDb() {
  if (!_db) {
    return initDb();
  }
  return _db;
}
