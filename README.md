# Jingu

Daily language practice through text conversations, with deterministic spaced repetition and a lightweight progress dashboard.

**Starting point:** Korean over Twilio SMS, running locally on this Mac. BlueBubbles remains an optional adapter. Multiple languages are a core data-model requirement. AI asks conversational questions about application-selected words and grades meaning, including spelling variation and allowed transliterations. Deterministic application code selects every tested word and owns vocabulary records, review schedules, practice counts, and streaks. Users configure session size, translation direction (forward, reverse, or mixed), and transliteration acceptance.

## Project status

**[Local Twilio activation](docs/daily-use.md)** — selected path after Apple Account setup failed. Polling mode runs on the Mac without public hosting. Paid account, owned/registered number, credentials, and real SMS verification are required before calling it live.

**[Set up BlueBubbles on this Mac](docs/bluebubbles.md)** — alternative transport. Invite-only friends have independent practice state and share the owner’s server-side AI key, with per-person and global call limits. The adapter is tested; macOS permissions, credentials, approved chat identities, and live verification are pending.

Personal-alpha text application implemented: deterministic SRS, persistent sessions/settings/progress, OpenAI question generation and semantic grading, signed Twilio webhooks, outbound delivery, opt-out, daily reminders, streaks, and garden progression. Startup imports the 50-sense Korean draft pack into PostgreSQL. Offline flows are tested; live credentials, an SMS number, and hosting are not configured yet. No real AI call or carrier SMS has been verified. The visual dashboard remains unbuilt.

**[Activate daily texting](docs/daily-use.md)** covers deployment, required credentials, phone setup, commands, and the live smoke test. `npm run dev` starts the actual API/worker using a local `.env`; `npm start` uses host environment variables. No fake grading is allowed in live SMS mode.

- [System design](docs/system-design.md): user flow, architecture, data model, scheduling, and reliability.
- [Development plan](docs/development-plan.md): ordered milestones and acceptance criteria.
- [Decisions](docs/decisions.md): confirmed requirements, proposed defaults, and open questions.
- [Garden concept](docs/garden-concept.md): view the illustrated dashboard direction.

## Run the foundation

Requires Node 22.18 or newer (the target CI version is pinned in `.nvmrc`).

```sh
npm ci
npm run check
npm run demo
```

The demo uses fixed inputs and a clearly labeled model-output fixture; it sends no messages and does not grade live answers. `npm run check` type-checks the TypeScript sources and runs the tests. PostgreSQL tests explicitly skip unless `TEST_DATABASE_URL` is set. To run all tests, use a dedicated local test database:

```sh
TEST_DATABASE_URL=postgres://localhost/jingu_test npm run check
```

The database test user needs permission to create schemas; tests isolate their data in a temporary schema and remove that schema afterward. The [CI template](docs/ci/check.yml) provisions PostgreSQL 17 and includes these tests. GitHub CI is not active: the current GitHub credential lacks workflow scope, so move the template to `.github/workflows/check.yml` using a workflow-authorized credential to activate it. See [database setup](packages/db/README.md) for migration and persistence contracts.

The initial daily new-word allowance is five, matching the default daily goal. Vocabulary entries are original draft learning material and still need pedagogical review before alpha. AI grading quality is not tested by fixed-output fixtures; that evaluation belongs to the live-AI milestone.

## Product loop

1. Text Jingu to begin a short conversation, or respond to an opted-in daily reminder.
2. Practice words selected from your due vocabulary in a natural scenario.
3. Receive short, useful corrections and occasional explicit recall checks.
4. Finish with a recap of words practiced, reviews completed, and daily progress.
5. Open the dashboard to see practice history, upcoming reviews, and streaks.

The dashboard centers on an illustrated game-style garden that grows with each completed practice day. Held days preserve it without adding growth, and missed days never erase earned plants.

Implemented garden progression (`garden-v2`) starts with one empty four-slot box. Every seven days of longest streak unlocks another box; five completed practice days mature a plant. Varieties cycle through basil, lavender, strawberry, and echinacea. When all boxes are full, the oldest mature plant moves into a permanent collection to make room. The engine reconstructs rewards from saved practice history, preserving earned boxes after a streak break. Run `npm run demo` for milestone examples. Garden artwork and dashboard rendering are still pending.

Completing the daily goal increases your streak. On a busy day, practicing one word can hold an existing streak for a day without adding to its count; complete the full goal the next day to keep it going.

## Proposed implementation

TypeScript monorepo: web dashboard, API, background worker, shared learning engine, language packs, and messaging adapters. PostgreSQL stores durable state and jobs. SMS is the first adapter; a browser simulator supports development without sending texts.

Development starts with the deterministic learning engine and its tests, then builds one complete practice loop before adding live SMS and scheduled reminders. See the development plan for release gates.
