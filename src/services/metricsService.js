import { classifyVertical } from './verticalClassifier.js';

export class MetricsService {
  constructor({ db }) {
    if (!db) throw new Error('db required');
    this.db = db;
  }

  outreachFunnel({ since } = {}) {
    const sinceIso = since || '1970-01-01T00:00:00Z';

    const rows = this.db.prepare(`
      SELECT
        es.template_style,
        COUNT(DISTINCT es.id) AS sent,
        SUM(CASE WHEN ev.type = 'replied'        THEN 1 ELSE 0 END) AS replied,
        SUM(CASE WHEN ev.type = 'bounced'        THEN 1 ELSE 0 END) AS bounced,
        SUM(CASE WHEN ev.type = 'auto_replied'   THEN 1 ELSE 0 END) AS auto_replied,
        SUM(CASE WHEN ev.type = 'unsubscribed'   THEN 1 ELSE 0 END) AS unsubscribed
      FROM email_sends es
      LEFT JOIN email_events ev ON ev.send_id = es.id
      WHERE es.status = 'sent' AND es.sent_at >= ?
      GROUP BY es.template_style
    `).all(sinceIso);

    const by_template = rows.map((r) => ({
      template_style: r.template_style,
      sent: r.sent,
      replied: r.replied || 0,
      bounced: r.bounced || 0,
      auto_replied: r.auto_replied || 0,
      unsubscribed: r.unsubscribed || 0,
      reply_rate:  r.sent ? (r.replied  || 0) / r.sent : 0,
      bounce_rate: r.sent ? (r.bounced  || 0) / r.sent : 0,
    }));

    const totals = by_template.reduce(
      (acc, r) => ({
        sent:         acc.sent + r.sent,
        replied:      acc.replied + r.replied,
        bounced:      acc.bounced + r.bounced,
        auto_replied: acc.auto_replied + r.auto_replied,
        unsubscribed: acc.unsubscribed + r.unsubscribed,
      }),
      { sent: 0, replied: 0, bounced: 0, auto_replied: 0, unsubscribed: 0 }
    );
    totals.reply_rate  = totals.sent ? totals.replied / totals.sent : 0;
    totals.bounce_rate = totals.sent ? totals.bounced / totals.sent : 0;

    return { by_template, totals, since: sinceIso };
  }

  abComparison({ since } = {}) {
    const sinceIso = since || '1970-01-01T00:00:00Z';
    const arm = (style) => {
      const row = this.db.prepare(`
        SELECT COUNT(DISTINCT es.id) AS sent,
               COUNT(DISTINCT CASE WHEN ev.type = 'replied' THEN es.id END) AS replied
        FROM email_sends es
        LEFT JOIN email_events ev ON ev.send_id = es.id
        WHERE es.status = 'sent' AND es.sent_at >= ? AND es.template_style = ?
      `).get(sinceIso, style);
      const sent = row.sent || 0;
      const replied = row.replied || 0;
      return { sent, replied, reply_rate: sent ? replied / sent : 0 };
    };

    const poke = arm('touch_1_poke');
    const route = arm('touch_1_route');
    let winner = null;
    if (poke.sent && route.sent) {
      if (poke.reply_rate > route.reply_rate) winner = 'poke';
      else if (route.reply_rate > poke.reply_rate) winner = 'route';
      else winner = 'tie';
    }
    return { poke, route, winner, since: sinceIso };
  }

  campaignSummary(campaignId, { now = new Date() } = {}) {
    const campaign = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) return null;

    const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
    const leads = this.db.prepare(
      'SELECT COUNT(*) AS c FROM campaign_leads WHERE campaign_id = ?'
    ).get(campaignId).c;

    const rows = this.db.prepare(`
      SELECT es.id AS send_id, es.touch_number, l.type AS lead_type,
        SUM(CASE WHEN ev.type = 'replied'      THEN 1 ELSE 0 END) AS replied,
        SUM(CASE WHEN ev.type = 'bounced'      THEN 1 ELSE 0 END) AS bounced,
        SUM(CASE WHEN ev.type = 'unsubscribed' THEN 1 ELSE 0 END) AS unsubscribed
      FROM email_sends es
      JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
      JOIN leads l ON l.id = cl.lead_id
      LEFT JOIN email_events ev ON ev.send_id = es.id
      WHERE cl.campaign_id = ? AND es.status = 'sent'
      GROUP BY es.id
    `).all(campaignId);

    const totals = { sent: 0, replied: 0, bounced: 0, unsubscribed: 0 };
    const touchMap = new Map();
    const vertMap = new Map();

    for (const r of rows) {
      const replied = r.replied || 0;
      const bounced = r.bounced || 0;
      const unsubscribed = r.unsubscribed || 0;
      totals.sent += 1;
      totals.replied += replied;
      totals.bounced += bounced;
      totals.unsubscribed += unsubscribed;

      const t = touchMap.get(r.touch_number) || { touch: r.touch_number, sent: 0, replied: 0, bounced: 0 };
      t.sent += 1; t.replied += replied; t.bounced += bounced;
      touchMap.set(r.touch_number, t);

      const vertical = classifyVertical({ type: r.lead_type });
      const v = vertMap.get(vertical) || { vertical, sent: 0, replied: 0 };
      v.sent += 1; v.replied += replied;
      vertMap.set(vertical, v);
    }

    const totalsOut = {
      ...totals,
      reply_rate: totals.sent ? totals.replied / totals.sent : 0,
      bounce_rate: totals.sent ? totals.bounced / totals.sent : 0,
    };
    const by_touch = [...touchMap.values()].sort((a, b) => a.touch - b.touch);
    const by_vertical = [...vertMap.values()]
      .map((v) => ({ ...v, reply_rate: v.sent ? v.replied / v.sent : 0 }))
      .sort((a, b) => b.sent - a.sent);

    const outcomes = { interested: 0, not_interested: 0, meeting_booked: 0, contract_signed: 0 };
    for (const r of this.db.prepare(
      'SELECT status, COUNT(*) AS c FROM campaign_leads WHERE campaign_id = ? GROUP BY status'
    ).all(campaignId)) {
      if (r.status in outcomes) outcomes[r.status] = r.c;
    }

    const startedRow = this.db.prepare(`
      SELECT MIN(es.sent_at) AS started
      FROM email_sends es JOIN campaign_leads cl ON cl.id = es.campaign_lead_id
      WHERE cl.campaign_id = ? AND es.status = 'sent'
    `).get(campaignId);
    const started_at = startedRow.started || campaign.created_at;
    const end = campaign.finished_at || nowIso;
    const duration_days = Math.max(
      0,
      Math.floor((new Date(end).getTime() - new Date(started_at).getTime()) / 86400000)
    );

    return {
      finished_at: campaign.finished_at || null,
      started_at,
      duration_days,
      leads,
      totals: totalsOut,
      by_touch,
      outcomes,
      by_vertical,
    };
  }
}

export default MetricsService;
