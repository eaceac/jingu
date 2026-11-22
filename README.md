# Jingu

Daily language practice through text conversations, with deterministic spaced repetition and a lightweight progress dashboard.

**Starting point:** Korean over SMS. Multiple languages are a core data-model requirement. AI asks conversational questions about application-selected words and grades meaning, including spelling variation and allowed transliterations. Deterministic application code selects every tested word and owns vocabulary records, review schedules, practice counts, and streaks. Users configure session size, translation direction (forward, reverse, or mixed), and transliteration acceptance.

## Project status

Implementation started: deterministic scheduling and session planning, grading-policy validation, streak holds and garden projections, a 50-sense draft Korean pack, and transactional PostgreSQL persistence are implemented with tests. A scripted foundation demo is runnable locally. Live conversation, SMS, dashboard UI, and reminders are not implemented yet. No external messaging service or AI provider has been provisioned.

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

Completing the daily goal increases your streak. On a busy day, practicing one word can hold an existing streak for a day without adding to its count; complete the full goal the next day to keep it going.

## Proposed implementation

TypeScript monorepo: web dashboard, API, background worker, shared learning engine, language packs, and messaging adapters. PostgreSQL stores durable state and jobs. SMS is the first adapter; a browser simulator supports development without sending texts.

Development starts with the deterministic learning engine and its tests, then builds one complete practice loop before adding live SMS and scheduled reminders. See the development plan for release gates.
