#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Validate all credentials/allowlist before starting a persistent service.
node --env-file=.env --import tsx -e "import('./apps/api/config.ts').then(({config}) => { if(config().transport !== 'bluebubbles') throw new Error('Use BlueBubbles mode for this launcher'); })"
pg_bin="/opt/homebrew/opt/postgresql@17/bin"
pg_data="$PWD/.local/postgres"
if [[ ! -f "$pg_data/PG_VERSION" ]]; then
  echo 'Local PostgreSQL has not been initialized; see docs/bluebubbles.md.'
  exit 1
fi
if ! "$pg_bin/pg_ctl" -D "$pg_data" status >/dev/null 2>&1; then
  "$pg_bin/pg_ctl" -D "$pg_data" -l "$PWD/.local/postgres.log" -o "-p 55440 -h 127.0.0.1 -k $PWD/.local" start
fi
# Keep the Mac awake while this foreground process runs. Ctrl-C stops Jingu.
exec caffeinate -i npm run dev
