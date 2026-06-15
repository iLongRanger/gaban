#!/usr/bin/env node
// Single-terminal supervisor for Gaban. Spawns the web app, the background
// worker (the bot), and the Cloudflare tunnel as child processes, streams each
// one's output to logs/<name>.log, and renders a live status dashboard that
// refreshes in place. Ctrl+C stops all three.
//
// Usage:
//   node scripts/start-all.mjs            # production: next start (needs build:web first)
//   node scripts/start-all.mjs --dev      # development: next dev (no build needed)

import 'dotenv/config';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import Database from 'better-sqlite3';

const DEV = process.argv.includes('--dev');
const IS_WIN = process.platform === 'win32';
const REPO_ROOT = path.resolve(process.cwd());
const LOG_DIR = path.join(REPO_ROOT, 'logs');
const DB_PATH = path.join(REPO_ROOT, 'data', 'gaban.sqlite');
const WEB_URL = process.env.LOCAL_WEB_URL || 'http://localhost:3010';
const PUBLIC_URL = process.env.PUBLIC_APP_URL || null;
const TICK_MS = 700;
const HEARTBEAT_STALE_MS = 3 * 60_000;

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const UP = (n) => `\x1b[${n}A`;
const CLEAR_LINE = '\x1b[2K';

mkdirSync(LOG_DIR, { recursive: true });

