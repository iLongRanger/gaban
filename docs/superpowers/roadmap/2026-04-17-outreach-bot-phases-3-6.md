# Outreach Bot — Remaining Phases (3 → 6)

> Roadmap for the four phases after Phase 1 (infra setup) and Phase 2 (core compliance code) are done.
> Each phase follows the same workflow: **brainstorm → spec → plan → subagent-driven implementation**.
> Don't skip the brainstorm — the design questions in each phase have multiple valid answers and need user input before code is written.

**Workflow recap (per phase):**
1. Invoke `superpowers:brainstorming` skill → resolve open design questions → write spec to `docs/superpowers/specs/YYYY-MM-DD-<phase>-design.md`
2. Invoke `superpowers:writing-plans` skill → write task-by-task plan to `docs/superpowers/plans/YYYY-MM-DD-<phase>.md`
3. Invoke `superpowers:subagent-driven-development` skill → execute plan with implementer + spec reviewer + code quality reviewer per task

---

## Bridge — Phase 2 Task 9 (manual smoke test)

Before Phase 3 begins, complete the deferred smoke test from the Phase 2 plan.

**What to do:**
1. Confirm Phase 1 setup runbook is fully checked off (`docs/superpowers/runbooks/2026-04-17-outreach-bot-phase-1-setup.md`).
2. Create `scripts/smoke-send.mjs` per Phase 2 plan §Task 9.
3. Run: `node scripts/smoke-send.mjs your-personal-email@example.com`
4. Verify in your inbox:
   - Sender shows `GleamPro Cleaning <outreach@outreach.gleampro.ca>`
   - Gmail's "Show original" reports SPF=PASS, DKIM=PASS, DMARC=PASS
   - CASL footer is visible
   - Unsubscribe link opens `https://outreach.gleampro.ca/u/<token>`
5. Delete `scripts/smoke-send.mjs` (do not commit).

**If anything fails**, troubleshoot via the Phase 1 runbook's Troubleshooting section before continuing. Don't proceed to Phase 3 with broken auth — every later phase depends on a working send path.

---

## Phase 3 — Campaign + Sequence Engine

**Goal:** Turn the manual single-send capability into an automated multi-touch sequencing engine. After this phase, you can launch a campaign of N leads and the bot sends Touch 1 / Touch 2 / Touch 3 on schedule, respecting send-windows and warm-up caps.

**Why now:** Phase 2 gave us a compliant send and unsubscribe flow but no automation. Without a sequencer, the bot can't actually run on its own.

### Open design questions (resolve in brainstorm)

1. **Touch timing precision:** Days 0/4/10 from spec — measured from Touch 1's send time, or from the start of the send-window on those days? What if Day 4 falls on a weekend?
2. **Send-window enforcement:** Strictly Mon–Fri 9am–5pm Vancouver, or extend slightly to use full window if the queue is large?
3. **Warm-up ramp:** What does Week 1 look like (5 emails total? 10? per day?), and how does the cap escalate weekly? Hard-coded ladder or stored in `system_settings`?
4. **Lead intake:** Does the discovery pipeline (existing `scoringService` + Outscraper) push leads into a campaign automatically, or does the operator manually approve each lead first?
5. **Pause/resume semantics:** Can a campaign be paused mid-sequence? If a sequence is paused for 5 days, do the un-sent touches catch up or shift forward?
6. **Concurrency:** Single sender (1 user) means strictly serial sends. What's the minimum gap between sends to look natural — 30 seconds? 2 minutes? Random jitter?

### Components to build

**Services:**
- `src/services/sequenceScheduler.js` — given a campaign_lead, produces the schedule for Touches 1/2/3 respecting send-window + send-days
- `src/services/sendQueueWorker.js` — runs every minute (cron), pulls due `email_sends` rows, sends them, updates status
- `src/services/warmupCapService.js` — checks today's send count against the configured cap, blocks/permits new sends
- `src/services/campaignService.js` — start/pause/cancel a campaign, intake leads, derive draft email bodies via existing `claudeDraftService`

**Web (Next.js):**
- `src/web/app/(authed)/campaigns/page.tsx` — list of campaigns
- `src/web/app/(authed)/campaigns/new/page.tsx` — create from preset + lead source
- `src/web/app/(authed)/campaigns/[id]/page.tsx` — detail view (later expanded in Phase 5)

**Background:**
- Wire `sendQueueWorker` into the existing `node-cron` startup at `src/web/instrumentation.ts`. Fires every minute during send-window, every 5 minutes outside it.

**DB:**
- No new tables (Phase 2 schema covers this). May add indexes on `email_sends(status, scheduled_for)` and `campaign_leads(campaign_id, status)`.

### Build order (rough)

