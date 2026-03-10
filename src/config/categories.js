export const CATEGORY_SCHEDULE = [
  ['restaurants', 'offices'],
  ['clinics', 'gyms'],
  ['schools', 'retail stores'],
  ['community centers', 'industrial facilities']
];

export function getCategoriesForWeek(weekNumber) {
  const index = ((weekNumber - 1) % CATEGORY_SCHEDULE.length + CATEGORY_SCHEDULE.length) % CATEGORY_SCHEDULE.length;
  return CATEGORY_SCHEDULE[index];
}
