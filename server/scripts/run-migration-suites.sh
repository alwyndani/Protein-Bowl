#!/usr/bin/env bash
# Runs the nine migration suites on a DISPOSABLE PostgreSQL instance that this script creates, uses and removes. Git Bash, from ./server:
#
#   bash scripts/run-migration-suites.sh
#
# What it does, in order (every step stops the run on failure):
#  1. Refuses unless the PostgreSQL 17 binaries exist (override: PB_PG_BIN) and port 5433 is FREE (it never attaches to a running server).
#  2. Refuses if the data directory already exists. The data directory is $HOME/pb-disposable-pg, a brand-new cluster created here with
#     `initdb` (superuser "postgres", random throwaway password, listens on localhost only).
#  3. Starts that cluster on port 5433 (NOT 5432: your development server is never contacted, authenticated against or modified).
#  4. Runs `npm run test:migrations` with PB_MIGRATION_PG_ADMIN_URL pointing at 127.0.0.1:5433. The suites create and drop their own temporary
#     databases (pb_p7a_taxmig_*, pb_p7c_mig_*, pb_p9b_mig_*, pb_p9c_mig_*, pb_p10a_mig_a|b_*, pb_p10b_mig_a|b_*, pb_p10c_mig_a_*,
#     protein_bowl_p6b_iso_*) inside that cluster only.
#  5. Always (trap): stops the cluster, then deletes the data directory it created (only that exact path, only if the marker file written in
#     step 2 is present).
# Output is saved to scripts/migration-suites.log.
set -euo pipefail
cd "$(dirname "$0")/.."
exec > >(tee scripts/migration-suites.log) 2>&1

# The only path this script may ever delete is "$HOME/pb-disposable-pg": refuse an empty, relative or root HOME before anything else.
case "${HOME:-}" in /?*|[A-Za-z]:/?*) ;; *) echo "REFUSED: HOME ('${HOME:-}') is not an absolute non-root path"; exit 1;; esac
PG_BIN="${PB_PG_BIN:-C:/Program Files/PostgreSQL/17/bin}"
PORT=5433
DATA_DIR="$HOME/pb-disposable-pg"
MARKER="$DATA_DIR/.pb-disposable-created-by-run-migration-suites"

for tool in initdb pg_ctl pg_isready; do
  [ -x "$PG_BIN/$tool.exe" ] || [ -x "$PG_BIN/$tool" ] || { echo "REFUSED: $tool not found in '$PG_BIN' (set PB_PG_BIN)"; exit 1; }
done
bin() { if [ -x "$PG_BIN/$1.exe" ]; then echo "$PG_BIN/$1.exe"; else echo "$PG_BIN/$1"; fi; }

if "$(bin pg_isready)" -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; then
  echo "REFUSED: something already accepts connections on port $PORT. Stop it first; this script only starts its own cluster."; exit 1
fi
[ ! -e "$DATA_DIR" ] || { echo "REFUSED: $DATA_DIR already exists (delete it yourself if it is a leftover of an earlier run)."; exit 1; }

PASSWORD="pb$(date +%s)disposable"
STARTED=0
cleanup() {
  set +e
  if [ "$STARTED" = 1 ]; then echo "== stopping the disposable cluster =="; "$(bin pg_ctl)" -D "$DATA_DIR" -m fast stop; fi
  if [ -f "$MARKER" ] && [ "$DATA_DIR" = "$HOME/pb-disposable-pg" ]; then echo "== removing $DATA_DIR =="; rm -rf "$DATA_DIR"; fi
}
trap cleanup EXIT

echo "== creating a new throwaway cluster in $DATA_DIR =="
PWFILE="$(mktemp)"; printf '%s' "$PASSWORD" > "$PWFILE"
"$(bin initdb)" -D "$DATA_DIR" -U postgres -A scram-sha-256 --pwfile="$PWFILE" -E UTF8 >/dev/null
rm -f "$PWFILE"; : > "$MARKER"

echo "== starting it on 127.0.0.1:$PORT =="
"$(bin pg_ctl)" -D "$DATA_DIR" -o "-p $PORT -c listen_addresses=127.0.0.1" -l "$DATA_DIR/server.log" -w start
STARTED=1

# Unset anything inherited that could point a child at another server; the only server named is the disposable one.
unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGSSLMODE DIRECT_URL SHADOW_DATABASE_URL TEST_DATABASE_URL
export PB_MIGRATION_PG_ADMIN_URL="postgresql://postgres:${PASSWORD}@127.0.0.1:${PORT}/postgres"
# Even if some tool ignored the explicit URLs and fell back to DATABASE_URL, it would find the disposable server, never the one in server/.env.
export DATABASE_URL="$PB_MIGRATION_PG_ADMIN_URL"

echo "== running the migration suites against 127.0.0.1:$PORT only =="
npm run test:migrations
echo "== done =="
