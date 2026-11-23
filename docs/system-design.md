# Jingu system design

## Current scope

One learner using a local password-protected web application. The dashboard is the garden; a separate practice page provides conversational vocabulary tests. External hosting and additional user interfaces are out of scope.

## Components

- `apps/dashboard`: static, responsive garden and practice interfaces. DOM text insertion keeps user text separate from HTML.
- `apps/api`: local HTTP API, password authentication, durable input queue and worker.
- `packages/learning`: deterministic vocabulary planning, review intervals, streaks and garden progression.
- `packages/languages`: Korean starter vocabulary and language-pack contracts.
- `packages/ai`: server-side OpenAI adapter for questions and semantic grades. Scheduling never depends on model decisions.
- `packages/db`: PostgreSQL migrations and atomic review persistence.

## Request flow

The browser authenticates using HTTP Basic authentication against a high-entropy password hash. The local server binds to loopback. Practice submissions require JSON and an application-specific header; foreign origins are rejected. Each submission has an idempotency key, enters a durable queue, and is processed serially. Replies appear in the conversation by polling. Existing per-learner and global AI quotas remain enforced.

The server selects a due card deterministically, asks the model to test that exact sense, and validates structured grading output. A transaction commits the assessment, card state, practice event, daily progress and response together. Duplicate requests cannot count twice. Failed grading never earns progress.

## Learning policy

Default five words per session and five distinct senses per daily goal. Direction supports English to Korean, Korean to English, or mixed. Transliteration can be enabled or disabled. Settings are snapshotted for each session.

The versioned review ladder uses 1, 3, 7, 14, 30, 60, 120 and 240-day intervals; an incorrect recall returns after ten minutes. Vocabulary selection and interval updates are code-owned. AI accepts equivalent meaning, spelling variants and allowed romanization, but cannot change the selected word or schedule.

## Progress and garden

A completed daily goal adds one streak day and one permanent growth step. A partial day with at least one eligible word can preserve an existing streak for one day; consecutive holds do not extend it. Plants remain after missed days. One four-slot box is initially available, with another box per seven days of longest streak. Plants mature over five growth steps.

## Storage and privacy

All learner records carry a user ID so future expansion need not erase existing progress. Current web access represents one learner. Real credentials and personal data live only in ignored local runtime storage. OpenAI receives practice content for grading, with response storage disabled. Repository examples contain synthetic data only. The password-protected API returns only the current learner's conversation and garden.
