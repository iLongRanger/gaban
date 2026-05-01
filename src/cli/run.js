// src/cli/run.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import logger from '../utils/logger.js';
import { getCategoriesForWeek } from '../config/categories.js';
import { loadSeenLeads, saveSeenLeads, markAsSeen } from '../utils/seenLeads.js';
import DiscoveryService from '../services/discoveryService.js';
import FilteringService from '../services/filteringService.js';
import EmailEnrichmentService from '../services/emailEnrichmentService.js';
import ScoringService from '../services/scoringService.js';
import DraftingService from '../services/draftingService.js';
import SheetsService from '../services/sheetsService.js';
import SqliteService from '../services/sqliteService.js';
import { initDb } from '../web/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadSettings() {
  const settingsPath = path.resolve(__dirname, '../config/settings.json');
  const raw = await fs.readFile(settingsPath, 'utf-8');
  return JSON.parse(raw);
}

export function mergeConfig(base, override) {
  if (!override) return base;
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (typeof override[key] === 'object' && !Array.isArray(override[key]) && override[key] !== null) {
      result[key] = { ...base[key], ...override[key] };
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

function getWeekNumber() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now - start;
  const oneWeek = 604800000;
  return Math.ceil(diff / oneWeek);
}

function getWeekLabel() {
  const now = new Date();
  const week = getWeekNumber();
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function createSheetsAuth() {
  const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!credentialsPath) return null;

  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return auth;
}

export function validateRequiredEnv(env = process.env) {
  const missing = ['OUTSCRAPER_API_KEY', 'OPENAI_API_KEY']
    .filter((key) => !env[key] || env[key].includes('your_'));

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export function didAllScoringFail(scoredLeads) {
  return scoredLeads.length > 0 && scoredLeads.every((lead) =>
    lead.total_score === 0 && String(lead.reasoning || '').startsWith('Scoring failed:')
  );
}

async function run() {
  dotenv.config();
  let settings = await loadSettings();

  // Parse --config flag
  const configFlagIndex = process.argv.indexOf('--config');
  if (configFlagIndex !== -1 && process.argv[configFlagIndex + 1]) {
    const configPath = process.argv[configFlagIndex + 1];
    const raw = await fs.readFile(configPath, 'utf-8');
    const override = JSON.parse(raw);
    settings = mergeConfig(settings, override);
  }

  logger.info('=== Gleam Lead Scraper - Weekly Run ===');

  if (settings.operational.dry_run) {
    logger.info('Dry run enabled. Exiting.');
    return;
  }

  validateRequiredEnv();

  // Resolve paths
  const dataDir = path.resolve(__dirname, '../../data');
  await fs.mkdir(dataDir, { recursive: true });
  const seenLeadsPath = path.resolve(dataDir, 'seen_leads.json');

  // Load seen leads
  const seenLeads = await loadSeenLeads(seenLeadsPath);
  logger.info(`Loaded ${Object.keys(seenLeads).length} previously seen leads.`);

  // Phase 1: Discovery
  const weekNum = getWeekNumber();
  const categories = settings.categories || getCategoriesForWeek(weekNum);
  logger.info(`Week ${getWeekLabel()} — Categories: ${categories.join(', ')}`);

  const discovery = new DiscoveryService({
    apiKey: process.env.OUTSCRAPER_API_KEY,
    logger
  });

  const rawLeads = await discovery.discoverLeads({
    categories,
    location: settings.search.location,
    limit: settings.search.limit_per_category,
    language: settings.search.language,
    region: settings.search.region,
    enrichment: settings.enrichment?.enabled ? settings.enrichment.outscraper_services : null
  });
  logger.info(`Discovered ${rawLeads.length} raw leads.`);

  // Phase 2: Filtering
  const officeLocation = settings.office_location;
  const filtering = new FilteringService({ settings, logger });
  let { passed, excluded } = filtering.filterLeads(rawLeads, officeLocation, seenLeads);
  logger.info(`Filtered: ${passed.length} passed, ${excluded.length} excluded.`);

  if (passed.length === 0) {
    logger.warn('No leads passed filtering. Exiting.');
    return;
  }

  if (settings.enrichment?.enabled && settings.enrichment.website_email_lookup) {
    const emailEnrichment = new EmailEnrichmentService({
      logger,
      timeoutMs: settings.enrichment.timeout_ms,
      maxPagesPerSite: settings.enrichment.max_pages_per_site
    });
    passed = await emailEnrichment.enrichLeads(passed);
  }

  // Phase 3: Scoring
  const scoring = new ScoringService({
    apiKey: process.env.OPENAI_API_KEY,
    model: settings.scoring.model,
    logger
  });
  const scoredLeads = await scoring.scoreLeads(passed, officeLocation);
  if (didAllScoringFail(scoredLeads)) {
    throw new Error('All scoring attempts failed. Check OPENAI_API_KEY billing/quota before rerunning.');
  }

  const topLeads = scoring.selectTopN(scoredLeads, settings.scoring.top_n);
  logger.info(`Scored ${scoredLeads.length} leads. Selected top ${topLeads.length}.`);

  // Phase 4: Drafting
  const drafting = new DraftingService({
    apiKey: process.env.OPENAI_API_KEY,
    model: settings.drafting.model,
    logger
  });
  const drafts = await drafting.draftAllLeads(topLeads);
  logger.info(`Drafted outreach for ${drafts.length} leads.`);

  // Phase 5: Export
  const weekLabel = getWeekLabel();

  // Primary: SQLite
  try {
    const db = initDb();
    const sqliteService = new SqliteService({ db, logger });
    sqliteService.exportResults(topLeads, drafts, weekLabel);
    logger.info('Exported to SQLite.');
  } catch (error) {
    logger.warn('SQLite export failed: ' + error.message + '. Falling back to CSV.');
    const csvPath = path.resolve(dataDir, 'leads-' + weekLabel + '.csv');
    const sheetsService = new SheetsService({ logger });
    await sheetsService.exportToCSV(topLeads, drafts, csvPath);
    logger.info('Saved fallback CSV to ' + csvPath);
  }

  // Update seen leads
  for (const lead of topLeads) {
    markAsSeen(seenLeads, lead.place_id, lead.business_name);
  }
  await saveSeenLeads(seenLeadsPath, seenLeads);
  logger.info(`Updated seen leads file (${Object.keys(seenLeads).length} total).`);

  logger.info('=== Run complete ===');
}

const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMainModule) {
  run().catch((error) => {
    logger.error(`Run failed: ${error.message}`);
    process.exit(1);
  });
}
