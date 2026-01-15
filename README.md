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
    outreach_readiness: number,  // 0-40
    rating_fit: number,          // 0-25
    review_volume: number,       // 0-20
    independence: number         // 0-15
  },
  score_reason_summary: string
}
```

**Example:**
```javascript
const scored = await scoringService.scoreLeads(enrichedLeads, config.scoring.weights);

// Group by tier
const byTier = {
  A: scored.filter(l => l.lead_tier === 'A'),
  B: scored.filter(l => l.lead_tier === 'B'),
  C: scored.filter(l => l.lead_tier === 'C')
};

console.log('Distribution:', {
  A: byTier.A.length,
  B: byTier.B.length,
  C: byTier.C.length
});
```

#### `scoreLead(lead, weights)`
Scores a single lead.

**Parameters:**
- `lead` (EnrichedLead): Single lead
- `weights` (ScoringWeights): Scoring weights

**Returns:** `ScoredLead`

**Example:**
```javascript
const score = scoringService.scoreLead(lead, weights);

console.log(`${lead.business_name}: ${score.lead_score} (${score.lead_tier})`);
console.log('Breakdown:', score.score_breakdown);
// {
//   outreach_readiness: 35,  // Has email, website, Instagram
//   rating_fit: 22,          // 4.1 rating (near ideal)
//   review_volume: 18,       // 120 reviews (ideal range)
//   independence: 15         // Single location
// }
```

---

### Export Service

#### `exportToSheets(data, sheetId)`
Writes lead data to Google Sheets.

**Parameters:**
- `data` (ExportData): Object containing all tabs
- `sheetId` (string): Google Sheets ID

**ExportData:**
```typescript
{
  raw_leads: Lead[],
  enriched_leads: EnrichedLead[],
  top20: ScoredLead[],
  settings: Object
}
```

**Returns:** `Promise<ExportResult>`

**ExportResult:**
```typescript
{
  success: boolean,
  tabs_created: string[],
  tabs_updated: string[],
  rows_written: {
    Leads_Raw: number,
    Leads_Enriched: number,
    Shortlist_Top20: number,
    Settings: number
  },
  errors: Array<{tab: string, error: string}>
}
```

**Example:**
```javascript
const exportData = {
  raw_leads: allLeads,
  enriched_leads: enrichedLeads,
  top20: topLeads,
  settings: config
};

const result = await sheetsExporter.exportToSheets(
  exportData,
  process.env.GOOGLE_SHEET_ID
);

if (result.success) {
  console.log('Export complete!');
  console.log('Rows written:', result.rows_written);
} else {
  console.error('Export errors:', result.errors);
}
```

#### `writeToTab(tabName, data, sheetId)`
Writes to a specific tab.

**Parameters:**
- `tabName` (string): Sheet tab name
- `data` (any[][]): 2D array of values
- `sheetId` (string): Google Sheets ID

**Returns:** `Promise<void>`

**Example:**
```javascript
// Custom export
const customData = [
  ['Business Name', 'Phone', 'Score'],
  ['Joe\'s Pizza', '604-555-1234', 85],
  ['Sushi Haven', '604-555-5678', 92]
];

await sheetsExporter.writeToTab('Custom_List', customData, sheetId);
```

---

### Utility Functions

#### geo.calculateDistance(point1, point2)
Calculates distance between two coordinates using Haversine formula.

**Parameters:**
- `point1` (Object): `{ lat: number, lng: number }`
- `point2` (Object): `{ lat: number, lng: number }`

**Returns:** `number` (distance in kilometers)

**Example:**
```javascript
const { calculateDistance } = require('./utils/geo');

const office = { lat: 49.2026, lng: -122.9106 };
const restaurant = { lat: 49.2467, lng: -122.8838 };

const distance = calculateDistance(office, restaurant);
console.log(`${distance.toFixed(2)} km away`);
// Output: 5.43 km away
```

#### dedupe.removeDuplicates(leads, key)
Removes duplicate leads by specified key.

**Parameters:**
- `leads` (Lead[]): Array of leads
- `key` (string): Property to dedupe by (default: 'place_id')

**Returns:** `Lead[]`

**Example:**
```javascript
const { removeDuplicates } = require('./utils/dedupe');

const uniqueLeads = removeDuplicates(allLeads, 'place_id');
console.log(`Removed ${allLeads.length - uniqueLeads.length} duplicates`);
```

#### logger
Winston-based logger instance.

**Methods:**
- `logger.error(message, meta?)`
- `logger.warn(message, meta?)`
- `logger.info(message, meta?)`
- `logger.debug(message, meta?)`

**Example:**
```javascript
const { logger } = require('./utils/logger');

logger.info('Starting lead discovery');
logger.debug('Search params:', { radius: 50, center: office });
logger.warn('Rate limit approaching', { remaining: 100 });
logger.error('API call failed', { error: err.message });
```

**Log Output Format:**
```
2024-01-15 14:32:45 [INFO]: Starting lead discovery
2024-01-15 14:32:46 [DEBUG]: Search params: {"radius":50,"center":{"lat":49.2026,"lng":-122.9106}}
```

---

## Data Models

### Lead (Base)
Core lead structure from Google Places API.

```typescript
interface Lead {
  // Identity
  place_id: string;              // Google's unique identifier
  business_name: string;
  category: string;              // e.g., "Italian Restaurant"
  
