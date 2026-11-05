# Protein Bowl — Implementation Status (six-role architecture)

Status words: **VERIFIED** = checked by the stated automated run and/or a browser run (see `PROGRESS.md` for dates and counts); **CODE WRITTEN, UNVERIFIED** = implemented and unit/integration tested but not exercised end to end; **BLOCKED** = needs something external (Razorpay sandbox, migration approval); **NOT STARTED**. Nothing here is a production-readiness claim.

## Scope
Customer web app (Vite + React 19), customer mobile app (Expo), one Express REST API (`/api/v1`), one PostgreSQL database. **Exactly six roles:** `CUSTOMER`, `CHEF`, `NUTRITIONIST`, `TRAINER`, `PROCUREMENT`, `SUPER_ADMIN`. **ONLINE payment only** (no Cash on Delivery, wallet or cash handling).

**Removed from the product (not deferred, not planned):** POS, Bakery/FMCG ERP, Tepache ERP, MD command centre, HRM/payroll, finance ledger, CMS, SRS generator, aggregator (Swiggy/Zomato) portal, the driver workspace and the `DELIVERY`/`MESS_CUSTOMER`/`MD`/`POS`/`BAKERY_FMCG`/`TEPACHE_ERP`/`SWIGGY_ZOMATO` roles. Those role names survive only as retired vocabulary in the Prisma enum until the approved enum-shrink migration; they never authorize anything. **Packaged-food and Tepache products remain ordinary items in the customer catalogue.**

## Module matrix
| Module | API (`/api/v1/…`) | Who | Web | Mobile | Status |
|---|---|---|---|---|---|
| Auth, sessions, password reset | `auth/*` (register, login, refresh, logout, forgot/reset password, staff accept-invite, me), `auth/mobile/*` (customer only) | all | yes | yes | VERIFIED (automated; browser: register, sign-in, duplicate email/phone) |
| Customer profile, health data, addresses | `customers/me/profile`, `customers/me/addresses` | CUSTOMER | yes | partial | VERIFIED (browser C1–C15, skip/basics-only save) |
| Catalogue and recipes | `products/*`, `recipes/*` (public read; Chef authoring; SUPER_ADMIN publishes) | public, CHEF, SUPER_ADMIN | yes | yes | VERIFIED (menu from published recipes) |
| Cart, checkout preview, orders | `cart/*`, `checkout/preview`, `orders` (create, my-orders, detail) | CUSTOMER | yes | yes | VERIFIED (unpaid order placed in browser) |
| Payments (Razorpay) | `orders/:id/payment-attempts/*`, `admin/payments`, `payments/webhook` | CUSTOMER, SUPER_ADMIN | yes | yes | CODE WRITTEN, UNVERIFIED against the real provider — **BLOCKED on the Razorpay sandbox** (mock provider only) |
| Cancellation and refunds | `orders/:id/cancel`, `orders/:id/cancellation-request`, `orders/:id/refunds`, `admin/cancellation-requests*`, `admin/refunds*` | CUSTOMER, SUPER_ADMIN | yes | yes | CODE WRITTEN, tested; paid-order refund flow BLOCKED on sandbox |
| Kitchen (KDS) | `kds/*` (accept → prepare → ready), `admin/kitchen/orders` (route to branch) | CHEF (own branches), SUPER_ADMIN | yes | — | CODE WRITTEN, tested |
| Delivery (administrator-operated) | `admin/delivery/orders/:id/{dispatch,takeover,report-failure,retry,resume,verify-delivery}`, `orders/:id/delivery-code*` (customer code) | SUPER_ADMIN, CUSTOMER | yes | code shown to customer | CODE WRITTEN, tested; DELIVERED only through a verified Delivery Code (or exceptional audited override) |
| Kerala Mess | `mess/*` (plans, subscriptions, meals, pause, handover code), `mess/kitchen/*` (chef batches), `admin/mess/*`, `admin/mess/delivery/*` (SUPER_ADMIN-operated runs) | CUSTOMER, CHEF, SUPER_ADMIN | yes | partial | CODE WRITTEN, tested |
| Nutrition | `diets/*` (request → claim → publish versions; health data only for the claiming nutritionist) | CUSTOMER, NUTRITIONIST | yes | API ready | CODE WRITTEN, tested |
| Coaching | `trainer/*` (assignments by SUPER_ADMIN, workout plans, customer progress logs) | TRAINER, SUPER_ADMIN, CUSTOMER | yes | — | CODE WRITTEN, tested (needs migration B) |
| Procurement | `procurement/*` (items, stock, suppliers, purchase orders, goods receipts) | PROCUREMENT, SUPER_ADMIN | yes | — | CODE WRITTEN, tested (needs migration B) |
| Staff and branches | `admin/staff*`, `admin/branches*`, `admin/step-up`, `admin/audit`, `staff/me`, `staff/permissions` | SUPER_ADMIN, staff | yes | — | VERIFIED (automated); invitation e-mail provider not configured |
| Background jobs | `payments:reconcile:prod` (dry run default), `orders:expire-unpaid`, `mess:close-day`, `mess:generate-meals` | operations | — | — | CODE WRITTEN; production reconciliation `--apply` stays gated until verified |

## Database and migrations
Forward-only, `prisma migrate deploy` only. **Prepared, NOT applied to any non-disposable database (three, in this order):** `20261020100000_role_simplification_admin_actors` (additive columns for administrator-operated delivery), `20261031120000_trainer_procurement_foundation` (trainer, procurement, cancellation-request and password-reset tables) and `20261101120000_health_exercise_unanswered` (`health_biometrics.hasExercise` becomes nullable so "not answered" is no longer stored as "No"; no data is rewritten). Drafts under `server/prisma/proposed/`: enum shrink (Migration B-draft) and retired-table drop (Migration C) — destructive, not part of the current change set. The code requires both prepared migrations before it can run on a real database.

## Verification state
See `PROGRESS.md` (latest counts) and `docs/E2E_CHECKLIST.md` (browser evidence). Open items: Razorpay sandbox scenarios (`docs/SANDBOX_VERIFICATION.md`), two browser checks (women-only answer persistence, API-down menu banner), CI workflow and Docker image never executed, mobile app never run on a device, migrations unapplied.
