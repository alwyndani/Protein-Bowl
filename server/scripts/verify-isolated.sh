#!/usr/bin/env bash
# Verification against the ISOLATED database pb_ci_test on LOCAL PostgreSQL. Run from ./server in Git Bash:
#
#   PB_CONFIRM_TARGET_DB=pb_ci_test bash scripts/verify-isolated.sh
#
# Safety properties
#  - Host must be localhost/127.0.0.1 and the port must equal PB_TEST_PG_EXPECT_PORT (default 5432), else nothing runs.
#  - The target name pb_ci_test must be confirmed (env PB_CONFIRM_TARGET_DB, or typed when run from a terminal).
#  - If pb_ci_test already exists the run STOPS (nothing is touched). Rebuilding needs --recreate AND PB_CONFIRM_DROP=pb_ci_test.
#  - ONE URL is computed here and exported as BOTH DATABASE_URL and TEST_DATABASE_URL, so migrate, seed, typecheck and tests cannot
#    resolve a different database from a .env file. The test setup additionally rejects any name but a validated test name and checks
#    current_database() after connecting.
#  - The development and production databases are never connected to.
#  - Suites that create/drop their own temporary databases as the postgres superuser (*.migration.test.ts, p6b.isolated.test.ts) are
#    EXCLUDED. Their separate, opt-in procedure is documented in server/TESTING.md ("Migration suites").
# Output is also saved to scripts/verify-isolated.log. Credentials: PB_TEST_PG_USER / PB_TEST_PG_PASSWORD (default postgres/postgres).
set -euo pipefail
cd "$(dirname "$0")/.."
exec > >(tee scripts/verify-isolated.log) 2>&1

DB_USER="${PB_TEST_PG_USER:-postgres}"; DB_PASS="${PB_TEST_PG_PASSWORD:-postgres}"; DB_HOST="${PB_TEST_PG_HOST:-localhost}"; DB_PORT="${PB_TEST_PG_PORT:-5432}"
EXPECT_PORT="${PB_TEST_PG_EXPECT_PORT:-5432}"

# Nothing inherited from the shell may redirect a child command to another server or database
# (the values above were read first, under different variable names, so this cannot erase them).
unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGSSLMODE DIRECT_URL SHADOW_DATABASE_URL DATABASE_URL_UNPOOLED

# The credentials go into a URL: only plain characters are accepted (anything else would change what the URL means).
SAFE='^[A-Za-z0-9._~-]+$'
[[ "$DB_USER" =~ $SAFE ]] || { echo "REFUSED: PB_TEST_PG_USER contains characters that are not allowed in this script"; exit 1; }
[[ "$DB_PASS" =~ $SAFE ]] || { echo "REFUSED: PB_TEST_PG_PASSWORD may only contain letters, digits and . _ ~ - (choose a simple password for the throwaway local server)"; exit 1; }

case "$DB_HOST" in localhost|127.0.0.1) ;; *) echo "REFUSED: host '$DB_HOST' is not localhost/127.0.0.1"; exit 1;; esac
[ "$DB_PORT" = "$EXPECT_PORT" ] || { echo "REFUSED: port '$DB_PORT' is not the expected port '$EXPECT_PORT'"; exit 1; }

RECREATE=()
for a in "$@"; do
  case "$a" in
    --recreate) RECREATE=(--recreate) ;;
    *) echo "REFUSED: unknown option '$a'"; exit 1 ;;
  esac
done

export TEST_DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/pb_ci_test?schema=public"
export DATABASE_URL="$TEST_DATABASE_URL"   # every child command (prisma, tsx, vitest) sees ONLY the verified URL
export PB_TEST_PG_USER="$DB_USER" PB_TEST_PG_PASSWORD="$DB_PASS" PB_TEST_PG_HOST="$DB_HOST" PB_TEST_PG_PORT="$DB_PORT" PB_TEST_PG_EXPECT_PORT="$EXPECT_PORT"

echo "Effective target for EVERY command below: ${DB_HOST}:${DB_PORT}/pb_ci_test (user ${DB_USER}, password hidden)"
echo "== 1. verify target, confirm, create pb_ci_test (stops if it exists), apply migrations to it only =="
npx tsx scripts/setupTestDb.ts --migrate "${RECREATE[@]}"
echo "== 2. generate Prisma client (local, no database) =="
npx --no-install prisma generate
echo "== 2b. pre-flight: a child process must see exactly the verified URL (stops here otherwise) =="
npx --no-install tsx scripts/checkChildEnv.ts
echo "== 3. server typecheck (a failure is reported at the end; the tests still run so everything is seen in one pass) =="
TSC_STATUS=0; npx tsc --noEmit -p . || TSC_STATUS=$?
echo "== 4. seed the isolated database (catalogue + demo fixtures only) =="
DATABASE_URL="$TEST_DATABASE_URL" npx --no-install prisma db seed
echo "== 5. server tests (isolated database; migration suites excluded) =="
TEST_STATUS=0; TEST_DATABASE_URL="$TEST_DATABASE_URL" DATABASE_URL="$TEST_DATABASE_URL" npx --no-install vitest run --reporter=default --exclude "**/node_modules/**" --exclude "**/*.migration.test.ts" --exclude "**/p6b.isolated.test.ts" || TEST_STATUS=$?
echo "== done: typecheck exit ${TSC_STATUS}, tests exit ${TEST_STATUS} =="
[ "$TSC_STATUS" = 0 ] && [ "$TEST_STATUS" = 0 ]