  // Location
  address: string;
  lat: number;
  lng: number;
  distance_km: number;           // From office
  
  // Quality Indicators
  google_rating: number;         // 1.0 - 5.0
  review_count: number;
  
  // Contact
  phone: string | null;
  website: string | null;
  
  // Metadata
  google_maps_url: string;
  hours: Object | null;          // Opening hours
  discovered_at: Date;
}
```

### EnrichedLead
Lead with website scraping results.

```typescript
interface EnrichedLead extends Lead {
  // Enrichment Results
  email_found: string | null;
  instagram_url: string | null;
  contact_person: string | null;
  
  // Enrichment Status
  enrichment_attempted: boolean;
  enrichment_success: boolean;
  enrichment_error: string | null;
  enriched_at: Date | null;
  
  // Outreach Readiness
  outreach_ready: 'Y' | 'N';
  best_contact_method: 'email' | 'sms' | 'instagram' | 'phone';
}
```

### ScoredLead
Lead with scoring and tier assignment.

```typescript
interface ScoredLead extends EnrichedLead {
  // Scoring
  lead_score: number;            // 0-100
  lead_tier: 'A' | 'B' | 'C';
  
  // Score Breakdown
  score_breakdown: {
    outreach_readiness: number;  // 0-40
    rating_fit: number;          // 0-25
    review_volume: number;       // 0-20
    independence: number;        // 0-15
  };
  
  score_reason_summary: string;  // Human-readable explanation
  scored_at: Date;
}
```

### FilteredLead
Lead that failed filters (for audit trail).

```typescript
interface FilteredLead extends Lead {
  is_excluded: boolean;          // Always true
  exclusion_reason: string;      // Why it was excluded
  excluded_at: Date;
}
```

**Common exclusion_reason values:**
- `"No phone number"`
- `"Outside radius (>50km)"`
- `"Rating outside range (not 3.5-4.6)"`
- `"Chain/franchise detected"`
- `"Mall or food court location"`
- `"Home-based business"`
- `"Business age <1 year"`

---

## Lead Scoring System

### Scoring Philosophy
Quality over quantity. We want leads that are:
1. **Contactable**: Email/phone/Instagram available
2. **Right fit**: 3.5-4.6 rating (quality-conscious but not premium)
3. **Active**: Enough reviews to indicate regular customers
4. **Independent**: Owner/operator can make quick decisions

### Scoring Formula

**Total Score = Outreach + Rating + Reviews + Independence**

#### 1. Outreach Readiness (0-40 points)
```
Email found:          +20
Website exists:       +10
Instagram found:      +5
Contact person found: +5
```

**Rationale:** Email is king for B2B outreach. Website shows professionalism. Instagram indicates social media presence. Knowing a name personalizes outreach.

**Example:**
- Lead with email, website, Instagram, name: **40 points**
- Lead with just phone number: **0 points**

#### 2. Rating Fit (0-25 points)
Ideal rating: **4.2** (±0.4 tolerance)

```javascript
function calculateRatingScore(rating) {
  const ideal = 4.2;
  const tolerance = 0.4;
  const distance = Math.abs(rating - ideal);
  
  if (distance <= tolerance) {
    return 25; // Perfect fit
  }
  
  // Decay beyond tolerance
  const decay = (distance - tolerance) / tolerance;
  return Math.max(0, 25 - (decay * 25));
}
```

**Why 4.2?**
- **Below 3.5**: Quality issues (avoid)
- **3.5-4.2**: Good but improving (our sweet spot)
- **4.2-4.6**: Great quality, still accessible
- **Above 4.6**: Too established, less likely to need help

**Examples:**
- Rating 4.2: **25 points**
- Rating 4.0: **25 points** (within tolerance)
- Rating 3.8: **18 points**
- Rating 4.8: **12 points**

#### 3. Review Volume (0-20 points)
Ideal range: **30-300 reviews**

```javascript
function calculateReviewScore(count) {
  const min = 30;
  const max = 300;
  
  if (count < min) {
    // Too few: may be too new or not popular
    return (count / min) * 20;
  }
  
  if (count <= max) {
    // Ideal range
    return 20;
  }
  
  // Too many: too established
  return Math.max(0, 20 - ((count - max) / 100));
}
```

**Examples:**
- 15 reviews: **10 points** (too new)
- 100 reviews: **20 points** (perfect)
- 500 reviews: **0 points** (too established)

#### 4. Independence Score (0-15 points)
Detect chains/franchises using heuristics.

**Chain Detection Signals:**
- Website mentions "locations" (plural)
- Franchise keywords: "franchisee", "corporate", "find us at"
- Multiple locations in Google results
- Same phone number across multiple listings

```javascript
function calculateIndependenceScore(lead) {
  if (isChainDetected(lead)) {
    return 0; // Chains get zero points
  }
  return 15; // Independent gets full points
}
```

**Why penalize chains?**
- Longer sales cycles (corporate approval needed)
- Less flexibility in decision-making
- May already have corporate cleaning contracts

### Tier Assignment

```javascript
function assignTier(score) {
  if (score >= 80) return 'A';  // High priority
  if (score >= 65) return 'B';  // Medium priority
  if (score >= 50) return 'C';  // Low priority
  return 'D';                    // Do not contact
}
```

**Tier Characteristics:**

**A-Tier (80-100):**
- Email + website + Instagram
- Rating 3.8-4.5
- 50-250 reviews
- Independent
- **Action:** Contact immediately

**B-Tier (65-79):**
- Email or website
- Rating 3.5-4.6
- 30-300 reviews
- Independent
- **Action:** Contact if A-tier exhausted

**C-Tier (50-64):**
- Phone only
- Rating outside ideal range
- Review count off
- **Action:** Manual review, low priority

**D-Tier (<50):**
- Missing critical info
- Poor fit
- **Action:** Do not contact

### Score Reason Summary

Auto-generated explanation for each score:

**Example summaries:**
```
"Strong outreach potential (email + Instagram), excellent rating fit (4.2), ideal review count (120), confirmed independent."

