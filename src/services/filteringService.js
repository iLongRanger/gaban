import { calculateDistance } from '../utils/geo.js';
import { isChain } from '../config/chains.js';
import { hasBeenSeen } from '../utils/seenLeads.js';

export default class FilteringService {
  constructor({ settings, logger } = {}) {
    this.settings = settings;
    this.logger = logger;
  }

  filterLeads(leads, officeLocation, seenLeads) {
    const passed = [];
    const excluded = [];

    for (const lead of leads) {
      const reason = this.getExclusionReason(lead, officeLocation, seenLeads);
      if (reason) {
        excluded.push({ ...lead, exclusion_reason: reason });
      } else {
        passed.push(lead);
      }
    }

    this.logger?.info(`Filtering complete: ${passed.length} passed, ${excluded.length} excluded.`);
    return { passed, excluded };
  }

  getExclusionReason(lead, officeLocation, seenLeads) {
    if (hasBeenSeen(seenLeads, lead.place_id)) {
      return 'already_seen';
    }

    if (lead.business_status === 'CLOSED_PERMANENTLY') {
      return 'permanently_closed';
    }

    if (isChain(lead.business_name)) {
      return 'chain_franchise';
    }

    if (!lead.location || lead.location.lat === null) {
      return 'missing_location';
    }

    const distance = calculateDistance(officeLocation, lead.location);
    if (distance > this.settings.search.radius_km) {
      return 'outside_radius';
    }

    if (this.settings.filters.require_contact) {
      if (!lead.phone && !lead.email && !lead.website) {
        return 'no_contact_info';
      }
    }

    return null;
  }
}
