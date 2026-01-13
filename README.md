# Gleam Lead Scraper (V1)
High-quality commercial restaurant lead scraper for **Gleam Pro Cleaning**

## Purpose
Gleam Lead Scraper is an internal, semi-automated Node.js application designed to generate **high-intent commercial restaurant leads** for:
- Nightly janitorial services
- Recurring commercial cleaning

The system focuses on **quality over quantity**, producing a curated **Top 20 outreach-ready leads** per run and exporting them directly to **Google Sheets**.

Target users: Christine & husband (internal use only).

---

## Key Features (V1)
- Radius-based discovery from Gleam office
- Commercial restaurants only
- Independent businesses (non-chain)
- 1+ year operational validation (best-effort)
- Automated exclusions (malls, food courts, no phone, home-based)
- Outreach enrichment (Email / Instagram / Contact person)
- Lead scoring (0–100) + Tiering (A/B/C)
- Google Sheets export

---

## Target Lead Criteria (Locked)

### Included
- Commercial restaurants
- Independent (non-chain)
- Google rating: **3.5 – 4.6**
- **Open 1+ year** (confidence-based)
- Within **50 km radius**
- Must have **phone number**

### Excluded
- Malls / food courts
- Home-based businesses
- No phone number
- Large chains / franchises

---

## Geographic Scope
**Anchor Location (Office):**
6–1209 4th Avenue
New Westminster, BC
V3M 1T8


- Radius: **50 km**
- Coverage includes:
  - New Westminster
  - Burnaby
  - Coquitlam
  - Vancouver

---

## Lead Volume Strategy
- **Top 20 leads per run**
- Quality-first
- Semi-automated human verification

---

## Data Sources
- **Google Places API** (discovery + details)
- Business websites (contact/about/team pages)
- Instagram links (from site or Google listing)

---

## Outreach Channels Supported
- SMS
- Email
- Instagram DM

> Note: No automated outreach in V1 (data collection only).

---

## Tech Stack
- Node.js
- Google Places API
- Google Sheets API
- Playwright / Axios (website crawling)
- CLI-based (no UI in V1)

---

## Project Structure
gleam-leads/
├─ src/
│ ├─ config/
│ │ └─ settings.json
│ ├─ providers/
│ │ └─ googlePlaces.js
│ ├─ enrich/
│ │ ├─ websiteCrawler.js
│ │ └─ extractors.js
│ ├─ scoring/
│ │ ├─ scoreLead.js
│ │ └─ rules.js
│ ├─ export/
│ │ └─ sheets.js
│ ├─ utils/
│ │ ├─ geo.js
│ │ ├─ dedupe.js
│ │ └─ logger.js
│ └─ run.js
├─ .env
├─ package.json
└─ README.md


---

## Google Sheets Output
The app automatically creates and updates the following tabs:

### 1️⃣ Leads_Raw
All discovered leads (including excluded).

**Fields**
- business_name
- category
- google_rating
- review_count
- address
- phone
- website
- hours
- google_maps_url
- place_id
- lat / lng
- distance_km
- exclusion_reason

---

### 2️⃣ Leads_Enriched
Valid leads with outreach enrichment.

**Additional Fields**
- email_found
- contact_person
- instagram_url
- outreach_ready (Y/N)
- best_contact_method

---

### 3️⃣ Shortlist_Top20
Final outreach list.

**Additional Fields**
- lead_score (0–100)
- lead_tier (A / B / C)
- score_reason_summary

---

### 4️⃣ Settings
Editable runtime parameters:
- radius_km
- rating_min / rating_max
- review_min / review_max
- exclusion_keywords
- chain_keywords
- scoring_weights

---

## Lead Scoring Model (0–100)

### Hard Requirements
- Phone number present
- Not mall / food court
- Within 50 km
- Open 1+ year (confidence-based)

### Scoring Breakdown
**Outreach Readiness (0–40)**
- Email found: +20
- Website exists: +10
- Instagram found: +5
- Contact person found: +5

**Rating Fit (0–25)**
- Ideal around ~4.2

**Review Volume (0–20)**
- Ideal range: 30–300

**Independence Likelihood (0–15)**
- Penalize multi-location or franchise signals

### Tier Mapping
- A: 80–100
- B: 65–79
- C: <65

---

## Open 1+ Year Validation (Best-Effort)
A lead passes if **any** signal exists:
- Earliest visible Google review ≥ 1 year
- Website text contains “Since 20XX” or “Est.”
- Review volume + activity indicates maturity

Low-confidence leads are excluded from Top 20 but retained in raw data.

---

## Execution Flow
1. Load configuration
2. Query Google Places API
3. Deduplicate results
4. Apply hard exclusions
5. Crawl website for enrichment
6. Score leads
7. Select Top 20
8. Export to Google Sheets
9. Output run summary

---

## Running the App
node src/run.js

---

## Cost
- Covered by Google’s $200/month free credit
- Expected cost: ~$0/month
- Usage caps enforced in Google Cloud Console

---


