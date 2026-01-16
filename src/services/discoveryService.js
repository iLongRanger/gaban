import { Client } from '@googlemaps/google-maps-services-js';

export default class DiscoveryService {
  constructor({ apiKey, logger, client } = {}) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.client = client || new Client({});
  }

  async discoverNearbyRestaurants({
    location,
    radiusMeters,
    type,
    language,
    includeDetails
  }) {
    if (!this.apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY is required to run discovery.');
    }

    this.logger?.info(
      `Requesting nearby places: ${type} within ${radiusMeters}m of ${location.lat},${location.lng}.`
    );

    const response = await this.client.placesNearby({
      params: {
        key: this.apiKey,
        location,
        radius: radiusMeters,
        type,
        language
      }
    });

    const places = response.data.results || [];

    if (!includeDetails) {
      return places.map((place) => this.normalizeNearbyResult(place));
    }

    const detailedLeads = [];
    for (const place of places) {
      const details = await this.fetchPlaceDetails(place.place_id, language);
      if (details) {
        detailedLeads.push(this.normalizeDetailsResult(details));
      }
    }

    return detailedLeads;
  }

  normalizeNearbyResult(place) {
    return {
      place_id: place.place_id,
      business_name: place.name,
      rating: place.rating ?? null,
      user_ratings_total: place.user_ratings_total ?? null,
      formatted_address: place.vicinity ?? null,
      formatted_phone_number: null,
      website: null,
      location: place.geometry?.location ?? null,
      types: place.types || []
    };
  }

  async fetchPlaceDetails(placeId, language) {
    try {
      const response = await this.client.placeDetails({
        params: {
          key: this.apiKey,
          place_id: placeId,
          fields: [
            'place_id',
            'name',
            'rating',
            'user_ratings_total',
            'formatted_address',
            'formatted_phone_number',
            'website',
            'geometry',
            'types'
          ],
          language
        }
      });

      return response.data.result || null;
    } catch (error) {
      this.logger?.warn(
        `Failed to fetch details for place ${placeId}: ${error.message}`
      );
      return null;
    }
  }

  normalizeDetailsResult(place) {
    return {
      place_id: place.place_id,
      business_name: place.name,
      rating: place.rating ?? null,
      user_ratings_total: place.user_ratings_total ?? null,
      formatted_address: place.formatted_address ?? null,
      formatted_phone_number: place.formatted_phone_number ?? null,
      website: place.website ?? null,
      location: place.geometry?.location ?? null,
      types: place.types || []
    };
  }
}
