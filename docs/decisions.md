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
- Make a beautiful game-style garden the dashboard centerpiece, visibly growing with daily practice to encourage returning each day.
- The site primarily opens to the dashboard. Start with one empty garden box and a simple dreamy oil-painted illustrative background, replacing the original elaborate garden scene.
- Render garden boxes and plants realistically, contrasting with the oil-painted background. Support different plant varieties and unlock more boxes as streaks lengthen.
- Completing the daily practice goal increases the streak. Practicing one word can preserve an existing streak for one day without increasing its count.
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
| New vocabulary | At most 5 new senses per day | Match the initial five-word daily goal so a new learner can complete day one; configurable |
| Reminder | One per local day, only after time and consent are configured | No guessed reminder time or unsolicited messages |
| Streak scope | Overall learner streak plus per-language activity | Switching languages should still support the daily habit |
| One-day streak hold | Automatically preserve an existing streak on a partial-practice day; no consecutive holds | Proposed interpretation of a one-day extension; a full-goal day restores eligibility |
| Scheduler | Explicit, versioned interval ladder v1 | Transparent, deterministic, easy to test; no efficacy claim |
| Messaging | Local BlueBubbles iMessage adapter; optional Twilio SMS | User chose Mac hosting and selected friends; mandatory practice prefix, direct-chat allowlist, separate learner state |
| AI | Provider adapter with structured, validated output | Keep scheduling independent of a model or provider |
| Backend | TypeScript API and worker; PostgreSQL | One language across app and domain code; durable transactions |
| SRS deployment | Pure shared package inside the backend, no separate service | Keep scheduling and assessment commits transactional; avoid unnecessary network calls |
| Dashboard | React, responsive, read-focused | Small surface for progress and vocabulary inspection |
| Garden growth | One permanent growth step per completed daily goal; holds preserve without growth | Proposed reward mapping aligned with daily streak rules; missed days do not destroy earned plants |
| Garden box unlocks | One starting box plus one per 7 days of longest streak | Proposed thresholds; preserves earned boxes after a streak break |
| Repository | Private GitHub repository | Appropriate default for a new personal project |

## Resolve during implementation

- Actual Korean level and desired topics; beginner is only a provisional seed setting.
- SMS destination country, sender availability, provider setup, and spending ceiling before live SMS.
- AI provider credentials and model choice before enabling real AI calls.
- Dashboard hosting and authentication provider before external access.
- User-confirmed timezone and reminder time before reminder activation. Device/browser timezone can be suggested, not silently assumed.
- Whether to import an existing vocabulary list; first-party example vocabulary can unblock the alpha.

## Deferred

Official native iMessage app, voice/audio, speech assessment, social leaderboards, banked or purchased streak freezes, billing, adaptive scheduler optimization, and integration with an existing language app are outside the initial MVP. The one-word, one-day streak hold is included. Jingu is a standalone practice tool; it does not automate completion of another app's lessons.

## Local iMessage alpha update

BlueBubbles on the owner’s Mac is the chosen messaging transport. Selected friends share the owner’s OpenAI project key, kept server-side. Per-user state and budgets are isolated; a shared daily AI-call cap bounds combined usage. Local polling uses basic AppleScript sending with SIP enabled. See [activation and privacy details](bluebubbles.md).