"Limited contact info (phone only), rating too high (4.8 - very established), but otherwise good fit."

"No email found, rating below ideal (3.6), chain detected - low priority."
```

---

## Enrichment Pipeline

### Overview
Enrichment extracts contact information from business websites using web scraping.

### Pipeline Stages

```
Input: Lead with website URL
         ↓
1. Website Accessible?
   ├─ YES → Continue
   └─ NO → Mark enrichment_error, skip
         ↓
2. Load Homepage
   - Timeout: 15 seconds
   - User agent: Random desktop browser
   - JavaScript enabled (Playwright)
         ↓
3. Extract from Homepage
   - Emails (regex)
   - Instagram links
   - Contact names (heuristics)
         ↓
4. Navigate to Subpages
   - /contact
   - /about
   - /team
   (if exist)
         ↓
5. Extract from Subpages
   - Repeat extraction
   - Aggregate results
         ↓
6. Consolidate
   - Best email (prioritize info@, contact@)
   - Instagram (validate URL)
   - Contact person (prioritize "Owner", "Manager")
         ↓
Output: EnrichedLead
```

### Extraction Details

#### Email Extraction
**Regex Pattern:**
```javascript
const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
```

**Prioritization:**
1. `contact@domain.com`
2. `info@domain.com`
3. `hello@domain.com`
4. Any other email
5. Exclude: `noreply@`, `support@` (generic)

**Example:**
```
Found emails: 
- sales@joespizza.com
- noreply@mailchimp.com (excluded)
- joe@joespizza.com

