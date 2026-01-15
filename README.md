# Gleam Lead Scraper - Complete Documentation

## Table of Contents

1. [Overview](#overview)
2. [Business Context](#business-context)
3. [System Architecture](#system-architecture)
4. [Technical Specifications](#technical-specifications)
5. [Setup & Installation](#setup--installation)
6. [Configuration](#configuration)
7. [API Reference](#api-reference)
8. [Data Models](#data-models)
9. [Lead Scoring System](#lead-scoring-system)
10. [Enrichment Pipeline](#enrichment-pipeline)
11. [Export System](#export-system)
12. [Error Handling](#error-handling)
13. [Testing](#testing)
14. [Performance & Costs](#performance--costs)
15. [Troubleshooting](#troubleshooting)
16. [Development Guidelines](#development-guidelines)
17. [Changelog](#changelog)

---

## Overview

### Purpose
Gleam Lead Scraper is an internal, semi-automated lead generation system designed to discover, enrich, and score high-quality commercial restaurant leads for Gleam Pro Cleaning's nightly janitorial and recurring commercial cleaning services.

### Key Capabilities
- **Automated Discovery**: Finds commercial restaurants within 50km radius using Google Places API
- **Smart Filtering**: Excludes chains, malls, home-based businesses
- **Multi-Source Enrichment**: Extracts contact info from websites, social media, and business profiles
- **Intelligent Scoring**: 0-100 scoring system with A/B/C tier classification
- **Outreach Preparation**: Identifies decision makers and optimal contact channels
- **Google Sheets Integration**: Automated export to organized spreadsheet tabs

### Target Users
- Christine (Gleam Pro Cleaning - Sales)
- Gleam Team (Internal use only)

### Version
**V1.0** - Production Ready (January 2026)

---

## Business Context

### Problem Statement
Gleam Pro Cleaning needs a consistent pipeline of high-intent commercial restaurant leads for their nightly janitorial services. Manual lead research is time-consuming and inconsistent.

### Solution
An automated system that generates a curated **Top 20** outreach-ready leads per run, focusing on quality over quantity.

### Success Metrics
- **Lead Quality**: 80%+ of Top 20 should be valid, contactable businesses
- **Time Savings**: Reduce lead research from 8 hours to 30 minutes per week
- **Conversion Rate**: Track which lead attributes correlate with won deals
- **Cost Efficiency**: Stay within Google's $200/month free credit

### Target Lead Profile
**Ideal Lead:**
- Independent commercial restaurant
- Open 1-3 years (established but growing)
- Google rating: 3.5 - 4.6 (good but room for improvement)
- 30-300 reviews (active customer base)
- Has website with contact info
- Within 50km of New Westminster office

**Why this profile?**
- **Independent**: Decision maker is owner/operator (faster sales cycle)
- **1-3 years**: Past survival phase, ready to invest in services
- **3.5-4.6 rating**: Quality-conscious but not yet premium (price-sensitive sweet spot)
- **Contact info**: Can reach decision maker directly

---

## System Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      GLEAM LEAD SCRAPER                         │
└─────────────────────────────────────────────────────────────────┘

1. DISCOVERY PHASE
   ┌─────────────────┐
   │ Google Places   │──> Query restaurants within 50km radius
   │ API (Nearby)    │──> Fetch place details (rating, reviews, etc)
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │  Raw Leads DB   │──> Store all discovered leads
   │  (In-Memory)    │──> ~200-500 leads per run
   └────────┬────────┘
            │
            ▼
2. FILTERING PHASE
   ┌─────────────────┐
   │ Exclusion Rules │──> Remove chains, malls, no phone, etc
   │                 │──> Apply distance/rating/review filters
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │ Valid Leads     │──> ~100-200 leads remain
   │                 │
   └────────┬────────┘
            │
            ▼
3. ENRICHMENT PHASE
   ┌─────────────────┐
   │ Website Crawler │──> Extract emails, Instagram, contact names
   │ (Playwright)    │──> Crawl /contact, /about, /team pages
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │ Enriched Leads  │──> Leads with outreach data
   │                 │
   └────────┬────────┘
            │
            ▼
4. SCORING PHASE
   ┌─────────────────┐
   │ Lead Scoring    │──> Calculate 0-100 score
   │ Engine          │──> Assign A/B/C tier
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │ Ranked Leads    │──> Sorted by score (highest first)
   │                 │
   └────────┬────────┘
            │
            ▼
5. SELECTION PHASE
   ┌─────────────────┐
   │ Top 20 Filter   │──> Select highest scoring leads
   │                 │──> Enforce hard requirements
   └────────┬────────┘
            │
            ▼
6. EXPORT PHASE
   ┌─────────────────┐
   │ Google Sheets   │──> Write to multiple tabs
   │ Exporter        │──> Leads_Raw, Enriched, Top20, Settings
   └─────────────────┘
```

### Component Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYERS                        │
└──────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  CLI LAYER (Entry Point)                                     │
│  - run.js: Main orchestration script                         │
│  - Command line arguments parsing                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  SERVICE LAYER (Business Logic)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Discovery  │  │ Enrichment  │  │   Scoring   │         │
│  │  Service    │  │  Service    │  │   Service   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                               │
│  ┌─────────────┐  ┌─────────────┐                           │
│  │  Filtering  │  │   Export    │                           │
│  │  Service    │  │   Service   │                           │
│  └─────────────┘  └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PROVIDER LAYER (External APIs)                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Google Places    │  │ Google Sheets    │                │
│  │ API Client       │  │ API Client       │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                               │
│  ┌──────────────────┐                                        │
│  │ Web Crawler      │                                        │
│  │ (Playwright)     │                                        │
│  └──────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  UTILITY LAYER                                                │
│  - Geo calculations (distance, radius)                       │
│  - Deduplication (place_id uniqueness)                       │
│  - Logging (Winston)                                          │
│  - Rate limiting                                              │
│  - Retry logic                                                │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
Input: Geographic Center + Radius
            │
            ▼
     ┌──────────────┐
     │ Google Places│──> API Request (nearbySearch)
     │ Discovery    │
     └──────┬───────┘
            │ Returns: place_id, name, rating, address, etc
            ▼
     ┌──────────────┐
     │ Raw Lead     │──> Lead { place_id, business_name, ... }
     │ Normalization│
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Deduplication│──> Remove duplicate place_ids
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Hard Filters │──> Distance < 50km?
     │              │──> Has phone number?
     │              │──> Not in mall/food court?
     │              │──> Rating 3.5-4.6?
     └──────┬───────┘
            │ YES → Continue
            │ NO → exclusion_reason = "..."
            ▼
     ┌──────────────┐
     │ Chain        │──> Multi-location detection
     │ Detection    │──> Franchise keyword matching
     └──────┬───────┘
            │ Independent → Continue
            │ Chain → Exclude
            ▼
     ┌──────────────┐
     │ Business Age │──> Review date analysis
     │ Validation   │──> Website "Since" text extraction
     └──────┬───────┘
            │ Open 1+ year → Continue
            │ Too new → Exclude (low confidence)
            ▼
     ┌──────────────┐
     │ Website      │──> Crawl homepage
     │ Enrichment   │──> Crawl /contact, /about, /team
     │              │──> Extract: emails, Instagram, names
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Lead Scoring │──> Calculate score (0-100)
     │              │──> Assign tier (A/B/C)
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Sort & Rank  │──> Order by score DESC
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Top 20       │──> Select highest 20 leads
     │ Selection    │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Google Sheets│──> Export to tabs:
     │ Export       │    - Leads_Raw
     │              │    - Leads_Enriched
     │              │    - Shortlist_Top20
     │              │    - Settings
     └──────────────┘
```

---

## Technical Specifications

### Technology Stack

**Runtime**
- Node.js v18+ (ES6 modules)
- JavaScript (may migrate to TypeScript in V2)

**Core Dependencies**
```json
{
  "dependencies": {
    "@googlemaps/google-maps-services-js": "^3.3.0",
    "googleapis": "^118.0.0",
    "playwright": "^1.40.0",
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12",
    "winston": "^3.11.0",
    "dotenv": "^16.3.0"
  }
}
```

**External APIs**
- **Google Places API**: Lead discovery
  - Endpoints: `nearbySearch`, `placeDetails`
  - Quota: 100,000 requests/month (free tier)
  
- **Google Sheets API**: Data export
  - Endpoints: `spreadsheets.values.update`, `spreadsheets.batchUpdate`
  - Quota: Unlimited reads, 100 writes/100 seconds/user

**Development Tools**
- ESLint (code quality)
- Prettier (formatting)
- Jest (testing - planned for V2)

### Project Structure

```
gleam-leads/
├─ src/
│  ├─ config/
│  │  ├─ settings.json         # Runtime configuration
│  │  └─ constants.js           # Hardcoded values
│  │
│  ├─ providers/
│  │  ├─ googlePlaces.js        # Google Places API client
│  │  └─ googleSheets.js        # Google Sheets API client
│  │
│  ├─ services/
│  │  ├─ discoveryService.js    # Lead discovery orchestration
│  │  ├─ filteringService.js    # Exclusion rules application
│  │  ├─ enrichmentService.js   # Website crawling coordination
│  │  └─ scoringService.js      # Lead scoring logic
│  │
│  ├─ enrich/
│  │  ├─ websiteCrawler.js      # Playwright-based crawler
│  │  ├─ extractors.js          # Email/Instagram/Name extraction
│  │  └─ businessAgeValidator.js # Review date analysis
│  │
│  ├─ scoring/
│  │  ├─ scoreLead.js           # Main scoring function
│  │  └─ rules.js               # Scoring rule definitions
│  │
│  ├─ export/
│  │  └─ sheetsExporter.js      # Google Sheets write logic
│  │
│  ├─ utils/
│  │  ├─ geo.js                 # Distance calculations
│  │  ├─ dedupe.js              # Duplicate removal
│  │  ├─ logger.js              # Winston logger setup
│  │  ├─ retry.js               # Retry helper (planned)
│  │  └─ rateLimit.js           # Rate limiter (planned)
│  │
│  └─ run.js                    # Main entry point
│
├─ logs/
│  └─ app.log                   # Runtime logs
│
├─ .env                         # API keys (NOT committed)
├─ .env.example                 # Template for .env
├─ .gitignore
├─ package.json
├─ package-lock.json
└─ README.md
```

### File Responsibilities

**config/settings.json**
- Editable runtime parameters
- No code changes required to adjust behavior
- Examples: radius, rating ranges, exclusion keywords

**providers/googlePlaces.js**
- Wraps Google Places API
- Handles authentication
- Provides clean interface: `search(location, radius)`, `getDetails(placeId)`

**providers/googleSheets.js**
- Wraps Google Sheets API
- Handles service account authentication
- Provides methods: `writeToTab(tabName, data)`, `createTab(tabName)`

**services/discoveryService.js**
- Orchestrates lead discovery flow
- Calls Google Places provider
- Normalizes raw API responses into Lead objects

**services/filteringService.js**
- Applies all exclusion rules
- Distance validation
- Chain detection
- Business age validation
- Sets `exclusion_reason` for filtered leads

**services/enrichmentService.js**
- Coordinates website crawling
- Handles errors gracefully (some sites will fail)
- Enriches leads with: email, instagram_url, contact_person

**services/scoringService.js**
- Calculates lead scores
- Assigns tiers (A/B/C)
- Generates score breakdown explanations

**enrich/websiteCrawler.js**
- Uses Playwright to load pages
- Extracts HTML content
- Handles timeouts and errors
- Navigates to /contact, /about, /team subpages

**enrich/extractors.js**
- Parses HTML with Cheerio
- Email regex matching
- Instagram URL extraction
- Contact name heuristics (looks for "Owner", "Manager", etc)

**scoring/scoreLead.js**
- Main scoring algorithm
- Calls individual scoring rules
- Sums weighted components
- Returns score (0-100) and tier

**export/sheetsExporter.js**
- Formats data for Google Sheets
- Creates tabs if they don't exist
- Writes data in batches
- Handles API rate limits

**utils/geo.js**
- Haversine formula for distance calculation
- Input: two lat/lng pairs
- Output: distance in kilometers

**utils/dedupe.js**
- Removes duplicate leads by `place_id`
- Ensures uniqueness before export

**utils/logger.js**
- Winston logger configuration
- Logs to console and file
- Levels: error, warn, info, debug

**run.js**
- Entry point when running `node src/run.js`
- Orchestrates entire pipeline:
  1. Load config
  2. Discover leads
  3. Filter leads
  4. Enrich leads
  5. Score leads
  6. Select Top 20
  7. Export to Sheets
  8. Print summary

---

## Setup & Installation

### Prerequisites

**System Requirements**
- Node.js v18 or higher
- npm v8 or higher
- 500MB free disk space
- Internet connection (API access)

**Required Accounts**
- Google Cloud Platform account (free tier)
- Google account with access to target Google Sheet

### Installation Steps

#### 1. Clone Repository
```bash
git clone https://github.com/gleam/gleam-leads.git
cd gleam-leads
```

#### 2. Install Dependencies
```bash
npm install
```

This installs:
- Google Maps API client
- Google Sheets API client
- Playwright (includes Chromium browser)
- Axios, Cheerio, Winston, dotenv

#### 3. Set Up Google Cloud Project

**a) Create Project**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click "New Project"
3. Name: "Gleam Lead Scraper"
4. Click "Create"

**b) Enable APIs**
1. Navigate to "APIs & Services" > "Library"
2. Search and enable:
   - **Places API (New)**
   - **Google Sheets API**

**c) Create API Key (for Places API)**
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "API Key"
3. Copy the key
4. Click "Restrict Key"
   - Application restrictions: None
   - API restrictions: Places API only
5. Save

**d) Create Service Account (for Sheets API)**
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Name: "gleam-sheets-writer"
4. Role: None needed (we'll grant Sheet-specific access)
5. Click "Done"
6. Click on created service account
7. Go to "Keys" tab
8. Click "Add Key" > "Create new key" > JSON
9. Save the JSON file as `service-account.json` in project root
10. Copy the email address (looks like: `gleam-sheets-writer@project-id.iam.gserviceaccount.com`)

**e) Configure Billing**
1. Go to "Billing"
2. Link a payment method (credit card required, but won't be charged in free tier)
3. Set budget alert at $10/month (safety measure)

**f) Set Usage Quotas**
1. Go to "APIs & Services" > "Places API" > "Quotas"
2. Set daily request limit: 3,000 (prevents runaway costs)

#### 4. Set Up Google Sheet

**a) Create Sheet**
1. Go to [Google Sheets](https://sheets.google.com)
2. Create new spreadsheet
3. Name: "Gleam Leads - [Current Year]"
4. Copy the Spreadsheet ID from URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```

**b) Share with Service Account**
1. Click "Share" button
2. Paste service account email
3. Set permission: **Editor**
4. Uncheck "Notify people"
5. Click "Share"

#### 5. Configure Environment Variables

Create `.env` file in project root:

```bash
cp .env.example .env
```

Edit `.env`:
```bash
# Google Places API
GOOGLE_PLACES_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Google Sheets API
GOOGLE_SHEET_ID=1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t
SERVICE_ACCOUNT_PATH=./service-account.json

# Office Location (anchor point)
OFFICE_LAT=49.2026
OFFICE_LNG=-122.9106
OFFICE_ADDRESS=6–1209 4th Avenue, New Westminster, BC V3M 1T8

# Search Parameters
SEARCH_RADIUS_KM=50
RATING_MIN=3.5
RATING_MAX=4.6
REVIEW_MIN=10
REVIEW_MAX=500

# Operational
LOG_LEVEL=info
MAX_CONCURRENT_CRAWLS=3
CRAWL_TIMEOUT_MS=15000
```

#### 6. Verify Installation

Run test command:
```bash
npm run test-setup
```

Expected output:
```
✓ Node.js version: v18.x.x
✓ Dependencies installed
✓ Google Places API key valid
✓ Google Sheets API accessible
✓ Service account authenticated
✓ Target sheet writable
✓ Playwright browser installed

All systems ready!
```

#### 7. First Run (Dry Run)

```bash
npm run dry-run
```

This will:
- Discover 10 leads (limited)
- Log all steps without writing to Sheets
- Verify entire pipeline works

---

## Configuration

### settings.json Structure

Location: `src/config/settings.json`

```json
{
  "search": {
    "radius_km": 50,
    "center": {
      "lat": 49.2026,
      "lng": -122.9106,
      "address": "6–1209 4th Avenue, New Westminster, BC V3M 1T8"
    },
    "place_types": ["restaurant"],
    "exclude_types": ["food_court", "shopping_mall"]
  },
  
  "filters": {
    "rating": {
      "min": 3.5,
      "max": 4.6,
      "reason": "Quality-conscious but not yet premium"
    },
    "reviews": {
      "min": 10,
      "max": 500,
      "reason": "Active customer base, not too established"
    },
    "business_age": {
      "min_years": 1,
      "confidence_threshold": 0.7,
      "reason": "Past survival phase, ready to invest"
    }
  },
  
  "exclusions": {
    "keywords": {
      "mall": ["mall", "food court", "shopping center", "plaza"],
      "chain": ["franchise", "locations", "find us at"],
      "home_based": ["home kitchen", "home chef", "catering only"]
    },
    "require_phone": true,
    "require_physical_address": true
  },
  
  "enrichment": {
    "website": {
      "enabled": true,
      "timeout_ms": 15000,
      "pages_to_crawl": ["", "/contact", "/about", "/team"],
      "max_pages_per_site": 3
    },
    "social_media": {
      "instagram": true,
      "facebook": false,
      "twitter": false
    }
  },
  
  "scoring": {
    "weights": {
      "outreach_readiness": {
        "email_found": 20,
        "website_exists": 10,
        "instagram_found": 5,
        "contact_person_found": 5,
        "max_points": 40
      },
      "rating_fit": {
        "ideal_rating": 4.2,
        "tolerance": 0.4,
        "max_points": 25
      },
      "review_volume": {
        "ideal_min": 30,
        "ideal_max": 300,
        "max_points": 20
      },
      "independence": {
        "single_location_bonus": 15,
        "chain_penalty": -15
      }
    },
    "tiers": {
      "A": {"min": 80, "max": 100},
      "B": {"min": 65, "max": 79},
      "C": {"min": 0, "max": 64}
    }
  },
  
  "output": {
    "top_n": 20,
    "export_raw": true,
    "export_enriched": true,
    "export_settings": true
  },
  
  "operational": {
    "max_concurrent_crawls": 3,
    "retry_attempts": 3,
    "retry_delay_ms": 5000,
    "log_level": "info"
  }
}
```

### Modifying Configuration

**To change search radius:**
```json
"radius_km": 75  // Expand to 75km
```

**To adjust rating sweet spot:**
```json
"rating": {
  "min": 3.0,  // Lower threshold
  "max": 4.8   // Higher threshold
}
```

**To add exclusion keywords:**
```json
"chain": [
  "franchise",
  "locations",
  "find us at",
  "visit our other",  // New
  "multiple locations" // New
]
```

**To disable Instagram enrichment:**
```json
"social_media": {
  "instagram": false  // Set to false
}
```

**To change Top N:**
```json
"top_n": 50  // Generate Top 50 instead of Top 20
```

### Environment-Specific Configs

For different environments (dev/staging/prod):

```bash
# Development
npm run start:dev  # Uses settings.dev.json

# Production
npm run start:prod  # Uses settings.prod.json
```

---

## API Reference

### Main Entry Point

#### `run()`
Executes full lead generation pipeline.

**Usage:**
```javascript
const { run } = require('./src/run');

async function main() {
  const result = await run();
  console.log(`Generated ${result.top20.length} leads`);
}

main();
```

**Returns:**
```typescript
{
  raw_leads: Lead[],           // All discovered leads
  enriched_leads: Lead[],      // Valid + enriched leads
  top20: Lead[],               // Final shortlist
  stats: {
    total_discovered: number,
    total_excluded: number,
    total_enriched: number,
    total_scored: number,
    execution_time_ms: number
  }
}
```

---

### Discovery Service

#### `discoverLeads(center, radius)`
Searches for restaurants using Google Places API.

**Parameters:**
- `center` (Object): `{ lat: number, lng: number }`
- `radius` (number): Search radius in meters (max: 50000)

**Returns:** `Promise<RawLead[]>`

**Example:**
```javascript
const leads = await discoveryService.discoverLeads(
  { lat: 49.2026, lng: -122.9106 },
  50000 // 50km in meters
);

console.log(`Found ${leads.length} restaurants`);
```

**Error Handling:**
```javascript
try {
  const leads = await discoveryService.discoverLeads(...);
} catch (error) {
  if (error.code === 'PLACES_API_ERROR') {
    // Handle Google Places API failure
  } else if (error.code === 'QUOTA_EXCEEDED') {
    // Handle rate limit
  }
}
```

---

### Filtering Service

#### `filterLeads(leads, rules)`
Applies exclusion rules to raw leads.

**Parameters:**
- `leads` (Lead[]): Array of leads to filter
- `rules` (FilterRules): Configuration from settings.json

**Returns:** `Promise<FilterResult>`

**FilterResult:**
```typescript
{
  valid: Lead[],      // Passed all filters
  excluded: Lead[]    // Failed filters (with exclusion_reason set)
}
```

**Example:**
```javascript
const result = await filteringService.filterLeads(rawLeads, config.filters);

console.log(`Valid: ${result.valid.length}`);
console.log(`Excluded: ${result.excluded.length}`);

// Exclusion reasons breakdown
const reasons = result.excluded.reduce((acc, lead) => {
  acc[lead.exclusion_reason] = (acc[lead.exclusion_reason] || 0) + 1;
  return acc;
}, {});

console.log('Exclusions:', reasons);
// Output: { "No phone number": 45, "Chain detected": 23, ... }
```

---

### Enrichment Service

#### `enrichLeads(leads, config)`
Crawls websites to extract contact information.

**Parameters:**
- `leads` (Lead[]): Leads to enrich
- `config` (EnrichmentConfig): Enrichment settings

**Returns:** `Promise<EnrichedLead[]>`

**EnrichedLead extends Lead:**
```typescript
{
  ...Lead,
  email_found: string | null,
  instagram_url: string | null,
  contact_person: string | null,
  enrichment_attempted: boolean,
  enrichment_success: boolean,
  enrichment_error: string | null
}
```

**Example:**
```javascript
const enriched = await enrichmentService.enrichLeads(
  validLeads,
  config.enrichment
);

const withEmail = enriched.filter(l => l.email_found);
console.log(`Found emails for ${withEmail.length} leads`);
```

**Concurrent Processing:**
Enrichment runs in batches to avoid overwhelming target sites:
```javascript
// Internal implementation detail
const batches = chunk(leads, config.max_concurrent_crawls);
for (const batch of batches) {
  await Promise.all(batch.map(lead => enrichLead(lead)));
}
```

---

### Scoring Service

#### `scoreLeads(leads, weights)`
Calculates scores and assigns tiers.

**Parameters:**
- `leads` (EnrichedLead[]): Leads to score
- `weights` (ScoringWeights): Scoring configuration

**Returns:** `Promise<ScoredLead[]>`

**ScoredLead extends EnrichedLead:**
```typescript
{
  ...EnrichedLead,
  lead_score: number,        // 0-100
  lead_tier: 'A' | 'B' | 'C',
  score_breakdown: {
