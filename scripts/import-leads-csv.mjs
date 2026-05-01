#!/usr/bin/env node
// One-off importer for fallback CSVs produced when the SQLite export failed.
// Usage: node scripts/import-leads-csv.mjs data/leads-2026-W18.csv [weekLabel]
//
// The fallback CSV only contains a subset of fields (no place_id, no coords,
// no drafts). This script generates a synthetic place_id, uses the configured
// office location as a placeholder for required coords, and inserts each row
// with no outreach drafts. Re-running the pipeline against fresh discovery
// data is preferred — this script exists for cases where rerunning isn't
// possible (e.g. budget caps, suppressed leads).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from '../src/web/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = splitRow(lines.shift());
  return lines.map(line => {
    const cells = splitRow(line);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

function splitRow(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function buildFallbackPlaceId(row) {
  const key = [row.business_name, row.address, row.phone, row.website]
    .filter(v => v && v.trim())
    .join('|')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
  return `generated:${key || 'unknown'}`;
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: node scripts/import-leads-csv.mjs <csv> [weekLabel]');
  process.exit(1);
}

const settings = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../src/config/settings.json'), 'utf-8')
);
const office = settings.office_location;

const weekLabel = process.argv[3] || path.basename(csvPath).match(/(\d{4}-W\d{2})/)?.[1];
if (!weekLabel) {
  console.error('Could not infer week label from filename; pass it as second arg.');
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(csvPath, 'utf-8'));
const db = initDb();
const now = new Date().toISOString();

const insert = db.prepare(`
  INSERT OR IGNORE INTO leads (
    place_id, business_name, type, address, phone, website, email,
    latitude, longitude, distance_km,
    total_score, factor_scores, reasoning,
    status, week, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)
`);

let imported = 0;
for (const row of rows) {
  const result = insert.run(
    buildFallbackPlaceId(row),
    row.business_name || 'Unknown',
    row.type || null,
    row.address || null,
    row.phone || null,
    row.website || null,
    row.email || null,
    office.lat,
    office.lng,
    0,
    Number(row.score) || 0,
    '{}',
    row.reasoning || '',
    weekLabel,
    now,
    now
  );
  if (result.changes > 0) imported++;
}

console.log(`Imported ${imported}/${rows.length} leads from ${csvPath} as week ${weekLabel}.`);
console.log('Note: coords default to office location, no outreach drafts attached.');