Selected: sales@joespizza.com
```

#### Instagram Extraction
**URL Patterns:**
```javascript
const instagramRegex = /instagram\.com\/([a-zA-Z0-9._]+)/;
```

**Sources:**
1. Direct links on website
2. Social media icons (href attributes)
3. Footer links

**Validation:**
- Must be valid Instagram username
- Exclude Instagram ads links
- Verify account exists (optional, costs API quota)

#### Contact Person Extraction
**Heuristics:**
- Look for "Owner:", "Manager:", "Chef:"
- Proximity to name (within 50 chars)
- Capitalized names (e.g., "Joe Smith")
- Context keywords: "founded by", "created by", "chef"

**Example HTML:**
```html
<p>Joe's Pizza was founded by <strong>Joe Mancini</strong> in 2018...</p>
```

**Extracted:**
```json
{
  "contact_person": "Joe Mancini",
  "context": "founded by"
}
```

### Error Handling

**Crawl Failures:**
- Timeout (15s exceeded)
- SSL certificate issues
- 404/403/500 errors
- JavaScript errors

**Action:** Log error, continue pipeline (don't block other leads)

**Example Log:**
```
[WARN] Enrichment failed for "Joe's Pizza": Timeout after 15000ms
[INFO] Continuing with available data (phone only)
```

### Rate Limiting
**Respectful Crawling:**
- Max 3 concurrent requests
- 2-second delay between requests to same domain
- Respect robots.txt (future enhancement)

### Performance
**Typical Timing:**
- Homepage load: 2-5 seconds
- Subpage loads: 1-3 seconds each
- Total per lead: 5-15 seconds
- **100 leads: ~15 minutes**

---

## Export System

### Google Sheets Structure

#### Tab 1: Leads_Raw
All discovered leads (including excluded).

**Columns:**
```
A: business_name
B: category
C: google_rating
D: review_count
E: address
F: phone
G: website
H: hours (JSON string)
I: google_maps_url
J: place_id
K: lat
L: lng
M: distance_km
N: is_excluded
O: exclusion_reason
P: discovered_at
```

**Purpose:** Audit trail, re-scoring, historical analysis

#### Tab 2: Leads_Enriched
Valid leads with enrichment data.

**Columns:**
```
A-M: (same as Leads_Raw)
N: email_found
O: contact_person
P: instagram_url
Q: enrichment_attempted
R: enrichment_success
S: outreach_ready (Y/N)
T: best_contact_method
U: enriched_at
```

**Purpose:** Full lead database for review

#### Tab 3: Shortlist_Top20
Final outreach list.

**Columns:**
```
A-T: (same as Leads_Enriched)
U: lead_score
V: lead_tier (A/B/C)
W: score_breakdown (JSON)
X: score_reason_summary
Y: scored_at
```

**Purpose:** Daily outreach list for sales team

**Formatting:**
- Tier A: Green background
- Tier B: Yellow background
- Tier C: Orange background
- Header row: Bold, frozen

#### Tab 4: Settings
Runtime configuration snapshot.

**Format:**
```
A: Setting Name      | B: Value
--------------------|----------
Radius (km)         | 50
Rating Min          | 3.5
Rating Max          | 4.6
Review Min          | 10
Review Max          | 500
Top N Leads         | 20
Run Date            | 2024-01-15
```

**Purpose:** Track what settings produced these leads

### Export Process

**1. Tab Creation**
Check if tabs exist, create if missing:
```javascript
const tabs = await sheetsAPI.getTabNames(sheetId);
if (!tabs.includes('Leads_Raw')) {
  await sheetsAPI.createTab('Leads_Raw', sheetId);
}
```

**2. Data Formatting**
Convert Lead objects to 2D arrays:
```javascript
function formatLeadsForSheet(leads) {
  return [
    ['Business Name', 'Phone', 'Score', ...], // Header
    ...leads.map(lead => [
      lead.business_name,
      lead.phone,
      lead.lead_score,
      ...
    ])
  ];
}
```

**3. Batch Write**
Write all tabs in single API call (efficiency):
```javascript
await sheetsAPI.batchUpdate([
  { range: 'Leads_Raw!A1', values: rawData },
  { range: 'Leads_Enriched!A1', values: enrichedData },
  { range: 'Shortlist_Top20!A1', values: top20Data },
  { range: 'Settings!A1', values: settingsData }
]);
```

**4. Formatting**
Apply conditional formatting (colors, bold headers):
```javascript
await sheetsAPI.formatTierColors('Shortlist_Top20', 'V2:V21');
await sheetsAPI.freezeHeader('Shortlist_Top20');
```

### Manual Edits
Users can edit Settings tab, changes will be reflected in next run:
```javascript
// Before run, read Settings tab
const userSettings = await sheetsAPI.readSettings(sheetId);
const config = mergeSettings(defaultConfig, userSettings);
```

---

## Error Handling

### Error Categories

#### 1. API Errors
**Google Places API:**
- `OVER_QUERY_LIMIT`: Rate limit exceeded
- `REQUEST_DENIED`: Invalid API key
- `INVALID_REQUEST`: Malformed parameters
- `ZERO_RESULTS`: No places found

**Action:**
- Retry with exponential backoff (3 attempts)
- Log error details
- Fail gracefully with partial results

**Example:**
```javascript
try {
  const places = await googlePlaces.nearby(center, radius);
} catch (error) {
  if (error.status === 'OVER_QUERY_LIMIT') {
    logger.warn('Rate limit hit, waiting 60s...');
    await sleep(60000);
    return retry(googlePlaces.nearby, 2);
  }
  throw error;
}
```

#### 2. Crawl Errors
**Website Scraping:**
- Timeout (15s)
- DNS resolution failure
- SSL certificate invalid
- 403 Forbidden (blocking bot)
- 404 Not Found
- JavaScript errors

**Action:**
- Log error
- Mark `enrichment_error`
- Continue with available data (phone)
- Don't block other leads

**Example:**
```javascript
try {
  await page.goto(url, { timeout: 15000 });
} catch (error) {
  logger.warn(`Crawl failed for ${url}:`, error.message);
  return {
    ...lead,
    enrichment_attempted: true,
    enrichment_success: false,
    enrichment_error: error.message
  };
}
```

#### 3. Export Errors
**Google Sheets API:**
- Permission denied (service account not shared)
- Quota exceeded (100 writes/100s)
- Invalid range
- Sheet not found

**Action:**
- Retry once after 5s
- Log detailed error
- Save data to local CSV backup

**Example:**
```javascript
try {
  await sheetsAPI.write(data);
} catch (error) {
  logger.error('Sheets export failed:', error);
  
  // Backup to CSV
  const csv = convertToCSV(data);
  fs.writeFileSync('./backup_leads.csv', csv);
  logger.info('Data saved to backup_leads.csv');
}
```

### Retry Strategy

```javascript
async function retry(fn, attempts = 3, delay = 5000) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === attempts - 1) throw error;
      
      logger.warn(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
      await sleep(delay);
      delay *= 2; // Exponential backoff
    }
  }
}
```

### Logging

**Log Levels:**
- `ERROR`: Critical failures (API auth, export failure)
- `WARN`: Recoverable issues (crawl timeout, excluded leads)
- `INFO`: Normal operations (pipeline progress)
- `DEBUG`: Detailed traces (raw API responses)

**Log Location:**
- Console: All levels
- File (`logs/app.log`): ERROR and WARN only

**Example Output:**
```
2024-01-15 14:30:00 [INFO]: Starting lead discovery...
2024-01-15 14:30:15 [INFO]: Found 234 restaurants
2024-01-15 14:30:16 [INFO]: Applying filters...
2024-01-15 14:30:17 [WARN]: Excluded 89 leads (chains, no phone, etc)
2024-01-15 14:30:18 [INFO]: Enriching 145 leads...
2024-01-15 14:32:45 [WARN]: Crawl timeout for https://example.com
2024-01-15 14:35:12 [INFO]: Enrichment complete (132/145 successful)
2024-01-15 14:35:13 [INFO]: Scoring leads...
2024-01-15 14:35:14 [INFO]: Top 20 selected
2024-01-15 14:35:15 [INFO]: Exporting to Google Sheets...
2024-01-15 14:35:20 [INFO]: ✓ Export complete!
```

---

## Testing

### Test Strategy

**Unit Tests** (Individual functions)
- Geo calculations
- Email extraction regex
- Scoring formulas
- Deduplication

**Integration Tests** (API interactions)
- Google Places API mocking
- Google Sheets API mocking
- Website crawling (with fixtures)

**End-to-End Tests** (Full pipeline)
- Dry run with limited scope (10 leads)
- Validate output structure
- Check Google Sheets write

### Running Tests

```bash
# All tests
npm test

