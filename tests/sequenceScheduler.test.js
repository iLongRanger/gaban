import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nextSendTime, scheduleSequence, clampToWindowStart } from '../src/services/sequenceScheduler.js';

const OPTIONS = {
  timeZone: 'America/Vancouver',
  sendWindowStart: '09:00',
  sendWindowEnd: '17:00',
  sendDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
};

describe('sequenceScheduler', () => {
  it('moves weekend starts to Monday morning', () => {
    const result = nextSendTime('2026-05-02T19:00:00.000Z', OPTIONS);
    assert.strictEqual(result.toISOString(), '2026-05-04T16:00:00.000Z');
  });

  it('schedules touches on day 0, 4 business days, 10 business days, and 21 business days', () => {
    const scheduled = scheduleSequence({
      startAt: '2026-05-04T16:00:00.000Z',
      options: OPTIONS,
    });
    assert.deepStrictEqual(scheduled.map((row) => row.touchNumber), [1, 2, 3, 4]);
    assert.strictEqual(scheduled[0].scheduledFor, '2026-05-04T16:00:00.000Z');
    assert.strictEqual(scheduled[1].scheduledFor, '2026-05-08T16:00:00.000Z');
    assert.strictEqual(scheduled[2].scheduledFor, '2026-05-18T16:00:00.000Z');
    assert.strictEqual(scheduled[3].scheduledFor, '2026-06-02T16:00:00.000Z');
  });

  it('spaces sends apart when existing times conflict', () => {
    const scheduled = scheduleSequence({
      startAt: '2026-05-04T16:00:00.000Z',
      existingScheduledTimes: ['2026-05-04T16:00:00.000Z'],
      minGapMinutes: 2,
      options: OPTIONS,
    });
    assert.strictEqual(scheduled[0].scheduledFor, '2026-05-04T16:02:00.000Z');
  });

  it('clamps a timestamp to the new window start on the same local date', () => {
    // 2026-05-08T16:00Z is 09:00 Vancouver (PDT). New 11:00 start → 18:00Z same date.
    const result = clampToWindowStart('2026-05-08T16:00:00.000Z', { ...OPTIONS, sendWindowStart: '11:00' });
    assert.strictEqual(result.toISOString(), '2026-05-08T18:00:00.000Z');
  });

  it('bumps to the next send day when the clamped date is a non-send weekday', () => {
    // 2026-05-09 is a Saturday in Vancouver → clamp lands on Monday 2026-05-11 at window start.
    const result = clampToWindowStart('2026-05-09T16:00:00.000Z', OPTIONS);
    assert.strictEqual(result.toISOString(), '2026-05-11T16:00:00.000Z');
  });
});
