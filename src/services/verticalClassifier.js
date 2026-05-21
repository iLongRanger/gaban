export const VERTICALS = new Set(['restaurant', 'brewery', 'industrial', 'retail', 'office']);

const RULES = [
  { vertical: 'brewery',    patterns: [/brewer|taproom|\bbar\b|pub|distiller|winery/i] },
  { vertical: 'restaurant', patterns: [/restaurant|cafe|coffee|diner|bistro|pizz|sushi|bakery|grill|kitchen|eatery|food/i] },
  { vertical: 'industrial', patterns: [/warehouse|plant|equipment|machinery|industrial|manufactur|yard|workshop|factory|fabricat|chemical|metal|auto|garage|storage/i] },
  { vertical: 'retail',     patterns: [/store|shop|boutique|clothing|grocery|market|salon|spa|gym|fitness|barber|nail/i] },
];

export function classifyVertical(lead) {
  const type = String(lead?.type || '').trim();
  if (!type) return 'office';
  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(type))) return rule.vertical;
  }
  return 'office';
}
