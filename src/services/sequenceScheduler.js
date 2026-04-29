const DEFAULT_SEND_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DEFAULT_TOUCH_OFFSETS = [0, 4, 10];

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseTime(value, field) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`${field} must be HH:MM`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`${field} must be HH:MM`);
  return { hours, minutes };
}

function partsInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hours: Number(get('hour')),
    minutes: Number(get('minute')),
    seconds: Number(get('second')),
    weekday: get('weekday').toLowerCase().slice(0, 3),
  };
}

function wallTimeToUtc({ year, month, day, hours, minutes }, timeZone) {
  const target = Date.UTC(year, month - 1, day, hours, minutes, 0);
  let guess = target;
  for (let i = 0; i < 3; i += 1) {
    const actual = partsInTimeZone(new Date(guess), timeZone);
    const actualWall = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hours,
      actual.minutes,
      actual.seconds
    );
    guess += target - actualWall;
  }
  return new Date(guess);
}

function addLocalDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function withWeekday(parts) {
  return {
    ...parts,
    weekday: WEEKDAYS[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()],
  };
}

function compareTime(parts, time) {
  const left = parts.hours * 60 + parts.minutes;
  const right = time.hours * 60 + time.minutes;
  return left - right;
}

export function nextSendTime(from, options = {}) {
  const timeZone = options.timeZone || 'America/Vancouver';
  const sendDays = options.sendDays || DEFAULT_SEND_DAYS;
  const windowStart = parseTime(options.sendWindowStart || '09:00', 'sendWindowStart');
  const windowEnd = parseTime(options.sendWindowEnd || '17:00', 'sendWindowEnd');

  let parts = partsInTimeZone(new Date(from), timeZone);
  for (let i = 0; i < 14; i += 1) {
    if (!sendDays.includes(parts.weekday)) {
      parts = withWeekday({ ...addLocalDays(parts, 1), hours: windowStart.hours, minutes: windowStart.minutes });
      continue;
    }

    if (compareTime(parts, windowStart) < 0) {
      return wallTimeToUtc({ ...parts, hours: windowStart.hours, minutes: windowStart.minutes }, timeZone);
    }

    if (compareTime(parts, windowEnd) < 0) {
      return wallTimeToUtc(parts, timeZone);
    }

    parts = withWeekday({ ...addLocalDays(parts, 1), hours: windowStart.hours, minutes: windowStart.minutes });
  }

  throw new Error('could not find a valid send time');
}

function addBusinessDays(start, count, options = {}) {
  const timeZone = options.timeZone || 'America/Vancouver';
  const sendDays = options.sendDays || DEFAULT_SEND_DAYS;
  let parts = partsInTimeZone(new Date(start), timeZone);
  let remaining = count;
  while (remaining > 0) {
    parts = { ...addLocalDays(parts, 1), hours: parts.hours, minutes: parts.minutes };
    const weekday = WEEKDAYS[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()];
    if (sendDays.includes(weekday)) remaining -= 1;
  }
  return wallTimeToUtc(parts, timeZone);
}

export function scheduleSequence({
  startAt,
  existingScheduledTimes = [],
  touchOffsets = DEFAULT_TOUCH_OFFSETS,
  minGapMinutes = 2,
  options = {},
} = {}) {
  if (!startAt) throw new Error('startAt required');
  const scheduled = existingScheduledTimes.map((value) => new Date(value).getTime()).sort((a, b) => a - b);
  const minGapMs = minGapMinutes * 60 * 1000;

  return touchOffsets.map((offset, index) => {
    const base = index === 0
      ? new Date(startAt)
      : addBusinessDays(startAt, offset, options);
    let candidate = nextSendTime(base, options);

    while (scheduled.some((time) => Math.abs(time - candidate.getTime()) < minGapMs)) {
      candidate = nextSendTime(new Date(candidate.getTime() + minGapMs), options);
    }

    scheduled.push(candidate.getTime());
    scheduled.sort((a, b) => a - b);

    return {
      touchNumber: index + 1,
      scheduledFor: candidate.toISOString(),
    };
  });
}
