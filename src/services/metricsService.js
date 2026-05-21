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
        COUNT(*) AS sent,
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
}

export default MetricsService;
