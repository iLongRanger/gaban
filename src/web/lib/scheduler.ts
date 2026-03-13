import cron from 'node-cron';
import { getDb } from './db.js';
import { startRun, getActiveRunId } from './pipelineRunner';

const jobs = new Map<number, cron.ScheduledTask>();

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

export function stopAllSchedules() {
  for (const [id, task] of jobs) {
    task.stop();
  }
  jobs.clear();
}
