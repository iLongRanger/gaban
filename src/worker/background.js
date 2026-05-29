import '../web/lib/loadEnv.js';
import cron from 'node-cron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb } from '../web/lib/db.js';
import { BackupService } from '../services/backupService.js';
import { createGmailClientFromEnv, GmailService } from '../services/gmailService.js';
import { HealthCheckService } from '../services/healthCheckService.js';
import { EmailResponseMonitor } from '../services/emailResponseMonitor.js';
import { SendQueueWorker } from '../services/sendQueueWorker.js';
import { CampaignService } from '../services/campaignService.js';
import { StartupRecovery } from '../services/startupRecovery.js';

const TIMEZONE = 'America/Vancouver';
const db = initDb();

const scheduleJobs = new Map();
let activeRun = null;
let sendWorkerRunning = false;
let responseMonitorRunning = false;
let healthCheckRunning = false;
let finalizeRunning = false;
let reconcileRunning = false;

function writeSetting(key, value, at = new Date()) {
  db.prepare(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value), at.toISOString());
}

function hasGmailEnv() {
  return Boolean(
    process.env.GMAIL_OAUTH_CLIENT_ID &&
    process.env.GMAIL_OAUTH_CLIENT_SECRET &&
    process.env.GMAIL_OAUTH_REFRESH_TOKEN &&
    process.env.GMAIL_SENDER_EMAIL
  );
}

function createMailer() {
  const client = createGmailClientFromEnv();
  return new GmailService({
    client,
    sender: {
      email: process.env.GMAIL_SENDER_EMAIL,
      name: process.env.GMAIL_SENDER_NAME,
    },
    logger: console,
  });
}

function hasRunningPipelineRun() {
  const active = db.prepare("SELECT id FROM pipeline_runs WHERE status = 'running'").get();
  return Boolean(active);
}

