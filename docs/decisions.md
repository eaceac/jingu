# Decisions

## Confirmed

- Product and repository name: Jingu (`jingu`).
- Korean is the first learning language; the architecture must support multiple languages.
- SMS is acceptable for the first version. Native iMessage is not required for v1.
- Text conversations are the primary interface.
- AI supports natural conversation; spaced repetition must be deterministic.
- AI is limited to conversational testing and semantic grading, including spelling variation and permitted transliterations. Application code selects every tested word and updates its schedule.
- V1 uses a third-party hosted model API called by Jingu's backend, not a self-hosted model. Jingu holds the server-side credentials and pays API usage costs; learners do not need an AI-provider account, subscription, or API key. Provider and model selection remain open.
- Configurable words per session, English → Korean / Korean → English / mixed directions, and whether transliteration is accepted; generalized for other language pairs.
- Maintain a vocabulary library and track how often each word is practiced.
- Provide a lightweight web dashboard and streak mechanism.
- Start with system design and a development plan before application implementation.

## Proposed defaults

These are implementation defaults, not requirements supplied by the user.

| Area | Default | Reason |
| --- | --- | --- |
| Initial audience | Personal alpha, one learner; user IDs on every owned record | Keep onboarding simple without a single-user data-model dead end |
| Instruction language | English | Practical starting point; separate from target language |
| Korean starting pack | Beginner daily conversation, polite 해요체 | Usable first experience; level remains configurable |
| Session length | About 5–10 minutes | A manageable daily habit |
| Words per session | 5 distinct senses; configurable 1–50 | Explicit session target, separate from the daily goal |
| Direction | English → Korean; selectable reverse or mixed | Independent review history per direction |
| Transliteration | Allowed initially; configurable | Accept meaning despite romanization variation; record answer form |
| Daily goal | 5 distinct vocabulary senses with eligible recall attempts | Reward effort without rewarding repetition spam |
| New vocabulary | At most 3 new senses per day | Avoid overwhelming the due queue |
| Reminder | One per local day, only after time and consent are configured | No guessed reminder time or unsolicited messages |
| Streak scope | Overall learner streak plus per-language activity | Switching languages should still support the daily habit |
| Scheduler | Explicit, versioned interval ladder v1 | Transparent, deterministic, easy to test; no efficacy claim |
| Messaging | Twilio SMS behind an adapter | Documented inbound webhooks and outbound messaging |
| AI | Provider adapter with structured, validated output | Keep scheduling independent of a model or provider |
| Backend | TypeScript API and worker; PostgreSQL | One language across app and domain code; durable transactions |
| SRS deployment | Pure shared package inside the backend, no separate service | Keep scheduling and assessment commits transactional; avoid unnecessary network calls |
| Dashboard | React, responsive, read-focused | Small surface for progress and vocabulary inspection |
| Repository | Private GitHub repository | Appropriate default for a new personal project |

## Resolve during implementation

- Actual Korean level and desired topics; beginner is only a provisional seed setting.
- SMS destination country, sender availability, provider setup, and spending ceiling before live SMS.
- AI provider credentials and model choice before enabling real AI calls.
- Dashboard hosting and authentication provider before external access.
- User-confirmed timezone and reminder time before reminder activation. Device/browser timezone can be suggested, not silently assumed.
- Whether to import an existing vocabulary list; first-party example vocabulary can unblock the alpha.

## Deferred

Native iMessage, voice/audio, speech assessment, social leaderboards, streak freezes, billing, adaptive scheduler optimization, and integration with an existing language app are outside the initial MVP. Jingu is a standalone practice tool; it does not automate completion of another app's lessons.