1. `sequenceScheduler` — pure function, schedule-only, no I/O
2. `warmupCapService` — DB read against `email_sends` per-day count
3. `campaignService.create()` + `intake()` — bring leads into a campaign with initial Touch 1 row scheduled
4. `sendQueueWorker.tick()` — pull due rows, hand off to `gmailService` + `emailTemplateService`, update status
5. Cron wiring + idempotency guard (don't send if already sent, don't double-tick)
6. Campaigns list/create/detail pages (basic — full UI in Phase 5)
7. Integration test: launch campaign with 3 mocked leads → fast-forward time → assert all 9 sends executed in correct order

### Acceptance criteria

- [ ] A campaign of 5 leads, started at 9:00am Monday, results in 5 Touch-1 sends spaced ≥1 minute apart, all within the send-window
- [ ] Touch 2 fires for each lead 4 weekdays later (skipping weekends)
- [ ] Warm-up cap of 10/day refuses the 11th send and logs it as `deferred`, retrying next morning
- [ ] If a lead's `campaign_lead.status` becomes `unsubscribed` or `replied` (Phase 4), all future scheduled sends for that lead are cancelled
- [ ] All sends respect Mon–Fri 9–5 Vancouver time
- [ ] No regressions in the 100+ Phase 2 tests

### Phase 3 dependencies

- Phase 1 done (so the worker can actually send)
- Phase 2 done (suppression check inside `sendQueueWorker.tick()` happens before each send)

---

## Phase 4 — Reply + Bounce Poller

**Goal:** Detect replies and bounces by polling the outreach mailbox, then auto-stop sequences for affected leads. Notify operator on replies.

**Why now:** Phase 3's sequencer fires touches blindly. Without reply detection, you'd keep emailing someone who already responded — a hard credibility kill in a B2B context.

### Open design questions

1. **Polling cadence:** Every 5 minutes? Every minute? Gmail API quota is generous (1B units/day) so cost isn't the constraint — latency vs API call volume is.
2. **Reply detection method:** Match by Gmail thread ID (we store `gmail_thread_id` in `email_sends`), or full-text search? Thread ID is more reliable but misses out-of-thread replies (rare).
3. **Bounce parsing:** Parse DSN (Delivery Status Notification) bodies ourselves, or use Gmail's built-in `bounced` label/header? Gmail surfaces `X-Failed-Recipients` cleanly.
4. **Notification channel:** Desktop notification (native Windows toast), email-to-self, or just dashboard-visible? Operator preference: most likely toast since the PC is always on.
5. **Auto-suppress on hard bounce:** Definitely yes — RFC 5321 5.x.x codes mean address is dead, suppress immediately. Soft bounces (4.x.x): retry once or just suppress?
6. **Auto-reply detection:** OOO replies, vacation responders. Should those count as "replied" (stops sequence) or be filtered out?

### Components to build

**Services:**
- `src/services/replyPoller.js` — polls `users.history.list` from a stored `historyId` cursor, identifies new messages, classifies them
- `src/services/bounceParser.js` — pure function, takes a Gmail message and returns `{ kind: 'bounce' | 'reply' | 'autoresponder' | 'other', recipient?, code?, reason? }`
- `src/services/notificationService.js` — Windows toast via `node-notifier` or similar; abstraction so we can swap to email-to-self later
- Extension to `src/services/campaignService.js` — `markReplied(campaignLeadId, gmailMessageId)` cancels future sends, writes `email_events` row

**Web:**
- `src/web/app/(authed)/inbox/page.tsx` — list of recent replies awaiting operator action (mark as "interested", "not interested", "out of scope", "auto-reply")

**Cron:**
- Wire `replyPoller` into the cron schedule, every 5 minutes during business hours, every 30 minutes off-hours.

**DB:**
- Add `system_settings` row `gmail_history_cursor` to track last-seen historyId
- Insert `email_events` rows: `type IN ('replied', 'bounced_hard', 'bounced_soft', 'autoresponder')`

### Build order

1. `bounceParser` — pure, fully testable with fixture DSN bodies (collect 3–5 real bounce examples to use as test fixtures)
2. `replyPoller.poll()` — uses Gmail API `users.history.list` + `users.messages.get`, returns array of classified events; idempotent on re-runs
3. `campaignService.markReplied/markBounced` — applies events to DB, cancels future scheduled sends
4. Cron wiring + cursor persistence
5. Notification toast on first reply per lead
6. Inbox UI page (basic list; expanded in Phase 5)

### Acceptance criteria

- [ ] Sending a manual reply to a sequence email auto-cancels the next scheduled touch within 5 minutes
- [ ] A hard bounce from a fake address adds the recipient to `suppression_list` with `reason='bounced'`
- [ ] An OOO autoresponder is logged as `autoresponder` but does NOT cancel the sequence
- [ ] Operator gets a Windows toast within 5 minutes of a reply landing
- [ ] Cursor advances correctly across polls (no replays of already-processed messages)
- [ ] All Phase 2 + 3 tests still pass

