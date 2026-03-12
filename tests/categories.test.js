import { describe, it } from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCategoriesForWeek, CATEGORY_SCHEDULE, ALL_CATEGORIES } from '../src/config/categories.js';

test('getCategoriesForWeek returns correct categories for week 1', () => {
  const result = getCategoriesForWeek(1);
  assert.deepStrictEqual(result, ['restaurants', 'offices']);
});

test('getCategoriesForWeek returns correct categories for week 4', () => {
  const result = getCategoriesForWeek(4);
  assert.deepStrictEqual(result, ['community centers', 'industrial facilities']);
});

test('getCategoriesForWeek wraps around after week 4', () => {
  const result = getCategoriesForWeek(5);
  assert.deepStrictEqual(result, getCategoriesForWeek(1));
});

test('getCategoriesForWeek handles week 0 by wrapping to week 4', () => {
  const result = getCategoriesForWeek(0);
  assert.deepStrictEqual(result, getCategoriesForWeek(4));
});

test('CATEGORY_SCHEDULE has 4 entries', () => {
  assert.equal(CATEGORY_SCHEDULE.length, 4);
});

describe('ALL_CATEGORIES', () => {
  it('contains all unique categories from the schedule', () => {
    const expected = [...new Set(CATEGORY_SCHEDULE.flat())];
    assert.deepStrictEqual(ALL_CATEGORIES.sort(), expected.sort());
  });

  it('has no duplicates', () => {
    assert.strictEqual(ALL_CATEGORIES.length, new Set(ALL_CATEGORIES).size);
  });
});
