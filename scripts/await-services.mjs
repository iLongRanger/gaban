#!/usr/bin/env node
// Animated waiter for the three services restart-all.ps1 spins up.
// Prints a per-service spinner that flips to a check when the service is
// verifiably alive, then prints a legend of single-service restart commands.
//
// Usage:
//   node scripts/await-services.mjs           # wait up to 120s for all services
//   node scripts/await-services.mjs --status  # one-shot check, no waiting

import 'dotenv/config';
import path from 'node:path';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';

const ONE_SHOT = process.argv.includes('--status');
const TIMEOUT_MS = 120_000;
const TICK_MS = 120;

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const UP = (n) => `\x1b[${n}A`;
const CLEAR_LINE = '\x1b[2K';

const DB_PATH = path.resolve(process.cwd(), 'data/gaban.sqlite');
const WEB_URL = process.env.LOCAL_WEB_URL || 'http://localhost:3010';
const PUBLIC_URL = process.env.PUBLIC_APP_URL || null;

const START = Date.now();
const startIso = new Date(START).toISOString();

const services = [
  { name: 'Background worker', status: 'pending', detail: 'waiting...' },
  { name: 'Web app          ', status: 'pending', detail: 'waiting...' },
  { name: 'Cloudflare tunnel', status: 'pending', detail: 'waiting...' },
];
let frame = 0;
let printed = false;

let db = null;
if (existsSync(DB_PATH)) {
  try { db = new Database(DB_PATH, { readonly: true }); } catch { db = null; }
}

function relative(iso) {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  return `${Math.round(sec / 3600)}h ago`;
}

function checkWorker() {
  if (!db) return { ok: false, detail: 'db not reachable' };
  const row = db.prepare(`
    SELECT MAX(updated_at) AS last FROM system_settings
    WHERE key IN ('outreach.last_send_worker_tick','outreach.last_response_monitor','outreach.last_healthcheck')
  `).get();
  const last = row?.last;
  if (!last) return { ok: false, detail: 'no heartbeat yet' };
  if (!ONE_SHOT && last <= startIso) return { ok: false, detail: `stale (${relative(last)})` };
  // For one-shot: alive if heartbeat is within the last 3 minutes.
  if (ONE_SHOT && Date.now() - new Date(last).getTime() > 3 * 60_000) {
    return { ok: false, detail: `stale (${relative(last)})` };
  }
  return { ok: true, detail: `heartbeat ${relative(last)}` };
}

async function checkHttp(url) {
  if (!url) return { ok: false, detail: 'no URL configured' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const t0 = Date.now();
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'manual' });
    const ms = Date.now() - t0;
    if (res.status >= 200 && res.status < 500) return { ok: true, detail: `http ${res.status} in ${ms}ms` };
    return { ok: false, detail: `http ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(t);
  }
}

function paint() {
  if (printed) process.stdout.write(UP(services.length));
  for (const s of services) {
    const icon =
      s.status === 'alive' ? `${GREEN}✓${RESET}` :
      s.status === 'failed' ? `${RED}✗${RESET}` :
      FRAMES[frame % FRAMES.length];
    process.stdout.write(`${CLEAR_LINE}  ${icon} ${s.name}  ${DIM}${s.detail}${RESET}\n`);
  }
  printed = true;
}

async function tick() {
  const [w, web, tunnel] = await Promise.all([
    Promise.resolve(checkWorker()),
    checkHttp(WEB_URL),
    checkHttp(PUBLIC_URL),
  ]);
  services[0].status = w.ok ? 'alive' : 'pending';
  services[0].detail = w.detail;
  services[1].status = web.ok ? 'alive' : 'pending';
  services[1].detail = web.detail;
  services[2].status = tunnel.ok ? 'alive' : 'pending';
  services[2].detail = tunnel.detail;
}

function printLegend(allAlive) {
  console.log();
  if (allAlive) {
    console.log(`${GREEN}${BOLD}==> All systems running${RESET}`);
  } else {
    console.log(`${RED}${BOLD}==> Some services are not responding${RESET}`);
  }
  console.log();
  console.log(`${DIM}Restart individual services:${RESET}`);
  console.log(`  Worker:  ${BOLD}./scripts/start-bot-worker.ps1${RESET}`);
  console.log(`  Web:     ${BOLD}./scripts/start-bot-web.ps1${RESET}`);
  console.log(`  Tunnel:  ${BOLD}./scripts/start-cloudflared-tunnel.ps1${RESET}`);
  console.log(`${DIM}Restart everything (rebuilds web, slower):${RESET}`);
  console.log(`  All:     ${BOLD}./scripts/restart-all.ps1${RESET}`);
}

async function main() {
  if (ONE_SHOT) {
    await tick();
    for (const s of services) if (s.status !== 'alive') s.status = 'failed';
    paint();
    printLegend(services.every((s) => s.status === 'alive'));
    process.exit(services.every((s) => s.status === 'alive') ? 0 : 1);
  }

  console.log('Checking services...');
  while (Date.now() - START < TIMEOUT_MS) {
    await tick();
    paint();
    if (services.every((s) => s.status === 'alive')) break;
    await new Promise((r) => setTimeout(r, TICK_MS));
    frame += 1;
  }
  for (const s of services) if (s.status !== 'alive') s.status = 'failed';
  paint();
  const ok = services.every((s) => s.status === 'alive');
  printLegend(ok);
  process.exit(ok ? 0 : 1);
}

process.on('SIGINT', () => { console.log(); process.exit(130); });
main().catch((err) => { console.error(err); process.exit(2); });