### Phase 4 dependencies

- Phase 3 done (we need active sequences to interrupt)
- Gmail API `gmail.readonly` scope already granted in Phase 1 Stage 4 — no new auth needed

---

## Phase 5 — Operator Dashboard

**Goal:** Make the bot visible. Campaign pages with timelines, outcome-logging forms, system heartbeat. Without this, the operator is flying blind.

**Why now:** Phases 3 + 4 produce a lot of state (sends, replies, bounces, suppressions). The operator needs a single pane of glass to see what's happening, log meeting bookings, log signed contracts, and intervene when something looks wrong.

### Open design questions

1. **Information architecture:** Single dashboard with everything, or split pages (Campaigns / Inbox / Outcomes / Settings)? Probably split.
2. **Timeline view:** Per-lead vertical timeline (Touch 1 sent → Touch 2 sent → Reply → Marked interested → Meeting booked) or campaign-wide grid? Both useful — start with per-lead.
3. **Outcome logging UI:** Free-form notes + structured fields (meeting date, contract value)? Forms inline on the lead row, or modal?
4. **Heartbeat indicator:** Just "last cron run at HH:MM" + green/red dot, or full system status (DB connected, Gmail token valid, tunnel up)?
5. **Pagination & search:** At 10 leads/week × 52 weeks the data fits trivially in one page. But searching by business name across all campaigns will be needed eventually.
6. **Real-time updates:** SSE / polling for live campaign status, or just refresh the page? Polling every 30s is fine and simple.

### Components to build

**Web pages (Next.js App Router):**
- `src/web/app/(authed)/page.tsx` — overview: heartbeat, today's send count, recent replies
- `src/web/app/(authed)/campaigns/[id]/page.tsx` — full campaign detail: lead list with status, timeline view per lead, pause/resume buttons
- `src/web/app/(authed)/campaigns/[id]/leads/[leadId]/page.tsx` — single-lead deep dive with full email history and outcome form
- `src/web/app/(authed)/inbox/page.tsx` — replies + bounces queue with quick-action buttons
- `src/web/app/(authed)/outcomes/page.tsx` — meetings + contracts log, monthly KPI rollup (target: 1 contract/month)
- `src/web/app/(authed)/settings/page.tsx` — already exists, extend with: warm-up cap editor, send-window editor, suppression list management

**API routes:**
- `src/web/app/api/campaigns/[id]/pause/route.ts`
- `src/web/app/api/campaigns/[id]/resume/route.ts`
- `src/web/app/api/leads/[id]/outcome/route.ts` — POST a meeting / contract / disposition
- `src/web/app/api/heartbeat/route.ts` — system status JSON

**No new services** — Phase 5 is pure UI on top of Phase 3+4 data.

### Build order

1. Heartbeat route + overview page (smallest, validates infra)
2. Campaign detail page (mostly read-only at first)
3. Lead deep-dive page with outcome form (write path)
4. Inbox page with action buttons
5. Outcomes log + monthly KPI summary
6. Settings extensions (cap editor, send-window, suppression management UI)

### Acceptance criteria

- [ ] Operator can see at a glance how many emails were sent today, how many replies are waiting, system health
- [ ] Each lead's full timeline (sends + events + outcomes) is reachable in 2 clicks from the dashboard
- [ ] Outcomes (meeting booked, contract signed) are logged via UI, persisted to `meetings` / `contracts` tables, and roll up to a "1 contract this month" indicator
- [ ] Campaign pause works: clicking Pause stops new sends within 60 seconds, Resume re-enables
- [ ] Operator can manually add a domain or email to the suppression list via the settings page

### Phase 5 dependencies

