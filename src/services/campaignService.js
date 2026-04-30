import { nextSendTime, scheduleSequence } from './sequenceScheduler.js';

const DEFAULT_TOUCH_STYLES = ['curious_neighbor', 'value_lead', 'compliment_question'];
const TOUCH_OFFSETS = { 1: 0, 2: 4, 3: 10 };

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

        const sequence = scheduleSequence({
          startAt: start,
          existingScheduledTimes: existingTimes,
          options,
        });

        for (const scheduled of sequence) {
          const style = touchStyles[scheduled.touchNumber - 1] || touchStyles[0];
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

  cancelFutureSends(campaignLeadId, { reason = 'cancelled' } = {}) {
    return this.db.prepare(
      `UPDATE email_sends
       SET status = 'cancelled', error_message = ?
       WHERE campaign_lead_id = ? AND status = 'scheduled'`
    ).run(reason, campaignLeadId).changes;
  }
}
