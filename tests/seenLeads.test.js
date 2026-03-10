import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadSeenLeads, saveSeenLeads, hasBeenSeen, markAsSeen } from '../src/utils/seenLeads.js';

const TEST_FILE = path.resolve('tests/fixtures/test_seen_leads.json');

test.beforeEach(async () => {
  await fs.mkdir(path.dirname(TEST_FILE), { recursive: true });
  try { await fs.unlink(TEST_FILE); } catch {}
});

test.afterEach(async () => {
  try { await fs.unlink(TEST_FILE); } catch {}
});

test('loadSeenLeads returns empty object when file does not exist', async () => {
  const result = await loadSeenLeads(TEST_FILE);
  assert.deepStrictEqual(result, {});
});

test('saveSeenLeads writes and loadSeenLeads reads back', async () => {
  const data = { 'place_123': { name: 'Test Biz', first_seen: '2026-03-10', status: 'scored' } };
  await saveSeenLeads(TEST_FILE, data);
  const loaded = await loadSeenLeads(TEST_FILE);
  assert.deepStrictEqual(loaded, data);
});

test('hasBeenSeen returns true for existing place_id', () => {
  const seen = { 'place_123': { name: 'Test', first_seen: '2026-03-10', status: 'scored' } };
  assert.equal(hasBeenSeen(seen, 'place_123'), true);
});

test('hasBeenSeen returns false for unknown place_id', () => {
  const seen = {};
  assert.equal(hasBeenSeen(seen, 'place_999'), false);
});

test('markAsSeen adds entry to seen object', () => {
  const seen = {};
  markAsSeen(seen, 'place_456', 'New Biz');
  assert.equal(seen['place_456'].name, 'New Biz');
  assert.equal(seen['place_456'].status, 'scored');
  assert.ok(seen['place_456'].first_seen);
});