# Specific test file
npm test -- geo.test.js

# With coverage
npm run test:coverage

# Watch mode (during development)
npm run test:watch
```

### Example Test

```javascript
// tests/utils/geo.test.js
const { calculateDistance } = require('../../src/utils/geo');

describe('calculateDistance', () => {
  it('calculates distance between two points', () => {
    const point1 = { lat: 49.2026, lng: -122.9106 };
    const point2 = { lat: 49.2467, lng: -122.8838 };
    
    const distance = calculateDistance(point1, point2);
    
    expect(distance).toBeCloseTo(5.43, 1); // ~5.43 km
  });
  
  it('returns 0 for same point', () => {
    const point = { lat: 49.2026, lng: -122.9106 };
    
    const distance = calculateDistance(point, point);
    
    expect(distance).toBe(0);
  });
});
```

### Test Coverage Goals
- **Utilities**: 95%+ (pure functions)
- **Services**: 80%+ (business logic)
- **Providers**: 70%+ (API wrappers, harder to test)
- **Overall**: 80%+

---

## Performance & Costs

### Execution Time

**Typical Run (50km radius):**
- Discovery: ~30 seconds (200-300 places)
- Filtering: ~2 seconds
- Enrichment: ~15 minutes (100-150 sites, 3 concurrent)
- Scoring: ~1 second
- Export: ~5 seconds
- **Total: ~16 minutes**

**Optimization Tips:**
- Increase `max_concurrent_crawls` (risk: overwhelming sites)
- Reduce crawl timeout (miss some data)
- Skip subpage crawling (faster but less data)

### API Costs

**Google Places API:**
- Nearby Search: $0.032 per request
- Place Details: $0.017 per request
- Typical run: ~300 nearby + ~150 details = **$13.05**

**With Free Tier:**
- $200 free credit per month
- ~15 full runs per month = **$0 cost**

**Google Sheets API:**
- Free (no quota limits for our usage)

**Total Monthly Cost: $0** (within free tier)

### Cost Monitoring

**Set Budget Alert:**
```
Google Cloud Console → Billing → Budgets & Alerts
- Budget: $10/month
- Alert at 50%, 90%, 100%
```

**Usage Dashboard:**
```bash
npm run usage-report
```

Outputs:
```
=== API Usage (Current Month) ===
Google Places API:
- Nearby Search: 1,234 requests ($39.49)
- Place Details: 567 requests ($9.64)
Total: $49.13 / $200.00 (24.6%)

