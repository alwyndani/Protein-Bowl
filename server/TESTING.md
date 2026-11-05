# Server tests: database isolation

The server suite is integration-style (real PostgreSQL). It **never** chooses a database by itself.

- `TEST_DATABASE_URL` is the only source of the target. Without it, `DATABASE_URL` is set to a dead sentinel (`127.0.0.1:1`), no
  database is contacted, and only database-free unit tests can pass (`*.unit.test.ts`, `invite-config.test.ts`).
- The URL is validated before anything connects (`src/tests/testDatabase.ts`): `postgresql://`, host `localhost`/`127.0.0.1`/`::1`,
  a database name containing `test`, `scratch` or `isolated`, and **never** `protein_bowl_db` (development), `protein_bowl_test_db`
  (the shared test database), `postgres` or a template database. An invalid value aborts the run.
- After connecting, `SELECT current_database()` must equal the validated name, otherwise the run aborts.

## One-time setup of an isolated test database (needs your approval; touches only the new database)

```bash
# 1. create an empty database (local PostgreSQL)
psql -U postgres -h localhost -c "CREATE DATABASE pb_ci_test;"
# 2. apply the migration chain to THAT database only
cd server && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pb_ci_test?schema=public" npx prisma migrate deploy
# 3. seed (catalogue + demo data) if the suites you run need it
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pb_ci_test?schema=public" npm run prisma:seed
# Demo users are created ONLY for a local database (localhost / 127.0.0.1 / ::1) and never when NODE_ENV=production; a remote database needs the explicit
# opt-in ALLOW_DEMO_SEED=true (disposable test databases only). A SEED_DEFAULT_PASSWORD shorter than 12 characters disables demo users. Otherwise the
# seed imports the catalogue only.
```

## Running

```bash
cd server
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pb_ci_test?schema=public" npx vitest run
# database-free subset
npx vitest run src/tests/testDatabase.unit.test.ts src/tests/purchasing.unit.test.ts src/tests/invite-config.test.ts
```

### Disposable cluster on Windows: use `127.0.0.1`, not `localhost`

A throwaway cluster that listens on IPv4 only (`listen_addresses = '127.0.0.1'`, as recommended above) must be addressed as `127.0.0.1`.
On Windows, `localhost` is tried as IPv6 `::1` first; the closed IPv6 port is refused only after about 2 s, so **every new database connection costs
about 2 s**. Prisma's default interactive-transaction start limit (`maxWait`) is also 2 s, so any test that makes two or more callers open transactions
at once fails with `P2028 Unable to start a transaction in the given time` (concurrent dispatch/takeover/regeneration/transition tests; they take ~2.0 s
and return 500 instead of the expected result). The same suite passes without a single P2028 once the host is `127.0.0.1`
(verified 2026-11-05: 84 files / 1,738 tests passed, 0 failed, 0 skipped, on a UTF8 PostgreSQL 17 cluster on port 5434).

- `scripts/verify-isolated.sh`: set `PB_TEST_PG_HOST=127.0.0.1` (the script accepts `localhost` or `127.0.0.1`), together with the port variables.
- Direct runs: put `127.0.0.1` in `TEST_DATABASE_URL`, e.g. `postgresql://postgres:<password>@127.0.0.1:5434/pb_ci_test?schema=public`.
- Alternatively let the cluster listen on both families (`listen_addresses = '127.0.0.1,::1'`); a server listening on `[::]`, such as a normal
  Windows service install, does not show the delay.

Create such a cluster with an explicit encoding: the seed contains emoji (`prisma/seedProducts.ts`), which a Windows-default `WIN1252` cluster
rejects (`initdb -E UTF8 --locale=English_India.1252 ...`).

## Migration suites (separate, opt-in)

`*.migration.test.ts` (7 files) and `p6b.isolated.test.ts` are excluded from the default `npm test` (`vitest.config.ts`) and from
`scripts/verify-isolated.sh`. They run only through `npm run test:migrations` (`vitest.migrations.config.ts`).

