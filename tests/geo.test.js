import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDistance } from '../src/utils/geo.js';

test('calculateDistance returns ~5.43km for known points', () => {
  const point1 = { lat: 49.2026, lng: -122.9106 };
  const point2 = { lat: 49.2467, lng: -122.8838 };

  const distance = calculateDistance(point1, point2);

  assert.ok(Math.abs(distance - 5.43) < 0.2);
});

test('calculateDistance returns 0 for same point', () => {
  const point = { lat: 49.2026, lng: -122.9106 };

  const distance = calculateDistance(point, point);

  assert.equal(distance, 0);
});
