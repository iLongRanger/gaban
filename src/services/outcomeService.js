import { CampaignService } from './campaignService.js';

const DISPOSITIONS = new Set(['interested', 'not_interested', 'out_of_scope', 'follow_up_later']);

export class OutcomeService {
  constructor({ db } = {}) {
    if (!db) throw new Error('db required');
    this.db = db;
    this.campaigns = new CampaignService({ db });
  }

  logMeeting({ campaignLeadId, scheduledFor, kind = 'call', notes = '', at = new Date() } = {}) {
    if (!campaignLeadId) throw new Error('campaignLeadId required');
    if (!scheduledFor) throw new Error('scheduledFor required');
    const now = at.toISOString();

    const insert = this.db.transaction(() => {
      const result = this.db.prepare(
        `INSERT INTO meetings (campaign_lead_id, scheduled_for, kind, notes, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(campaignLeadId, scheduledFor, kind || 'call', notes || null, now);
      this.db.prepare(
        `UPDATE campaign_leads
         SET status = 'meeting_booked', outcome = 'meeting_booked', completed_at = ?
         WHERE id = ?`
      ).run(now, campaignLeadId);
      this.campaigns.cancelFutureSends(campaignLeadId, { reason: 'meeting_booked' });
      return this.db.prepare('SELECT * FROM meetings WHERE id = ?').get(result.lastInsertRowid);
    });

    return insert();
  }

  logContract({ campaignLeadId, signedDate, valueMonthly = null, notes = '', at = new Date() } = {}) {
    if (!campaignLeadId) throw new Error('campaignLeadId required');
    const now = at.toISOString();
    const signed = signedDate || now.slice(0, 10);

    const insert = this.db.transaction(() => {
      const result = this.db.prepare(
        `INSERT INTO contracts (campaign_lead_id, signed_date, value_monthly, notes, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(campaignLeadId, signed, valueMonthly === '' ? null : valueMonthly, notes || null, now);
      this.db.prepare(
        `UPDATE campaign_leads
         SET status = 'contract_signed', outcome = 'contract_signed', completed_at = ?
         WHERE id = ?`
      ).run(now, campaignLeadId);
      this.campaigns.cancelFutureSends(campaignLeadId, { reason: 'contract_signed' });
      return this.db.prepare('SELECT * FROM contracts WHERE id = ?').get(result.lastInsertRowid);
    });

    return insert();
  }

  logDisposition({ campaignLeadId, outcome, notes = '', at = new Date() } = {}) {
    if (!campaignLeadId) throw new Error('campaignLeadId required');
    if (!DISPOSITIONS.has(outcome)) throw new Error('invalid outcome');
    const now = at.toISOString();
    const completedAt = ['not_interested', 'out_of_scope'].includes(outcome) ? now : null;

    const update = this.db.transaction(() => {
      this.db.prepare(
        `UPDATE campaign_leads
         SET status = ?, outcome = ?, completed_at = COALESCE(?, completed_at)
         WHERE id = ?`
      ).run(outcome, outcome, completedAt, campaignLeadId);
      if (notes) {
        const lead = this.db.prepare('SELECT lead_id FROM campaign_leads WHERE id = ?').get(campaignLeadId);
        if (lead) {
          this.db.prepare('INSERT INTO lead_notes (lead_id, content, created_at) VALUES (?, ?, ?)')
            .run(lead.lead_id, notes, now);
        }
      }
      if (outcome !== 'follow_up_later') {
        this.campaigns.cancelFutureSends(campaignLeadId, { reason: outcome });
      }
      return this.db.prepare('SELECT * FROM campaign_leads WHERE id = ?').get(campaignLeadId);
    });

    return update();
  }
}
