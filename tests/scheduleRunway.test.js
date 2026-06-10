import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarModel } from '../src/services/scheduleRunway.js';

const TZ = 'America/Vancouver';

// A fixed "now" in Vancouver local terms: 2026-06-10 09:00 PDT == 16:00 UTC.
const NOW = new Date('2026-06-10T16:00:00Z');

function send(id, iso) {
  return { id, scheduled_for: iso };
}

test('buckets sends into Vancouver-local days', () => {
  const model = buildCalendarModel(
    [
      // 2026-06-10 09:05 PDT
      send(1, '2026-06-10T16:05:00Z'),
      send(2, '2026-06-10T18:00:00Z'),
      // 2026-06-11 10:00 PDT
      send(3, '2026-06-11T17:00:00Z'),
    ],
    { now: NOW, leadTimeDays: 3, timeZone: TZ }
  );

  assert.equal(model.countsByDay.get('2026-06-10'), 2);
  assert.equal(model.countsByDay.get('2026-06-11'), 1);
  assert.equal(model.totalScheduled, 3);
});

test('a UTC time that crosses midnight in Vancouver lands on the local day', () => {
  // 2026-06-12 04:00 UTC == 2026-06-11 21:00 PDT (previous local day)
  const model = buildCalendarModel([send(1, '2026-06-12T04:00:00Z')], {
    now: NOW,
    leadTimeDays: 3,
    timeZone: TZ,
  });
  assert.equal(model.countsByDay.get('2026-06-11'), 1);
  assert.equal(model.countsByDay.has('2026-06-12'), false);
});

test('emptiesOn is the last scheduled local day and daysOfRunway counts from now', () => {
  const model = buildCalendarModel(
    [
      send(1, '2026-06-10T17:00:00Z'), // Jun 10
      send(2, '2026-06-18T17:00:00Z'), // Jun 18
    ],
    { now: NOW, leadTimeDays: 3, timeZone: TZ }
  );
  assert.equal(model.emptiesOn, '2026-06-18');
  assert.equal(model.daysOfRunway, 8); // Jun 10 -> Jun 18
});

test('scrapeBy is emptiesOn minus leadTimeDays', () => {
  const model = buildCalendarModel([send(1, '2026-06-18T17:00:00Z')], {
    now: NOW,
    leadTimeDays: 3,
    timeZone: TZ,
  });
  assert.equal(model.emptiesOn, '2026-06-18');
  assert.equal(model.scrapeBy, '2026-06-15');
  assert.equal(model.leadTimeDays, 3);
});

test('leadTimeDays is honored (5 shifts scrapeBy earlier)', () => {
  const model = buildCalendarModel([send(1, '2026-06-18T17:00:00Z')], {
    now: NOW,
    leadTimeDays: 5,
    timeZone: TZ,
  });
  assert.equal(model.scrapeBy, '2026-06-13');
});

test('scrapeBy clamps to today when it would be in the past', () => {
  // empties Jun 11, lead time 5 -> Jun 6 (past) -> clamp to today Jun 10
  const model = buildCalendarModel([send(1, '2026-06-11T17:00:00Z')], {
    now: NOW,
    leadTimeDays: 5,
    timeZone: TZ,
  });
  assert.equal(model.emptiesOn, '2026-06-11');
  assert.equal(model.scrapeBy, '2026-06-10');
});

test('empty input yields nulls and zero total', () => {
  const model = buildCalendarModel([], { now: NOW, leadTimeDays: 3, timeZone: TZ });
  assert.equal(model.totalScheduled, 0);
  assert.equal(model.emptiesOn, null);
  assert.equal(model.scrapeBy, null);
  assert.equal(model.daysOfRunway, 0);
  assert.equal(model.countsByDay.size, 0);
});

test('defaults leadTimeDays to 3 and timeZone to Vancouver', () => {
  const model = buildCalendarModel([send(1, '2026-06-18T17:00:00Z')], { now: NOW });
  assert.equal(model.leadTimeDays, 3);
  assert.equal(model.scrapeBy, '2026-06-15');
});
