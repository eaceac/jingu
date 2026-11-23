# Activate Jingu for daily texting

## Trial account limitation

The current Twilio 30-day trial provides 100 SMS units and restricts outbound message bodies to predefined templates. The account console verified this restriction on November 22, 2026. This can test basic SMS delivery and receiving, but cannot run Jingu's custom Korean questions or grading responses. The existing Jingu adapter needs an account that permits custom SMS content. Do not upgrade or enable billing automatically; the user has only authorized trying the free trial.

Reference: [Twilio free trial restrictions](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account).


The personal-alpha SMS application is implemented, but is not yet deployed or connected to a real phone number. Live AI calls and carrier delivery have not been tested with account credentials. The current release supports one configured learner, Korean/English, an always-running Node service, and PostgreSQL. The garden/progress API is available; the visual dashboard is not yet built.

## What the running app does

- Imports all 50 draft Korean entries and their variants into PostgreSQL and creates independent directional review cards.
- Stores incoming texts before acknowledging the webhook; a background loop processes them in order.
- Chooses vocabulary deterministically and asks an AI-generated question, with a curated question if generation is unavailable.
- Grades meaning through the OpenAI Responses API, including permitted romanization; validates output before recording a review.
- Commits the assessment, schedule, daily progress, session advancement, and reply intent in one transaction.
- Sends replies through Twilio, saves provider IDs, and handles failed-delivery callbacks.
- Sends one opted-in reminder per local day in a ten-minute window; skips completed days and paused/opted-out learners.
- Updates the streak, one-word hold, garden, and collection from the same saved history.

## Required accounts and configuration

Use a private deployment with a persistent PostgreSQL database and an always-on service. Railway is a deployment option; `Dockerfile` and `railway.json` are included. Deployment may incur charges; nothing has been purchased or provisioned by this implementation.

Set these in the host's secret/environment settings, not in chat or Git:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Dedicated persistent Jingu PostgreSQL connection string |
| `ADMIN_TOKEN` | At least 32 cryptographically random characters; protects progress/operations endpoints |
| `TRANSPORT` | `twilio` |
| `AI_MODE` | `openai` |
| `OPENAI_API_KEY` | Jingu's project API key |
| `OPENAI_MODEL` | A Responses API model supporting structured output; `gpt-4.1-mini` is an initial candidate to evaluate |
| `TWILIO_ACCOUNT_SID` | Account owning the sender |
| `TWILIO_AUTH_TOKEN` | Account authentication token, also used to validate signatures |
| `TWILIO_FROM_NUMBER` | SMS-capable sender in E.164 form (`+` and country code) |
| `LEARNER_PHONE` | Your phone in E.164 form; all other incoming numbers are ignored |
| `PUBLIC_URL` | Exact HTTPS origin, no path/query, e.g. `https://jingu.example` |
| `JINGU_TIMEZONE` | Initial learner timezone, e.g. `America/Los_Angeles` |
| `MAX_AI_CALLS_PER_DAY` | Default 100; persisted across process restarts |
| `MAX_SMS_PER_DAY` | Default 60 outbound attempts accepted/uncertain; SMS segments can cost separately |

`PORT` is supplied by the host or defaults to 3000. Startup runs migrations and idempotently seeds vocabulary. Existing learner settings and schedules are preserved on restart. The timezone environment variable initializes a new learner only; it does not rewrite historical dates. Reminders start disabled, and messaging starts opted out.

Before live activation, complete the sender/account steps Twilio requires for the recipient country and number type. Use the account console to confirm the number can send and receive SMS to your phone. Set provider spending limits as well as the app's call/message caps. Do not use a sleeping/free-preview service for unattended daily reminders.

## Connect the text flow

1. Deploy the repository as a service using its Dockerfile and attach PostgreSQL. Set the variables above. Verify `GET /health` returns `{"ok":true}`.
2. Configure the Twilio number's incoming-message webhook as **POST** to `PUBLIC_URL/webhooks/sms/inbound`. Keep the public URL exact because it is part of signature validation. Outbound messages set their status callback to `PUBLIC_URL/webhooks/sms/status` automatically.
3. From `LEARNER_PHONE`, text **START** to the Twilio number. Jingu explains AI processing and how to opt out. The sender must be the configured learner; no public registration is enabled.
4. Text **PRACTICE**, answer the first question, and complete the session. Check that **PROGRESS** reports five attempted words, a one-day streak, and a garden seed.
5. Text **REMINDER 09:00** (or your chosen local time). Confirm the reply includes the intended timezone. Text **PAUSE** to pause reminders; **STOP** disables messaging and reminders.

