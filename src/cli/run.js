import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import DiscoveryService from '../services/discoveryService.js';
import FilteringService from '../services/filteringService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return ['true', '1', 'yes', 'y'].includes(String(value).toLowerCase());
}

function applyEnvOverrides(settings) {
  return {
    ...settings,
    search: {
      ...settings.search,
      radius_km: parseNumber(process.env.SEARCH_RADIUS_KM, settings.search.radius_km),
      type: process.env.SEARCH_TYPE || settings.search.type,
      language: process.env.SEARCH_LANGUAGE || settings.search.language,
      include_details: parseBoolean(
        process.env.INCLUDE_DETAILS,
        settings.search.include_details
      )
    },
    filters: {
      ...settings.filters,
      rating: {
        ...settings.filters.rating,
        min: parseNumber(process.env.RATING_MIN, settings.filters.rating.min),
        max: parseNumber(process.env.RATING_MAX, settings.filters.rating.max)
      },
      reviews: {
        ...settings.filters.reviews,
        min: parseNumber(process.env.REVIEW_MIN, settings.filters.reviews.min),
        max: parseNumber(process.env.REVIEW_MAX, settings.filters.reviews.max)
      },
      require_phone: parseBoolean(
        process.env.REQUIRE_PHONE,
        settings.filters.require_phone
      )
    },
    operational: {
      ...settings.operational,
      dry_run: parseBoolean(process.env.DRY_RUN, settings.operational.dry_run)
    }
  };
}

async function loadSettings() {
  const settingsPath = path.resolve(__dirname, '../config/settings.json');
  const raw = await fs.readFile(settingsPath, 'utf-8');
  return JSON.parse(raw);
}

async function run() {
  dotenv.config();

  const settings = applyEnvOverrides(await loadSettings());
  const officeLocation = {
    lat: parseNumber(process.env.OFFICE_LAT, 49.2026),
    lng: parseNumber(process.env.OFFICE_LNG, -122.9106)
  };

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const discovery = new DiscoveryService({ apiKey, logger });
  const filtering = new FilteringService({ settings, logger });

  logger.info('Starting discovery phase.');

  if (settings.operational.dry_run) {
    logger.info('Dry run enabled. Skipping Google Places API calls.');
    return;
  }

  const leads = await discovery.discoverNearbyRestaurants({
    location: officeLocation,
    radiusMeters: settings.search.radius_km * 1000,
    type: settings.search.type,
    language: settings.search.language,
    includeDetails: settings.search.include_details
  });

  logger.info(`Discovered ${leads.length} leads.`);

  const { passed, excluded } = filtering.filterLeads(leads, officeLocation);

  logger.info(`Leads ready for enrichment: ${passed.length}.`);
  logger.info(`Excluded leads: ${excluded.length}.`);
}

run().catch((error) => {
  logger.error(`Run failed: ${error.message}`);
  process.exit(1);
});
