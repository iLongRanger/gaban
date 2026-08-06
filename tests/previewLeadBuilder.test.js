import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyVertical } from '../src/services/verticalClassifier.js';
import {
  PREVIEW_BUSINESS_TYPES,
  buildPreviewLead,
  previewVertical,
} from '../src/services/previewLeadBuilder.js';

test('every preview type resolves to its stated vertical', () => {
  for (const entry of PREVIEW_BUSINESS_TYPES) {
    assert.equal(
      classifyVertical({ type: entry.type }),
      entry.vertical,
      `${entry.id} (type "${entry.type}") should classify as ${entry.vertical}`
    );
  }
});

test('preview types cover all nine verticals exactly once', () => {
  const verticals = PREVIEW_BUSINESS_TYPES.map((t) => t.vertical).sort();
  assert.deepEqual(verticals, [
    'brewery', 'civic', 'industrial', 'medical', 'office',
    'physiotherapy', 'restaurant', 'retail', 'spa',
  ]);
});

test('buildPreviewLead carries no reviews so touch 1 uses the generic drift opener', () => {
  const lead = buildPreviewLead('restaurant');
  assert.equal(lead.type, 'Restaurant');
  assert.deepEqual(lead.reviews_data, []);
  assert.equal(lead.reviews_count, 60);
  assert.ok(lead.business_name);
});

test('previewVertical resolves through the real classifier', () => {
  assert.equal(previewVertical('spa'), 'spa');
  assert.equal(previewVertical('physiotherapy'), 'physiotherapy');
});

test('buildPreviewLead rejects unknown types', () => {
  assert.throws(() => buildPreviewLead('nope'), /Unknown preview business type/);
});