- Phase 3 + 4 done (otherwise there's no data to display)

---

## Phase 6 — Operational Resilience + Week 1 Launch

**Goal:** Make the bot robust enough to run unattended on the local PC, then run the actual first warm-up campaign.

**Why now:** Everything to this point assumes the PC is on, the dev server is running, the tunnel is alive. Production needs auto-start, auto-recover, and graceful handling of the inevitable PC restart / power outage.

### Open design questions

1. **Process supervision:** Run the bot as a Windows service (via `node-windows` or NSSM), or rely on Task Scheduler with restart-on-failure? Service is cleaner.
2. **Crash recovery:** On startup, scan `email_sends` for rows in `status='sending'` (a crash mid-send would leave them dangling). What's the recovery — retry, or mark failed?
3. **Backup strategy:** Daily SQLite dump to local Documents folder? Weekly upload to Google Drive via the existing service account? Both?
4. **PC-off scenario:** If PC is off during a scheduled send-window, on next startup do we (a) catch up by sending all missed touches immediately, (b) shift the schedule forward, or (c) skip and resume normally? The spec leaned toward (c) with a 9am notification flagging the gap.
5. **Update path:** When you change code, how does the running service pick it up? Manual stop → git pull → restart, or auto-reload on file change? Auto is dangerous in prod.
6. **Health alerting:** Toast on heartbeat-stale > 10 minutes? Email to admin on Gmail API errors > 3 in a row?

### Components to build

**Process management:**
- `scripts/install-service.ps1` — installs `node-windows` service, configures auto-start
- `scripts/uninstall-service.ps1` — clean removal
- README updates for the operator: how to start/stop/restart, where the logs go

**Resilience services:**
- `src/services/startupRecovery.js` — on app boot, scans for stale `sending` rows, logs gaps in send-window coverage, sends a single startup-summary toast
- `src/services/backupService.js` — daily SQLite snapshot to `data/backups/YYYY-MM-DD.sqlite`, weekly upload to Google Drive (use existing `googleSheetsService` auth)
- `src/services/healthCheck.js` — periodic checks: DB writable, Gmail token valid, tunnel responding to HTTPS GET; persists to `system_settings.last_healthcheck`

**Cron / scheduling polish:**
- Catch-up logic in `sendQueueWorker`: if last tick was >2 hours ago AND we're in send-window now, do NOT immediately fire all the missed sends — log a gap event and resume normal cadence
- Random jitter (30s–120s) between consecutive sends to avoid robotic patterns

**Operator runbook:**
- `docs/superpowers/runbooks/2026-XX-XX-outreach-bot-operator-runbook.md` — what to do when the bot is acting up (commands, log locations, common fixes)

### Build order

1. `startupRecovery` — runs on every boot, populates the heartbeat panel
2. `healthCheck` cron + dashboard indicator
3. `backupService` (local first, then Drive)
4. `node-windows` service install + uninstall scripts, tested with a PC reboot
5. Catch-up jitter logic in `sendQueueWorker`
6. Operator runbook
7. **Launch**: warm-up Week 1 — start a campaign of 5 leads, send Touch 1 only, monitor for 2 days, verify SPF/DKIM/DMARC stay green, no spam complaints

### Acceptance criteria

- [ ] Bot survives a PC restart with no operator intervention; resumes within 2 minutes of boot
- [ ] If PC was off for 18 hours, on resume the bot does NOT immediately blast all missed sends — it logs the gap and resumes at the next scheduled time
- [ ] Daily SQLite backup file appears in `data/backups/` automatically
- [ ] Weekly Google Drive upload of latest backup succeeds and is visible in Drive
- [ ] Health check fails loudly (toast + dashboard red) when Gmail token expires
- [ ] First Week 1 warm-up campaign sends 5 emails, all reach inbox, no spam reports, no bounces
- [ ] Operator runbook covers: bot stuck, replies not detected, tunnel down, OAuth expired

### Phase 6 dependencies

- Phases 3 + 4 + 5 done (resilience layers wrap everything beneath)
- Phase 1 infra still in place

---

## After Phase 6 — Steady State

Once Phase 6 ships and the Week 1 warm-up succeeds, the project transitions from build mode to operate mode. The build is done. From here:

1. **Run weekly campaigns** through the dashboard. Target: ~10 emails/week early, ramping to 30–40/week after 4 weeks of clean reputation signals.
2. **Track the goal**: 1 new cleaning contract per month. Use the Outcomes page to log signed contracts; review monthly.
3. **Iterate based on what works**: which touch styles get reply rates? Which categories (offices vs dental vs retail) convert best? Adjust presets, tune drafting prompts, prune categories that don't convert.
4. **Observe DMARC reports** for the first 30 days. If clean, advance DMARC policy from `p=none` to `p=quarantine`, then `p=reject`.
5. **New features as needed**: A/B testing of subject lines, calendar integration for meeting booking, CRM export — all out of scope for the initial 6 phases, but possible follow-ons.

---

## Reference: workflow per phase

For each of Phases 3–6, the execution sequence is:

```
1. /brainstorm
   → Resolve open design questions above
   → Save spec to docs/superpowers/specs/YYYY-MM-DD-outreach-phase-N-design.md
2. Invoke writing-plans skill
   → Save plan to docs/superpowers/plans/YYYY-MM-DD-outreach-phase-N.md
3. Invoke subagent-driven-development skill
   → Implementer + spec reviewer + code quality reviewer per task
   → Final cross-cutting review at end of phase
4. Manual verification step (smoke test, real send, etc.)
5. Commit, no push to remote unless requested
```

Don't try to skip steps 1–2 and jump to "just write the code." The brainstorm exists because every phase has 3+ open questions where the wrong answer wastes weeks. A 30-minute brainstorm prevents a 30-hour rewrite.
