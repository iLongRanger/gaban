import { nextSendTime, scheduleSequence, clampToWindowStart, parseTime } from './sequenceScheduler.js';
import { MetricsService } from './metricsService.js';

// Stored on the campaign for sequence length / finalize count. Slot 0 ('touch_1') is a
// length placeholder only — the per-send touch-1 style is always set by openerArm() to
// touch_1_poke or touch_1_route. Slots 1-3 ARE used as draft-lookup keys for touches 2-4.
const DEFAULT_TOUCH_STYLES = ['touch_1', 'touch_2', 'touch_3', 'touch_4'];

// follow_up_later is included: it's an operator note to revisit manually and does not
// cancel future sends, so once the sequence finishes it must not pin the campaign open.
const TERMINAL_LEAD_STATUSES = new Set([
  'replied', 'bounced', 'auto_replied', 'unsubscribed',
  'interested', 'not_interested', 'out_of_scope', 'follow_up_later',
  'meeting_booked', 'contract_signed',
]);

function readSetting(db, key) {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  return row?.value;
}

const TOUCH_OFFSETS = { 1: 0, 2: 4, 3: 10, 4: 21 };

// Deterministic 50/50 opener-arm assignment by lead id.
// NOTE: arm styles must stay in sync with draftingService.js TOUCH_KEYS.
function openerArm(leadId) {
  return Number(leadId) % 2 === 0 ? 'touch_1_poke' : 'touch_1_route';
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function campaignScheduleOptions(campaign) {
  return {
    timeZone: campaign.timezone || 'America/Vancouver',
    sendWindowStart: campaign.send_window_start || '09:00',
    sendWindowEnd: campaign.send_window_end || '17:00',
    sendDays: String(campaign.send_days || 'mon,tue,wed,thu,fri').split(',').map((day) => day.trim()),
  };
}

export class CampaignService {
  constructor({ db }) {
    if (!db) throw new Error('db required');
    this.db = db;
  }

  createCampaign({
    presetId,
    name,
    leadIds,
    startAt,
    dailyCap = 5,
    touchStyles = DEFAULT_TOUCH_STYLES,
    status = 'active',
  }) {
    if (!presetId) throw new Error('presetId required');
    if (!name) throw new Error('name required');
    if (!Array.isArray(leadIds) || leadIds.length === 0) throw new Error('leadIds required');

    const preset = this.db.prepare('SELECT * FROM presets WHERE id = ?').get(presetId);
    if (!preset) throw new Error('preset not found');

    const now = new Date().toISOString();
    const start = startAt || now;

    const create = this.db.transaction(() => {
      const result = this.db.prepare(
        `INSERT INTO campaigns
          (name, preset_id, status, daily_cap, start_date, touch_styles, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(name, presetId, status, dailyCap, start, JSON.stringify(touchStyles), now, now);
      const campaignId = Number(result.lastInsertRowid);
      const campaign = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
      const options = campaignScheduleOptions(campaign);
      const existingTimes = this.db.prepare(
        `SELECT scheduled_for FROM email_sends ORDER BY scheduled_for`
      ).all().map((row) => row.scheduled_for);

      for (const leadId of leadIds) {
        const lead = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
        if (!lead) throw new Error(`lead not found: ${leadId}`);
        if (!lead.email) throw new Error(`lead ${leadId} does not have an email`);

        const clResult = this.db.prepare(
          `INSERT INTO campaign_leads (campaign_id, lead_id, status, added_at)
           VALUES (?, ?, 'queued', ?)`
        ).run(campaignId, leadId, now);
        const campaignLeadId = Number(clResult.lastInsertRowid);

        const touchOffsets = touchStyles.map((_, i) => TOUCH_OFFSETS[i + 1] ?? 0);
        const sequence = scheduleSequence({
          startAt: start,
          existingScheduledTimes: existingTimes,
          touchOffsets,
          options,
        });

        for (const scheduled of sequence) {
          const style = scheduled.touchNumber === 1
            ? openerArm(leadId)
            : (touchStyles[scheduled.touchNumber - 1] || touchStyles[0]);
          const draft = this.db.prepare(
            `SELECT * FROM outreach_drafts
             WHERE lead_id = ? AND style = ?
             LIMIT 1`
          ).get(leadId, style);
          if (!draft) throw new Error(`missing ${style} draft for lead ${leadId}`);

          this.db.prepare(
            `INSERT INTO email_sends
              (campaign_lead_id, touch_number, template_style, subject, body,
               recipient_email, scheduled_for, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            campaignLeadId,
            scheduled.touchNumber,
            style,
            draft.email_subject,
            draft.edited_email_body || draft.email_body,
            lead.email,
            scheduled.scheduledFor,
            now
          );
          existingTimes.push(scheduled.scheduledFor);
        }
      }

      return this.getCampaign(campaignId);
    });

    return create();
  }

  getCampaign(id) {
    const campaign = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    if (!campaign) return null;
    return {
      ...campaign,
      touch_styles: parseJson(campaign.touch_styles, DEFAULT_TOUCH_STYLES),
    };
  }

  pauseCampaign(id, { at = new Date().toISOString() } = {}) {
    const result = this.db.prepare(
      `UPDATE campaigns SET status = 'paused', updated_at = ? WHERE id = ?`
    ).run(at, id);
    return result.changes > 0;
  }

  resumeCampaign(id, { at = new Date().toISOString() } = {}) {
    const resume = this.db.transaction(() => {
      const campaign = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
      if (!campaign) return false;

      this.db.prepare(
        `UPDATE campaigns SET status = 'active', updated_at = ? WHERE id = ?`
      ).run(at, id);

      this.reschedulePendingSends(id, { at });
      return true;
    });
    return resume();
  }

  reschedulePendingSends(campaignId, { at = new Date().toISOString(), minGapMinutes = 2 } = {}) {
    const campaign = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) throw new Error('campaign not found');
    const options = campaignScheduleOptions(campaign);
    const otherScheduledTimes = this.db.prepare(
      `SELECT es.scheduled_for
       FROM email_sends es
       JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
       WHERE es.status = 'scheduled' AND cl.campaign_id != ?
       ORDER BY es.scheduled_for`
    ).all(campaignId).map((row) => row.scheduled_for);

    const campaignLeads = this.db.prepare(
      `SELECT id FROM campaign_leads WHERE campaign_id = ? ORDER BY id`
    ).all(campaignId);

    let changed = 0;
    const existingTimes = [...otherScheduledTimes];

    for (const campaignLead of campaignLeads) {
      const pending = this.db.prepare(
        `SELECT id, touch_number
         FROM email_sends
         WHERE campaign_lead_id = ? AND status = 'scheduled'
         ORDER BY touch_number ASC`
      ).all(campaignLead.id);
      if (pending.length === 0) continue;

      const firstOffset = TOUCH_OFFSETS[pending[0].touch_number] ?? 0;
      const touchOffsets = pending.map((send) => (TOUCH_OFFSETS[send.touch_number] ?? firstOffset) - firstOffset);
      const resumedStart = nextSendTime(at, options);
      const sequence = scheduleSequence({
        startAt: resumedStart,
        existingScheduledTimes: existingTimes,
        touchOffsets,
        minGapMinutes,
        options,
      });

      for (let i = 0; i < pending.length; i += 1) {
        const scheduledFor = sequence[i].scheduledFor;
        this.db.prepare(
          `UPDATE email_sends SET scheduled_for = ?, error_message = NULL WHERE id = ?`
        ).run(scheduledFor, pending[i].id);
        existingTimes.push(scheduledFor);
        changed += 1;
      }
    }

    return changed;
  }

  updateSendWindow(id, { sendWindowStart, sendWindowEnd } = {}, { minGapMinutes = 2 } = {}) {
    const start = parseTime(sendWindowStart, 'send_window_start');
    const end = parseTime(sendWindowEnd, 'send_window_end');
    if (start.hours * 60 + start.minutes >= end.hours * 60 + end.minutes) {
      throw new Error('send_window_start must be before send_window_end');
    }

    const update = this.db.transaction(() => {
      const campaign = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
      if (!campaign || campaign.status === 'finished') return null;

      const now = new Date().toISOString();
      this.db.prepare(
        `UPDATE campaigns SET send_window_start = ?, send_window_end = ?, updated_at = ? WHERE id = ?`
      ).run(sendWindowStart, sendWindowEnd, now, id);

      const updated = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
      const options = campaignScheduleOptions(updated);

      const otherScheduledTimes = this.db.prepare(
        `SELECT es.scheduled_for
         FROM email_sends es
         JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
         WHERE es.status = 'scheduled' AND cl.campaign_id != ?
         ORDER BY es.scheduled_for`
      ).all(id).map((row) => row.scheduled_for);

      const pending = this.db.prepare(
        `SELECT es.id, es.scheduled_for
         FROM email_sends es
         JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
         WHERE cl.campaign_id = ? AND es.status = 'scheduled'
         ORDER BY es.scheduled_for ASC, es.id ASC`
      ).all(id);

      const minGapMs = minGapMinutes * 60 * 1000;
      const existingTimes = otherScheduledTimes.map((value) => new Date(value).getTime());

      for (const send of pending) {
        let candidate = clampToWindowStart(send.scheduled_for, options);
        while (existingTimes.some((time) => Math.abs(time - candidate.getTime()) < minGapMs)) {
          candidate = nextSendTime(new Date(candidate.getTime() + minGapMs), options);
        }
        this.db.prepare(`UPDATE email_sends SET scheduled_for = ? WHERE id = ?`)
          .run(candidate.toISOString(), send.id);
        existingTimes.push(candidate.getTime());
      }

      return this.getCampaign(id);
    });

    return update();
  }

  cancelFutureSends(campaignLeadId, { reason = 'cancelled' } = {}) {
    return this.db.prepare(
      `UPDATE email_sends
       SET status = 'cancelled', error_message = ?
       WHERE campaign_lead_id = ? AND status = 'scheduled'`
    ).run(reason, campaignLeadId).changes;
  }

  finalizeIfDone(campaignId, now = new Date()) {
    const campaign = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) return { finished: false, reason: 'not_found' };
    if (campaign.status !== 'active') return { finished: false, reason: 'not_active' };

    const nowDate = now instanceof Date ? now : new Date(now);
    const maxTouches = parseJson(campaign.touch_styles, DEFAULT_TOUCH_STYLES).length;
    const graceSetting = readSetting(this.db, 'outreach.finish_grace_hours');
    const parsedGrace = Number(graceSetting);
    // Default to 48h unless the setting is a valid non-negative number. An empty
    // string or garbage value falls back rather than silently zeroing the window.
    const graceHours =
      graceSetting != null && graceSetting !== '' && Number.isFinite(parsedGrace) && parsedGrace >= 0
        ? parsedGrace
        : 48;
    const graceCutoff = new Date(nowDate.getTime() - graceHours * 3600 * 1000).toISOString();

    const pending = this.db.prepare(`
      SELECT COUNT(*) AS c FROM email_sends es
      JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
      WHERE cl.campaign_id = ? AND es.status IN ('scheduled', 'sending')
    `).get(campaignId).c;
    if (pending > 0) return { finished: false, reason: 'sends_pending' };

    const leads = this.db.prepare(
      'SELECT status, touch_count, last_touch_at FROM campaign_leads WHERE campaign_id = ?'
    ).all(campaignId);
    if (leads.length === 0) return { finished: false, reason: 'no_leads' };

    for (const lead of leads) {
      if (lead.status === 'queued') return { finished: false, reason: 'lead_queued' };
      if (TERMINAL_LEAD_STATUSES.has(lead.status)) continue;
      const exhausted =
        lead.status === 'active' &&
        lead.touch_count >= maxTouches &&
        lead.last_touch_at &&
        lead.last_touch_at <= graceCutoff;
      if (!exhausted) return { finished: false, reason: 'lead_in_progress' };
    }

    const summary = new MetricsService({ db: this.db }).campaignSummary(campaignId, { now: nowDate });
    const finishedAt = nowDate.toISOString();
    this.db.prepare(
      `UPDATE campaigns SET status = 'finished', finished_at = ?, summary = ?, updated_at = ? WHERE id = ?`
    ).run(finishedAt, JSON.stringify(summary), finishedAt, campaignId);
    return { finished: true };
  }

  finalizeAllActive(now = new Date()) {
    const active = this.db.prepare("SELECT id FROM campaigns WHERE status = 'active'").all();
    const finished = [];
    for (const c of active) {
      try {
        if (this.finalizeIfDone(c.id, now).finished) finished.push(c.id);
      } catch {
        // One campaign failing to finalize must not abort the whole sweep.
      }
    }
    return finished;
  }
}
