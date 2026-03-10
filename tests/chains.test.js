import test from 'node:test';
import assert from 'node:assert/strict';
import { isChain } from '../src/config/chains.js';

test('isChain detects exact chain name', () => {
  assert.equal(isChain('McDonald\'s'), true);
});

test('isChain detects chain name case-insensitive', () => {
  assert.equal(isChain('starbucks'), true);
});

test('isChain detects chain as substring', () => {
  assert.equal(isChain('Tim Hortons #1234'), true);
});

test('isChain returns false for independent business', () => {
  assert.equal(isChain('Joe\'s Bistro'), false);
});

test('isChain returns false for empty string', () => {
  assert.equal(isChain(''), false);
});
