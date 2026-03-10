# Gleam Pro Automated Lead Generation System — Design Spec

**Date:** 2026-03-10
**Status:** Approved
**Author:** Claude + User

## Overview

A fully automated weekly lead generation system for Gleam Pro Cleaning (gleampro.ca). The system discovers commercial facilities in Metro Vancouver, scores them, drafts personalized outreach messages, and delivers results to Google Sheets — ready for manual outreach.

## Goals

- Run unattended weekly, results waiting for review
- Deliver 4 high-quality, outreach-ready leads per week
- Draft personalized cold emails and DMs (3 styles each) per lead
- Keep monthly cost under $10
- No company name or pitch in initial outreach — conversation starters only

## Target Facilities

All commercial facilities within 50km of New Westminster, BC:

- Restaurants / pubs / bars
- Offices / coworking spaces
- Schools / daycares
- Medical / dental clinics
- Retail stores
- Gyms / fitness studios
- Community centers
- Industrial facilities

## Architecture

```
Discovery (Outscraper) → Filtering (Rules) → Scoring (Claude Haiku) → Drafting (Claude Haiku) → Export (Google Sheets)
```

5 sequential phases, executed as a single Node.js script triggered weekly via Windows Task Scheduler.

## Phase 1: Discovery

**API:** Outscraper Google Maps API

**Category rotation (weekly cycle):**

| Week | Categories |
|---|---|
| 1 | Restaurants, offices |
| 2 | Clinics, gyms |
| 3 | Schools, retail stores |
| 4 | Community centers, industrial facilities |
| 5 | Restart cycle |

**Search parameters:**
- Center: New Westminster, BC
- Radius: 50km (covers Metro Vancouver)
- Limit: ~50 results per category per run
- Language: English

**Data returned per business:**
- Name, address, phone, website, email
- Rating, review count, review text
- Social media links (Instagram, Facebook)
- Business category/type
- Photos count, hours of operation, business status

**Estimated volume:** ~100 businesses discovered per run.

## Phase 2: Filtering

**Hard exclusion rules:**

| Rule | Reason |
|---|---|
| Already in `seen_leads.json` | No repeat leads |
| Outside 50km radius | Beyond service area |
| No contact info (no email, no phone, no website) | Unreachable |
| Chain / franchise (matched against known list) | Corporate cleaning contracts |
| Permanently closed | Not a viable lead |

**Chain detection:** Maintained list of ~100 known franchise names. Business name matched against list.

**Deduplication file (`seen_leads.json`):**
```json
{
  "place_id_abc123": {
    "name": "Joe's Diner",
    "first_seen": "2026-03-10",
    "status": "contacted"
  }
}
```

## Phase 3: Scoring

**Model:** Claude Haiku (cheapest, fast, sufficient for scoring)

**6 weighted scoring factors (0-100 total):**

| Factor | Weight | Signals |
|---|---|---|
| Size signals | 20% | Review count, photos count, operating hours |
| Cleanliness pain | 20% | Negative reviews mentioning dirty, messy, sticky, smell, washroom |
| Location | 15% | Distance from New Westminster — closer = higher |
| Online presence | 15% | Has website, email, social media |
| Business age | 15% | Review date analysis — newer businesses score higher |
| No current cleaner | 15% | No cleaning service mentions on website/reviews |

**Per lead:** One Claude Haiku API call with structured prompt. Returns:
```json
{
  "total_score": 87,
  "factor_scores": { "size": 18, "cleanliness_pain": 16, ... },
  "reasoning": "High cleanliness pain signals in reviews, close proximity..."
}
```

**Selection:** Top 4 scores proceed to drafting.

## Phase 4: Outreach Drafting

**Model:** Claude Haiku

**3 message styles per lead:**

| Style | Tone | Approach |
|---|---|---|
| Curious Neighbor | Casual, conversational | Ask how they handle cleaning — no pitch |
| Value Lead | Helpful, knowledgeable | Share a cleaning tip relevant to their type, then ask |
| Compliment + Question | Warm, genuine | Compliment something specific, then ask about their setup |

**Per lead generates:**
- 3 email drafts (one per style)
- 3 DM drafts (one per style)

**Rules:**
- No company name in any message
- No pitch or service offering
- Goal is to start a conversation only
- Personalized using review data, business type, neighborhood

**Personalization signals:**
- Business name and type
- Specific details from reviews
- Neighborhood reference
- Business age / milestones

## Phase 5: Export to Google Sheets

**One workbook with 3 tabs:**

### Tab 1: "Weekly Leads"
| Column | Example |
|---|---|
| Week | 2026-W11 |
| Rank | 1 of 4 |
| Business Name | Joe's Bistro |
| Type | Restaurant |
| Address | 123 Main St, Burnaby |
| Distance (km) | 8.2 |
| Phone | 604-555-1234 |
| Email | joe@joesbistro.ca |
| Website | joesbistro.ca |
| Instagram | @joesbistro |
| Facebook | facebook.com/joesbistro |
| Score | 87/100 |
| Score Reasoning | High cleanliness pain, close proximity |
| Status | pending |

### Tab 2: "Outreach Drafts"
| Column | Content |
|---|---|
| Business Name | Joe's Bistro |
| Email - Curious Neighbor | draft... |
| Email - Value Lead | draft... |
| Email - Compliment | draft... |
| DM - Curious Neighbor | draft... |
| DM - Value Lead | draft... |
| DM - Compliment | draft... |

### Tab 3: "History"
| Column | Content |
|---|---|
| Business Name | Joe's Bistro |
| First Seen | 2026-03-10 |
| Score | 87 |
| Status | contacted / no-reply / replied / converted |
| Notes | (manually filled) |

User updates Status and Notes manually — lightweight CRM until real CRM is ready.

## Scheduling & Runtime

**Trigger:** Windows Task Scheduler, every Monday at 6:00 AM
**Runtime:** ~2-3 minutes per run
**Host:** User's local PC (always on)

**Run flow:**
1. Load config + `seen_leads.json`
2. Call Outscraper for this week's categories
3. Filter leads
4. Score with Claude Haiku
5. Draft outreach with Claude Haiku
6. Write to Google Sheets
7. Update `seen_leads.json`
8. Log summary
9. Exit

**Error handling:**
- Outscraper fails → retry once, then log and exit
- Claude API fails → retry once, then skip scoring/drafting, export raw leads
- Google Sheets fails → save to local CSV as backup
- All errors logged to `logs/` directory

## Tech Stack

- **Runtime:** Node.js (ES modules)
- **Discovery:** Outscraper API
- **Scoring & Drafting:** Anthropic Claude Haiku API
- **Export:** Google Sheets API
- **Logging:** Winston
- **Scheduler:** Windows Task Scheduler

## Estimated Monthly Cost

| Component | Cost |
|---|---|
| Outscraper (~400 leads/month) | ~$1.20 |
| Claude Haiku API | ~$0.05 |
| Google Sheets API | Free |
| Hosting | Free (local PC) |
| **Total** | **~$1.25 - $5/month** |

## What Changes From Current Codebase

- Replace Google Places API discovery with Outscraper API
- Keep existing filtering service structure, expand exclusion rules
- Add scoring service (new)
- Add drafting service (new)
- Add Google Sheets export service (new)
- Add `seen_leads.json` deduplication
- Add category rotation logic
- Add Windows Task Scheduler setup
- Update `package.json` with new dependencies
