import Outscraper from 'outscraper';

export default class DiscoveryService {
  constructor({ apiKey, logger, client } = {}) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.client = client || new Outscraper(apiKey);
  }

  async discoverLeads({ categories, location, limit, language, region, enrichment = null }) {
    const allLeads = [];

    for (const category of categories) {
      const query = `${category} near ${location}`;
      this.logger?.info(`Querying Outscraper: "${query}" (limit: ${limit})`);

      try {
        const response = await this.client.googleMapsSearch(
          [query], limit, language, region, 0, false, enrichment, false
        );

        const places = response?.[0] || [];
        const normalized = places.map(place => this.normalize(place));
        allLeads.push(...normalized);

        this.logger?.info(`Found ${normalized.length} results for "${category}".`);
      } catch (error) {
        this.logger?.error(`Outscraper query failed for "${category}": ${error.message}`);
      }
    }

    return allLeads;
  }

  normalize(place) {
    return {
      place_id: place.place_id || null,
      business_name: place.name || null,
      type: place.type || null,
      subtypes: place.subtypes || null,
      formatted_address: place.full_address || null,
      phone: place.phone || null,
      website: place.site || null,
      email: findFirstEmail(place),
      rating: place.rating ?? null,
      reviews_count: place.reviews ?? null,
      location: {
        lat: place.latitude ?? null,
        lng: place.longitude ?? null
      },
      photo_count: place.photo_count ?? null,
      working_hours: place.working_hours || null,
      business_status: place.business_status || null,
      facebook: place.facebook || null,
      instagram: place.instagram || null,
      reviews_data: place.reviews_data || []
    };
  }
}

function findFirstEmail(place) {
  const candidates = [
    place.email_1,
    place.email,
    ...(Array.isArray(place.emails) ? place.emails : []),
    ...(Array.isArray(place.emails_data)
      ? place.emails_data.flatMap(item => [item.email, item.value])
      : []),
    ...(Array.isArray(place.contacts)
      ? place.contacts.flatMap(item => [item.email, ...(Array.isArray(item.emails) ? item.emails : [])])
      : [])
  ];

  return candidates.find(isEmail) || null;
}

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