The final phone-to-provider-to-host-to-AI-to-phone smoke test is required before considering the deployment active. It is not replaced by the automated fake-provider tests.

## Commands

| Text | Behavior |
| --- | --- |
| `START` | Opt in; does not automatically enable reminders |
| `PRACTICE` | Start a session, or repeat the current question |
| Your answer or question | AI grades or asks for clarification about the selected word |
| `HINT` | Show the reference answer and mark the opportunity assisted |
| `DONE` | End the session and show daily progress |
| `PROGRESS` | Daily goal, streak, and garden summary |
| `SETTINGS` / `HELP` | Show current settings / commands |
| `WORDS 10` | Set maximum words in a new session; daily goal remains five |
| `DIRECTION forward` | English → Korean in new sessions |
| `DIRECTION reverse` | Korean → English in new sessions |
| `DIRECTION mixed` | Deterministic mix in new sessions |
| `TRANSLITERATION on` / `off` | Allow romanization / require Hangul in new sessions |
| `REMINDER 09:00` | Enable daily reminders at that local time |
| `PAUSE` | Pause reminders only |
| `STOP` | Opt out, cancel queued replies, and close the active session |

Incomplete sessions close on the next local day. One-word holds occur automatically when eligible; they do not count as a completed goal. If an answer cannot be graded because the AI is unavailable or the daily call limit is reached, no review is recorded and Jingu asks you to retry later. A long conversation can use multiple calls for clarifications. The current context consists of the selected word, prompt, policy, and latest reply; multi-turn free-form conversation history is a later enhancement.

## Run locally before connecting SMS

Create a dedicated local database, copy `.env.example` to `.env`, set its `DATABASE_URL`, and generate a real `ADMIN_TOKEN` (for example with `openssl rand -hex 32`). Leave `TRANSPORT=console` and `AI_MODE=fake` for an offline test. Then:

```sh
npm ci
npm run dev
```

The console transport prints replies in the server terminal. Post `{"text":"START"}`, then `{"text":"PRACTICE"}`, then a reply to `/api/simulate` with an `Authorization: Bearer <ADMIN_TOKEN>` header. The simulator endpoint exists only in console mode. Fake grading is explicitly exact-match test behavior, not an approximation of natural-language AI grading. To test real AI locally, keep console transport and set `AI_MODE=openai` plus the API key and model.

Authenticated read endpoints: `GET /api/progress` returns daily history and garden state; `GET /api/operations` returns queue/delivery status counts. There is no browser sign-in or visual dashboard in this release. Keep the admin token private.

## Reliability and operations

The API and background loop currently run together for this one-user alpha. PostgreSQL advisory locks prevent overlapping workers. A crash rolls back unfinished processing. Unexpected processing errors retry up to three times, then mark the inbound message failed so it cannot block later messages indefinitely. Monitor `/api/operations` for failed messages.

Outbound intent is durable. Known provider rejections become failed; timeouts or interrupted sends become ambiguous and are **not** automatically resent, because the provider may have accepted them. Inspect the provider log before any manual retry. `PRACTICE` repeats a question if a reply was lost. Unsent conversational replies expire after 30 minutes; reminder windows are not replayed after an outage. STOP cannot recall a message already handed to the provider, but prevents pending/future sends.

Set database backups in the hosting service. Raw practice messages are stored in the database; automatic retention/deletion tools are not implemented yet. Phone numbers and API credentials stay in server configuration and are not included in AI input. Model `store` is false, but provider data handling still applies. Korean examples remain draft material needing pedagogical review. Model accuracy and real carrier behavior are unverified until live evaluation.

## Verified interfaces

- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create) and [structured output](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
- [GPT-4.1 mini model reference](https://developers.openai.com/api/docs/models/gpt-4.1-mini) for the provisional model candidate.
- [Twilio webhook security](https://www.twilio.com/docs/usage/security) and [Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out).
