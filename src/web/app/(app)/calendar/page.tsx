import Link from 'next/link';
import { getDb } from '@/lib/db.js';
import { buildCalendarModel } from '../../../../services/scheduleRunway.js';

export const dynamic = 'force-dynamic';

const TIME_ZONE = 'America/Vancouver';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function leadTimeDays(db: ReturnType<typeof getDb>): number {
  const row = db
    .prepare('SELECT value FROM system_settings WHERE key = ?')
    .get('scrape_lead_time_days') as { value?: string } | undefined;
  const parsed = Number(row?.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}

// 'YYYY-MM-DD' for an instant in the given time zone.
function dayKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function monthKey(date: Date) {
  return dayKey(date).slice(0, 7); // YYYY-MM
}

function shiftMonth(monthStr: string, delta: number) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-CA', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
}

function prettyDay(key: string | null) {
  if (!key) return '-';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-CA', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}

// Weeks (Mon-Sun) of day keys covering the given month, padded into leading/trailing weeks.
function monthWeeks(monthStr: string): { key: string; inMonth: boolean }[][] {
  const [y, m] = monthStr.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const firstWeekday = (first.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - firstWeekday);

  const weeks: { key: string; inMonth: boolean }[][] = [];
  const cursor = new Date(gridStart);
  for (let w = 0; w < 6; w += 1) {
    const week: { key: string; inMonth: boolean }[] = [];
    for (let d = 0; d < 7; d += 1) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(
        cursor.getUTCDate()
      ).padStart(2, '0')}`;
      week.push({ key, inMonth: cursor.getUTCMonth() === m - 1 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
    // Stop after we've passed the month and completed a week.
    if (cursor.getUTCMonth() !== m - 1 && cursor > first) {
      const lastOfMonth = new Date(Date.UTC(y, m, 0));
      if (cursor > lastOfMonth) break;
    }
  }
  return weeks;
}

function cellTint(count: number, max: number) {
  if (count === 0) return 'transparent';
  const ratio = max > 0 ? count / max : 0;
  const pct = Math.round(12 + ratio * 30); // 12%..42%
  return `color-mix(in oklab, var(--accent) ${pct}%, transparent)`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const db = getDb();
  const now = new Date();
  const todayKey = dayKey(now);
  const lead = leadTimeDays(db);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const sends = db
    .prepare(
      `SELECT id, scheduled_for
         FROM email_sends
        WHERE status = 'scheduled'
          AND scheduled_for >= ?`
    )
    .all(todayStart.toISOString()) as { id: number; scheduled_for: string }[];

  const model = buildCalendarModel(sends, { now, leadTimeDays: lead, timeZone: TIME_ZONE });

  const selectedMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : monthKey(now);
  const weeks = monthWeeks(selectedMonth);
  const maxCount = Math.max(0, ...[...model.countsByDay.values()]);

  // Banner state.
  const empty = model.totalScheduled === 0 || model.emptiesOn === null;
  const scrapeIsUrgent =
    !empty && model.scrapeBy !== null && model.scrapeBy <= todayKey;
  const bannerTone = empty ? 'danger' : scrapeIsUrgent ? 'warn' : 'accent';
  const bannerColor =
    bannerTone === 'danger' ? 'var(--danger)' : bannerTone === 'warn' ? 'var(--warn)' : 'var(--accent)';

  return (
    <div className="boot">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>CALENDAR - 06</div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Scheduled email runway</h1>
          <p style={{ fontSize: 13, color: 'var(--mute)', marginTop: 6, marginBottom: 0 }}>
            Upcoming scheduled sends by day. Plan your next scrape before the queue runs dry.
          </p>
        </div>
        <span className="tag tag--accent">{model.totalScheduled} SCHEDULED</span>
      </div>

      <hr className="hr-fade" style={{ margin: '20px 0 22px' }} />

      {/* Runway banner */}
      <section
        className="frame frame--brackets"
        style={{ padding: '16px 20px', marginBottom: 22, borderColor: bannerColor }}
      >
        <span className="br-tr" /><span className="br-bl" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span className="pulse-dot" style={{ background: bannerColor }} />
          {empty ? (
            <span style={{ fontSize: 15, fontWeight: 650, color: bannerColor }}>
              Queue is empty - schedule a scrape now
            </span>
          ) : (
            <span style={{ fontSize: 15, fontWeight: 650 }}>
              Queue empties{' '}
              <span style={{ color: bannerColor }}>{prettyDay(model.emptiesOn)}</span>{' '}
              ({model.daysOfRunway} {model.daysOfRunway === 1 ? 'day' : 'days'}) ·{' '}
              schedule a scrape by{' '}
              <span style={{ color: bannerColor }}>{prettyDay(model.scrapeBy)}</span>
            </span>
          )}
          <span className="label" style={{ marginLeft: 'auto' }}>
            LEAD TIME {lead}d
          </span>
        </div>
      </section>

      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Link href={`/calendar?month=${shiftMonth(selectedMonth, -1)}`} className="label" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
          ‹ {monthLabel(shiftMonth(selectedMonth, -1))}
        </Link>
        <h2 style={{ fontSize: 18, margin: 0 }}>{monthLabel(selectedMonth)}</h2>
        <Link href={`/calendar?month=${shiftMonth(selectedMonth, 1)}`} className="label" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
          {monthLabel(shiftMonth(selectedMonth, 1))} ›
        </Link>
      </div>

      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="label" style={{ textAlign: 'center' }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gap: 6 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {week.map(({ key, inMonth }) => {
              const count = model.countsByDay.get(key) || 0;
              const isToday = key === todayKey;
              const isScrapeBy = key === model.scrapeBy && !empty;
              const isEmpties = key === model.emptiesOn && !empty;
              const cell = (
                <div
                  style={{
                    minHeight: 72,
                    padding: '8px 10px',
                    border: `1px solid ${isToday ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: 3,
                    background: cellTint(count, maxCount),
                    opacity: inMonth ? 1 : 0.4,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--accent)' : 'var(--mute)' }}>
                      {Number(key.slice(8))}
                    </span>
                    {isScrapeBy ? <span className="tag tag--warn" style={{ fontSize: 8 }}>SCRAPE</span> : null}
                    {isEmpties && !isScrapeBy ? <span className="tag tag--danger" style={{ fontSize: 8 }}>LAST</span> : null}
                  </div>
                  <div className="numeric" style={{ fontSize: 22, fontWeight: 650, textAlign: 'right', color: count ? 'var(--ink)' : 'var(--line)' }}>
                    {count || '-'}
                  </div>
                </div>
              );
              return count > 0 ? (
                <Link key={key} href={`/today?date=${key}`} style={{ textDecoration: 'none' }}>
                  {cell}
                </Link>
              ) : (
                <div key={key}>{cell}</div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
