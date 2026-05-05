import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { geocodeAddress, normalizeDistanceCenterAddress } from '../src/web/lib/geocoding.js';

describe('geocoding', () => {
  it('normalizes address input', () => {
    assert.equal(normalizeDistanceCenterAddress('  1209 Fourth Avenue  '), '1209 Fourth Avenue');
  });

  it('returns coordinates from Nominatim-style results', async () => {
    let requestUrl;
    let userAgent;
    const result = await geocodeAddress('1209 Fourth Avenue, New Westminster, BC', {
      fetch: async (url, options) => {
        requestUrl = url;
        userAgent = options.headers['User-Agent'];
        return {
          ok: true,
          json: async () => [{
            lat: '49.2051',
            lon: '-122.9126',
            display_name: '1209 Fourth Avenue, New Westminster, BC, Canada',
          }],
        };
      },
    });

    assert.equal(result.lat, 49.2051);
    assert.equal(result.lng, -122.9126);
    assert.equal(result.source, 'OpenStreetMap Nominatim');
    assert.equal(userAgent, 'GabanOutreachBot/0.1 (https://bot.gleamlift.ca)');
    assert.equal(requestUrl.searchParams.get('countrycodes'), 'ca');
    assert.equal(requestUrl.searchParams.get('limit'), '1');
  });

  it('throws when no coordinates are returned', async () => {
    await assert.rejects(
      () => geocodeAddress('unknown', {
        fetch: async () => ({
          ok: true,
          json: async () => [],
        }),
      }),
      /No coordinates found/
    );
  });
});
