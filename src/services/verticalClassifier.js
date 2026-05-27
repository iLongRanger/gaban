export const VERTICALS = new Set([
  'restaurant',
  'brewery',
  'industrial',
  'retail',
  'office',
  'medical',
  'civic',
]);

// Order matters: specific verticals must be tested before general ones.
// medical wins over industrial so "Medical equipment supplier" -> medical.
// civic wins over office so "Government office" -> civic.
// brewery wins over retail so "Cocktail bar" -> brewery (no retail overlap, but order is intentional).
const RULES = [
  {
    vertical: 'medical',
    patterns: [/medical|dental|dentist|physio|clinic|laboratory|\blab\b|skin\s*care|massage|wellness|chiropract|mental\s+health|women'?s\s+health|x-?ray|optometr|naturopath/i],
  },
  {
    vertical: 'civic',
    patterns: [/government|city\s*hall|courthouse|driver'?s?\s*license|federal\s+office|public\s+health|non[-\s]?profit|condominium/i],
  },
  {
    vertical: 'brewery',
    patterns: [/brewer|taproom|\bbar\b|pub|distiller|winery|cocktail|casino/i],
  },
  {
    vertical: 'restaurant',
    patterns: [/restaurant|cafe|coffee|diner|bistro|pizz|sushi|bakery|grill|kitchen|eatery|food/i],
  },
  {
    vertical: 'industrial',
    patterns: [/warehouse|plant|equipment|machinery|industrial|manufactur|yard|workshop|factory|fabricat|chemical|metal|auto|garage|storage|shipping|\bmover\b|telecom/i],
  },
  {
    vertical: 'retail',
    patterns: [/store|shop|boutique|clothing|grocery|market|salon|\bspa\b|gym|fitness|barber|nail|yoga|shopping\s*mall/i],
  },
];

export function classifyVertical(lead) {
  const type = String(lead?.type || '').trim();
  if (!type) return 'office';
  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(type))) return rule.vertical;
  }
  return 'office';
}
