# Development plan

Build one complete practice loop, then connect external services. Milestones below are ordered; each has an observable acceptance gate.

Implementation update (2026-11-22): the milestone 1 code foundation is implemented, including deterministic selection/scheduling, grading-policy validation, settings snapshots, streak/garden reducers, a 50-sense draft Korean pack, SQL migrations, and transactional review commits. Unit and real-PostgreSQL integration tests cover these modules. The vocabulary still needs pedagogical review. `npm run demo` exercises the foundation with fixed fixtures; it is not yet the persistent conversational simulator required by milestone 2. Live AI/SMS, dashboard UI, and reminders remain unimplemented.

All 35 tests and TypeScript checks passed locally, including 11 PostgreSQL integration tests. CI configuration is provided at `docs/ci/check.yml`; activation is pending a GitHub credential with workflow permission. The current credential cannot push `.github/workflows/` files.

## 0. Design and repository

- Create the private Jingu repository.
- Record scope, architecture, scheduler policy, data model, and decisions.
- Keep provider credentials, deployment configuration, and phone numbers out of source control.

Done when the design and milestones can be reviewed from the repository. No application deployment is required in this phase.

## 1. Deterministic learning foundation

Create a TypeScript workspace with `packages/learning`, `packages/languages`, `packages/contracts`, and `packages/db`. Add a test runner, type checking, reproducible dependency lockfile, and CI. Record runtime versions explicitly.

Implement the scheduler as an in-process package, due selection, eligible-review rules, practice event definitions, local-date daily goals, and streak computation. Add language-pair settings, independent directional cards, deterministic mixed-mode selection, session-plan snapshots, and grading-policy snapshots. Add PostgreSQL migrations with unique constraints and transaction helpers. Create a small reviewed Korean seed pack; expand to approximately 50 senses before alpha. Include a second-language fixture to prove the shared engine does not depend on Korean.

Acceptance:

- Fixed inputs produce identical schedules and queue order.
- Session size, short queues, mixed-mode ties, global due-before-new priority, and daily new-sense limits produce the documented deterministic plan without AI calls.
- English → Korean reviews do not advance Korean → English cards; mixed sessions never test the same sense twice.
- Repeating a word in a message or retrying a webhook does not inflate counts.
- Exposure and incidental usage cannot advance a review card.
- Hints, failures, maximum intervals, stale assessments, and missing dates behave as documented.
- Timezone and daylight-saving boundary tests pass.
- One eligible word preserves an existing streak for one day without increasing current or longest counts; zero practice and consecutive partial days break it after day-end.
- Holds cannot start or revive a streak; a later full goal upgrades a held day exactly once. A one-word daily goal completes normally, and a full day after a hold restores hold eligibility.
- Midnight, delayed grading of on-time messages, repeated day finalization, and late finalization jobs yield the same event-derived streak state.
- Database concurrency tests demonstrate one committed assessment per opportunity.

## 2. Complete local practice loop

Create `apps/api` and a browser or CLI conversation simulator. Add session planning, curated fallback prompts, event persistence, recap, and progress queries. Use a fake AI provider with fixed outputs before adding real AI.

Acceptance:

- Start a Korean session, complete reviews, finish it, restart the server, and recover the same durable progress.
- Inspect why each vocabulary count and due date changed.
- Complete the daily goal and see the correct streak without changing system time; use an injected test clock.
- Simulate complete → held → complete and complete → held → partial days; verify counts, day-end reset, and SMS recap wording.
- A second language can be selected without changing the scheduling code.
- Changing default settings leaves an existing session's ordered plan and grading policy unchanged.

## 3. AI conversation

Use a third-party hosted model with Jingu-managed server-side credentials and billing. Compare candidate models on the Korean grading evaluation set, latency, and cost before choosing one. Learners need no model-provider account or subscription.

Implement an AI adapter with structured output, bounded context, schema validation, semantic assessment proposals, stored model/prompt versions, timeout handling, and cost limits. Generate conversational prompts only for application-selected cards, and grade meaning using the opportunity's direction and transliteration policy. Commands, settings, reminders, summaries, and word selection do not invoke AI.

Acceptance:

- Conversations naturally practice selected words across several topics.
- Korean inflections, particles, politeness variants, multiword expressions, ambiguous evidence, and wrong answers are evaluated against a small curated assessment set.
- Evaluate minor typos versus meaning-changing errors, alternate romanizations with transliteration on/off, mixed-script answers, and equivalent English meanings in reverse mode.
- Disallowed transliteration yields a format clarification without a committed grade; a conforming follow-up can complete the same opportunity.
- AI cannot replace the selected word or direction; recorded call traces show only conversation/grading calls, never queue selection or separate usage-mining calls.
- Invalid vocabulary IDs and invented evidence are rejected.
- A learner cannot change scheduling rules or write arbitrary grades through a prompt.
- AI failures preserve progress and produce the fallback flow.
- Provider keys remain server-side; request construction omits phone numbers and account identifiers, and onboarding explains third-party processing of practice text.
- Replaying stored accepted assessments yields the same schedule without another AI request.

