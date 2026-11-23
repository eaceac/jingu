# Jingu

Personal Korean vocabulary practice through a local password-protected website. A deterministic spaced-repetition scheduler selects vocabulary; AI writes questions and grades meaning, including permitted spelling and transliteration variations. Daily practice grows a garden.

## Run locally

Requires Node 22.18+ and PostgreSQL 17. Run `npm ci`, copy `.env.example` to the ignored `.env`, and configure a dedicated database, random admin token, OpenAI API key and model. For personal use select `TRANSPORT=web` and `AI_MODE=openai`. Set `WEB_PASSWORD_HASH` to the SHA-256 hash of a randomly generated high-entropy password. The website username is `jingu`.

Run `npm run dev`. The app migrates its dedicated database automatically. Open `http://localhost:3000` for the garden or `/practice` for conversation. Choose Enable practice, then Practice. No messaging app or external tunnel is used. The server binds only to loopback.

On an already configured Mac, `./scripts/start-mac.sh` starts the repository-local PostgreSQL cluster and prevents idle sleep while the app runs. Otherwise provide your own PostgreSQL `DATABASE_URL`.

## Learning behavior

- Korean starter vocabulary: 50 original draft senses, awaiting educator review.
- Five words/session by default; forward, reverse, or mixed direction; optional transliteration.
- Deterministic interval ladder with durable, transactional review state.
- Complete your daily word goal to advance your streak and garden. One-word partial practice can hold an existing streak for one day without adding growth.
- One initial garden box; additional boxes unlock with longer streaks. Naming and personal progress are available on the dashboard.

## Development

`npm run check` runs typechecking and tests. Database integration tests require `TEST_DATABASE_URL` pointing at a disposable test database; each suite uses an isolated schema. `npm run demo` runs offline learning fixtures.

See [design](docs/system-design.md), [development plan](docs/development-plan.md), and [daily use](docs/daily-use.md).

## Private data

Keep `.env`, credentials, database files, dumps, personal transcripts, and login notes out of Git and container build contexts. Only `.env.example` contains placeholder settings. AI keys stay server-side. The website password protects both garden and practice history; the separate admin token is not sent to the browser. Live AI requires available API credits.
