import cron, { type ScheduledTask } from 'node-cron';
import { getDb } from './db.js';
import { startRun, getActiveRunId } from './pipelineRunner';
import { SendQueueWorker } from '../../services/sendQueueWorker.js';
import { createGmailClientFromEnv, GmailService } from '../../services/gmailService.js';

const jobs = new Map<number, ScheduledTask>();
let outreachWorkerJob: ScheduledTask | null = null;
let outreachWorkerRunning = false;

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

  outreachWorkerJob = cron.schedule('* * * * *', async () => {
    if (outreachWorkerRunning) return;
    outreachWorkerRunning = true;
    try {
      await worker.tick({ now: new Date(), limit: 1 });
    } finally {
      outreachWorkerRunning = false;
    }
  }, { timezone: 'America/Vancouver' });

  console.log('Loaded outreach send worker');
}

export function stopAllSchedules() {
  for (const [id, task] of jobs) {
    task.stop();
  }
  jobs.clear();
  outreachWorkerJob?.stop();
  outreachWorkerJob = null;
  outreachWorkerRunning = false;
}
