-- READ-ONLY pre-check for migration A. Run it with psql against ONE database at a time; it opens a READ ONLY transaction and rolls it back. It prints no credentials.
--   psql -h localhost -p 5432 -U postgres -d <database name> -X -v ON_ERROR_STOP=1 -f precheck_migration_a.sql      (psql asks for the password itself)
-- EXPECTED on a database that is ready for migration A: see the "expect" comment on every query.
BEGIN READ ONLY;

-- 1. Which database and server am I on? (the name must be exactly the intended one)
SELECT current_database() AS database, current_setting('server_version') AS server_version, inet_server_port() AS port, current_setting('transaction_read_only') AS read_only;   -- expect read_only = on

-- 2. Migration history: 18 migrations, all finished, none rolled back, tail = 20261013120000_p10c_mess_delivery
SELECT count(*) AS applied, count(*) FILTER (WHERE finished_at IS NULL) AS unfinished, count(*) FILTER (WHERE rolled_back_at IS NOT NULL) AS rolled_back, max(migration_name) AS tail FROM _prisma_migrations;   -- expect 18, 0, 0, 20261013120000_p10c_mess_delivery
SELECT count(*) AS migration_a_records FROM _prisma_migrations WHERE migration_name = '20261020100000_role_simplification_admin_actors';   -- expect 0

-- 3. None of the new objects exist yet
SELECT table_name, column_name FROM information_schema.columns WHERE (table_name, column_name) IN (('delivery_assignments','operatedByUserId'),('delivery_assignments','takenOverFromDriverId'),('delivery_proofs','verifiedByUserId'),('delivery_attempts','operatedByUserId'),('mess_delivery_runs','claimedByUserId'),('mess_delivery_runs','takenOverFromEmployeeId'),('mess_delivery_stops','handedOverByUserId'));   -- expect 0 rows
SELECT conname FROM pg_constraint WHERE conname IN ('delivery_assignments_one_owner_ck','delivery_assignments_takeover_ck','delivery_attempts_one_owner_ck','mess_runs_takeover_ck') OR conname ~ '(operatedByUserId|takenOverFromDriverId|verifiedByUserId|claimedByUserId|takenOverFromEmployeeId|handedOverByUserId)_fkey';   -- expect 0 rows
SELECT indexname FROM pg_indexes WHERE indexname = 'delivery_assignments_operatedByUserId_idx';   -- expect 0 rows

-- 4. The three constraints that migration A re-creates exist in their current form
SELECT conname FROM pg_constraint WHERE conname IN ('delivery_proofs_pin_ck','mess_runs_claim_ck','mess_stops_handed_ck') ORDER BY 1;   -- expect 3 rows

-- 5. Existing rows already satisfy every new / re-created CHECK (all three numbers must be 0, otherwise the migration would fail)
SELECT
  (SELECT count(*) FROM delivery_proofs WHERE method = 'PIN' AND NOT ("codeHash" IS NOT NULL AND "verifiedByEmployeeId" IS NOT NULL)) AS proofs_violating,
  (SELECT count(*) FROM mess_delivery_runs WHERE NOT (("status" <> 'AVAILABLE' OR ("claimedByEmployeeId" IS NULL AND "claimedAt" IS NULL)) AND ("status" NOT IN ('CLAIMED','IN_TRANSIT','COMPLETED') OR ("claimedByEmployeeId" IS NOT NULL AND "claimedAt" IS NOT NULL)))) AS runs_violating,
  (SELECT count(*) FROM mess_delivery_stops WHERE "handoverMethod" = 'CODE' AND "handedOverByEmployeeId" IS NULL) AS stops_violating;   -- expect 0, 0, 0

-- 6. Row counts of the affected tables (write them down: they must be identical after the migration)
SELECT (SELECT count(*) FROM delivery_assignments) AS delivery_assignments, (SELECT count(*) FROM delivery_proofs) AS delivery_proofs, (SELECT count(*) FROM delivery_attempts) AS delivery_attempts, (SELECT count(*) FROM mess_delivery_runs) AS mess_delivery_runs, (SELECT count(*) FROM mess_delivery_stops) AS mess_delivery_stops;

-- 7. Quiet window: nobody else is connected to this database, and no long transaction is open (expect 0 other sessions; a non-zero number means WAIT)
SELECT count(*) AS other_sessions FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();
SELECT pid, state, now() - xact_start AS transaction_age FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND xact_start IS NOT NULL ORDER BY xact_start;   -- expect 0 rows

-- 8. The referenced tables exist
SELECT to_regclass('public.users')::text AS users, to_regclass('public.employee_profiles')::text AS employee_profiles;

ROLLBACK;