Remaining credit: $150.87
Estimated runs left: 11
```

### Rate Limits

**Google Places API:**
- 100,000 requests per day (free tier)
- Our typical run: ~450 requests
- **Max runs per day: 222** (no practical limit)

**Google Sheets API:**
- 100 write requests per 100 seconds per user
- Our typical run: ~4 writes
- **No practical limit**

**Website Crawling:**
- Self-imposed: 3 concurrent, 2s delay between same-domain requests
- Respectful of target sites

---

## Troubleshooting

### Common Issues

#### Issue: "OVER_QUERY_LIMIT" Error

**Symptoms:**
```
ERROR: Google Places API returned OVER_QUERY_LIMIT
```

**Causes:**
- Daily API quota exceeded (100k requests)
- Billing not enabled on Google Cloud

**Solutions:**
1. Check quota usage:
   ```bash
   npm run check-quota
   ```

2. Enable billing in Google Cloud Console

3. Wait until next day (quota resets at midnight PST)

#### Issue: "Permission denied" on Google Sheets

**Symptoms:**
```
ERROR: Failed to write to Google Sheets: Permission denied
```

**Causes:**
- Service account not shared with Sheet
- Service account email incorrect

**Solutions:**
1. Verify service account email:
   ```bash
   cat service-account.json | grep "client_email"
   ```

2. Share Sheet with this email (Editor permission)

3. Wait 1-2 minutes for permissions to propagate

#### Issue: Crawl Timeouts

**Symptoms:**
```
WARN: Crawl timeout for https://example.com (15000ms)
```

**Causes:**
- Slow website
- JavaScript-heavy site
- Server overloaded

**Solutions:**
1. Increase timeout in settings.json:
   ```json
   "enrichment": {
     "website": {
       "timeout_ms": 30000  // 30 seconds
     }
   }
   ```

2. Reduce concurrent crawls:
   ```json
   "operational": {
     "max_concurrent_crawls": 2  // Instead of 3
   }
   ```

3. Accept some data loss (phone-only leads still valuable)

#### Issue: No Leads Found

**Symptoms:**
```
INFO: Found 0 restaurants
```

**Causes:**
- Incorrect center coordinates
- Radius too small
- No restaurants in area (unlikely)

**Solutions:**
1. Verify office coordinates:
   ```bash
   # Should output: 49.2026, -122.9106
   echo $OFFICE_LAT, $OFFICE_LNG
   ```

2. Increase radius temporarily:
   ```json
   "radius_km": 75  // Test with larger area
   ```

3. Check Google Places API status:
   https://status.cloud.google.com/

#### Issue: All Leads Excluded

**Symptoms:**
```
INFO: 234 leads discovered
INFO: 234 leads excluded
INFO: 0 leads enriched
```

**Causes:**
- Filters too strict
- All leads are chains
- Rating range too narrow

**Solutions:**
1. Review exclusion breakdown:
   ```bash
   npm run analyze-exclusions
   ```

2. Relax filters temporarily:
   ```json
   "rating": {
     "min": 3.0,  // Was 3.5
     "max": 5.0   // Was 4.6
   }
   ```

3. Disable chain detection temporarily:
   ```javascript
   // In filteringService.js
   // Comment out chain detection for testing
   ```

#### Issue: Export Succeeds but No Data in Sheets

**Symptoms:**
```
INFO: ✓ Export complete!
(But Google Sheet is empty)
```

**Causes:**
- Wrong Sheet ID
- Writing to wrong tab names
- Data cleared by user/script

**Solutions:**
1. Verify Sheet ID:
   ```bash
   echo $GOOGLE_SHEET_ID
   # Compare with URL
   ```

2. Check tab names in Sheet (must match exactly):
   - Leads_Raw
   - Leads_Enriched
   - Shortlist_Top20
   - Settings

3. Check Sheet history (File → Version history)

### Debug Mode

Enable verbose logging:

```bash
LOG_LEVEL=debug npm start
```

Output includes:
- Raw API responses
- Crawl HTML snippets
- Scoring calculations step-by-step
- Detailed error traces

### Getting Help

1. **Check logs:**
   ```bash
   tail -100 logs/app.log
   ```

2. **Run diagnostics:**
   ```bash
   npm run diagnose
   ```

3. **Export debug report:**
   ```bash
   npm run export-debug-report
   # Creates debug-report-[timestamp].json
   ```

4. **Contact support:**
   - Email: gleam-support@example.com
   - Include: debug report, logs, screenshots

---

## Development Guidelines

### Code Style

**JavaScript Style:**
- ES6+ features (async/await, destructuring, etc.)
- Camelcase for variables: `leadScore`, `businessName`
- SCREAMING_SNAKE_CASE for constants: `MAX_RETRIES`, `API_KEY`
- 2-space indentation
- Single quotes for strings
- Semicolons required

**File Naming:**
- Services: `camelCase.js` (e.g., `scoringService.js`)
- Utilities: `camelCase.js` (e.g., `logger.js`)
- Tests: `*.test.js` (e.g., `geo.test.js`)

**Function Documentation:**
```javascript
/**
 * Calculates distance between two geographic points
 * @param {Object} point1 - First point {lat, lng}
 * @param {Object} point2 - Second point {lat, lng}
 * @returns {number} Distance in kilometers
 */
