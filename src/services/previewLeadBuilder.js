import { classifyVertical } from './verticalClassifier.js';

// One representative business type per vertical, for the Message Preview page.
// Each `type` string is chosen so classifyVertical(type) === vertical, so the preview
// always shows the copy a real lead of this kind would actually receive. The
// previewLeadBuilder test guards that invariant.
export const PREVIEW_BUSINESS_TYPES = [
  { id: 'restaurant',    label: 'Restaurant',              type: 'Restaurant',           vertical: 'restaurant',    sample_name: 'Sample Bistro' },
  { id: 'brewery',       label: 'Brewery / bar',           type: 'Brewery',              vertical: 'brewery',       sample_name: 'Sample Brewing Co.' },
  { id: 'office',        label: 'Office',                  type: 'Corporate office',     vertical: 'office',        sample_name: 'Sample Office' },
  { id: 'retail',        label: 'Retail store',            type: 'Retail store',         vertical: 'retail',        sample_name: 'Sample Store' },
  { id: 'medical',       label: 'Medical / dental clinic', type: 'Dental clinic',        vertical: 'medical',       sample_name: 'Sample Dental Clinic' },
  { id: 'physiotherapy', label: 'Physiotherapy',           type: 'Physiotherapy clinic', vertical: 'physiotherapy', sample_name: 'Sample Physio' },
  { id: 'spa',           label: 'Spa',                     type: 'Day spa',              vertical: 'spa',           sample_name: 'Sample Day Spa' },
  { id: 'industrial',    label: 'Industrial / warehouse',  type: 'Warehouse',            vertical: 'industrial',    sample_name: 'Sample Warehouse' },
  { id: 'civic',         label: 'Government / civic',      type: 'Government office',    vertical: 'civic',         sample_name: 'Sample Community Centre' },
];

const BY_ID = new Map(PREVIEW_BUSINESS_TYPES.map((t) => [t.id, t]));

// Build a synthetic lead for a preview. Deliberately carries no reviews so touch 1 opens
// from the vertical's generic drift line, which is the baseline every lead of this type
// sees before per-lead review personalization kicks in.
export function buildPreviewLead(businessTypeId) {
  const entry = BY_ID.get(businessTypeId);
  if (!entry) throw new Error(`Unknown preview business type: ${businessTypeId}`);
  return {
    business_name: entry.sample_name,
    type: entry.type,
    rating: 4.5,
    reviews_count: 60,
    reviews_data: [],
  };
}

// Convenience for callers that want the resolved vertical without rebuilding the lead.
export function previewVertical(businessTypeId) {
  return classifyVertical(buildPreviewLead(businessTypeId));
}
