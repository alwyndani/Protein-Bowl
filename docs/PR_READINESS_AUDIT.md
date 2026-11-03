# PR-readiness audit — working tree on branch `role-simplification` (2026-11-01)

> **Two passes.** Pass 1 (§0–§10 below) is the read-only audit. **Pass 2 (§P2, at the end of this file) is the controlled PR-preparation pass and supersedes pass 1 where they differ** (stubs verified, delivery tests restored, migrations reviewed, three docs rewritten, hygiene checked, full verification re-run, exact file lists). Nothing was committed, pushed, merged, migrated or deleted in either pass.

Read-only audit. Nothing was committed, pushed, deleted, renamed, migrated or modified for the audit itself (apart from adding this file and the two doc updates). No secret VALUES are printed here; findings give paths and categories only.

## 0. Inventory (measured)
`git status`: 191 modified + 19 deleted tracked files (210 diff entries, +3,613 / −39,211 lines), and **179** untracked files (`git status` shows 124 entries because some are directories; `-uall` expands them).

| Group | Count | Note |
|---|---|---|
| Deleted (tracked) | 19 | 9 server modules (fmcg, pos, tepache controller/routes/service), 10 web driver-workspace files (delivery workspace/home/panel, `useDeliveryQueue`) |
| **Blanked stubs** (tracked, content replaced by `// REMOVED … delete this file. export {};`) | **44** | Could not be deleted by Claude (guard). They must be `git rm`'d by the user before the PR or the PR ships 44 empty files |
| Modified docs | 5 | ARCHITECTURE, CLAUDE, IMPLEMENTATION_PLAN, IMPLEMENTATION_STATUS, README |
| Modified tests | 53 | server, web and mobile test files (3 of them mobile) |
| Modified application code (non-test, non-stub) | server ~65 src + 6 other (`package.json`, `schema.prisma`, `seed.ts`, `seedProducts.ts`, `reconcilePayments.ts`, `vitest.config.ts`), web ~71 src (incl. stubs counted in their groups), mobile 9 | |
| Untracked | 179 | 56 tests, 16 server modules/utils, 11 web components, 10 server scripts, 2 migrations (+3 draft migration/rollback files), 40+ evidence/draft files, docs, `.claude/`, CI, Docker |

## 1–2. Classification

### A. Required application change (commit)
- **Server:** `server/src/authz/{approvedRoles,permissions,roleScopes}.ts`; `middleware/{auth,rateLimiter}`; `config/env.ts`; `app.ts` (retired routes unmounted; trainer + admin operate routes mounted); `modules/auth/*` (password reset, phone uniqueness, mobile auth); `modules/admin/*` (invitations, staff); `modules/customer/*` (profile: phone, DOB/gender-only save, women-only tri-state); `modules/health/biometricsPresentation.ts`; `utils/{biometricsCalculator,phone}.ts`; `modules/diet/diet.service.ts`; `modules/delivery/*` (driver paths removed; SUPER_ADMIN operate: `deliveryOperate.{routes,service}.ts`); `modules/mess/*` (+ `messDeliveryOperate.routes.ts`); `modules/order/{orderStatus,orderTransition,orderExpiry,order.dto}`; `modules/payment/{paymentReconciliation,paymentReconcileDryRun,reconcileApplyGate,reconcileCli,reconcileTargetGuard}`; `modules/refund/*` (+ `cancellationReview.service.ts`); `modules/procurement/*` (+ `purchasing.service.ts`); `modules/trainer/*`; `modules/email/mailer.ts`; `prisma/schema.prisma`; `prisma/seed.ts`, `seedProducts.ts`, `prisma/seedData/fmcgPackagedProducts.ts` (packaged-food catalogue: kept as customer products); `scripts/{expireUnpaidOrders,reconcilePaymentsProd,reconcilePayments,setupTestDb,startIsolatedApi,checkChildEnv}.ts`, `package.json`.
- **Web:** `src/App.tsx`, `main.tsx`, `context/AuthContext.tsx`, `types.ts`, `components/customer/*` (AuthModal, HealthProfile*, DirectCartCheckoutModal, CustomerHome/Dashboard, CustomerWorkouts, CancellationRequestPanel, DietPlanBuilder, CustomerPlanReview), `components/admin/*` (Recipe publishing, Delivery operations, Operate*, TrainerAssignments, CancellationReview, AdminWorkspace, InvitationHandoff), `components/staff/*`, `components/auth/ResetPasswordPage.tsx`, `components/erp/{ChefDashboard,NutritionistDashboard,NutritionistWorkspace}.tsx`, `services/*`, `utils/*` (roleGuard, approvedRoles, healthProfile, phone, authErrors…), `hooks/usePublishedRecipes.ts`, `data/blankProfile.ts`.
- **Mobile:** `apps/mobile/src/{auth,commerce,copy,navigation,screens}/*`, new `src/orders/*`, `screens/commerce/OrderActionPanels.tsx`.
- **Tooling that CLAUDE.md/CI depend on:** `automation/run-web-tests.mjs`, `.github/workflows/ci.yml`, `server/Dockerfile`, `.dockerignore`, `server/.dockerignore`, `server/scripts/{run-migration-suites.sh,verify-isolated.sh}`, `server/vitest.migrations.config.ts`.

### B. Required tests (commit)
All 53 modified and 56 untracked test/fixture files (`server/src/tests/**` incl. `fixtures/*`, `testDatabase.ts`, `migrationDb.ts` helpers; `src/**/*.test.*`; `apps/mobile/__tests__/*`). Two stale-looking items to check: `src/components/customer/CheckoutModal.test.tsx` now only asserts the removed files are not imported (fine, but name is misleading); `server/src/tests/p6b.isolated.test.ts` uses hard-coded fixture JWT secrets (test only).

