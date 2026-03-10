import test from 'node:test';
import assert from 'node:assert/strict';
import { getCategoriesForWeek, CATEGORY_SCHEDULE } from '../src/config/categories.js';

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
