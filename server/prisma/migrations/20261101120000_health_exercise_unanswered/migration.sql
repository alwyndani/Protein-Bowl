-- health_biometrics."hasExercise": make "the customer has not answered" representable (NULL).
-- PREPARED, NOT APPLIED. Hand-written to match schema.prisma (`hasExercise Boolean?`); verify with `prisma migrate diff` on a disposable database first.
--
-- Before: BOOLEAN NOT NULL DEFAULT false, so a customer who never answered "Do you exercise regularly?" was stored (and shown) as "No".
-- After:  BOOLEAN NULL, no default. A new profile row stores NULL until the customer chooses Yes or No.
--
-- Data-preserving: no row is updated, backfilled, moved or deleted. Every existing value (true or false) is kept exactly as it is; rows that were
-- stored as false cannot be told apart from a real "No" and therefore stay "No". Relaxing NOT NULL / dropping a default cannot fail on existing data.
-- Rollback (only if no NULL has been written yet, otherwise decide a value first):
--   ALTER TABLE "health_biometrics" ALTER COLUMN "hasExercise" SET DEFAULT false;
--   ALTER TABLE "health_biometrics" ALTER COLUMN "hasExercise" SET NOT NULL;

ALTER TABLE "health_biometrics" ALTER COLUMN "hasExercise" DROP NOT NULL;
ALTER TABLE "health_biometrics" ALTER COLUMN "hasExercise" DROP DEFAULT;