**What they do.** Each suite connects to the maintenance database `postgres` of the instance you name, as the superuser in that URL, runs
`CREATE DATABASE` for its own temporary database(s) (`pb_p7a_taxmig_<ts>`, `pb_p7c_mig_<ts>`, `pb_p9b_mig_<ts>`, `pb_p9c_mig_<ts>`,
`pb_p10a_mig_a/b_<ts>`, `pb_p10b_mig_a/b_<ts>`, `pb_p10c_mig_a_<ts>`, `protein_bowl_p6b_iso_<ts>`; `<ts>` = `Date.now()`), replays the migration
files into them (`prisma db execute` / `prisma migrate deploy` with `DATABASE_URL` set to the temporary database), asserts on the result, and in
`afterAll` runs `DROP DATABASE IF EXISTS "<its own name>" WITH (FORCE)`. They never open, read, alter or drop any other database.
**Permission needed:** a role that may `CREATE DATABASE` and `DROP DATABASE` (superuser in practice; `DROP ... WITH (FORCE)` terminates sessions of
that one database).

**Server selection (new).** No server is hard-coded any more. You must set `PB_MIGRATION_PG_ADMIN_URL=postgresql://postgres:<password>@localhost:<port>/postgres`
(`src/tests/migrationDb.ts`): local host only, maintenance database must be `postgres`, and **port 5432 is refused** (that is where a development
database normally lives) unless you also set `PB_MIGRATION_PG_CONFIRM_DISPOSABLE=yes`. Without the variable the suites fail at import and contact nothing.

**Safe on a separate disposable instance: yes.** Start a second PostgreSQL on another port (a throwaway data directory), for example on Windows
(adjust the version path):

```bash
"C:/Program Files/PostgreSQL/16/bin/initdb.exe" -D C:/pb-disposable-pg -U postgres -A scram-sha-256 --pwfile=<(printf 'disposable1')
"C:/Program Files/PostgreSQL/16/bin/pg_ctl.exe" -D C:/pb-disposable-pg -o "-p 5433" -l C:/pb-disposable-pg/log.txt start
cd server
PB_MIGRATION_PG_ADMIN_URL="postgresql://postgres:disposable1@localhost:5433/postgres" npm run test:migrations
"C:/Program Files/PostgreSQL/16/bin/pg_ctl.exe" -D C:/pb-disposable-pg stop
```

(or a Docker container `postgres:16` published on 5433). Delete `C:/pb-disposable-pg` afterwards. The suites do NOT need `TEST_DATABASE_URL`.

**Fresh-database replay + schema comparison of the prepared migrations.** `src/tests/preparedMigrations.migration.test.ts` is one of these suites. It creates its own
temporary database on the disposable instance, runs `prisma migrate deploy` over ALL migration folders (including `20261020100000_role_simplification_admin_actors`,
`20261031120000_trainer_procurement_foundation` and `20261101120000_health_exercise_unanswered`), checks names/checksums/objects, then runs
`prisma migrate diff --from-url <temporary db> --to-schema-datamodel prisma/schema.prisma --script` and fails on anything except unmodelled `DROP INDEX` lines.
Prerequisites: PostgreSQL 16 on a second port (5433) as above, `npm install` done in `server/` (the Prisma CLI is run from `node_modules`), and `npx prisma generate`
so the client matches the current schema. Run just this suite:

```bash
cd server
PB_MIGRATION_PG_ADMIN_URL="postgresql://postgres:disposable1@localhost:5433/postgres" npx vitest run --config vitest.migrations.config.ts src/tests/preparedMigrations.migration.test.ts
```

Never point `PB_MIGRATION_PG_ADMIN_URL` at the development or production server; none of these commands applies anything to an existing application database.
To see the same comparison against the isolated test database only (read-only; it lists differences and changes nothing), after `prisma generate`:
`npx prisma migrate diff --from-url "postgresql://postgres:<password>@localhost:5432/pb_ci_test?schema=public" --to-schema-datamodel prisma/schema.prisma --script`
(expected: only the pending `hasExercise` change until `20261101120000_health_exercise_unanswered` is applied there with `prisma migrate deploy`).

Rebuilding `pb_ci_test` deliberately: `PB_CONFIRM_TARGET_DB=pb_ci_test PB_CONFIRM_DROP=pb_ci_test bash scripts/verify-isolated.sh --recreate`.

Notes
- Suites named `*.migration.test.ts` and `p6b.isolated.test.ts` create and drop their own throwaway databases through the local
  `postgres` superuser (`localhost:5432`). They do not touch the database in `TEST_DATABASE_URL`, but they do need that superuser;
  exclude them (`--exclude "**/*migration*" --exclude "**/*isolated*"`) if you do not want any superuser access.
- Tests leave rows behind; rebuild the isolated database when it accumulates (drop and recreate `pb_ci_test`).
