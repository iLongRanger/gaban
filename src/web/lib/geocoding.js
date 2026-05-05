const DEFAULT_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_USER_AGENT = 'GabanOutreachBot/0.1 (https://bot.gleamlift.ca)';

function parseCoordinate(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function geocodeAddress(address, options = {}) {
  const query = String(address ?? '').trim();
  if (!query) {
    throw new Error('Distance center address is required');
  }

  const endpoint = options.endpoint || process.env.GEOCODING_ENDPOINT || DEFAULT_ENDPOINT;
  const userAgent = options.userAgent || process.env.GEOCODING_USER_AGENT || DEFAULT_USER_AGENT;
  const fetchImpl = options.fetch || fetch;
  const url = new URL(endpoint);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'ca');
  url.searchParams.set('addressdetails', '1');

  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': userAgent,
      'Accept-Language': 'en-CA,en;q=0.8',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed: ${response.status}`);
  }

  const results = await response.json();
  const first = Array.isArray(results) ? results[0] : null;
  const lat = parseCoordinate(first?.lat);
  const lng = parseCoordinate(first?.lon);

  if (lat === null || lng === null) {
    throw new Error('No coordinates found for that address');
  }

  return {
    lat,
    lng,
    label: first.display_name || query,
    source: 'OpenStreetMap Nominatim',
  };
}

export function normalizeDistanceCenterAddress(value) {
  return String(value ?? '').trim();
}