### C. Documentation
- Commit: `README.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `PROGRESS.md`, `docs/{OPERATIONS,SANDBOX_VERIFICATION,E2E_CHECKLIST,PR_READINESS_AUDIT}.md`, `server/TESTING.md`.
- **Inconsistent (fix before PR):** `IMPLEMENTATION_STATUS.md` still lists POS/Bakery-FMCG/Tepache/MD/HRM/Finance/CMS as "DEFERRED, Mock/Partial" with their `/api/v1/...` routes (these APIs no longer exist); `PROTEIN_BOWL_MASTER_DOCUMENTATION.md` (untracked, 1 file) documents `/md`, `/hrm`, `/finance`, `/cms` routes as "stubs" and must be checked line by line against the six-role scope; `PROJECT_COMPLETION_ROADMAP.md` (tracked, unmodified) still cites `/pos/*`, `/kds`; `SCOPE_REMOVAL_IMPACT_REPORT.md` is a point-in-time report (keep only if wanted as history).
- `automation/reports/*` (4 dated reports + README): working notes from earlier sessions → **keep local** or move to `docs/history/`.

### D. Migrations
`server/prisma/migrations/20261020100000_role_simplification_admin_actors/` (A), `…/20261031120000_trainer_procurement_foundation/` — see §5. Draft/proposed (not under `migrations/`): `server/prisma/proposed/role-simplification/**` (Migration B enum shrink, rollback.sql, pre/post checks, procedures).

### E. Generated / build artefact
None found tracked or untracked: `dist/`, `node_modules/`, `*.tsbuildinfo` are ignored; `git status` shows no build output. Tracked binaries unchanged: `public/Protein_Bowl_Enterprise_SRS.docx` (**obsolete**: its generator was removed; delete or keep deliberately) and three `src/assets/images/*.jpg`. Two lockfiles are tracked (`package-lock.json`, `bun.lock`); neither is modified.

### F. Temporary / debug
- `server/prisma/proposed/role-simplification/evidence/**` (≈40 files: b2a/g1 test-run logs including failing intermediate runs, shared-test row-count CSVs, one `counts_before.csv.keep`). They contain only table row counts and test output (no credentials or rows), but they record the shared development database name/port and local temp paths (a temporary folder inside the Windows user profile, `C:/Users/[USER]/AppData/...`). **Keep local; do not commit.**
- `server/scripts/takeoverLiveDelivery.ts`: one-off script hard-coded to the development database `protein_bowl_db` and a named development order; dry-run default, guarded, but environment-specific → **keep local** (or commit only after generalising).
- `.claude/skills/pb-work/SKILL.md`: contains the local path of the database-backup folder in the Windows user profile (`C:/Users/[USER]/…`) → keep local (or remove the path first).

### G. Unrelated or obsolete
The 44 blanked stubs and 19 deletions (retired POS, Bakery/FMCG ERP, Tepache, MD, HRM, Finance, CMS, SRS generator, Swiggy/Zomato, driver workspace, made-up pricing/mock data, guest/COD-era modal). They are **required for scope** but must be removed with `git rm`, not committed as empty files.

## 3. Untracked files individually (179)
Each was checked by content class, not by name (secret/PII scans over all of them, plus reading the head of every script, workflow, Dockerfile, settings and migration).
| Path group | Verdict |
|---|---|
| `.claude/hooks/pb-guard.mjs`, `.claude/settings.json` | see §6 |
| `.claude/skills/pb-work/SKILL.md` | local |
| `.dockerignore`, `server/.dockerignore`, `server/Dockerfile` | commit; **Docker image never built or run** |
| `.github/workflows/ci.yml` | commit; **never executed** (no GitHub access from here). Uses only throwaway service-container databases |
| `PROGRESS.md`, `docs/*`, `server/TESTING.md` | commit |
| `PROTEIN_BOWL_MASTER_DOCUMENTATION.md`, `SCOPE_REMOVAL_IMPACT_REPORT.md` | further review (stale content) |
| `automation/run-web-tests.mjs` | commit (required runner) |
| `automation/reports/*` (5) | local |
| `apps/mobile/__tests__/*` (4), `apps/mobile/src/orders/*` (2), `OrderActionPanels.tsx` | commit |
| `server/prisma/migrations/*` (2 SQL files) | commit after approval (§5) |
| `server/prisma/proposed/**` docs, SQL, `migration-b/**` | commit the README/SQL/procedure docs as drafts; evidence → local |
| `server/prisma/seedData/fmcgPackagedProducts.ts` | commit (customer packaged-food catalogue) |
| `server/scripts/*` (8 files) | commit except `takeoverLiveDelivery.ts` |
| `server/src/**` new modules (16) and tests (36) and fixtures (2) | commit |
| `src/**` new components/services/hooks/utils/tests (≈45) | commit |

## 4. Secrets, credentials, tokens, personal data (paths only)
- **No real secret found.** Scans covered private-key headers, Razorpay/Stripe/AWS/GitHub/Slack/Resend key shapes, JWTs, bcrypt hashes, personal-provider e-mail addresses and database URLs with passwords, across the whole tree except `node_modules`/`dist`/`.git`.
- Test/fixture values only (placeholders by their own labels): `src/test/razorpayFake.ts`, `server/src/tests/p11c2.reconcileGuard.test.ts` (fake `rzp_test_…` shapes and `postgresql://…LEAKSECRET@…` leak-detection fixtures), `server/src/tests/{setup.ts,p6a,p6b.isolated,p7b.unit,p7c.*,invite-config}.test.ts` and `server/src/modules/payment/mock.provider.ts` (dummy secrets for the mock provider), `server/scripts/startIsolatedApi.ts` (fixed local-only JWT secrets for the isolated E2E API). `server/TESTING.md` and `.github/workflows/ci.yml` contain the default local/CI database password `postgres` and a documented throwaway `disposable1`.
- **Environment files:** `.env` and `server/.env`-style files exist locally but are git-ignored (`.gitignore` lines `.env`, `.env.*`, `!.env.example`); they were NOT opened. Only `.env.example` and `server/.env.example` are tracked. `server/.env.example` has CRLF line endings (cosmetic).
- Seed data: `server/prisma/seed.ts` hashes a documented development default password (`SEED_DEFAULT_PASSWORD`); development/test only by CLAUDE.md; keep it out of any production run.
- Personal data: no real customer e-mail/phone/health data in files. Evidence CSVs hold row counts only. Test accounts created in the browser (`e2e.*@example.test`) live only in the isolated test database.

## 5. Migrations
| | A `20261020100000_role_simplification_admin_actors` | B `20261031120000_trainer_procurement_foundation` |
|---|---|---|
| Purpose | Additive columns/FKs/CHECKs so a SUPER_ADMIN can operate delivery (`operatedByUserId`, `verifiedByUserId`, mess `claimedByUserId` …); re-creates 3 CHECK constraints with a *wider* condition | New tables: `trainer_assignments`, `workout_logs`, `suppliers`, `purchase_orders/lines`, `goods_receipts/lines`, `cancellation_requests` (partial unique index: one PENDING per order), `password_reset_tokens`; 2 indexes on `workout_plans` |
| Needed for approved six-role scope? | **Yes** (driver role retired → administrator-operated delivery; code reads/writes these columns) | **Yes** (Trainer, Procurement, cancellation requests, password reset) |
| Depends on | existing tables `delivery_assignments`, `delivery_proofs`, `delivery_attempts`, `mess_delivery_runs/stops`, `users`, `employee_profiles` (all from P9–P10C) | `users`, `orders`, `inventory_items`, `customer_profiles`, `workout_plans` |
| Ordering | sorts after the applied tail `20261013120000_p10c_mess_delivery` and before B | sorts after A |
| Evidence | Byte-identical to the reviewed copy under `proposed/` (verified with `diff`); has pre/post checks and a rollback.sql; replayed on disposable databases earlier | "Hand-written to match schema.prisma; verify with `migrate diff` on a disposable database" — **`migrate diff` has NOT been run**; the isolated test database was built with it and the full suite passes (1646 server tests) |
| Risk | purely additive, nothing updated/deleted; the 3 re-created CHECKs are dropped and re-added (brief lock) | additive; new constraint names must match `schema.prisma` (unchecked by `migrate diff`) |

Migration B-draft (`migration-b/20261020110000_role_enum_six_roles`) shrinks the Role enum and is **destructive/irreversible-ish**: not part of this PR, stays under `proposed/`.
**Operational risk:** code in this branch queries the new tables/columns; against a database that has not had A and B applied (the shared development database, and any deployment) the customer profile, password-reset, trainer, procurement, cancellation-request and delivery paths will fail. Apply order: backup → A → B → verify; **not applied anywhere except disposable test databases.** Schema drift risk: `schema.prisma` is modified (+211) and Prisma client regeneration is required (`prisma generate`) on every environment.

## 6. `.claude/` guard files
| File | Recommendation | Why |
|---|---|---|
| `.claude/hooks/pb-guard.mjs` | **Commit** | Policy referenced by CLAUDE.md §7; no secrets or local paths (checked); lets every contributor's Claude sessions share the same shell/database/.env rules |
| `.claude/settings.json` | **Commit** | Permission allow/ask/deny lists and the hook wiring; no secrets; project-wide policy |
| `.claude/skills/pb-work/SKILL.md` | **Keep local** (or commit after removing the local backup-folder path) | Personal workflow; manual-only |
| `.claude/settings.local.json` (does not exist yet) | Add `.claude/settings.local.json` to `.gitignore` | Per-user overrides must never be committed |
Caveat: CLAUDE.md calls these "user-owned": confirm the owner wants them shared. The hook also blocks Claude from editing its own guard (`Edit(/.claude/**)` denied), so any change must be made by the user.

## 7. Line endings
- No `.gitattributes` exists. `core.autocrlf` is effectively on (git prints "LF will be replaced by CRLF" for ~200 files): the **index is LF for all 543 tracked text files** (`git ls-files --eol`: 502 `i/lf w/lf`, 21 `i/lf w/crlf`, 1 `i/lf w/mixed`, 4 binary). So the warnings are cosmetic: committing will store LF either way, and no file's index content changes.
- CRLF working-tree files: 17 server/web sources and tests plus `server/.env.example`; mixed: `server/src/tests/p7a.unit.test.ts`. No untracked file contains CR.
- Real risk: on a Windows checkout with autocrlf, `*.sh` and `Dockerfile` would become CRLF and break in Docker/CI.
- **Proposed `.gitattributes`** (new file at repo root; not created by this audit):
```
* text=auto eol=lf
*.sh text eol=lf
Dockerfile text eol=lf
*.png *.jpg *.jpeg *.gif *.ico *.webp *.woff *.woff2 *.ttf *.docx *.pdf binary
```
  Safe because the index is already LF: adding it changes no tracked file. Verify before committing with `git add --renormalize --dry-run .` (expected: nothing listed except `.gitattributes`). Do not run a repo-wide `dos2unix`.

## 8. Accidental-deletion check (customer-facing FMCG, payment, order, inventory, auth, delivery)
- **Not accidental.** The 9 deleted server files were staff-only APIs for retired roles (`/fmcg/batches|challans`, `/pos/transaction(s)`, `/tepache/tanks|bottle-returns`). Mounted routes still include auth (+ mobile), customers, products, recipes, cart, checkout, orders (payment, refund, delivery-code, order), mess, diets, kds, procurement, trainer, delivery, admin (payment, refund, kitchen, delivery, delivery-operate, mess), staff.
- Customer packaged-FMCG and Tepache **products** stay in the catalogue (`/api/v1/products`, `seedData/fmcgPackagedProducts.ts`).
- Prisma models for the retired tables are all still in `schema.prisma` (only additions; two relation renames for `DeliveryAssignment`/`EmployeeProfile`); dropping them is the unapplied Migration C draft.
- Delivery: driver endpoints and the driver workspace were removed; the customer Delivery Code route (`deliveryCode.routes.ts`), proof verification and administrator operation remain; delivery/mess tests rewritten accordingly (server `delivery.test.ts` shrank 741→130 lines: review that no customer-side assertion was dropped).
- Web: `DirectGuestOrderModal` (guest/COD path), `CheckoutModal` (made-up address/price, no payment), cost/price calculators and `mock*` data were blanked; `DirectCartCheckoutModal` (server-priced, ONLINE only) is the live checkout. `grep` finds no import of any blanked file.
- **Needs a human decision:** deleting `deliveryTypes`-adjacent driver tests/components (10 web files) is correct for six roles, but the PR description should say so explicitly.

## 9. Missing / inconsistent tests and documentation
1. No web test for the women-only "Choose…" default (server side is tested) → add.
2. "Do you exercise?" still preselects Yes (non-null column) → product decision.
3. Not covered in the browser yet: women-only answer persistence and API-down menu banner (added to `E2E_CHECKLIST.md`).
4. `migrate diff` against `schema.prisma` not run for migration B; Dockerfile and CI workflow never executed; mobile app never run on a device/emulator (automated jest only); Razorpay sandbox scenarios (docs/SANDBOX_VERIFICATION.md §A) not started.
5. Stale docs listed in §C; `CLAUDE.md` says "no commit/push… to be approved", fine, but its test-count lines (if any) must be refreshed from `PROGRESS.md`.
6. Web CI runs `npx vitest run` at the root while local runs use `automation/run-web-tests.mjs` (to avoid loading `.env`); harmless in CI but the two differ.
7. Pre-existing `Edit` race risk is a tooling note only.

## 10. Report
**Verification re-run for this audit (all read-only):** web typecheck 0 errors; web tests 60 files / 656 passed; web `npm run build` OK (chunk-size warning only); server typecheck clean; server suite on `pb_ci_test` 72 files / 1646 passed (earlier today); mobile `tsc` clean, jest 23 suites / 540 passed.

**Required files:** groups A, B, C (commit list), D, and the 19 deletions + 44 blanked files removed with `git rm`.
**Keep local:** `server/prisma/proposed/role-simplification/evidence/**`, `server/scripts/takeoverLiveDelivery.ts`, `.claude/skills/pb-work/`, `automation/reports/*`, all `.env*` (already ignored), `.claude/settings.local.json` (add to `.gitignore`).
**Needs further review:** `IMPLEMENTATION_STATUS.md`, `PROJECT_COMPLETION_ROADMAP.md`, `PROTEIN_BOWL_MASTER_DOCUMENTATION.md`, `SCOPE_REMOVAL_IMPACT_REPORT.md`, `public/Protein_Bowl_Enterprise_SRS.docx`, `server/src/tests/delivery.test.ts` (shrunk), `README.md` (−909 lines), `.claude/*` ownership, Dockerfile, CI workflow.
**Potential security issues:** none confirmed. Watch-list: fixed-secret isolated API script (local only), default seed password (dev only), mock payment provider (production config rejects it per CLAUDE.md), `LogMailer` (keeps mail in memory only, refused in production), `takeoverLiveDelivery.ts` operates on live data if misused (guarded; keep local), CI/Docker unexecuted.
**Migration risks:** §5 — two additive migrations unapplied; B unverified with `migrate diff`; code requires them; Migration B-draft/C are destructive and out of scope.
**Remaining functional blockers:** Razorpay sandbox (payment, paid cancellation/refund, kitchen/delivery after payment) not tested; the two outstanding browser checks; migrations A + trainer/procurement not applied to any non-disposable database; mobile app not run on a device; CI/Docker unverified.

**Is the tree safe to review?** Yes (nothing secret, no build output, deletions are intentional). **Is it ready to commit as-is?** No: first `git rm` the 44 stubs, decide the "keep local" files, add `.gitattributes`/`.gitignore` lines, fix the stale docs, and (after approval) commit in logical commits rather than one 334-file commit (suggested split: 1 retired-scope removal; 2 authz/auth/identity; 3 customer health/profile/checkout; 4 orders/payments/cancellation; 5 delivery/mess admin-operated; 6 trainer/procurement; 7 migrations + schema; 8 tooling/CI/docs).

---

# P2. Controlled PR-preparation pass (2026-11-01) — nothing committed, deleted, migrated or pushed

## P2.1 The 44 blanked stub files
All 44 are 2-line files (`// REMOVED … delete this file.` + `export {};`). Verified by a repository-wide search for imports, requires, re-exports and dynamic imports of each name: **no source file imports any of them** (typecheck and all suites also pass with them as empty modules). The only references are tests that read them to assert they are empty. Four such tests would have FAILED after deletion (`readFileSync` on a missing file); they were changed in this pass to accept "deleted or empty stub" (`src/test/deliverySecurity.test.ts`, `src/components/customer/CheckoutModal.test.tsx`, `src/test/p7dSecurity.test.ts`, `src/test/noDemoData.test.ts`), and the full web suite still passes (656). No customer-facing function depends on them: the live equivalents are `DirectCartCheckoutModal` (checkout), `CustomerWorkouts` (workouts), `RecipePublishing`/`ChefDashboard` (menu), server `products`/`orders`/`delivery-code` routes.

**Exact list (44):**
```
scripts/generate_srs_docx.ts
server/src/modules/cms/cms.controller.ts          server/src/modules/cms/cms.routes.ts          server/src/modules/cms/cms.service.ts
server/src/modules/finance/finance.controller.ts  server/src/modules/finance/finance.routes.ts  server/src/modules/finance/finance.service.ts
server/src/modules/hrm/hrm.controller.ts          server/src/modules/hrm/hrm.routes.ts          server/src/modules/hrm/hrm.service.ts
server/src/modules/md/md.controller.ts            server/src/modules/md/md.routes.ts            server/src/modules/md/md.service.ts
src/components/common/DishPriceCalculator.tsx     src/components/common/IngredientPriceCalculator.tsx   src/components/common/SRSDownloadModal.tsx
src/components/customer/CheckoutModal.tsx         src/components/customer/DirectGuestOrderModal.tsx     src/components/customer/WorkoutPlanTab.tsx
src/components/erp/BakeryFMCGDashboard.tsx        src/components/erp/DeliveryDashboard.tsx      src/components/erp/FinancialsModule.tsx
src/components/erp/HRMModule.tsx                  src/components/erp/MDDashboard.tsx            src/components/erp/MultiKitchenOverviewModule.tsx
src/components/erp/OmnichannelSalesModule.tsx     src/components/erp/POSDashboard.tsx           src/components/erp/ProcurementDashboard.tsx
src/components/erp/TepacheBreweryDashboard.tsx    src/components/erp/TrainerDashboard.tsx
src/components/mess/SwiggyZomatoAggregatorPortal.tsx
src/data/cloudKitchensData.ts   src/data/mockBakeryFMCGData.ts   src/data/mockData.ts   src/data/mockDirectOrdersData.ts
src/data/mockFitnessData.ts     src/data/mockKeralaMessData.ts   src/data/mockOmnichannelData.ts   src/data/mockPOSData.ts   src/data/mockTepacheData.ts
src/services/kdsService.ts      src/services/mdService.ts
src/utils/costEngine.ts         src/utils/srsDocxGenerator.ts
```
**Prepared deletion command (NOT executed; run from the repository root after you approve):**
```bash
git rm -f -- scripts/generate_srs_docx.ts \
  server/src/modules/cms/cms.controller.ts server/src/modules/cms/cms.routes.ts server/src/modules/cms/cms.service.ts \
  server/src/modules/finance/finance.controller.ts server/src/modules/finance/finance.routes.ts server/src/modules/finance/finance.service.ts \
  server/src/modules/hrm/hrm.controller.ts server/src/modules/hrm/hrm.routes.ts server/src/modules/hrm/hrm.service.ts \
  server/src/modules/md/md.controller.ts server/src/modules/md/md.routes.ts server/src/modules/md/md.service.ts \
  src/components/common/DishPriceCalculator.tsx src/components/common/IngredientPriceCalculator.tsx src/components/common/SRSDownloadModal.tsx \
  src/components/customer/CheckoutModal.tsx src/components/customer/DirectGuestOrderModal.tsx src/components/customer/WorkoutPlanTab.tsx \
  src/components/erp/BakeryFMCGDashboard.tsx src/components/erp/DeliveryDashboard.tsx src/components/erp/FinancialsModule.tsx \
  src/components/erp/HRMModule.tsx src/components/erp/MDDashboard.tsx src/components/erp/MultiKitchenOverviewModule.tsx \
  src/components/erp/OmnichannelSalesModule.tsx src/components/erp/POSDashboard.tsx src/components/erp/ProcurementDashboard.tsx \
  src/components/erp/TepacheBreweryDashboard.tsx src/components/erp/TrainerDashboard.tsx \
  src/components/mess/SwiggyZomatoAggregatorPortal.tsx \
  src/data/cloudKitchensData.ts src/data/mockBakeryFMCGData.ts src/data/mockData.ts src/data/mockDirectOrdersData.ts \
  src/data/mockFitnessData.ts src/data/mockKeralaMessData.ts src/data/mockOmnichannelData.ts src/data/mockPOSData.ts src/data/mockTepacheData.ts \
  src/services/kdsService.ts src/services/mdService.ts src/utils/costEngine.ts src/utils/srsDocxGenerator.ts
```
The 19 already-deleted files (9 server modules `fmcg|pos|tepache` controller/routes/service, and `src/components/erp/delivery/{DeliveryHome,DeliveryResume,DeliveryVerify,DeliveryWorkspace,MessDeliveryPanel}` + their tests + `src/hooks/useDeliveryQueue{,.test}`) are staged by `git add -u`; no separate command is needed. **After running the deletion, re-run the web, server and mobile suites** (the four tolerant tests above are the only ones that touched these files).

## P2.2 Delivery test coverage (old 52 scenarios → current)
Old `delivery.test.ts` (52 scenarios, 741 lines) was the P9A **driver** suite. Current 14 scenarios cover what is left of that surface; the administrator-operated equivalents are in `adminDelivery.stage3a.test.ts` (was 28, **now 33**), `deliveryProof.test.ts` (40 + 11b-d), `deliveryResolution.test.ts`, `adminMessDelivery.stage3a.test.ts`, `b2a.retiredDelivery.test.ts`.

| Old scenario | Fate |
|---|---|
| 1 unauthenticated 401; 2/4/5 role RBAC; 3 permission catalogue | replaced: new 1–6 + adminDelivery 1–4 (every endpoint 401/403, step-up on every write, SUPER_ADMIN-only) |
| 6, 17 queue/claim eligibility (ONLINE+PAID+READY, no COD/unpaid/refunded/unrouted) | covered: adminDelivery 7 (same ineligible set refused) |
| 7–8, 11, 19 driver queue ownership, branch isolation, scope removal | **removed with the driver role** (no driver exists; routes answer 404, tested in new 1–3) |
| 9–10 DTO allow-lists (pre/post claim) | replaced: new 8 (monitor DTO allow-list) + adminDelivery 6 (operated DTO has no code/hash/payment/refund/email/price) |
| **12 address comes from the IMMUTABLE order snapshot** | **was lost → RESTORED** as adminDelivery 21f |
| 13 monitor bounds/grouping | covered: new 7 |
| 14–16, 39–44 claim, claim races | **removed with the driver role** (claim routes no longer exist; adminDelivery 11) |
| 18 strict bodies (no status/payment/amount/…) | covered: adminDelivery 4 and new 2 |
| 20–22, 45 dispatch, replay, double dispatch | covered: adminDelivery 5, 10 |
| 23–24, 46 payment gate re-read under the order lock; stale cards | covered: adminDelivery 8, 7, 14 |
| 25 failure report (state, order stays DISPATCHED, no payment/refund/event change, audit) | covered: adminDelivery 21 + **extended in 21b** |
| **26 reasonCode exactly five codes; client-built deliveryNotes rejected** | **was lost → RESTORED** as 21b |
| **27 note sanitization / hostile text round-trip** | **was lost → RESTORED** as 21c |
| **28 parser never trusts unknown formats** | **was lost → RESTORED** as 21d (DB-free) |
| 29–30 owner-only report, driver "issue reported" view | owner-only is now admin-only (adminDelivery 9, 21); driver view removed |
| **31 after a failure the order stays DISPATCHED; dispatch is a no-op** | **was weak → RESTORED** as 21e |
| 32–38 admin assign/reassign/unassign of a driver | **removed with the driver role** (routes answer 404, new 2) |
| 47 MD read-only | **removed with the MD role** (MD refused everywhere: new 6, adminDelivery 1–2) |
| 48–51 legacy API 404, DELIVERED unreachable, transition-service refusal, static guard | kept: new 9–12 (+ 13 no source authorizes DELIVERY) |
| 52 Chef cannot reach delivery; no change to kitchen/payments/refunds | kept: new 14 |
Customer-facing coverage that remains: customer issue/state/regenerate of the **delivery code** and its limits (deliveryProof 5–13, 11b–d), **delivery-code validation** (normalisation, 5-attempt/15-minute persisted lock, three lock cycles, parallel guesses, stale code after regeneration, double verify: deliveryProof 14–29), **delivery status labels** seen by the customer (deliveryResolution 32: DELIVERY_ISSUE / RETRY_PLANNED / ON_THE_WAY / DELIVERED, no reasons/drivers/codes), **authorization** (customer routes CUSTOMER-only incl. a retired DELIVERY token refused: b2a.retiredDelivery; only SUPER_ADMIN enters the code: deliveryProof 16), no leakage of the code/hash to logs, audit and errors (deliveryProof 38–39). **Customer "order tracking"** is the order DTO's derived `delivery` field (deliveryResolution 32) plus `GET /orders/:id`/`my-orders` (commerce suites); there is no separate tracking endpoint test beyond those. Removed deliveryResolution scenarios (resume/reassign rules for drivers, MD structured history, driver queue exposure) are driver- or MD-specific; their administrator equivalents are adminDelivery 21–25 and deliveryResolution 5–7.
Result: `adminDelivery.stage3a.test.ts` 33/33 pass; full server suite 1651 pass.

## P2.3 Migration review (no migration applied anywhere)
Method: read both SQL files against the current `schema.prisma` (every new model/column/index/FK), the DB-free test `migrationConsistency.unit.test.ts` (parses `schema.prisma` and asserts column, index and FK coverage and "purely additive" for the second migration), the integration suites that run on the isolated `pb_ci_test` database built with `prisma migrate deploy` (`server/TESTING.md`), and the older `*.migration.test.ts` suites. Prisma CLI commands were not run (blocked by the guard and by your rules).

| | `20261020100000_role_simplification_admin_actors` | `20261031120000_trainer_procurement_foundation` |
|---|---|---|
| SQL vs schema | 7 nullable columns, 7 RESTRICT FKs and 1 index match the 7 new fields/relations in `schema.prisma` (`operatedByUserId`, `takenOverFromDriverId`, `verifiedByUserId`, attempt `operatedByUserId`, mess run `claimedByUserId`/`takenOverFromEmployeeId`, stop `handedOverByUserId`); the two relation renames in the schema are client-side only | all 9 tables, defaults, types (`Float`→DOUBLE PRECISION, `Decimal(p,s)`), unique/regular indexes and FKs with the schema's ON DELETE rules match; the 2 `workout_plans` indexes match; the partial unique index `cancellation_requests_one_pending_per_order` and the CHECK constraints are intentionally SQL-only |
| Constraints | 4 new CHECKs, 3 CHECKs dropped and re-added **wider** (never narrower); every existing row satisfies them (precheck query 5, earlier run) | CHECKs on status vocabularies, quantities ≥ 0 / > 0, effort 1–10, one PENDING request per order |
| Dependencies | existing P9–P10C tables + `users`, `employee_profiles` | `users`, `orders`, `inventory_items`, `customer_profiles`, `workout_plans`, `kitchen_branches` |
| Order / fresh DB | sorts after `20261013120000_p10c_mess_delivery`; consistency test asserts the second sorts after all others | after A; `migrate deploy` on an empty database applies all 20 folders in order; the isolated test database used for all 1651 server tests is built that way |
| Required? | **Yes**: the retired driver role is replaced by SUPER_ADMIN operation; code writes these columns (delivery/mess admin routes, proof verification) | **Yes**: Trainer, Procurement, cancellation requests (customer-facing paid-order cancellation), password reset (all roles) |
| Risk | brief locks while 3 CHECKs are re-created; none touch data; rollback.sql exists | none for data (additive); **never checked with `prisma migrate diff`** (needs a disposable database and a Prisma command: please run it yourself or approve a one-off, see below); hand-written, so a mismatch would only show as a diff |
**Approval status: NOT APPROVED, NOT APPLIED.** Neither was applied to your development or production database; both exist only on disposable test databases. Code in this branch fails at runtime against any database lacking them (profile save, password reset, trainer, procurement, cancellation requests, delivery administration).
**Safe test procedure (nothing touches development/production):** (1) take a verified backup of the target; (2) on a throwaway database: create it, `DATABASE_URL=<throwaway> npx prisma migrate deploy`, then `npx prisma migrate diff --from-url <throwaway> --to-schema-datamodel prisma/schema.prisma --exit-code` (expected: only the documented SQL-only items differ); (3) run the server suites against it (`TEST_DATABASE_URL`, `server/TESTING.md`) and `npm run test:migrations`; (4) only then, with your written approval, A then B on development, with the pre/post checks in `server/prisma/proposed/role-simplification/` and the backup/rollback notes; (5) production last. Never `db push`, never `migrate reset` on a non-disposable database. The enum-shrink and drop-tables drafts must NOT be included.

## P2.4 Documentation updated
`IMPLEMENTATION_STATUS.md`, `PROJECT_COMPLETION_ROADMAP.md` and `PROTEIN_BOWL_MASTER_DOCUMENTATION.md` were **rewritten** (477/409/823 stale lines → concise current documents) around the six roles and ONLINE-only payment; retired modules appear only under "Removed from the product / non-goals", never as active or deferred; the module matrix lists the mounted routes; migrations, blockers and non-verified items are stated. `README.md` and `ARCHITECTURE.md` were already updated earlier (not re-edited). `SCOPE_REMOVAL_IMPACT_REPORT.md` is a point-in-time report with a local path: **keep local**.
**`public/Protein_Bowl_Enterprise_SRS.docx` (29 KB, only in the initial commit, no code references it):** its text still describes retired modules (POS ×20, HRM ×11, Tepache ×4, Bakery ×3, MD ×4). Because it sits in `public/`, Vite copies it into the website build, i.e. **it would be published with the site**. Recommendation: **remove it from `public/`** (`git rm public/Protein_Bowl_Enterprise_SRS.docx`; it stays in git history, so no archive copy is needed; if you want a copy outside the repo, save it yourself first). Not deleted.

## P2.5 Git hygiene
**Proposed `.gitattributes` (not created; prepared text):**
```
* text=auto eol=lf
*.sh text eol=lf
Dockerfile text eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.webp binary
*.woff binary
*.woff2 binary
*.ttf binary
*.docx binary
*.pdf binary
```
Safe because every tracked text file is already LF in the index (543 of 543); verify with `git add --renormalize --dry-run .` before the first commit (expected: only `.gitattributes` listed).
**`.gitignore`:** `.claude/settings.local.json` is **not** ignored (checked with `git check-ignore`; the file does not exist yet). Proposed addition: `.claude/settings.local.json`. `.env*` (except `.env.example`), `node_modules/`, `dist/`, `*.log`, `*.tsbuildinfo`, `tmp/`, `scratch/` are ignored.
**Guard files:** commit `.claude/hooks/pb-guard.mjs` and `.claude/settings.json` (policy referenced by CLAUDE.md §7; no secrets or local paths); keep local `.claude/skills/pb-work/SKILL.md` (contains a local backup path).
**Confirmed for the PR candidates:** no secrets (pass 1 scans; no `.env*` file is tracked or untracked), no generated artifacts (`dist/` ignored; no `.log/.tmp/.bak/.dump/.zip` or file over 200 KB among untracked files), no temp files except `evidence/shared-test/counts_before.csv.keep` (local set). **Local paths found and handled:** `docs/E2E_CHECKLIST.md` (two `cd <local user-profile path>` lines replaced with `<repository root>` in this pass); still present in files that should stay local or be sanitized: `SCOPE_REMOVAL_IMPACT_REPORT.md`, `automation/reports/*`, `server/prisma/proposed/role-simplification/SHARED_TEST_PROCEDURE.md` and `SHARED_TEST_RECOVERY_PLAN.md` (backup path + checksum of a database dump), `.claude/skills/pb-work/SKILL.md`, the `evidence/` folder, and this audit file (it quotes those paths as findings; reword before commit if you want zero local paths).

## P2.6 Verification actually executed in this pass
| Check | Result |
|---|---|
| Server typecheck (`tsc --noEmit -p .`) | clean |
| Full server suite on isolated `pb_ci_test` | **72 files / 1651 passed** (1646 + 5 restored delivery tests) |
| Web typecheck | 0 errors |
| Full web suite | **60 files / 656 passed** |
| Mobile typecheck (`tsc --noEmit`) | clean |
| Mobile suite | **23 suites / 540 passed** |
| Web production build | OK (`built in 5.35s`, chunk-size warning only) |
| Not executed | Prisma commands, `migrate diff`, migration suites (`npm run test:migrations`), CI workflow, Docker build, mobile on a device, Razorpay sandbox, any git write command |

## P2.7 Final lists
**Ready for commit (after your approval; exact pathspecs):**
- All tracked modifications and deletions: `git add -u` (this also stages the 19 deletions; run the stub `git rm` above first, or after; either order works).
- Untracked, explicit:
```
.claude/hooks/pb-guard.mjs  .claude/settings.json
.dockerignore  server/.dockerignore  server/Dockerfile  .github/workflows/ci.yml
PROGRESS.md  PROTEIN_BOWL_MASTER_DOCUMENTATION.md
docs/E2E_CHECKLIST.md  docs/OPERATIONS.md  docs/SANDBOX_VERIFICATION.md  docs/PR_READINESS_AUDIT.md  server/TESTING.md
automation/run-web-tests.mjs
apps/mobile/__tests__/noApprovedRole.test.ts  apps/mobile/__tests__/orderActions.test.tsx  apps/mobile/__tests__/passwordReset.test.tsx  apps/mobile/__tests__/validation.test.ts
apps/mobile/src/orders  apps/mobile/src/screens/commerce/OrderActionPanels.tsx
server/prisma/migrations/20261020100000_role_simplification_admin_actors  server/prisma/migrations/20261031120000_trainer_procurement_foundation   (only after migration approval)
server/prisma/seedData/fmcgPackagedProducts.ts
server/scripts/checkChildEnv.ts  server/scripts/expireUnpaidOrders.ts  server/scripts/reconcilePaymentsProd.ts  server/scripts/run-migration-suites.sh  server/scripts/setupTestDb.ts  server/scripts/startIsolatedApi.ts  server/scripts/verify-isolated.sh
server/src  (all untracked files below it: authz/approvedRoles, modules/{auth,delivery,email,health,mess,order,payment,procurement,refund,trainer}/*, utils/phone, and 36 tests + fixtures)
server/vitest.migrations.config.ts
src  (all untracked files below it: components/{admin,auth,customer,erp,staff}, context, data/blankProfile.ts, hooks/usePublishedRecipes*, services, test, utils)
server/prisma/proposed/role-simplification  EXCLUDING evidence/, SHARED_TEST_PROCEDURE.md and SHARED_TEST_RECOVERY_PLAN.md  (README, BACKUP_AND_RECOVERY, MESS_CUSTOMER_IMPACT_INSPECTION_PLAN, pre/postcheck SQL, rollback, migration-b draft: drafts only)
.gitattributes (new, proposed above)   .gitignore (one added line)
```
**To delete (not executed):** the 44 stubs (P2.1) and, on your decision, `public/Protein_Bowl_Enterprise_SRS.docx`.
**Keep locally (do not commit):** `server/prisma/proposed/role-simplification/evidence/**` (incl. `.keep`), `…/SHARED_TEST_PROCEDURE.md`, `…/SHARED_TEST_RECOVERY_PLAN.md`, `server/scripts/takeoverLiveDelivery.ts`, `.claude/skills/pb-work/`, `automation/reports/*`, `SCOPE_REMOVAL_IMPACT_REPORT.md`, every `.env*` file, any future `.claude/settings.local.json`.
**Remaining functional concerns:** Razorpay sandbox not started (no real payment ever verified); staff journeys not browser-tested (checklist §X); women-only answer persistence and API-down banner (O1, O2) not browser-tested; "Do you exercise?" still preselects Yes; **server address defaults**: `POST /customers/me/addresses` still defaults `title` to "Home" and `state` to "Kerala" when a client omits them (web and its tests now require both; mobile address form not reviewed), so an API client can still store a defaulted address; CI workflow, Docker image and mobile-on-device never executed; migrations unapplied.
**Remaining security concerns (none confirmed exploitable):** the unreviewed mobile address path above; fixed development-only secrets in `startIsolatedApi.ts` and the documented seed default password (never use outside local/dev); `takeoverLiveDelivery.ts` operates on live data if misused (keep local); mock payment provider and `LogMailer` are refused in production by config (tested), but CI/Docker are unverified; two stale-looking local paths remain in committed docs unless reworded; no secret scanner (e.g. gitleaks) was available offline — the scans were pattern based.
**Migration approval status:** both migrations **pending your approval; not applied**; `migrate diff` still to be run on a disposable database.
**Final test results:** see P2.6 (all green; 1651 server / 656 web / 540 mobile). **Superseded by P3 below.**

---

# P3. Final checks (2026-11-01) — nothing staged, committed, deleted, migrated or pushed

## P3.1 Address API consistency — FIXED
- **Server:** `createAddressSchema` no longer defaults `title` ("Home") or `state` ("Kerala"); both are required, trimmed, 1–60 characters; the same rule applies to updates (an update cannot blank them; an omitted field keeps its value). `customer.service.ts` no longer falls back to either value. The database column defaults still exist in `schema.prisma` but are unreachable through the API (changing them needs a migration; not worth one).
- **Web** (`DirectCartCheckoutModal`): done earlier, label and state start empty and are `required`.
- **Mobile** (`AddressScreens.tsx`): the form no longer pre-fills "Home"/"Kerala" and no longer falls back to them on save; both fields show an inline error when empty and nothing is posted. The mobile fake backend now mirrors the server rule.
- **Tests:** new `addressRequired.test.ts` (omitted/blank/whitespace label or state → 422 `VALIDATION_ERROR` and the address count is unchanged; a complete address is stored exactly as typed, trimmed; an update cannot blank either field; a partial update keeps the others); `p11b.contract.test.ts` updated (an address stores exactly what was sent); mobile tests assert the empty initial values, the two inline errors, and that nothing is posted until both are typed.
- **Live check:** the running API (:5000) was started before this change, so the new server rule was NOT exercised in the browser; restart it to use it. Web-side behaviour was browser-verified earlier (fourth pass).

## P3.2 Development secrets and seed credentials — HARDENED
Reviewed without printing values: `server/scripts/startIsolatedApi.ts`, `server/prisma/seed.ts`, `server/prisma/seedGuard.ts`, `server/src/config/env.ts`, the tests' shared secrets.
- **Isolated E2E API:** target database fixed to `pb_ci_test` on localhost, validated twice before the application is imported, mock payments, log mailer, `NODE_ENV=development`; its fixed JWT secrets exist only inside that process. **New:** it refuses to start when `NODE_ENV=production`. Static test pins all of this.
- **Production secret check (new):** `NODE_ENV=production` now refuses JWT secrets that are development/test/e2e/placeholder values (known markers such as the isolated-API and test-suite secrets, `changeme`, `your-…`, `replace-me`, `1234567890`…), in addition to the existing ≥ 32 characters and access ≠ refresh rules. The existing production fail-closed rules remain: explicit `CORS_ALLOWED_ORIGINS`, `EMAIL_PROVIDER` (`log` refused), `INVITE_DELIVERY`, no mock payment provider, `DELIVERY_PROOF_SECRET` required and ≥ minimum length.
- **Seed guard (rewritten):** the guard used to check only `NODE_ENV=production`, so `npm run prisma:seed` run by hand against a production database with `NODE_ENV` unset would have created demo accounts with a publicly documented password. Demo users are now created only when ALL hold: not production; the `DATABASE_URL` host is localhost / 127.0.0.1 / ::1 (a missing or unparsable URL counts as non-local); a `SEED_DEFAULT_PASSWORD` override, if set, is at least 12 characters. A remote database needs the explicit `ALLOW_DEMO_SEED=true`, and production always wins. Otherwise only the catalogue is imported. The reason text never contains the password or the connection string. `server/TESTING.md` documents this.
- **Tests:** `hardening.test.ts` (local seeds; remote/unset/unparsable never seed even with NODE_ENV unset; opt-in; production wins; weak override disables; no secret in the reason; seed script routes through the plan; isolated API pinned), `invite-config.test.ts` (production rejects each placeholder secret in either slot; development accepts them). `p6a` and `hardening` production-boot tests now set neutral secrets.
- **Not changed:** the documented dev default seed password remains (local databases only); the shared test-suite secrets remain in the repository by design (now unusable in production).

## P3.3 Customer order tracking — NEW DEDICATED TEST
`orderTracking.test.ts` (8 tests): anonymous → 401 on detail and list; another customer gets the same 404 as an unknown order and never sees the order in `my-orders`; staff roles (CHEF, SUPER_ADMIN, TRAINER) get 403 on both routes; the owner sees server status, PAID/ONLINE payment summary, timeline and no delivery label before dispatch; delivery label ON_THE_WAY / DELIVERY_ISSUE / RETRY_PLANNED / DELIVERED with attempt number and maximum on detail AND list; UNDELIVERABLE_REFUND_PENDING after an undeliverable cancellation; the payload never contains operator, driver, failure reason/note, code/hash, staff e-mail or internal ids (canary string in the note); tracking is read-only. Existing delivery-code and administrator delivery tests are untouched (adminDelivery 33/33, deliveryProof, deliveryResolution all pass).

## P3.4 Migration verification (no database other than the disposable `pb_ci_test` was touched; nothing applied)
- **Reviewed `migrate diff` procedure:** `prisma migrate diff --from-url <throwaway> --to-schema-datamodel prisma/schema.prisma --exit-code` compares the database with the schema; correct for this purpose. It needs a Prisma CLI call, which the project guard blocks for Claude, so it was **not run**. To run it yourself, only against the disposable test database (never the development/production URL):
  `cd server && npx prisma migrate diff --from-url "postgresql://postgres:<password>@localhost:5432/pb_ci_test?schema=public" --to-schema-datamodel prisma/schema.prisma --exit-code` (exit 0 = no drift; the partial unique index and CHECK constraints are SQL-only and are expected to be the only differences).
- **DB-free comparison (new, passing):** `migrationAdminActors.unit.test.ts` (13 tests: 7 nullable columns, 7 RESTRICT foreign keys, the single index, 4 new CHECKs, 3 re-created CHECKs that only widen, no data rewrite/drop of columns, ordering after `20261013120000_p10c_mess_delivery`, byte-identical to the reviewed copy) and the existing `migrationConsistency.unit.test.ts` (trainer/procurement migration: tables, columns, indexes, foreign keys, additive-only).
- **Disposable-database evidence (new, passing, read-only):** `migrationApplied.test.ts` reads `_prisma_migrations` of the isolated test database and proves every one of the 20 migration folders is recorded as finished, not rolled back, with the **same SHA-256 checksum as the file in the repository**, and that nothing else is recorded; it also proves the 7 columns, the index, the 7 CHECK constraints (migration A) and the 9 tables, the partial unique index and 7 CHECK constraints (migration B) exist. So a database built from the repository's migrations (that is how `pb_ci_test` was built) matches what the code needs, and the full server suite runs on it.
- **Not done:** a from-scratch replay on a brand-new empty database (needs a database-creation and Prisma command, blocked for Claude), `npm run test:migrations` (needs a separate disposable PostgreSQL on port 5433 named in `PB_MIGRATION_PG_ADMIN_URL`), `migrate diff`.
- **Approval status:** **NOT APPROVED, NOT APPLIED** to development or production. Both are required. Risk summary unchanged from P2.3.

## P3.5 Outstanding browser checks
- **O1 women-only persistence — PARTIAL PASS.** `e2e.customer8@example.test` (new account): Pregnant = No and Breastfeeding = Yes saved; Menopause and cycle left unanswered; after a full reload the API returned `isPregnant:false`, `isBreastfeeding:true` and no `isMenopause`/`menstrualCycle` (unanswered, not "No"). **Finding F2 (open, small):** the dashboard "Edit Health Data" tab does not show women-only questions at all (only the sign-up health step and `HealthProfileWizard` do, and the wizard could not be reached from the dashboard), so a customer cannot see or change a stored answer there. Decide: show them in `HealthProfileTab`, or accept.
- **O2 API-down banner — PASS (simulated).** Real API outage not possible from this session; menu requests were forced to fail inside the page: banner "The menu could not be loaded." + Retry, 0 recipe dishes (no static fallback); Retry after restoring the network loaded 23 dishes and cleared the banner.
- **Mobile address form:** no device or emulator available; reviewed in code and covered by jest (initial empty, required, nothing posted until valid). **NOT TESTED on a device.**
- Console note: 58 `401` resource errors over the browser session (anonymous refresh attempts at page load and a manual refresh call); no script errors. Worth a look but not a blocker.

## P3.6 Final verification (executed in this pass)
| Check | Result |
|---|---|
| Server typecheck | clean |
| Full server suite (`pb_ci_test`) | **76 files / 1685 passed** (+34 vs P2: address 5, order tracking 8, migration DB-free 13, migration applied 3, seed/secret/isolated-API guards 5) |
| Web typecheck | 0 errors |
| Full web suite | **60 files / 656 passed** |
| Mobile typecheck | clean |
| Full mobile suite | **23 suites / 540 passed** |
| Web production build | OK (chunk-size warning only) |
Not executed: any Prisma command, `migrate diff`, `npm run test:migrations`, CI, Docker build, device run, Razorpay sandbox, any git write command.

## P3.7 Final lists (unchanged git state: nothing staged)
**Files to delete (after your approval):** the 44 stubs listed in P2.1 (`git rm -f …` command there); `public/Protein_Bowl_Enterprise_SRS.docx` (recommended, your decision).
**Files to commit:** the P2.7 list, which already covers everything changed in this pass: modified tracked files via `git add -u` (this pass: `server/src/modules/customer/customer.{validator,service}.ts`, `server/src/config/env.ts`, `server/prisma/seedGuard.ts`, `server/src/tests/{hardening,invite-config,p6a,p11b.contract}.test.ts`, `server/TESTING.md`, `apps/mobile/src/screens/commerce/AddressScreens.tsx`, `apps/mobile/src/test/fakeCommerceBackend.ts`, `apps/mobile/__tests__/{commerce.browse,commerce.checkout}.test.tsx`) and the untracked paths `server/src` and `src` (this pass adds `server/src/tests/{addressRequired,orderTracking,migrationAdminActors.unit,migrationApplied}.test.ts`, and `server/scripts/startIsolatedApi.ts` changed). `docs/PR_READINESS_AUDIT.md`, `docs/E2E_CHECKLIST.md`, `PROGRESS.md`, `IMPLEMENTATION_STATUS.md`, `PROJECT_COMPLETION_ROADMAP.md`, `PROTEIN_BOWL_MASTER_DOCUMENTATION.md` are included. New `.gitattributes` and one `.gitignore` line (`.claude/settings.local.json`) still to be created at commit time.
**Files to keep locally:** unchanged — `server/prisma/proposed/role-simplification/evidence/**`, `…/SHARED_TEST_PROCEDURE.md`, `…/SHARED_TEST_RECOVERY_PLAN.md`, `server/scripts/takeoverLiveDelivery.ts`, `.claude/skills/pb-work/`, `automation/reports/*`, `SCOPE_REMOVAL_IMPACT_REPORT.md`, every `.env*` file, any future `.claude/settings.local.json`.
**Remaining blockers:**
1. **Your approvals:** stub deletion, SRS docx removal, commit split, `.gitattributes`/`.gitignore`, migrations.
2. **Migrations A and B not applied** (nothing runs on a real database without them); `migrate diff` and an empty-database replay still to be run by you or a Prisma-enabled session.
3. **Razorpay sandbox** not started (no real payment verified); staff journeys in the browser (§X) not run; mobile never run on a device; CI workflow and Docker image never executed.
4. **Restart the API** to pick up the address, secret-check and seed-guard changes before any new browser run.
5. **Open findings:** F2 (women-only answers not shown on the dashboard), "Do you exercise?" still preselects Yes (non-null column), the 401 console noise.
**Security notes:** no confirmed vulnerability; the seed and production-secret gaps found in this pass are closed and tested; pattern-based secret scans only; the shared documented development password still exists for local databases.

---

# P4. Final quality and safety pass (2026-11-01) — nothing staged, committed, deleted or pushed; no migration applied

## P4.1 Production seed protection — VERIFIED AND TIGHTENED
- `NODE_ENV=production` can never seed demo users, **even with `ALLOW_DEMO_SEED=true`**: `resolveSeedPlan` checks production first; the check is now case- and whitespace-insensitive (`isProductionEnv`: "Production", " PRODUCTION ", "production\n" were bypasses of the old exact comparison); and `seed.ts` re-checks on its own (throws before the first user is created), independent of the plan.
- Exact-scenario test (`hardening.test.ts`): 5 spellings of production × local/IPv6/remote/unparsable/missing database URL × `ALLOW_DEMO_SEED` in {true, TRUE, 1, unset} × password override set/unset — every combination yields no demo users and no password; plus a static check that the refusal precedes the first `prisma.user.upsert`.
- Remote databases: only the exact `ALLOW_DEMO_SEED=true` opts in; "TRUE", "1", "yes", empty, " true" and unset do not; look-alike hosts (`localhost.evil.example`, `db.localhost.example.com`, private/LAN addresses, `0.0.0.0`, `host.docker.internal`) are not local. A weak `SEED_DEFAULT_PASSWORD` disables demo users; the reason text never contains the password or connection string (tested).

## P4.2 The 58 HTTP 401 errors — INVESTIGATED
- **Source:** every one was `POST /api/v1/auth/refresh` returning 401 for a visitor with no session, issued by the session restore in `AuthContext` (`useEffect` → `AuthService.refresh`). That 401 is the correct, expected answer (the page cannot see an HttpOnly cookie, so it must ask). No other endpoint produced a 401 (verified from the network log of signed-in and signed-out reloads).
- **Genuine defects found and fixed (not hidden):** (1) the restore ran **twice** per load (React StrictMode double effect, development), i.e. two concurrent refreshes with a rotating cookie; (2) `ApiClient`'s 401 handler let only the first concurrent request refresh — a second request that met an expired token at the same moment returned its 401 without a refresh or retry although the session was valid. Fix: one shared in-flight refresh (`ApiClient.refreshAccessToken`) used by the session restore and by the 401-retry path; every waiting request retries once. The console still shows the one expected 401 for a signed-out visitor; I did not suppress it (changing the API to answer 200 for "no session" would be a contract change).
- **Tests:** `src/services/apiClient.refresh.test.ts` (6): simultaneous restores → one request; visitor without session → one 401, token cleared, slot released; two simultaneous expired-token requests → one refresh, both retried once; refresh failure → no retry loop; login/refresh never trigger a refresh; network failure resolves false.
- **Browser:** an anonymous reload now sends exactly one refresh. Other duplicate reads at load (`products`, `auth/me`, `customers/me/profile`) are StrictMode development doubling of harmless GETs; unchanged.

## P4.3 Customer health profile — DONE (one part needs your migration)
- **Visible and editable:** the dashboard health tab now has a "Women's Health (optional)" block (female profiles only: Pregnant, Breastfeeding, Menopause, Menstrual cycle) and a "Do you exercise regularly?" field. View mode shows the saved value or "Not provided"; edit mode uses selects that start on "Choose…" when unanswered. A saved answer is preselected and cannot be silently reset to unanswered (the "Choose…" option disappears once an answer exists; the server keeps what it has for omitted fields). Unanswered fields are never sent; answered ones are sent exactly as chosen.
- **No default "Yes":** sign-up step, `HealthProfileWizard` and the tab no longer default to Yes (`boolean | null`, unanswered adds nothing to the water requirement); existing saved answers (true or false) are shown and kept.
- **Server:** the column cannot represent "never answered" (`NOT NULL DEFAULT false` stored "No"). New schema (`Boolean?`, no default) and prepared migration `20261101120000_health_exercise_unanswered` (DROP NOT NULL, DROP DEFAULT; no row is rewritten; existing true/false values stay, rows previously stored as false remain "No" because they cannot be told apart). **Not applied.** Until you apply it (and run `prisma generate`), a customer who never answers still gets "No" stored by the old column default.
- **Tests:** web `HealthProfileTab.test.tsx` +6 (saved values shown, "Not provided" for unanswered, female-only block, no defaults and nothing sent when untouched, chosen answers sent exactly, saved answer preselected without "Choose…", cancel restores); server `profileExercise.test.ts` (omitted answer never "Yes", explicit No/Yes stored and preserved when omitted, non-boolean 422; **the NULL round-trip test is SKIPPED (1 skipped) until the migration is applied to the test database** — it reports skipped, not passed), `migrationExercise.unit.test.ts` (5, DB-free). Women-only server persistence tests from earlier passes unchanged.
- **Browser (customer8, customer9):** block shows No / Yes / Not provided / Not provided; editing Menopause = No saved and read back (`isMenopause:false`, cycle absent); a new sign-up shows neither exercise button selected. Stored-as-unanswered NOT verified live (migration).

## P4.4 Migration verification — partly blocked, documented
- **Done (read-only / DB-free):** `migrationAdminActors.unit.test.ts` (13), `migrationConsistency.unit.test.ts` (trainer/procurement), `migrationExercise.unit.test.ts` (5) and `migrationApplied.test.ts` (checksums and objects of everything already on the isolated test database; the third migration is listed as the allowed pending tail).
- **New, written but NOT run:** `src/tests/preparedMigrations.migration.test.ts` — creates its own temporary database on a disposable instance, replays ALL migration folders with `prisma migrate deploy`, checks names/checksums/objects/`hasExercise` nullability, runs `prisma migrate diff --from-url <temp db> --to-schema-datamodel prisma/schema.prisma --script` and fails on anything but unmodelled `DROP INDEX`. It needs a **separate disposable PostgreSQL on port 5433** (the project's own rule refuses 5432); none is running here (an attempt to reach port 5433 found nothing and contacted no database; a second attempt was declined by the sandbox and was not retried). The Prisma CLI commands themselves are blocked for this session by the project guard, so nothing was bypassed.
- **Exact safe command and prerequisites:** `server/TESTING.md` ("Fresh-database replay + schema comparison"): start PostgreSQL 16 on 5433 with a throwaway data directory, `npm install` and `npx prisma generate` in `server/`, then `PB_MIGRATION_PG_ADMIN_URL="postgresql://postgres:<password>@localhost:5433/postgres" npx vitest run --config vitest.migrations.config.ts src/tests/preparedMigrations.migration.test.ts`. Read-only comparison against the isolated test database only: the `migrate diff --from-url …pb_ci_test…` command in the same section.
- **Status:** **three migrations prepared, NOT approved, NOT applied** to any existing application database (development, production). **CORRECTION (2026-11-02):** the disposable test database `pb_ci_test` already contains migrations 1 and 2 (proved read-only by `migrationApplied.test.ts`; it was built from the migration folders by your isolated-database procedure, not by me); migration 3 is on no database. This session never ran any migration. The development and production databases were never used.

## P4.5 Final verification (executed in this pass)
| Check | Result |
|---|---|
| Server typecheck | clean |
| Full server suite (`pb_ci_test`) | **78 files / 1696 passed, 1 skipped** (the NULL round-trip, pending the migration) |
| Web typecheck | 0 errors |
| Full web suite | **61 files / 668 passed** |
| Mobile typecheck | clean |
| Full mobile suite | **23 suites / 540 passed** |
| Web production build | OK |
Not executed: Prisma CLI commands, `npm run test:migrations` (no disposable instance), CI, Docker build, device run, Razorpay sandbox, any git write.

## P4.6 Files (unchanged git state: nothing staged)
**New in this pass (untracked, all covered by the P2.7 pathspecs `server/src` and `src`, plus one migration folder to add explicitly):** `server/prisma/migrations/20261101120000_health_exercise_unanswered/` (after your migration approval), `server/src/tests/{profileExercise,migrationExercise.unit,preparedMigrations.migration}.test.ts`, `src/services/apiClient.refresh.test.ts`. **Modified in this pass (covered by `git add -u`):** `server/prisma/{schema.prisma,seed.ts,seedGuard.ts}`, `server/src/tests/{hardening,migrationApplied,migrationConsistency.unit,migrationDb.unit}.test.ts`, `server/TESTING.md`, `src/services/{apiClient,authService}.ts`, `src/components/customer/{AuthModal,HealthProfileWizard,HealthProfileTab}.tsx`, `src/components/customer/HealthProfileTab.test.tsx`, the three rewritten root docs and the three audit/progress/E2E docs.
**To delete:** unchanged (the 44 stubs; the SRS docx on your decision). **Keep local:** unchanged.

## P4.7 Remaining limitations and blockers
1. **Your approvals:** stub deletion, SRS docx, commit split, `.gitattributes`/`.gitignore`, and **three** migrations.
2. **Fresh-database replay and `migrate diff` never executed** (needs a disposable PostgreSQL on 5433 and Prisma CLI access); the replay suite is unrun code.
3. **API restart and migration needed** for the address rule, production-secret check, seed guard (already coded) and for the "unanswered exercise" to be stored as unanswered.
4. Razorpay sandbox, staff journeys, mobile on a device, CI and Docker image: not executed.
5. Rows stored before the third migration as `hasExercise = false` cannot be distinguished from a real "No" and stay "No".
6. The anonymous-visitor 401 on `/auth/refresh` remains by design (one per page load); StrictMode doubles some harmless GETs in development only.
7. A customer cannot return a saved women-only/exercise answer to "unanswered" (by design: omitted means unchanged).

---

# P5. Final release-readiness review (2026-11-01) — nothing staged, committed, deleted or pushed; no migration applied; no database other than the isolated `pb_ci_test` touched

## P5.1 The three prepared migrations, reviewed together
| # | Folder | Purpose | Depends on (all exist earlier in the chain) | Verified by |
|---|---|---|---|---|
| 1 | `20261020100000_role_simplification_admin_actors` | 7 nullable columns, 7 RESTRICT FKs, 1 index, 4 new + 3 re-created (wider) CHECKs: SUPER_ADMIN-operated delivery | `users`, `employee_profiles`, `delivery_*`, `mess_delivery_*` | `migrationAdminActors.unit` (13), `migrationChain.unit`, `migrationApplied` (objects + checksums on `pb_ci_test`) |
| 2 | `20261031120000_trainer_procurement_foundation` | 9 tables (trainer, workout logs, suppliers, purchase orders/lines, goods receipts/lines, cancellation requests, password-reset tokens), their FKs/indexes/CHECKs, partial unique index, 2 `workout_plans` indexes | `users`, `orders`, `inventory_items`, `customer_profiles`, `workout_plans`, `kitchen_branches` | `migrationConsistency.unit`, `migrationChain.unit`, `migrationApplied` |
| 3 | `20261101120000_health_exercise_unanswered` | `health_biometrics.hasExercise`: DROP NOT NULL + DROP DEFAULT | `health_biometrics` (P-earlier) | `migrationExercise.unit` (5), `migrationChain.unit` |
- **New this pass, DB-free (`migrationChain.unit.test.ts`, 7 tests):** the three are the last three folders in this order after `20261013120000_p10c_mess_delivery`; every table they ALTER, REFERENCE or INDEX exists by then; none depends on a table a later one creates; **the tables created by replaying the whole chain equal exactly the tables `schema.prisma` maps** (no table missing, none unknown); none drops a table/column or rewrites data.
- **Third migration and existing answers:** the executable SQL is exactly two statements, `ALTER COLUMN "hasExercise" DROP NOT NULL` and `DROP DEFAULT` (asserted to the character; no UPDATE, no `USING`, no `SET`). PostgreSQL does not touch stored values for either statement, so **every existing `true` and `false` stays exactly as it is — no `false` is converted to NULL/unanswered.** After it, a profile row created without an answer stores NULL. Rows stored as `false` before cannot be told apart from a real "No" and remain "No" (documented in the migration header).
- **Compatibility with `schema.prisma`:** column types, FKs with ON DELETE rules, indexes and unique constraints agree for all three (tests above); CHECK constraints and the partial unique index are SQL-only by design. `prisma migrate diff` itself has not been run (see P5.1 procedure).
- **Safe fresh-database replay procedure (nothing touches development or production):**
  1. Install/start a second PostgreSQL 16 on a **different port (5433)** with a throwaway data directory (`server/TESTING.md`, "Safe on a separate disposable instance").
  2. `cd server && npm install && npx prisma generate`.
  3. `PB_MIGRATION_PG_ADMIN_URL="postgresql://postgres:<password>@localhost:5433/postgres" npx vitest run --config vitest.migrations.config.ts src/tests/preparedMigrations.migration.test.ts` — creates its own temporary database, runs `prisma migrate deploy` over all 21 folders, checks names/checksums/objects and `hasExercise` nullability, runs `prisma migrate diff … --script` (only unmodelled `DROP INDEX` lines allowed), and drops only its own database.
  4. Stop the instance and delete the data directory. The helper refuses any non-local host, any maintenance database other than `postgres`, and port 5432 (unless explicitly declared disposable).
  5. Not executed here: no disposable instance exists in this environment (an attempt to reach 5433 found none and contacted no database; a second attempt was declined by the sandbox and not retried), and the Prisma CLI is blocked for this session by the project guard.
- **Approval status: NOT APPROVED; NOT APPLIED to development or production** (this session never connected to either). **CORRECTION (2026-11-02):** migrations 1 and 2 are present on the disposable `pb_ci_test` (built by the isolated-database procedure; the tests run on them); migration 3 is applied nowhere.

## P5.2 The skipped server test — exactly why, and when it runs
- **Test:** `server/src/tests/profileExercise.test.ts` › "(needs migration 20261101120000) a customer who never answered is stored as NULL and comes back UNANSWERED, not No; answering later works".
- **Why skipped:** the file reads `information_schema` for `health_biometrics.hasExercise` **when the test file is collected**. On the isolated test database that column is still `NOT NULL DEFAULT false`, because the database was built from the 20 migrations applied so far; storing NULL is therefore impossible and asserting it would be false. The condition is `skipIf(column is not nullable)`.
- **It reports as skipped (1 skipped in the totals), never as passed.** The other four tests in the file (omitted answer never becomes "Yes"; explicit No/Yes stored and kept when omitted; editing ONE answer overwrites nothing else; non-boolean is 422) pass today.
- **Will it run after the migration is applied to a fresh test database?** Yes, by construction: after `scripts/verify-isolated.sh --recreate` (needs `PB_CONFIRM_DROP=pb_ci_test`; it re-creates `pb_ci_test`, runs `prisma migrate deploy` over ALL folders, regenerates the client, seeds and runs the suite) the column is nullable, the condition is false, and the test executes (create without answer → row has NULL → API omits the field → later answer is stored). It also does not need `prisma generate` to have run: the omitted field is simply not inserted. I did not execute that re-creation (it drops and recreates a database; the project rule requires your explicit confirmation).

## P5.3 Authentication: shared refresh, reviewed
| Aspect | Behaviour | Covered by (`apiClient.refresh.test.ts`, 10 tests) |
|---|---|---|
| Concurrency | exactly one refresh request in flight; session restore, StrictMode double effects and any number of simultaneous 401s share it | restores share one request; two expired-token requests → one refresh, both retried once |
| Token rotation | the HttpOnly cookie rotates once per refresh, never twice concurrently | same tests (single `/auth/refresh`) |
| Failed refresh | resolves false, token cleared, in-flight slot released so a later attempt really asks again | no-session test; network-failure test; slot-release assertion |
| No infinite loop | the retry is made once (`isRetry`); a refresh that succeeds while the retried request is still 401 gives exactly: original, one refresh, one retry; a failed refresh gives no retry; many requests with an expired session cost ONE refresh | "NO INFINITE LOOP" and "an expired session never loops" tests |
| Logout | `AuthService.logout` ends the session first (`ApiClient.endSession`, a session epoch) and again in `finally`; **a refresh already in flight can no longer bring the token back after logout** (found in this review and fixed; the previous code would have installed the late token) | "LOGOUT during a refresh"; logout with a failing request still clears the token; a refresh after logout works |
| Session expiry | restore → refresh 401 → `AuthContext` signs the user out (state cleared); `/auth/login` and `/auth/refresh` never trigger a refresh | no-session test; "login and refresh never trigger a refresh" |
- Not covered by an automated browser run: a real access-token expiry (15 minutes) in the app; the server-side behaviour of the refresh endpoint is covered by the server auth suites.

## P5.4 Customer health profile
- **Existing saved answers preserved:** shown as saved (No/Yes) and preselected; "Choose…" disappears once an answer exists; `hasExercise = true/false` already stored stays and is displayed (web tests; browser: customer8's earlier "Yes" and women-only answers).
- **Unanswered stays unanswered:** displayed "Not provided", never sent, never converted (web tests; server tests for omitted answers; NULL storage after migration 3).
- **Editing one answer overwrites nothing else:** web test sends every other saved value unchanged and invents nothing (no zero, no default, `menstrualCycle` still absent); **server test** (new): a request carrying only `{ isMenopause: true }` leaves every other answer, list, measurement and derived figure byte-identical, and a second single-answer edit does not touch the first.
- Limitation: the tab sends the whole profile it has loaded; if the same customer changes the profile in two tabs, the later save wins for the fields it contains (pre-existing design; not changed).

## P5.5 Final repository review
- **Stale references to removed roles/modules:** in production code the only mentions are the retired-role lists (`server/src/authz/approvedRoles.ts`, `src/utils/approvedRoles.ts`, used to refuse them), the legacy-role message in `src/utils/messErrors.ts`, and `AdminWorkspace.test.tsx`/test fixtures that assert refusal. **One inconsistency fixed:** `src/utils/roleGuard.ts` still listed `MESS_CUSTOMER` as an allowed backend role for the customer UI; removed (the customer view is public anyway, and the API refuses that role). Stale prose remains only where documented as history (`SCOPE_REMOVAL_IMPACT_REPORT.md`, `server/prisma/proposed/**`, which stay local or draft).
- **Six-role consistency:** server `APPROVED_ROLES` = web `APPROVED_BACKEND_ROLES` (asserted equal by `roleSimplificationStatic.test.ts`), the mobile app accepts exactly `CUSTOMER` (`isCustomerOnly`; `CUSTOMER_APP_ONLY`), web guard maps each UI role to exactly one approved backend role. The Prisma enum still contains the retired values until the separately approved enum shrink; they authorize nothing.
- **Hardcoded credentials / secrets / fake production data / unsafe defaults:** no real secret (pattern scans; env files not opened). Findings and handling: (a) demo seed users with a documented dev password — only for a local database, never in production, tested (P3/P4); (b) test-suite and isolated-API JWT secrets — rejected by production config, tested; (c) **new this pass:** the delivery-code proof secret had a public development fallback guarded by an exact `=== 'production'`; any other spelling would have used it → now case/whitespace-insensitive, tested (the server's strict `NODE_ENV` enum already refuses non-canonical values at startup, now also tested); (d) `DELIVERY_PROOF_SECRET` fallback, mock payment provider and log mailer are refused in production (existing tests); (e) seeded demo emails (`@proteinbowl.in`, `@nutrifitkitchen.in`) and demo catalogue exist only in the seed (non-production); (f) no fake production data in application code (`noDemoData` static test).
- **The 44 stubs:** re-checked across `src`, `server`, `apps/mobile`, `scripts`, package/tsconfig/vite/CI/automation files: **none is imported, required or referenced by name** except `CheckoutModal.test.tsx` (an assertion that nothing imports them) and the four tests made tolerant of deletion. Safe to `git rm`.

## P5.6 Verification classification (what is verified vs not)
**VERIFIED** (automated and, where marked, in the browser): six-role authorization and retired-role refusal (server/web/mobile suites); customer registration, duplicate email/phone, health profile save/skip/edit, derived-figure rules, address label/state required (browser + tests); cart, preview and unpaid order placement (browser C1–C15, fourth pass); order tracking and delivery labels, delivery code lifecycle, administrator delivery operations, cancellation/refund logic, procurement and trainer logic, password reset, kitchen routing (server integration tests on the isolated database; the mock payment provider only); shared session refresh (10 unit tests + browser reload); seed/secret production safeguards (tests); web build; three typechecks.
**PARTIALLY VERIFIED:** women-only and exercise answers (web and server tests + browser read-back; "stored as unanswered" waits for migration 3); API-down menu banner (simulated, not a real outage); migrations (DB-free + checksum/object evidence; no fresh replay, no `migrate diff`); mobile app (jest only: address form, checkout flow with a fake backend; never on a device); Chef/Nutritionist/Trainer/Procurement/SUPER_ADMIN workspaces (component and API tests; no browser journeys); CI workflow and Docker image (written, never executed).
**UNTESTED:** any real Razorpay/sandbox payment, paid-order cancellation and refund against the provider, webhook from the provider, provider reconciliation `--apply`, production email delivery (Resend), real SMS/OTP (none exists), a real 15-minute token expiry in the browser, load/performance, accessibility audit, mobile on a device/emulator, production deployment and backup/restore of a real database.

## P5.7 Final executed verification (this pass)
| Check | Result |
|---|---|
| Server typecheck | clean |
| Full server suite (`pb_ci_test`) | **79 files / 1705 passed, 1 skipped** (the skip is the post-migration NULL test, P5.2) |
| Web typecheck | 0 errors |
| Full web suite | **61 files / 673 passed** |
| Mobile typecheck | clean |
| Full mobile suite | **23 suites / 540 passed** |
| Web production build | OK |
Not executed: Prisma CLI commands, the opt-in migration suites, database re-creation, CI, Docker, device, Razorpay sandbox, any git write command.

## P5.8 Final assessment
**Ready for a controlled Git review?** **Yes, with conditions.** The tree is internally consistent: all suites and typechecks pass, no secret or build artifact is in the commit set, the retired scope is removed and not referenced, and the three migrations are internally consistent and additive. A review should be done in logical commits (suggested split in §10), never as one 330-file commit, and only after the deletions and local-only decisions below.
**What still prevents a production release (none of these is a code defect I can close from here):**
1. Migrations 1–3 are not applied anywhere real, and a fresh-database replay and `migrate diff` have never been run.
2. Payments were never verified against Razorpay's sandbox or live API; refunds, webhooks and reconciliation `--apply` are untested against a real provider.
3. Production configuration is undefined (secrets, CORS, email provider, delivery-proof secret, commerce policy, jobs), CI has never run on GitHub, the Docker image was never built.
4. Staff workspaces and the mobile app have not been exercised end to end (browser/device).
5. No backup/restore drill, monitoring or incident procedure has been rehearsed (`docs/OPERATIONS.md` describes them).
**Exact next steps (in order):**
1. Review this report; decide: delete the 44 stubs (command in P2.1) and the SRS docx; keep-local list as stated.
2. Create `.gitattributes` (P2.5) and the `.gitignore` line; run `git add --renormalize --dry-run .` (expect no changes).
3. With your written approval: stage and commit in the suggested logical groups; open the PR; let CI run on GitHub.
4. Start a disposable PostgreSQL on 5433 and run the replay/diff suite (P5.1); fix any difference it reports.
5. Back up the development database, then apply migrations 1→3 there (`prisma migrate deploy`), `prisma generate`, restart the API, and re-run the browser checks plus `verify-isolated.sh --recreate` on a rebuilt test database so the skipped test runs.
6. Razorpay sandbox verification (`docs/SANDBOX_VERIFICATION.md` §A), then staff-journey browser tests (E2E §X), mobile device run.
7. Configure production secrets/env, rehearse backup/restore, deploy to a staging environment, then decide on production.

---

# P6. Repository organization for the controlled Git review (2026-11-02) — read-only; nothing staged, deleted, committed or migrated

## P6.1 Git status (branch `role-simplification`, HEAD `6d6bac1`)
407 entries = **198 modified** (44 of them are the blanked stubs) + **19 deleted** + **190 untracked**; nothing staged. `git diff --check`: **clean** (0 findings in the tracked diff); a separate scan of every untracked file that would be committed (code, SQL, scripts, workflows, JSON) found no trailing whitespace and no conflict markers. Line endings: all 543 tracked text files are LF in the index (`i/lf`; the 4 others are binary) and no untracked candidate contains CR, so a renormalization changes nothing. The ~200 "LF will be replaced by CRLF" lines are the working-tree `autocrlf` notice and are harmless.
**`git add --renormalize --dry-run .` was NOT run:** the project guard blocks every `git add`, including `--dry-run`. Run it yourself after creating `.gitattributes` (expected: only `.gitattributes` and `.gitignore` listed, no other file).

## P6.2 The 44 stubs: exact list and why each is safe to delete
Each file is a 2-line stub (`// REMOVED … export {};`). **None is imported, required or referenced by name** anywhere in `src`, `server`, `apps/mobile`, `scripts`, `package.json`, tsconfig, vite, CI or automation (re-verified 2026-11-02). The only mentions are `CheckoutModal.test.tsx` (asserts nothing imports them) and four tests already made tolerant of deletion. Typecheck, all suites and the build pass with them empty.
| Reason it is safe | Count | Files |
|---|---|---|
| Retired server API; the routes are unmounted in `app.ts` | 12 | `server/src/modules/cms/cms.{controller,routes,service}.ts`, `…/finance/finance.{controller,routes,service}.ts`, `…/hrm/hrm.{controller,routes,service}.ts`, `…/md/md.{controller,routes,service}.ts` |
| Client of a retired endpoint | 2 | `src/services/mdService.ts` (the `/md` API is gone), `src/services/kdsService.ts` (called retired `/kds/tickets`; `kitchenService.ts` replaces it) |
| Retired dashboards / modules; no workspace exists for these roles | 10 | `src/components/erp/{POSDashboard,BakeryFMCGDashboard,TepacheBreweryDashboard,MDDashboard,HRMModule,FinancialsModule,OmnichannelSalesModule,MultiKitchenOverviewModule,DeliveryDashboard}.tsx`, `src/components/mess/SwiggyZomatoAggregatorPortal.tsx` |
| Replaced by components that use the real API | 3 | `src/components/erp/TrainerDashboard.tsx` → `components/staff/TrainerWorkspace.tsx`; `src/components/erp/ProcurementDashboard.tsx` → `components/staff/ProcurementWorkspace.tsx`; `src/components/customer/WorkoutPlanTab.tsx` → `CustomerWorkouts.tsx` |
| Mock / demo data (no demo data in the product; customer products come from the server catalogue and `server/prisma/seedData/fmcgPackagedProducts.ts`) | 9 | `src/data/{cloudKitchensData,mockBakeryFMCGData,mockData,mockDirectOrdersData,mockFitnessData,mockKeralaMessData,mockOmnichannelData,mockPOSData,mockTepacheData}.ts` |
| Made-up client pricing or a fake checkout (the server is the only pricing authority; ONLINE payment only) | 5 | `src/utils/costEngine.ts`, `src/components/common/{IngredientPriceCalculator,DishPriceCalculator}.tsx`, `src/components/customer/CheckoutModal.tsx` (diet-plan checkout with a made-up address and price, no payment), `src/components/customer/DirectGuestOrderModal.tsx` (guest / COD-era path) |
| SRS document generator (goes with the SRS document) | 3 | `src/utils/srsDocxGenerator.ts`, `src/components/common/SRSDownloadModal.tsx`, `scripts/generate_srs_docx.ts` |
Total 12 + 2 + 10 + 3 + 9 + 5 + 3 = **44**. The prepared command is unchanged in §P2.1 (`git rm -f -- …`). The live equivalents are `DirectCartCheckoutModal` (checkout), `kitchenService`, the staff workspaces, `CustomerWorkouts`, and the server catalogue/orders/delivery-code routes. The 19 already-deleted files stay deleted (staged by `git add -u`).

## P6.3 `public/Protein_Bowl_Enterprise_SRS.docx` — remove
Path: `public/Protein_Bowl_Enterprise_SRS.docx` (29 KB, unchanged since the initial commit; no code, test or doc references it). Reasons: (1) its text describes the retired scope (POS ×20, HRM ×11, Tepache ×4, Bakery ×3, MD ×4) and contradicts the six-role, ONLINE-only product; (2) it sits in `public/`, which Vite copies verbatim into the web build, so the outdated document would be **published with the site**; (3) its generator (`srsDocxGenerator.ts`, `SRSDownloadModal.tsx`, `generate_srs_docx.ts`) is among the stubs. It stays in git history; save a copy elsewhere first if you want one. Not deleted.

## P6.4 Proposed files (prepared outside the repository; the working tree is unchanged)
Directory: the session scratchpad folder (a temporary folder inside the local user profile, outside the repository)
- `gitattributes.proposed` → `.gitattributes`: `* text=auto eol=lf`; `*.sh`, `Dockerfile`, `*.mjs` `eol=lf`; binary types (`png jpg jpeg gif ico webp woff woff2 ttf docx pdf dump`). Safe because the index is already 100 % LF.
- `gitignore-addition.txt` → append to `.gitignore`: `.claude/settings.local.json` (currently NOT ignored; `git check-ignore` confirmed), `*.dump`, `*.sql.gz`, `pb-backups/`, and the keep-local paths (`evidence/`, `SHARED_TEST_*.md`, `takeoverLiveDelivery.ts`, `.claude/skills/`, `automation/reports/`, `SCOPE_REMOVAL_IMPACT_REPORT.md`).
- `commit-plan.md`: the full commit plan listing every file.

## P6.5 Logical commit plan (computed mechanically: each of the 407 entries is in exactly one group)
| # | Commit | Files | Contents |
|---|---|---|---|
| 0 | chore: line endings and ignore rules | 2 | `.gitattributes` (new), `.gitignore` (+ block) |
| 1 | feat(db): schema, 3 migrations, seeds, migration tests | 33 | `schema.prisma`, `seed*.ts`, `seedData/`, 3 migration folders (**need your migration approval**), `proposed/` drafts, all `*migration*` / `testDatabase*` / `profileExercise` tests |
| 2 | feat(auth): roles, sessions, password reset, config safeguards | 63 | server `authz/`, `config/`, `middleware/`, `modules/{auth,admin,email}`; web `AuthContext`, `apiClient`, `authService`, role guard, `AuthModal`, reset page; related tests |
| 3 | feat(customer): health profile, address rules, menu, diet | 35 | server `modules/{customer,diet,health}`, biometrics; web health tab/wizard, dashboard, storefront, `types.ts`, `App.tsx` |
| 4 | feat(orders): payments, expiry, cancellation, refunds, tracking | 38 | server `modules/{order,payment,refund}`, reconcile; web checkout, cancellation panels, `orderService` |
| 5 | feat(delivery): administrator-operated delivery and Mess operations | 52 | server `modules/{delivery,mess}`; web `DeliveryMonitor/Operations`, `Operate*`, services, tests |
| 6 | feat(staff): Trainer, Procurement, Nutritionist, Chef, recipe publishing | 24 | server `modules/{trainer,procurement}`; web `components/{staff,erp}`, `RecipePublishing` |
| 7 | feat(mobile): customer app updates | 22 | `apps/mobile/**` |
| 8 | chore(tooling): CI, Docker, test-database tooling, guard policy | 20 | `.github/workflows/ci.yml`, Dockerfile, `server/scripts/*`, vitest configs, `setup.ts`, fixtures, `TESTING.md`, `.claude/hooks/pb-guard.mjs`, `.claude/settings.json` |
| 9 | refactor: remove the retired scope and wire the routes | 64 + `app.ts` | `server/src/app.ts`, the 19 deleted files, the 44 stubs, the SRS docx |
| 10 | docs: six-role architecture, status, roadmap, audit, E2E evidence | 12 | 8 root docs + 4 `docs/*.md` |
| – | KEEP LOCAL (not committed) | 41 | `evidence/**` (30), 3 shared-test/backup docs, `takeoverLiveDelivery.ts`, `pb-work` skill, 5 `automation/reports`, `SCOPE_REMOVAL_IMPACT_REPORT.md` |
**Caveat:** the change set is interdependent (everything needs `schema.prisma`; `app.ts` mounts routes from commits 5–6 and unmounts the retired ones), so only the last commit is guaranteed to pass every suite. Run the full suites on the final tree. If you want every commit green, squash 1–9 into fewer commits.

## P6.6 Safety verification of the proposed commit set
- **Environment files:** only `.env.example` and `server/.env.example` are tracked; real `.env` files exist locally and are ignored (not opened). **Secrets:** pattern scans clean (test-fixture values only). **Backups, dumps, logs, keys:** none among the status entries; `server/scripts/verify-isolated.log` exists but is ignored (`*.log`). **Generated reports and evidence:** all listed as keep-local and covered by the proposed `.gitignore` block. **Local paths:** none in the commit set once `BACKUP_AND_RECOVERY.md` (database names, cluster id) is keep-local; this audit file quotes a few local paths as findings (reword before committing if you want zero).
- **Unrelated files:** none; no unassigned entry and no stray top-level file.

## P6.7 Warnings and unexpected items
1. `git add --renormalize --dry-run .` could not be run (guard); command above.
2. `server/prisma/proposed/role-simplification/migration-b/**` is a **destructive draft** (enum shrink) that would be committed under `proposed/`. It is not under `migrations/` and must never be moved there without approval; consider keeping it local.
3. `BACKUP_AND_RECOVERY.md` was added to keep-local in this pass (it was not on the earlier list).
4. Committing `.claude/settings.json` + `pb-guard.mjs` shares the guard rules (deny `git add/commit/push`, `npx prisma *`, `.env*`) with everyone's Claude sessions; confirm that is intended.
5. `CLAUDE.md` (−469 lines), `README.md` (−909) and `ARCHITECTURE.md` were rewritten earlier in the project; review them as documentation rewrites.
6. Root `assets/` is ignored by `.gitignore` (present locally, untracked) — unchanged, noted only because it is unusual.
7. The three migrations remain NOT approved and NOT applied; commit 1 contains them only as files.

---

# P7. Reconciled Git plan (2026-11-02) — supersedes the counts and the commit table in §P6.5 / §P6.7; read-only, nothing staged, deleted, committed or pushed

## P7.1 Reconciliation of the 407 status entries
`git status` right now: **198 modified + 19 deleted + 190 untracked = 407; staged: 0.** Every entry carries exactly one label from one rule table (computed mechanically, then re-added):
| Label | Count | Made of |
|---|---|---|
| **KEEP LOCAL** | **45** | 45 untracked files |
| **COMMIT CANDIDATES** | **362** | 153 modified + 145 untracked + 44 stubs (modified) + `server/src/app.ts` (modified) + 19 deleted |
| Total | **407** | 45 + 362; 153 + 44 + 1 = 198 modified ✓; 145 + 45 = 190 untracked ✓; 19 deleted ✓ |
The lists are mutually exclusive by construction (first matching rule wins) and a second check confirms it: the proposed `.gitignore` block, applied as a temporary exclude file, hides **exactly these 45 files and nothing else** (0 files outside the keep-local list).
**Why 366 versus 407:** 366 was 407 − 41, the keep-local count *before* this pass; the earlier plan listed 41 keep-local files. This pass moved 4 more files to keep-local (the destructive migration-b draft, the redundant copy of migration A under `proposed/`, `proposed/README.md`, `MESS_CUSTOMER_IMPACT_INSPECTION_PLAN.md`), giving 45 and **362** candidates. The per-commit counts in the old §P6.5 table also contained mistakes (tooling was 20, correct 23; the removal commit omitted that `app.ts` is separate from the deletions) — corrected below. Files that are in the plan but **not** in `git status`: `.gitattributes` (new), `.gitignore` (one block added), `public/Protein_Bowl_Enterprise_SRS.docx` (deleted) → **362 + 3 = 365 files touched**.
**Keep-local list (45):** `server/prisma/proposed/role-simplification/evidence/**` (30) · `SHARED_TEST_PROCEDURE.md`, `SHARED_TEST_RECOVERY_PLAN.md`, `BACKUP_AND_RECOVERY.md` (3) · `MESS_CUSTOMER_IMPACT_INSPECTION_PLAN.md` · `proposed/README.md` · `proposed/…/migration-b/20261020110000_role_enum_six_roles/migration.sql` · `proposed/…/20261020100000_role_simplification_admin_actors/migration.sql` · `server/scripts/takeoverLiveDelivery.ts` · `.claude/skills/pb-work/SKILL.md` · `automation/reports/*` (5) · `SCOPE_REMOVAL_IMPACT_REPORT.md` (30+3+1+1+1+1+1+1+5+1 = 45). No `.env` file, credential, backup/dump or generated report is among the 362 candidates (scans in §P6.6 unchanged).

## P7.2 Deleted files: the 19 and the 44 are separate and do not overlap
- **19 already deleted in the working tree (status ` D`, i.e. deleted, not staged):** `server/src/modules/{fmcg/fmcg,pos/pos,tepache/tepache}.{controller,routes,service}.ts` (9) · `src/components/erp/delivery/{DeliveryHome,DeliveryWorkspace,MessDeliveryPanel}.tsx` (3) · `src/components/erp/delivery/{DeliveryHome,DeliveryResume,DeliveryVerify,DeliveryWorkspace,MessDeliveryPanel}.test.tsx` (5) · `src/hooks/useDeliveryQueue.ts` and `.test.tsx` (2).
- **44 stubs (status ` M`, still exist as 2-line files):** exact list in §P2.1 / reasons in §P6.2.
- **Overlap: 0 paths** (compared programmatically; deleted files do not exist on disk, stubs do).
- **Leave Git when approved:** 19 (staged by `git add -u`) + 44 (`git rm -f`) + `public/Protein_Bowl_Enterprise_SRS.docx` (`git rm`) = **64 paths**. **Remain in Git unchanged:** every other tracked file (e.g. `src/App.tsx`, `server/src/app.ts` as modified, `CustomerWorkouts`, `kitchenService`).

## P7.3 Migration safety
- **Approval-candidates (3), committed only as files, not applied, need your approval before any apply:** `20261020100000_role_simplification_admin_actors`, `20261031120000_trainer_procurement_foundation`, `20261101120000_health_exercise_unanswered`.
- **Review package of migration A (hand-run SQL, not Prisma migrations), committed with them:** `proposed/…/precheck_migration_a.sql`, `postcheck_migration_a.sql`, `20261020100000_…/rollback.sql` (no local identifiers in them).
- **Experimental / draft migration files — all of them, kept LOCAL:** (1) `proposed/…/migration-b/20261020110000_role_enum_six_roles/migration.sql` (**destructive** enum shrink, excluded from the plan); (2) `proposed/…/20261020100000_role_simplification_admin_actors/migration.sql` (byte-identical duplicate of the active migration A; the only test that reads it, `migrationAdminActors.unit.test.ts`, skips that check when the file is absent). **"Migration C" (drop retired tables) has no file anywhere** — it exists only as text in docs. No other `.sql`, rollback or draft file exists in the tree (searched).
- **Documentation that mentions the local drafts (to reword only after you approve; not edited now):** `CLAUDE.md` (lines 6 and 39: Migration B/C "drafts under server/prisma/proposed/"), `IMPLEMENTATION_STATUS.md` line 29, `PROJECT_COMPLETION_ROADMAP.md` line 20, `PROTEIN_BOWL_MASTER_DOCUMENTATION.md` line 52. Suggested wording: "drafts are kept outside the repository until approved".

## P7.4 Corrected commit plan
**Option 1 (recommended): 6 layered commits, 365 files.**
| # | Commit | Files | Content / dependency |
|---|---|---|---|
| 1 | chore: line endings and ignore rules | 2 | `.gitattributes` (new), `.gitignore`; independent |
| 2 | feat(db): schema, 3 migrations, seeds, migration tests, test infrastructure | 40 | `schema.prisma`, `seed*.ts`, `seedData/`, 3 migrations, 3 A-package SQL files, migration/testDatabase tests (8 new + 7 legacy + 4), `setup.ts`, `fixtures/` (2), vitest configs (2), `server/package.json`, 5 test-DB scripts, `TESTING.md`; independent |
| 3 | feat: application, server + web, incl. removal of the retired scope and route wiring | 282 | auth (63), customer (35), orders (38), delivery/mess (52), staff (24), removal + wiring (64: `app.ts`, 19 deleted, 44 stubs) + SRS docx (1) + `profileExercise.test.ts`, `clientContract.unit.test.ts`, 3 job scripts; **needs 2** (Prisma client/schema) |
| 4 | feat(mobile): customer app updates | 22 | `apps/mobile/**`; independent (own package, fake backend) |
| 5 | chore(ci): CI, Docker, web test runner, guard policy | 7 | `ci.yml`, 2 `.dockerignore`, `Dockerfile`, `run-web-tests.mjs`, `pb-guard.mjs`, `.claude/settings.json`; **runs 2 + 3** |
| 6 | docs | 12 | 8 root docs + 4 `docs/*.md`; independent |
2 + 40 + 282 + 22 + 7 + 12 = **365**. Only commits 1, 4, 6 are green alone; 3 is green once 2 is present; 5 depends on both.
**Option 2: the 11 review-oriented groups** (counts: hygiene 2, db 29, auth 63, customer 35, orders 38, delivery/mess 52, staff 24, mobile 22, tooling 23, removal+wiring 65, docs 12 = 365). They cannot each build: `src/types.ts` (customer) is imported by the auth files, `AuthModal.tsx` (auth) imports customer services and `healthProfile`, server order/refund code and delivery/mess code import each other (a cycle), `app.ts` mounts routes from three groups and unmounts the modules deleted with it, and every server test needs the test infrastructure. Use Option 2 for reading, Option 1 for history.
Full lists: `commit-plan-v2.md` (scratchpad, outside the repository).

## P7.5 Line endings and proposed files
- **`git add --renormalize --dry-run .` was BLOCKED by the project guard and therefore NOT RUN. It is not reported as passed.** What was verified instead, read-only: `git ls-files --eol` shows all 543 tracked text files are LF in the index (4 binary), no untracked candidate contains CR, and `git diff --check` is clean — evidence that renormalization would change nothing, not a substitute for running it. Run it yourself after approving `.gitattributes`.
- `.gitattributes` and the `.gitignore` block exist only in the scratchpad (`gitattributes.proposed`, `gitignore-addition.txt`); the repository tree contains neither change. The block (updated: also lists the new keep-local paths) was tested as a temporary exclude file: it hides exactly the 45 keep-local files.

## P7.6 Final status (read-only)
Branch `role-simplification`, HEAD `6d6bac1`. **198 modified, 19 deleted, 190 untracked = 407; 0 staged.** Nothing was staged, deleted, committed, pushed, merged or migrated in this pass, no migration was applied and no application code was changed; the only repository file edited is this audit document.

---

# P8. Commit dependency verification (2026-11-02) — supersedes the commit 2/3/5 rows of §P7.4; read-only, nothing staged

**The earlier table was inconsistent and is corrected:** it said commit 2 had no dependencies, but it contained three files that need commit 3. Method: for every file of a commit, every relative import / dynamic import / `require` was resolved on disk and checked against "available at that point" (= HEAD, which equals the index because nothing is staged, plus the earlier commits, minus files the plan deletes). Results below; the scan is mechanical, not a build of the commits (building them would require staging).
## P8.1 Corrected membership (365 files; status entries 362 + `.gitattributes` + `.gitignore` + SRS docx)
| # | Commit | Files | Change from §P7.4 |
|---|---|---|---|
| 1 | line endings and ignore rules | 2 | – |
| 2 | db: schema, 3 migrations, seeds, migration tests, test-DB tooling | **37** | **moved to commit 3:** `server/package.json` (its scripts point at job scripts in commit 3) and the 2 reconcile fixtures (`fixtures/reconcileTestEntry.ts` imports `reconcileCli`/`reconcileTargetGuard`, which only exist in commit 3; `reconcileStubPrisma.cjs` is its companion) |
| 3 | application (server + web), removal of the retired scope, route wiring | **285** (284 status entries + the SRS docx deletion) | +3 (package.json, 2 fixtures) |
| 4 | mobile | 22 | – |
| 5 | CI, Docker, web test runner, guard policy | 7 | – |
| 6 | docs | 12 | – |
2 + 37 + 285 + 22 + 7 + 12 = **365**. Commit 3 = 221 modified or new application files (this includes `app.ts`, `server/package.json`, the 2 fixtures, `profileExercise.test.ts`, `clientContract.unit.test.ts` and the 3 job scripts) + 19 deleted + 44 stubs = 284 status entries, + 1 SRS docx deletion = 285.
## P8.2 Answers
1. **Can commit 2 pass on its own? Yes, after the three files above were moved.** Evidence: (a) every import of its files resolves inside HEAD ∪ commit 2; the single cross-reference is `p9c.migration.test.ts` → `deliveryAttemptPolicy.ts`, which commit 3 modifies, but the two names it uses (`ATTEMPT_OUTCOMES`, `MAX_DELIVERY_ATTEMPTS`) exist in the HEAD version; (b) the commit's own schema/migration suites — `migrationAdminActors.unit`, `migrationChain.unit`, `migrationConsistency.unit`, `migrationExercise.unit`, `migrationDb.unit`, `testDatabase.unit`, `migrationApplied` — pass (**7 files, 72 tests**; they read only the schema, the migration files, `testDatabase.ts` and `setup.ts`); (c) `prisma validate` on the new schema: **valid** (offline; the CLI auto-loads the local env file but nothing was printed or used; DATABASE_URL was set explicitly to the isolated URL). **Not proven by execution:** a server typecheck of HEAD's old code against the NEW schema (client regeneration is blocked). By inspection it compiles: HEAD's only uses of `hasExercise` are `data.hasExercise` (input accepts boolean/null/undefined), `?? false` on write and `?? true` on read. Suites needing the application (profile, orders, delivery…) are in commit 3 and are not expected to run at commit 2.
2. **Can commit 3 pass once commit 2 is present? Yes.** All imports of its files resolve inside (HEAD − deleted) ∪ commit 2 ∪ commit 3 (0 not-available; the 6 "unresolved" hits are text inside assertions that read source strings, and the real files exist); **no remaining file imports any of the 19 deleted or 44 stub files**; no test reads a docs, CI, Docker or keep-local file (one optional check on the proposed copy of migration A skips when absent). Commit 3 never imports commit 4, 5 or 6 files. The full server suite (79 files / 1705 passed, 1 skipped), full web suite (61 / 673), server and web typechecks and the web build — all run on the full working tree, which for server and web equals HEAD + commits 2 + 3 — pass. The 1 skipped test is the post-migration NULL round-trip (§P5.2), not a pass.
3. **Can commit 5 pass once 2 and 3 are present? Its jobs depend on them, and I could only verify the equivalent commands locally.** The workflow runs: web typecheck/tests/build (need 3), server `prisma generate`, `tsc`, **`migrate deploy` on a fresh database, seed**, `vitest run` (need 2 + 3), `test:migrations` (needs `server/package.json` from commit 3 and the suites from commit 2, plus a Postgres service on 5433), `docker build` (needs 3: `npm run build` = `tsc`), and the mobile job (independent; passes at HEAD and with commit 4). Run locally and passing: web typecheck, tests, build; server typecheck and full suite on `pb_ci_test`; mobile typecheck and suite. **Never run anywhere:** the workflow itself, a fresh-database `migrate deploy` + seed of all 21 folders, `npm run test:migrations` / `preparedMigrations.migration.test.ts`, `docker build`. Two consequences to expect on the first CI run: the skipped NULL test **will execute** on the fresh database (migration 3 applied there), and the new replay/`migrate diff` suite will execute for the first time.
4. **Dependency order:** **1 → 2 → 3 → 4 → 5 → 6.** Hard dependencies: 3 needs 2; 5 needs 2 and 3 (its jobs run both); everything else is independent (1, 4 — own package with a fake backend — and 6). Commit 6 should come last because it describes the finished state.
## P8.3 Confirmations (computed from the live status)
- **Totals:** LOCAL 45 + commit 2 (37) + commit 3 (284 status entries) + commit 4 (22) + commit 5 (7) + commit 6 (12) = **407**; no entry is in two groups.
- **The 45 keep-local files are in no commit group:** 0 of them match any non-local group; the proposed `.gitignore` block hides exactly those 45.
- **Destructive migration-b draft and all experimental proposed files are excluded:** of the 10 non-evidence files under `server/prisma/proposed/`, the only ones in the commit set are `precheck_migration_a.sql`, `postcheck_migration_a.sql`, `20261020100000_…/rollback.sql` (hand-run SQL of migration A); `migration-b/…/migration.sql`, the duplicate copy of migration A, `README.md`, `MESS_CUSTOMER_IMPACT_INSPECTION_PLAN.md`, `BACKUP_AND_RECOVERY.md` and both `SHARED_TEST_*.md` are LOCAL, and all 30 evidence files are LOCAL.
- **No sensitive path among the commit candidates:** no environment file, dump, backup, key, log, credential or secret-named file.
- **Deletions counted exactly once:** 19 deleted (status ` D`) + 44 stubs (status ` M`) = 63, 0 duplicate paths, 0 overlap; `public/Protein_Bowl_Enterprise_SRS.docx` is tracked, unmodified (not in `git status`) and appears only as an **intentional deletion** in commit 3 (the 64th removal).
- **Migration state (corrected, see §P4.4/§P5.1 notes):** migrations 1 and 2 already exist on the **disposable** `pb_ci_test` (built by your isolated-database procedure; proved read-only); migration 3 is on no database; nothing was applied to the development or production database by this session, which never connected to either.

---

# P9. Pre-commit staging phase (2026-11-02) — config files applied; STAGING BLOCKED by the project guard; nothing staged, committed, deleted or pushed

- **Applied (authorized file edits):** `.gitattributes` (new, rules exactly as proposed; only its header comment was reworded because "Not installed" was no longer true) and the `.gitignore` block (appended after `scratch/`). Effect verified read-only: `git ls-files -o -i --exclude-standard` shows exactly **45** newly ignored files (the keep-local set); status is now **19 deleted + 199 modified + 146 untracked = 364 entries** (362 candidates + `.gitattributes` + `.gitignore`); with `public/Protein_Bowl_Enterprise_SRS.docx` that is **365 files** to stage. `git diff --check`: clean. `git ls-files --eol`: still all `i/lf`.
- **Staging was attempted and BLOCKED:** `git add -- .gitattributes .gitignore` was refused by `.claude/hooks/pb-guard.mjs` ("git add is not allowed … needs the user"); the guard also refuses `git rm`, running `bash`, and `git add --renormalize --dry-run`. As instructed, it was not bypassed. **The index is empty (0 staged).**
- **Prepared instead:** `…\scratchpad\stage-groups.sh` (outside the repository) stages the six groups in order 1→6, verifies the running total after each group (2, 39, 324, 346, 353, 365) and aborts on any mismatch, then verifies the index (staged count, no keep-local or sensitive path, 64 deletions, `git diff --cached --check`, nothing left unstaged or untracked). Modes: `plan` (read-only), `all`, `1`..`6` (one group), `verify`. Its classification was replayed inline here (the guard also blocks running the script): **G1 2, G2 37, G3 284 + SRS = 285, G4 22, G5 7, G6 12, LOCAL 0, renames 0 = 365** — identical to the approved plan.
- **Group 3 staging detail (what the script does):** 19 paths already deleted → `git add -A` (stages the deletions); 44 stubs → `git rm -f` (they exist on disk); SRS docx → `git rm`; every other group-3 file → `git add -A`. Each of the 64 removals is staged exactly once.
- **Lightweight checks re-run on the working tree (post config change):** web typecheck 0 errors; server typecheck clean; mobile typecheck clean; web suite 61 files / 673 passed; schema/migration/config server suites (`migrationAdminActors.unit`, `migrationChain.unit`, `migrationConsistency.unit`, `migrationExercise.unit`, `migrationDb.unit`, `testDatabase.unit`, `migrationApplied`, `hardening`, `invite-config`) 9 files / 120 passed. No trailing whitespace or conflict markers in untracked candidates.
- **Not possible without staging:** inspecting `git diff --cached` (staged diff, staged file list, staged deletions, `git diff --cached --check`) — they run as part of `stage-groups.sh verify` once you run it.
