# Jingu

Daily language practice through text conversations, with deterministic spaced repetition and a lightweight progress dashboard.

**Starting point:** Korean over SMS. Multiple languages are a core data-model requirement. AI generates conversations and proposes assessments; application code owns vocabulary records, review schedules, practice counts, and streaks.

## Project status

Design phase. This repository contains the proposed system design and development plan, not a working application yet. No messaging service, AI provider, or website has been provisioned.

- [System design](docs/system-design.md): user flow, architecture, data model, scheduling, and reliability.
- [Development plan](docs/development-plan.md): ordered milestones and acceptance criteria.
- [Decisions](docs/decisions.md): confirmed requirements, proposed defaults, and open questions.

## Product loop

1. Text Jingu to begin a short conversation, or respond to an opted-in daily reminder.
2. Practice words selected from your due vocabulary in a natural scenario.
3. Receive short, useful corrections and occasional explicit recall checks.
4. Finish with a recap of words practiced, reviews completed, and daily progress.
5. Open the dashboard to see practice history, upcoming reviews, and streaks.

## Proposed implementation

TypeScript monorepo: web dashboard, API, background worker, shared learning engine, language packs, and messaging adapters. PostgreSQL stores durable state and jobs. SMS is the first adapter; a browser simulator supports development without sending texts.

Development starts with the deterministic learning engine and its tests, then builds one complete practice loop before adding live SMS and scheduled reminders. See the development plan for release gates.
