import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getDb } from './db.js';

let activeProcess: ChildProcess | null = null;
let activeRunId: number | null = null;

type LogListener = (line: string) => void;
const listeners = new Map<number, Set<LogListener>>();

export function getActiveRunId(): number | null {
  return activeRunId;
}

export function addLogListener(runId: number, listener: LogListener) {
  if (!listeners.has(runId)) listeners.set(runId, new Set());
  listeners.get(runId)!.add(listener);
}

export function removeLogListener(runId: number, listener: LogListener) {
  listeners.get(runId)?.delete(listener);
}

function notifyListeners(runId: number, line: string) {
  listeners.get(runId)?.forEach(fn => fn(line));
}

export function startRun(presetId: number): { runId: number } | { error: string; status: number } {
  const db = getDb();

  const active = db.prepare("SELECT id FROM pipeline_runs WHERE status = 'running'").get() as any;
  if (active) {
    return { error: 'A pipeline run is already in progress', status: 409 };
  }

  const preset = db.prepare('SELECT * FROM presets WHERE id = ?').get(presetId) as any;
  if (!preset) {
    return { error: 'Preset not found', status: 404 };
  }

  const categories = JSON.parse(preset.categories);
  const config = {
    search: { location: preset.location, radius_km: preset.radius_km },
    office_location: { lat: preset.office_lat, lng: preset.office_lng },
    categories,
    scoring: { top_n: preset.top_n },
  };
  const tmpPath = path.join(os.tmpdir(), `gaban-preset-${presetId}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(config));

  const now = new Date().toISOString();
  const result = db.prepare(
    "INSERT INTO pipeline_runs (preset_id, status, log, started_at) VALUES (?, 'running', '', ?)"
  ).run(presetId, now);
  const runId = Number(result.lastInsertRowid);
  activeRunId = runId;

  // Build path dynamically to prevent Turbopack from resolving it as a module
  const runJsPath = path.resolve(process.cwd(), 'src', 'cli', 'run.js');
  const args = [runJsPath, '--config', tmpPath];
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeProcess = child;

  const appendLog = (data: Buffer) => {
    const line = data.toString();
    db.prepare("UPDATE pipeline_runs SET log = log || ? WHERE id = ?").run(line, runId);
    notifyListeners(runId, line);
  };

  child.stdout?.on('data', appendLog);
  child.stderr?.on('data', appendLog);

  child.on('close', (code) => {
    const currentRun = db.prepare("SELECT status FROM pipeline_runs WHERE id = ?").get(runId) as any;
    if (currentRun?.status !== 'cancelled') {
      const status = code === 0 ? 'completed' : 'failed';
      const completedAt = new Date().toISOString();
      db.prepare(
        "UPDATE pipeline_runs SET status = ?, completed_at = ? WHERE id = ?"
      ).run(status, completedAt, runId);
    }
    activeProcess = null;
    activeRunId = null;
    listeners.delete(runId);
    try { fs.unlinkSync(tmpPath); } catch {}
  });

  return { runId };
}

export function cancelRun(runId: number): { ok: boolean } | { error: string; status: number } {
  if (activeRunId !== runId || !activeProcess) {
    return { error: 'No active run with that ID', status: 404 };
  }

  const db = getDb();
  db.prepare("UPDATE pipeline_runs SET status = 'cancelled', completed_at = ? WHERE id = ?")
    .run(new Date().toISOString(), runId);

  activeProcess.kill('SIGTERM');

  setTimeout(() => {
    if (activeProcess && !activeProcess.killed) {
      activeProcess.kill('SIGKILL');
    }
  }, 5000);

  return { ok: true };
}