function calculateDistance(point1, point2) {
  // Implementation
}
```

### Git Workflow

**Branches:**
- `main`: Production-ready code
- `develop`: Integration branch
- `feature/[name]`: New features
- `fix/[name]`: Bug fixes

**Commit Messages:**
```
feat: Add Instagram enrichment
fix: Handle timeout errors in crawler
docs: Update API reference
test: Add scoring service tests
refactor: Simplify lead filtering logic
```

**Pull Request Process:**
1. Create feature branch from `develop`
2. Make changes + add tests
3. Run `npm test` and `npm run lint`
4. Create PR to `develop`
5. Get review + approval
6. Merge (squash commits)

### Adding New Features

**Example: Add Facebook enrichment**

1. **Update config schema:**
   ```json
   // settings.json
   "social_media": {
     "instagram": true,
     "facebook": true  // New
   }
   ```

2. **Create extractor:**
   ```javascript
   // src/enrich/facebookExtractor.js
   async function extractFacebookUrl(html) {
     // Implementation
   }
   ```

3. **Integrate into pipeline:**
   ```javascript
   // src/enrich/websiteCrawler.js
   const facebook = await facebookExtractor.extract(html);
   lead.facebook_url = facebook;
   ```

4. **Update data model:**
   ```typescript
   // types/Lead.ts
   interface EnrichedLead {
     // ...
     facebook_url: string | null;  // New
   }
   ```

5. **Update export:**
   ```javascript
   // src/export/sheetsExporter.js
   const headers = [
     'business_name',
     // ...
     'instagram_url',
     'facebook_url'  // New
   ];
   ```

6. **Add tests:**
   ```javascript
   // tests/enrich/facebookExtractor.test.js
   describe('extractFacebookUrl', () => {
     it('extracts facebook URL from HTML', () => {
       // Test implementation
     });
   });
   ```

7. **Update documentation:**
   - README.md
   - CHANGELOG.md
   - API reference

### Testing Checklist

Before committing:
- [ ] All tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] New code has tests (80%+ coverage)
- [ ] No console.logs (use logger)
- [ ] No hardcoded values (use config)
- [ ] Error handling added
- [ ] Documentation updated

### Code Review Checklist

Reviewers check:
- [ ] Code follows style guide
- [ ] Tests are comprehensive
- [ ] Error handling is robust
- [ ] No security issues (API keys, etc.)
- [ ] Performance is acceptable
- [ ] Documentation is clear
- [ ] Backwards compatible (or migration plan)

---

## Changelog

### v1.0.0 (January 2026)
**Initial Release**

**Features:**
- Google Places API integration
- 50km radius search
- Hard exclusion rules (chains, malls, no phone)
- Website enrichment (email, Instagram, contact)
- Lead scoring (0-100, A/B/C tiers)
- Google Sheets export (4 tabs)
- CLI interface

**Technical:**
- Node.js 18+
- Playwright web scraping
- Winston logging
- 80%+ test coverage

**Known Limitations:**
- No database (in-memory only)
- No lead history tracking
- Manual outreach (no automation)
- Single-threaded enrichment
- No competitive intelligence

**Cost:**
- $0/month (within Google free tier)

### Future Roadmap

#### v1.1 (Q1 2026) - Planned
- [ ] SQLite database for lead persistence
- [ ] Lead deduplication across runs
- [ ] Enhanced business age validation
- [ ] Facebook enrichment
- [ ] Improved chain detection

#### v1.2 (Q2 2026) - Planned
- [ ] Job queue for async processing
- [ ] Parallel crawling (5+ concurrent)
- [ ] Conversion tracking
- [ ] Dynamic scoring weights
- [ ] Performance dashboard

#### v2.0 (Q3 2026) - Planned
- [ ] TypeScript migration
- [ ] PostgreSQL database
- [ ] Web UI (React)
- [ ] Claude AI contact extraction
- [ ] Automated outreach templates
- [ ] Multi-user support

---

## Appendix

### A. Google Places API Reference

**Place Types Used:**
- `restaurant`: Primary type
- Excluded: `meal_delivery`, `meal_takeaway`, `cafe`

**Fields Retrieved:**
```
- place_id (unique identifier)
- name (business name)
- formatted_address
- geometry.location (lat/lng)
- rating
- user_ratings_total (review count)
- formatted_phone_number
- website
- opening_hours
- types (categories)
```

**Request Example:**
```javascript
const response = await placesClient.placesNearby({
  location: { lat: 49.2026, lng: -122.9106 },
  radius: 50000,  // 50km in meters
  type: 'restaurant',
  language: 'en'
});
```

### B. Scoring Examples

**Example 1: High Score (A-Tier)**
```
Business: Sushi Garden
Rating: 4.3 ⭐ (145 reviews)
Contact: email + website + Instagram + "Chef Tanaka"
Independence: Single location

Score Breakdown:
- Outreach: 40/40 (email + website + IG + name)
- Rating: 25/25 (4.3 is ideal)
- Reviews: 20/20 (145 in sweet spot)
- Independence: 15/15 (confirmed single location)
Total: 100/100 (A-Tier)
```

**Example 2: Medium Score (B-Tier)**
```
Business: Pasta Palace
Rating: 3.9 ⭐ (67 reviews)
Contact: website only (no email found)
Independence: Single location

Score Breakdown:
- Outreach: 10/40 (website only)
- Rating: 20/25 (3.9 slightly below ideal)
- Reviews: 18/20 (67 reviews, good)
- Independence: 15/15 (single location)
Total: 63/100 (B-Tier)
```

**Example 3: Low Score (C-Tier)**
```
Business: Pizza Chain Express
Rating: 4.7 ⭐ (1,240 reviews)
Contact: phone only
Independence: Chain (multiple locations)