## 4. Live SMS and durable processing

Implement `packages/messaging` and `apps/worker`. Configure a provider account, sender, webhook endpoint, signature validation, inbound deduplication, per-learner ordering, outbox delivery, status callbacks, onboarding, and opt-out handling. Keep the simulator using the same session orchestrator.

Acceptance:

- A real opted-in phone can complete a session from its Messages app.
- Duplicate and concurrent webhook deliveries create one learning transition.
- Invalid signatures are rejected; unknown senders cannot see another user's data.
- Worker restarts recover queued work without losing accepted messages.
- STOP prevents scheduled sends; provider opt-out confirmations are not duplicated.
- Failed or ambiguous outbound sends are visible and do not fabricate delivery success.

Needs before activation: provider credentials, SMS destination country, available sender, verified learner number, and agreed spending limits. No purchase or live text is needed to finish milestones 1–3.

## 5. Lightweight dashboard

Create `apps/web` with an authenticated, responsive progress view, activity calendar, vocabulary table, sense history, and settings. Reuse server-side progress definitions instead of recomputing separate metrics in the browser.

Make the garden the visual centerpiece. Review a game-art concept, prepare reusable planting-stage assets, and implement the deterministic five-stage planting progression from completed-day records. Add gentle completion and hold feedback, responsive layout, reduced-motion behavior, and accessible text equivalents. Image generation is an asset-authoring tool only, not part of runtime practice or garden updates.

The latest art direction pairs realistic boxes/soil/plants with an oil-painted background. Implement species-specific growth assets and streak-based box unlocks (proposed: another box every seven days of longest streak), retaining earned boxes after a break. These additions are not yet in the existing `garden-v1` reducer. Define versioned plant-slot placement and capacity before rendering, including behavior when available boxes are full.

Acceptance:

- Dashboard values match the underlying practice events and SMS recap.
- Every completed local day grants one garden growth step across sessions/languages; holds grant no growth, and missed days preserve already earned plants.
- Streak thresholds unlock one empty box exactly once; held days do not advance thresholds, and a streak reset never removes earned boxes. Species/slot assignments remain deterministic across refreshes and unlocks.
- Replayed webhooks, refreshes, multiple devices, held-to-complete upgrades, and corrected daily results produce the same garden from canonical history.
- A new completed day produces visible growth at every stage, including after the first bed is full; reduced-motion mode preserves all progress information.
- Two users cannot access each other's vocabulary, sessions, or settings.
- Language filtering, empty states, mobile layout, keyboard navigation, and loading/error states work.
- Refreshing or signing in on another device preserves progress.
- Activity calendars distinguish completed and held days; a hold leaves the streak count unchanged and shows the next-day full-goal requirement.
- Reminder and timezone settings affect the next applicable period as documented.
- Users can change words per session, direction, and transliteration policy through validated dashboard controls and explicit SMS commands; direction-specific history and answer forms remain visible.

## 6. Reminders and personal alpha

Enable opted-in daily reminders, quiet hours, completion suppression, operational metrics, retention settings, backups, and deployment documentation. Run the complete Korean flow for several days and review false-positive assessments and message costs.

Acceptance:

- At most one reminder intent per learner/day; retries and restarts do not create extra intents.
- Completed days and opted-out learners are skipped, including jobs already queued.
- Midnight and daylight-saving transitions preserve streak and reminder behavior.
- Restore a backup and reproduce progress from saved events.
- Measure AI latency, SMS segments, failed jobs, and cost per completed session.
- A week of real use identifies the next prioritized improvements.

## Proposed repository structure

```text
apps/
  api/                  # Authenticated API and validated provider webhooks
  worker/               # Conversation jobs, delivery, and reminder processing
  web/                  # Dashboard and development conversation simulator
packages/
  learning/             # Pure scheduling, eligibility, daily goals, streaks
  languages/            # Vocabulary packs and language-specific evaluators
  contracts/            # Validated API and AI schemas
  db/                   # Schema, migrations, transaction helpers
  messaging/            # SMS and simulator adapters
  ai/                   # Real and fake provider implementations
docs/
  system-design.md
  development-plan.md
  decisions.md
```

## MVP release boundary

The MVP is complete when Korean SMS conversations, persisted vocabulary practice, deterministic review scheduling, authenticated progress views, streaks, and opted-in reminders work together. A simulator or dashboard mockup alone is not the MVP. Additional languages should require a reviewed language pack and evaluator configuration, not a new scheduler.
