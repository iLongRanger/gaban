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
