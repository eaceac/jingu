#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --env-file=.env --import tsx -e "import('./apps/api/config.ts').then(({config}) => config())"
pg_bin="/opt/homebrew/opt/postgresql@17/bin"
pg_data="$PWD/.local/postgres"
if [[ ! -f "$pg_data/PG_VERSION" ]]; then
  echo 'Local PostgreSQL has not been initialized; see README.md.'
  exit 1
fi
if ! "$pg_bin/pg_ctl" -D "$pg_data" status >/dev/null 2>&1; then
  "$pg_bin/pg_ctl" -D "$pg_data" -l "$PWD/.local/postgres.log" -o "-p 55440 -h 127.0.0.1 -k $PWD/.local" start
fi
# Keep the Mac awake while this foreground process runs. Ctrl-C stops Jingu.
exec caffeinate -i npm run dev
