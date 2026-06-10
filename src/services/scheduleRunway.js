const DEFAULT_TIME_ZONE = 'America/Vancouver';
const DEFAULT_LEAD_TIME_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Returns the local calendar day for an instant as a 'YYYY-MM-DD' string.
function localDayKey(date, timeZone) {
  // en-CA formats as YYYY-MM-DD, which is exactly the key shape we want.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Whole-day difference between two 'YYYY-MM-DD' keys (b - a), date-only, tz-agnostic.
function dayDiff(aKey, bKey) {
  const a = Date.parse(`${aKey}T00:00:00Z`);
  const b = Date.parse(`${bKey}T00:00:00Z`);
  return Math.round((b - a) / MS_PER_DAY);
}

// Shift a 'YYYY-MM-DD' key by a whole number of days.
function shiftDayKey(key, days) {
  const shifted = new Date(Date.parse(`${key}T00:00:00Z`) + days * MS_PER_DAY);
  return shifted.toISOString().slice(0, 10);
}

export function buildCalendarModel(sends = [], options = {}) {
  const {
    now = new Date(),
    leadTimeDays = DEFAULT_LEAD_TIME_DAYS,
    timeZone = DEFAULT_TIME_ZONE,
  } = options;

  const todayKey = localDayKey(now, timeZone);

  const countsByDay = new Map();
  let emptiesOn = null;

  for (const send of sends) {
    if (!send?.scheduled_for) continue;
    const key = localDayKey(new Date(send.scheduled_for), timeZone);
    countsByDay.set(key, (countsByDay.get(key) || 0) + 1);
    if (emptiesOn === null || key > emptiesOn) emptiesOn = key;
  }

  const totalScheduled = sends.filter((s) => s?.scheduled_for).length;

  let scrapeBy = null;
  let daysOfRunway = 0;
  if (emptiesOn !== null) {
    daysOfRunway = Math.max(0, dayDiff(todayKey, emptiesOn));
    const proposed = shiftDayKey(emptiesOn, -leadTimeDays);
    scrapeBy = proposed < todayKey ? todayKey : proposed;
  }

  return {
    countsByDay,
    totalScheduled,
    emptiesOn,
    daysOfRunway,
    scrapeBy,
    leadTimeDays,
  };
}

export default buildCalendarModel;
