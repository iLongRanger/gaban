import { calculateDistance } from '../utils/geo.js';

export default class FilteringService {
  constructor({ settings, logger } = {}) {
    this.settings = settings;
    this.logger = logger;
  }

  filterLeads(leads, officeLocation) {
    const passed = [];
    const excluded = [];

    for (const lead of leads) {
      const reason = this.getExclusionReason(lead, officeLocation);
      if (reason) {
        excluded.push({ ...lead, exclusion_reason: reason });
      } else {
        passed.push(lead);
      }
    }

    this.logger?.info(
      `Filtering complete: ${passed.length} passed, ${excluded.length} excluded.`
    );

    return { passed, excluded };
  }

  getExclusionReason(lead, officeLocation) {
    const { filters, search } = this.settings;

    if (!lead.location) {
      return 'missing_location';
    }

    const distance = calculateDistance(officeLocation, lead.location);
    if (distance > search.radius_km) {
      return 'outside_radius';
    }

    if (filters.require_phone && !lead.formatted_phone_number) {
      return 'missing_phone';
    }

    if (
      lead.rating !== null &&
      (lead.rating < filters.rating.min || lead.rating > filters.rating.max)
    ) {
      return 'rating_out_of_range';
    }

    if (
      lead.user_ratings_total !== null &&
      (lead.user_ratings_total < filters.reviews.min ||
        lead.user_ratings_total > filters.reviews.max)
    ) {
      return 'review_count_out_of_range';
    }

    return null;
  }
}