function startScheduledRun(presetId, scheduleId) {
  if (activeRun || hasRunningPipelineRun()) {
    console.warn(`Skipping scheduled run for preset ${presetId}: another run is active`);
    return;
  }

  const preset = db.prepare('SELECT * FROM presets WHERE id = ?').get(presetId);
  if (!preset) {
    console.warn(`Skipping scheduled run ${scheduleId}: preset ${presetId} was not found`);
    return;
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE schedules SET last_run_at = ? WHERE id = ?').run(now, scheduleId);

  const categories = JSON.parse(preset.categories);
  const config = {
    search: { location: preset.location, radius_km: preset.radius_km },
    office_location: { lat: preset.office_lat, lng: preset.office_lng },
    categories,
    scoring: { top_n: Math.max(Number.parseInt(preset.top_n, 10) || 10, 10) },
  };

  const tmpPath = path.join(os.tmpdir(), `gaban-worker-preset-${presetId}-${Date.now()}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(config));

  const result = db.prepare(
    "INSERT INTO pipeline_runs (preset_id, status, log, started_at) VALUES (?, 'running', '', ?)"
  ).run(presetId, now);
  const runId = Number(result.lastInsertRowid);
  const runJsPath = path.resolve(process.cwd(), 'src', 'cli', 'run.js');
  const child = spawn(process.execPath, [runJsPath, '--config', tmpPath], {
    cwd: process.cwd(),
    env: { ...process.env, GABAN_PIPELINE_RUN_ID: String(runId) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeRun = { id: runId, child };

  const appendLog = (data) => {
    db.prepare("UPDATE pipeline_runs SET log = log || ? WHERE id = ?").run(data.toString(), runId);
  };
  child.stdout?.on('data', appendLog);
  child.stderr?.on('data', appendLog);
  child.on('close', (code) => {
    const current = db.prepare('SELECT status FROM pipeline_runs WHERE id = ?').get(runId);
    if (current?.status !== 'cancelled') {
      db.prepare('UPDATE pipeline_runs SET status = ?, completed_at = ? WHERE id = ?')
        .run(code === 0 ? 'completed' : 'failed', new Date().toISOString(), runId);
    }
    activeRun = null;
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
  });
}

function scheduleKey(schedule) {
  return `${schedule.id}:${schedule.cron}:${schedule.preset_id}:${schedule.enabled}`;
}

function registerSchedule(schedule) {
  const key = scheduleKey(schedule);
  const existing = scheduleJobs.get(schedule.id);
  if (existing?.key === key) return;
  existing?.task.stop();

  const task = cron.schedule(
    schedule.cron,
    () => startScheduledRun(schedule.preset_id, schedule.id),
    { timezone: TIMEZONE }
  );
  scheduleJobs.set(schedule.id, { key, task });
  console.log(`Registered schedule ${schedule.id}: ${schedule.cron}`);
}

function reconcileSchedules() {
  if (reconcileRunning) return;
  reconcileRunning = true;
  try {
    const schedules = db.prepare('SELECT * FROM schedules WHERE enabled = 1').all();
    const activeIds = new Set();
    for (const schedule of schedules) {
      activeIds.add(schedule.id);
      if (cron.validate(schedule.cron)) {
        registerSchedule(schedule);
      } else {
        console.warn(`Ignoring invalid schedule ${schedule.id}: ${schedule.cron}`);
      }
    }

    for (const [id, job] of scheduleJobs) {
      if (!activeIds.has(id)) {
        job.task.stop();
        scheduleJobs.delete(id);
        console.log(`Unregistered schedule ${id}`);
      }
    }
    writeSetting('outreach.worker_schedule_count', String(scheduleJobs.size));
  } finally {
    reconcileRunning = false;
  }
}

async function main() {
  console.log('Starting Gaban background worker');
  new StartupRecovery({ db, logger: console }).run();
  await new BackupService({ db, logger: console }).createDailyBackup();

  const healthCheck = new HealthCheckService({ db, logger: console });
  await healthCheck.run({ now: new Date() });

  let mailer = null;
  let sendWorker = null;
  let responseMonitor = null;
  if (hasGmailEnv()) {
    mailer = createMailer();
    sendWorker = new SendQueueWorker({ db, mailer, logger: console });
    responseMonitor = new EmailResponseMonitor({
      db,
      gmail: mailer,
      senderEmail: process.env.GMAIL_SENDER_EMAIL,
      logger: console,
    });
  } else {
    console.warn('Gmail environment is incomplete; send worker and response monitor are disabled');
  }

  reconcileSchedules();
  cron.schedule('* * * * *', reconcileSchedules, { timezone: TIMEZONE });

  if (sendWorker) {
    cron.schedule('* * * * *', async () => {
      if (sendWorkerRunning) return;
      sendWorkerRunning = true;
      try {
        await sendWorker.tick({ now: new Date(), limit: 1 });
      } finally {
        sendWorkerRunning = false;
      }
    }, { timezone: TIMEZONE });
  }

  if (responseMonitor) {
    cron.schedule('*/5 * * * *', async () => {
      if (responseMonitorRunning) return;
      responseMonitorRunning = true;
      try {
        await responseMonitor.poll({ now: new Date(), maxResults: 25 });
        writeSetting('outreach.last_response_monitor', JSON.stringify({
          ok: true,
          checked_at: new Date().toISOString(),
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        writeSetting('outreach.last_response_monitor', JSON.stringify({
          ok: false,
          checked_at: new Date().toISOString(),
          message,
          code: err?.code || null,
          status: err?.status || null,
        }));
        console.error(message);
      } finally {
        responseMonitorRunning = false;
      }
    }, { timezone: TIMEZONE });
  }

  cron.schedule('*/10 * * * *', async () => {
    if (healthCheckRunning) return;
    healthCheckRunning = true;
    try {
      await healthCheck.run({ now: new Date() });
    } finally {
      healthCheckRunning = false;
    }
  }, { timezone: TIMEZONE });

  cron.schedule('*/15 * * * *', () => {
    if (finalizeRunning) return;
    finalizeRunning = true;
    try {
      const finished = new CampaignService({ db }).finalizeAllActive(new Date());
      if (finished.length) console.log(`Finalized campaigns: ${finished.join(', ')}`);
    } catch (err) {
      console.error(`Campaign finalize sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      finalizeRunning = false;
    }
  }, { timezone: TIMEZONE });

  writeSetting('outreach.background_worker_started_at', new Date().toISOString());
  console.log('Loaded background worker jobs');
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
