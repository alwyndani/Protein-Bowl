# Protein Bowl — Completion Roadmap (six-role scope)

Replaces the 2026-10-08 audit roadmap, whose POS/FMCG/Tepache/MD/HRM/Finance/CMS phases were removed from scope. This file lists only what remains to finish the **approved** scope: six roles, ONLINE payment only, one API, one database, web + customer mobile. Current evidence lives in `PROGRESS.md`; procedures in `docs/OPERATIONS.md`, `docs/SANDBOX_VERIFICATION.md`, `docs/E2E_CHECKLIST.md`, `server/TESTING.md`.

## Done (verified by the stated checks)
- Six-role authorization (database-authoritative roles, static permission catalogue, branch scope, step-up for sensitive admin actions).
- Customer journey in the browser (registration, health profile, address, cart, checkout preview, unpaid order, cancellation of unpaid order) — C1–C15.
- Server, web and mobile automated suites green; web production build OK.
- Retired scope removed from routes, UI and tests (files still to be deleted from git; see `docs/PR_READINESS_AUDIT.md`).

## Remaining work, in order
1. **PR preparation (no commit yet):** delete the 44 blanked stub files and 19 deleted-file entries in git, add `.gitattributes`, split the change set into logical commits, review and approve. *Owner: you; blocked on your approval.*
2. **Apply the two prepared migrations — only after approval and a backup:** first on a disposable copy (procedure in `server/TESTING.md`: create database → `migrate deploy` → run the suites), then on the development database, then production. Order: `20261020100000_role_simplification_admin_actors`, then `20261031120000_trainer_procurement_foundation`, then `20261101120000_health_exercise_unanswered` (then `npx prisma generate`). Run the fresh-replay + `migrate diff` suite on a disposable PostgreSQL instance first (`preparedMigrations.migration.test.ts`, command in `server/TESTING.md`; not yet run).
3. **Razorpay sandbox verification** (nine scenarios in `docs/SANDBOX_VERIFICATION.md` §A): pay for an order, PAID/CONFIRMED order, webhook handling, customer cancellation of a paid order and refund, cancellation requests for ACCEPTED/PREPARING/READY orders, delivery code after payment, kitchen and delivery journeys that start from a paid order. Needs sandbox keys supplied by you; none are used until then.
4. **Staff journeys in the browser** (section X of `docs/E2E_CHECKLIST.md`): SUPER_ADMIN routing/delivery/cancellation review, CHEF kitchen, NUTRITIONIST claim/publish, TRAINER plans, PROCUREMENT purchase orders and goods receipt.
5. **Outstanding browser checks:** women-only answer persistence (O1) and the API-down menu banner (O2).
6. **Production configuration:** `EMAIL_PROVIDER` (Resend or none), `COMMERCE_*` pricing policy, Razorpay live keys, `DELIVERY_PROOF_SECRET`, JWT secrets, `UNPAID_ORDER_EXPIRY_MINUTES`; schedule `orders:expire-unpaid`, `mess:close-day`, `mess:generate-meals`; enable `payments:reconcile:prod --apply` only after the dry run and the sandbox results are reviewed (`docs/OPERATIONS.md`).
7. **CI and container:** run `.github/workflows/ci.yml` on GitHub; build and run `server/Dockerfile` once.
8. **Mobile:** run the Expo app on a device/emulator against the isolated API; payment screens against the sandbox.
9. **Later, separately approved:** enum-shrink migration (remove retired role names from the Prisma enum) and the retired-table drop. Both are destructive and have drafts under `server/prisma/proposed/`; neither is needed to ship.

## Explicit non-goals
POS, Bakery/FMCG ERP, Tepache ERP, MD dashboard, HRM/payroll, finance ledger, CMS, driver/delivery-partner workspace, aggregators, Cash on Delivery, wallet payments, cash collection, client-side pricing. They are not "deferred": do not rebuild them without a new product decision.