function resolveCloudflared() {
  const candidates = IS_WIN
    ? ['C:\\Program Files\\cloudflared\\cloudflared.exe', 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe']
    : ['/usr/local/bin/cloudflared', '/usr/bin/cloudflared'];
  for (const c of candidates) if (existsSync(c)) return c;
  return 'cloudflared'; // fall back to PATH
}

const CF_CONFIG = path.join(os.homedir(), '.cloudflared', 'config.yml');
const NEXT_BIN = path.join(REPO_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');

// Service definitions. `command` is the program; `args` its arguments.
const services = [
  {
    id: 'web',
    name: 'Web app          ',
    command: process.execPath,
    args: [NEXT_BIN, DEV ? 'dev' : 'start', 'src/web', '-p', '3010'],
    log: path.join(LOG_DIR, 'bot-web.log'),
    check: () => checkHttp(WEB_URL),
  },
  {
    id: 'worker',
    name: 'Background worker',
    command: process.execPath,
    args: ['src/worker/background.js'],
    log: path.join(LOG_DIR, 'bot-worker.log'),
    check: () => checkWorker(),
  },
  {
    id: 'tunnel',
    name: 'Cloudflare tunnel',
    command: resolveCloudflared(),
    args: ['tunnel', '--config', CF_CONFIG, 'run'],
    log: path.join(LOG_DIR, 'cloudflared.log'),
    check: () => (PUBLIC_URL ? checkHttp(PUBLIC_URL) : checkChildAlive('tunnel')),
  },
];

for (const s of services) {
  s.status = 'pending';
  s.detail = 'starting…';
  s.child = null;
  s.exitCode = null;
}

// ── Process lifecycle ────────────────────────────────────────────────────────
function startService(s) {
  const out = createWriteStream(s.log, { flags: 'a' });
  out.write(`\n[${new Date().toISOString()}] start-all: launching ${s.id}\n`);
  const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', NEXT_TELEMETRY_DISABLED: '1' };
  let child;
  try {
    child = spawn(s.command, s.args, { cwd: REPO_ROOT, env, windowsHide: true });
  } catch (err) {
    s.exitCode = -1;
    out.write(`[${new Date().toISOString()}] start-all: ${s.id} failed to spawn: ${err.message}\n`);
    return;
  }
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  child.on('exit', (code) => {
    s.exitCode = code ?? 0;
  });
  child.on('error', (err) => {
    s.exitCode = -1;
    out.write(`[${new Date().toISOString()}] start-all: ${s.id} failed to spawn: ${err.message}\n`);
  });
  s.child = child;
}

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`${SHOW_CURSOR}\n${DIM}Stopping services (${signal})…${RESET}\n`);
  for (const s of services) {
    const child = s.child;
    if (!child || child.exitCode !== null || s.exitCode !== null) continue;
    try {
      if (IS_WIN) {
        // Kill the whole tree — npm spawns node/next as grandchildren.
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      /* best effort */
    }
  }
  setTimeout(() => process.exit(0), 1200);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Status checks ────────────────────────────────────────────────────────────
let db = null;
function getDb() {
  if (db) return db;
  if (!existsSync(DB_PATH)) return null;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch {
    db = null;
  }
  return db;
}

function relative(iso) {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  return `${Math.round(sec / 3600)}h ago`;
}

function checkChildAlive(id) {
  const s = services.find((x) => x.id === id);
  if (s?.exitCode !== null) return { ok: false, detail: `exited (code ${s.exitCode})` };
  return { ok: true, detail: 'process up' };
}

function checkWorker() {
  const worker = services.find((x) => x.id === 'worker');
  if (worker.exitCode !== null) return { ok: false, detail: `exited (code ${worker.exitCode})` };
  const conn = getDb();
  if (!conn) return { ok: false, detail: 'waiting for db…' };
  const row = conn.prepare(`
    SELECT MAX(updated_at) AS last FROM system_settings
    WHERE key IN (
      'outreach.last_send_worker_tick',
      'outreach.last_response_monitor',
      'outreach.last_healthcheck',
      'outreach.background_worker_started_at'
    )
  `).get();
  const last = row?.last;
  if (!last) return { ok: false, detail: 'no heartbeat yet' };
  if (Date.now() - new Date(last).getTime() > HEARTBEAT_STALE_MS) {
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
    return { ok: false, detail: err.name === 'AbortError' ? 'starting…' : 'unreachable' };
  } finally {
    clearTimeout(t);
  }
}

// ── Dashboard rendering ──────────────────────────────────────────────────────
const LIVE_LINES = services.length + 6;
let frame = 0;
let printed = false;

function paint() {
  const lines = [];
  lines.push('');
  lines.push(`  ${BOLD}Gaban${RESET}  ${DIM}—${RESET}  ${WEB_URL}${PUBLIC_URL ? `  ${DIM}·${RESET}  ${PUBLIC_URL}` : ''}`);
  lines.push('');
  for (const s of services) {
    const icon =
      s.status === 'alive' ? `${GREEN}✓${RESET}` :
      s.status === 'failed' ? `${RED}✗${RESET}` :
      `${YELLOW}${FRAMES[frame % FRAMES.length]}${RESET}`;
    lines.push(`  ${icon} ${s.name}  ${DIM}${s.detail}${RESET}`);
  }
  lines.push('');
  lines.push(`  ${DIM}Logs: logs/bot-web.log · bot-worker.log · cloudflared.log${RESET}`);
  lines.push(`  ${DIM}Ctrl+C stops all services${RESET}`);

  let buf = printed ? UP(LIVE_LINES) : '';
  for (const line of lines) buf += `${CLEAR_LINE}${line}\n`;
  process.stdout.write(buf);
  printed = true;
}

async function tick() {
  await Promise.all(services.map(async (s) => {
    if (s.exitCode !== null) {
      s.status = 'failed';
      s.detail = s.exitCode === -1 ? `${s.command} not found` : `exited (code ${s.exitCode})`;
      return;
    }
    const result = await s.check();
    s.status = result.ok ? 'alive' : 'pending';
    s.detail = result.detail;
  }));
}

async function main() {
  process.stdout.write(HIDE_CURSOR);
  for (const s of services) startService(s);

  while (!shuttingDown) {
    await tick();
    paint();
    await new Promise((r) => setTimeout(r, TICK_MS));
    frame += 1;
  }
}

main().catch((err) => {
  process.stdout.write(SHOW_CURSOR);
  console.error(err);
  process.exit(1);
});
