import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyVertical, VERTICALS } from '../src/services/verticalClassifier.js';

test('classifies food service into restaurant', () => {
  assert.equal(classifyVertical({ type: 'Restaurant' }), 'restaurant');
  assert.equal(classifyVertical({ type: 'Cafe' }), 'restaurant');
  assert.equal(classifyVertical({ type: 'Pizza restaurant' }), 'restaurant');
});

test('classifies breweries and bars into brewery', () => {
  assert.equal(classifyVertical({ type: 'Brewery' }), 'brewery');
  assert.equal(classifyVertical({ type: 'Taproom' }), 'brewery');
  assert.equal(classifyVertical({ type: 'Bar' }), 'brewery');
});

test('classifies industrial yards into industrial', () => {
  assert.equal(classifyVertical({ type: 'Equipment supplier' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Warehouse' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Chemical plant' }), 'industrial');
});

test('classifies storefront retail', () => {
  assert.equal(classifyVertical({ type: 'Boutique' }), 'retail');
  assert.equal(classifyVertical({ type: 'Clothing store' }), 'retail');
});

test('falls back to office when unknown', () => {
  assert.equal(classifyVertical({ type: 'Accountant' }), 'office');
  assert.equal(classifyVertical({ type: undefined }), 'office');
  assert.equal(classifyVertical({}), 'office');
});

test('exports the canonical vertical set', () => {
  assert.deepEqual(
    [...VERTICALS].sort(),
    ['brewery', 'industrial', 'office', 'restaurant', 'retail']
  );
});
