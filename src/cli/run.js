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

async function loadSettings() {
  const settingsPath = path.resolve(__dirname, '../config/settings.json');
  const raw = await fs.readFile(settingsPath, 'utf-8');
  return JSON.parse(raw);
}

async function run() {
  dotenv.config();

  const settings = await loadSettings();
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
