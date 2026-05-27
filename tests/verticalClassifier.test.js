import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyVertical, VERTICALS } from '../src/services/verticalClassifier.js';

test('classifies food service into restaurant', () => {
  assert.equal(classifyVertical({ type: 'Restaurant' }), 'restaurant');
  assert.equal(classifyVertical({ type: 'Cafe' }), 'restaurant');
  assert.equal(classifyVertical({ type: 'Pizza restaurant' }), 'restaurant');
  assert.equal(classifyVertical({ type: 'Coffee shop' }), 'restaurant');
  assert.equal(classifyVertical({ type: 'Brunch restaurant' }), 'restaurant');
});

test('classifies breweries, bars, and casinos into brewery', () => {
  assert.equal(classifyVertical({ type: 'Brewery' }), 'brewery');
  assert.equal(classifyVertical({ type: 'Taproom' }), 'brewery');
  assert.equal(classifyVertical({ type: 'Bar' }), 'brewery');
  assert.equal(classifyVertical({ type: 'Pub' }), 'brewery');
  assert.equal(classifyVertical({ type: 'Cocktail bar' }), 'brewery');
  assert.equal(classifyVertical({ type: 'Casino' }), 'brewery');
});

test('classifies industrial yards, shipping, and movers into industrial', () => {
  assert.equal(classifyVertical({ type: 'Equipment supplier' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Warehouse' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Chemical plant' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Manufacturer' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Shipping service' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Mover' }), 'industrial');
  assert.equal(classifyVertical({ type: 'Telecommunications service provider' }), 'industrial');
});

test('classifies storefront retail and fitness into retail', () => {
  assert.equal(classifyVertical({ type: 'Boutique' }), 'retail');
  assert.equal(classifyVertical({ type: 'Clothing store' }), 'retail');
  assert.equal(classifyVertical({ type: 'Shopping mall' }), 'retail');
  assert.equal(classifyVertical({ type: 'Gym' }), 'retail');
  assert.equal(classifyVertical({ type: 'Yoga studio' }), 'retail');
});

test('classifies medical, dental, and wellness into medical', () => {
  assert.equal(classifyVertical({ type: 'Medical clinic' }), 'medical');
  assert.equal(classifyVertical({ type: 'Dentist' }), 'medical');
  assert.equal(classifyVertical({ type: 'Dental clinic' }), 'medical');
  assert.equal(classifyVertical({ type: 'Physiotherapy Center' }), 'medical');
  assert.equal(classifyVertical({ type: 'Medical laboratory' }), 'medical');
  assert.equal(classifyVertical({ type: 'Skin care clinic' }), 'medical');
  assert.equal(classifyVertical({ type: 'Massage therapist' }), 'medical');
  assert.equal(classifyVertical({ type: 'Mental health clinic' }), 'medical');
  assert.equal(classifyVertical({ type: "Women's health clinic" }), 'medical');
  assert.equal(classifyVertical({ type: 'X-ray lab' }), 'medical');
  assert.equal(classifyVertical({ type: 'Chiropractor' }), 'medical');
});

test('medical wins over industrial for "medical equipment supplier"', () => {
  assert.equal(classifyVertical({ type: 'Medical equipment supplier' }), 'medical');
});

test('classifies government, civic, and condos into civic', () => {
  assert.equal(classifyVertical({ type: 'Government office' }), 'civic');
  assert.equal(classifyVertical({ type: 'Federal government office' }), 'civic');
  assert.equal(classifyVertical({ type: 'City Hall' }), 'civic');
  assert.equal(classifyVertical({ type: 'City government office' }), 'civic');
  assert.equal(classifyVertical({ type: 'Courthouse' }), 'civic');
  assert.equal(classifyVertical({ type: "Driver's license office" }), 'civic');
  assert.equal(classifyVertical({ type: 'Public health department' }), 'civic');
  assert.equal(classifyVertical({ type: 'Non-profit organization' }), 'civic');
  assert.equal(classifyVertical({ type: 'Condominium complex' }), 'civic');
});

test('falls back to office for generic professional services', () => {
  assert.equal(classifyVertical({ type: 'Insurance broker' }), 'office');
  assert.equal(classifyVertical({ type: 'Employment agency' }), 'office');
  assert.equal(classifyVertical({ type: 'Immigration & naturalization service' }), 'office');
  assert.equal(classifyVertical({ type: 'Coworking space' }), 'office');
  assert.equal(classifyVertical({ type: 'Corporate office' }), 'office');
  assert.equal(classifyVertical({ type: 'Business center' }), 'office');
  assert.equal(classifyVertical({ type: 'Office space rental agency' }), 'office');
  assert.equal(classifyVertical({ type: undefined }), 'office');
  assert.equal(classifyVertical({}), 'office');
});

test('exports the canonical 7-vertical set', () => {
  assert.deepEqual(
    [...VERTICALS].sort(),
    ['brewery', 'civic', 'industrial', 'medical', 'office', 'restaurant', 'retail']
  );
});
