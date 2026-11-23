# PostgreSQL foundation

`src/migrate.ts` applies versioned SQL transactionally to a dedicated Jingu database. `src/reviews.ts` commits an already validated semantic assessment and deterministic scheduler result together with the card update, recall event, and daily distinct-sense facts. It uses one PostgreSQL client per transaction, learner/card/opportunity row locks, unique constraints, and expected card versions.

This is internal persistence code, not an untrusted HTTP boundary. The caller must authenticate the learner, validate grading output and policy, compute the next state with the learning engine, and supply server-owned timezone/goal snapshots. Daily streak and garden states are derived from daily facts by the learning package. Corrections/replay, reminder workers, account deletion, and provider ingress remain later work.

The daily text runtime now uses `commitReviewInTransaction` to include session advancement and outbound intent in the same transaction. Migration 002 adds consent, message-processing state, prompt persistence, and AI call counters. The API validates provider signatures and restricts ingress to the configured learner phone. Reminder/delivery workers are implemented in `apps/api/runtime.ts`; account deletion and correction tooling remain later work.

Run integration tests with `TEST_DATABASE_URL` pointing to a PostgreSQL database on which the test user may create schemas. Tests create a uniquely named schema, migrate it twice to verify idempotency, and remove only that schema afterward. Without the variable, database tests are explicitly skipped. No default production connection is used.

Runtime dependency: `pg`. Development dependencies: `@types/pg`, `tsx`, TypeScript and Node types. The migration loader expects the SQL file relative to its source module; package/copy `migrations/` alongside compiled code if adding a build output later.

Transaction implementation follows the [node-postgres transaction contract](https://node-postgres.com/features/transactions).
