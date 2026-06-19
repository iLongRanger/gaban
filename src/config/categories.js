export const CATEGORY_SCHEDULE = [
  ['restaurants', 'offices'],
  ['clinics', 'gyms'],
  ['schools', 'retail stores'],
  ['community centers', 'industrial facilities']
];

// Categories selectable in presets on demand but intentionally kept out of the
// automatic weekly rotation (getCategoriesForWeek). Add here to make a target
// available without scraping it every cycle.
export const ADDITIONAL_CATEGORIES = ['spa', 'physiotherapy'];

export function getCategoriesForWeek(weekNumber) {
  const index = ((weekNumber - 1) % CATEGORY_SCHEDULE.length + CATEGORY_SCHEDULE.length) % CATEGORY_SCHEDULE.length;
  return CATEGORY_SCHEDULE[index];
}

export const ALL_CATEGORIES = [...new Set([...CATEGORY_SCHEDULE.flat(), ...ADDITIONAL_CATEGORIES])];