Score Breakdown:
- Outreach: 0/40 (phone only)
- Rating: 12/25 (4.7 too high)
- Reviews: 0/20 (1,240 too many)
- Independence: 0/15 (chain detected)
Total: 12/100 (C-Tier)
```

### C. Sample Output

**Console Output:**
```
╔════════════════════════════════════════════════════╗
║        GLEAM LEAD SCRAPER v1.0.0                   ║
╚════════════════════════════════════════════════════╝

[14:30:00] Starting lead discovery...
[14:30:15] ✓ Found 234 restaurants within 50km
[14:30:16] Applying filters...
[14:30:17] ✓ 145 leads passed filters (89 excluded)

Exclusion Breakdown:
  - Chains/franchises: 34
  - No phone number: 28
  - Mall/food court: 15
  - Rating outside range: 12

[14:30:18] Enriching 145 leads...
[14:32:45] ⚠ 13 crawl timeouts (acceptable)
[14:35:12] ✓ Enrichment complete (132/145 successful)

Enrichment Results:
  - Emails found: 89 (67%)
  - Instagram found: 76 (58%)
  - Contact names: 45 (34%)

[14:35:13] Scoring leads...
[14:35:14] ✓ Scored 132 leads

Score Distribution:
  - A-Tier (80-100): 23 leads
  - B-Tier (65-79): 47 leads
  - C-Tier (50-64): 62 leads

[14:35:14] Selecting Top 20...
[14:35:14] ✓ Top 20 selected (18 A-tier, 2 B-tier)

[14:35:15] Exporting to Google Sheets...
[14:35:20] ✓ Export complete!

╔════════════════════════════════════════════════════╗
║                   RUN SUMMARY                      ║
╠════════════════════════════════════════════════════╣
║ Total discovered:     234 leads                    ║
║ Excluded:             89 leads                     ║
║ Enriched:            132 leads                     ║
║ Top 20 generated:     20 leads                     ║
║                                                    ║
║ Execution time:      ~16 minutes                   ║
║ API cost:            $12.85 (within free tier)     ║
║                                                    ║
║ Next steps:                                        ║
║ 1. Review Top 20 in Google Sheets                  ║
║ 2. Begin outreach (email/SMS/Instagram)            ║
║ 3. Track conversions                               ║
╚════════════════════════════════════════════════════╝

Google Sheet: https://docs.google.com/spreadsheets/d/[SHEET_ID]
```

### D. Environment Variables Reference

```bash
# Required
GOOGLE_PLACES_API_KEY=        # From Google Cloud Console
GOOGLE_SHEET_ID=              # From Google Sheet URL
SERVICE_ACCOUNT_PATH=         # Path to JSON key file

# Office Location
OFFICE_LAT=49.2026           # Office latitude
OFFICE_LNG=-122.9106         # Office longitude
OFFICE_ADDRESS=              # Human-readable address

# Search Parameters
SEARCH_RADIUS_KM=50          # Search radius
RATING_MIN=3.5               # Minimum rating
RATING_MAX=4.6               # Maximum rating
REVIEW_MIN=10                # Minimum reviews
REVIEW_MAX=500               # Maximum reviews

# Operational
LOG_LEVEL=info               # debug, info, warn, error
MAX_CONCURRENT_CRAWLS=3      # Concurrent website crawls
CRAWL_TIMEOUT_MS=15000       # Crawl timeout in milliseconds
TOP_N_LEADS=20               # Number of leads to select

# Optional
ENABLE_DEBUG_MODE=false      # Extended logging
DRY_RUN=false                # Skip Sheets export
BACKUP_TO_CSV=true           # Create CSV backup
```

### E. Dependencies

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
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "eslint": "^8.55.0",
    "prettier": "^3.1.0",
    "@types/node": "^20.10.0"
  }
}
```

### F. License

**Internal Use Only**
This software is proprietary to Gleam Pro Cleaning and is not licensed for external use, modification, or distribution.

© 2026 Gleam Pro Cleaning. All rights reserved.

---

## Quick Reference Card

**Setup:**
```bash
npm install
# Configure .env
npm run test-setup
```

**Run:**
```bash
npm start                    # Full run
npm run dry-run             # Test mode
LOG_LEVEL=debug npm start   # Debug mode
```

**Utilities:**
```bash
npm test                    # Run tests
npm run lint                # Check code style
npm run check-quota         # Check API usage
npm run analyze-exclusions  # Review excluded leads
npm run export-debug-report # Create debug report
```

**Config:**
- Settings: `src/config/settings.json`
- Environment: `.env`
- Logs: `logs/app.log`

**Output:**
- Google Sheets: 4 tabs (Raw, Enriched, Top20, Settings)
- Backup: `backup_leads.csv` (if enabled)

**Support:**
- Docs: This file
- Issues: GitHub Issues
- Contact: gleam-support@example.com

---

**End of Documentation**

Last updated: January 15, 2026
Version: 1.0.0
Maintained by: rtchoux / Gleam Pro Cleaning Team
