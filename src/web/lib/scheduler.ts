import './loadEnv.js';
import cron, { type ScheduledTask } from 'node-cron';
import { getDb } from './db.js';
import { startRun, getActiveRunId } from './pipelineRunner';
import { SendQueueWorker } from '../../services/sendQueueWorker.js';
import { EmailResponseMonitor } from '../../services/emailResponseMonitor.js';
import { HealthCheckService } from '../../services/healthCheckService.js';
import { createGmailClientFromEnv, GmailService } from '../../services/gmailService.js';

const jobs = new Map<number, ScheduledTask>();
let outreachWorkerJob: ScheduledTask | null = null;
let outreachWorkerRunning = false;
let responseMonitorJob: ScheduledTask | null = null;
let responseMonitorRunning = false;
let healthCheckJob: ScheduledTask | null = null;
let healthCheckRunning = false;

export function registerSchedule(scheduleId: number, cronExpr: string, presetId: number) {
  unregisterSchedule(scheduleId);

  const task = cron.schedule(cronExpr, () => {
    if (getActiveRunId() !== null) {
      console.warn(`Skipping scheduled run for preset ${presetId}: another run is active`);
      return;
    }

    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('UPDATE schedules SET last_run_at = ? WHERE id = ?').run(now, scheduleId);

    startRun(presetId);
  });

  jobs.set(scheduleId, task);
}

export function unregisterSchedule(scheduleId: number) {
  const existing = jobs.get(scheduleId);
  if (existing) {
    existing.stop();
    jobs.delete(scheduleId);
  }
}

export function loadSchedulesOnStartup() {
  const db = getDb();
  const schedules = db.prepare('SELECT * FROM schedules WHERE enabled = 1').all() as any[];

  for (const schedule of schedules) {
    if (cron.validate(schedule.cron)) {
      registerSchedule(schedule.id, schedule.cron, schedule.preset_id);
    }
  }

  console.log(`Loaded ${schedules.length} scheduled jobs`);
}

function hasGmailEnv() {
  return Boolean(
    process.env.GMAIL_OAUTH_CLIENT_ID &&
    process.env.GMAIL_OAUTH_CLIENT_SECRET &&
    process.env.GMAIL_OAUTH_REFRESH_TOKEN &&
    process.env.GMAIL_SENDER_EMAIL
  );
}

export function loadOutreachWorkerOnStartup() {
  if (outreachWorkerJob) return;
  if (!hasGmailEnv()) {
    console.warn('Outreach send worker not started: Gmail environment is incomplete');
    return;
  }

  const db = getDb();
  const client = createGmailClientFromEnv();
  const mailer = new GmailService({
    client,
    sender: {
      email: process.env.GMAIL_SENDER_EMAIL!,
      name: process.env.GMAIL_SENDER_NAME,
    },
    logger: console,
  });
  const worker = new SendQueueWorker({
    db,
    mailer,
    capService: undefined,
    suppressionService: undefined,
    logger: console,
  });
  const ResponseMonitor = EmailResponseMonitor as any;
  const monitor = new ResponseMonitor({
    db,
    gmail: mailer,
    senderEmail: process.env.GMAIL_SENDER_EMAIL!,
    logger: console,
  });
  const HealthCheck = HealthCheckService as any;
  const healthCheck = new HealthCheck({ db, logger: console });

  outreachWorkerJob = cron.schedule('* * * * *', async () => {
    if (outreachWorkerRunning) return;
    outreachWorkerRunning = true;
    try {
      await worker.tick({ now: new Date(), limit: 1 });
    } finally {
      outreachWorkerRunning = false;
    }
  }, { timezone: 'America/Vancouver' });

  responseMonitorJob = cron.schedule('*/5 * * * *', async () => {
    if (responseMonitorRunning) return;
    responseMonitorRunning = true;
    try {
      await monitor.poll({ now: new Date(), maxResults: 25 });
    } finally {
      responseMonitorRunning = false;
    }
  }, { timezone: 'America/Vancouver' });

  healthCheckJob = cron.schedule('*/10 * * * *', async () => {
    if (healthCheckRunning) return;
    healthCheckRunning = true;
    try {
      await healthCheck.run({ now: new Date() });
    } finally {
      healthCheckRunning = false;
    }
  }, { timezone: 'America/Vancouver' });

  console.log('Loaded outreach send worker, response monitor, and health check');
}

export function stopAllSchedules() {
  for (const [id, task] of jobs) {
    task.stop();
  }
  jobs.clear();
  outreachWorkerJob?.stop();
  outreachWorkerJob = null;
  outreachWorkerRunning = false;
  responseMonitorJob?.stop();
  responseMonitorJob = null;
  responseMonitorRunning = false;
  healthCheckJob?.stop();
  healthCheckJob = null;
  healthCheckRunning = false;
}
