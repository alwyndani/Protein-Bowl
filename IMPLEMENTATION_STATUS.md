# Protein Bowl Enterprise Platform — Implementation Status

> **Strict Audit, Phase 4A & Phase 4B Implementation Status**

---

## 📊 Module Implementation Matrix

| # | Business Domain Module | Database Models | Backend APIs | Web Frontend | Mobile App | Automated Tests | Strict Status |
|---|------------------------|-----------------|--------------|--------------|------------|-----------------|---------------|
| 1 | Auth & RBAC | `User`, `UserRoleAssignment`, `RefreshToken`, `AuditLog` | `/api/v1/auth/*` | Integrated | Secure Storage Integrated | Vitest Passed (7 tests) | **VERIFIED** |
| 2 | Customer Profile & Biometrics | `CustomerProfile`, `HealthBiometrics`, `CustomerAddress` | `/api/v1/customers/*` | Integrated | Integrated | Vitest Passed (4 tests) | **VERIFIED** |
| 3 | Database Migration History | 60+ Prisma Models | Reconciled Migrations | N/A | N/A | Fresh DB Deploy Verified | **VERIFIED** |
| 4 | Seed Data & Idempotency | All Domain Entities | Seed Script `seed.ts` | N/A | N/A | Executed clean | **VERIFIED** |
| 5 | Mobile Token Security | Local Storage Tokens | Token Auth Header | N/A | `SecureStore` Integrated | `tsc` Passed | **VERIFIED** |
| 6 | Diet Plan Lifecycle & Versioning | `DietPlanRequest`, `DietPlan`, `DietPlanDay`, `DietPlanMeal` | `/api/v1/diets/*` | Integrated | API Contract Ready | Vitest Passed (19 tests) | **VERIFIED** |
| 7 | Recipe & Catalog | `Recipe`, `Ingredient`, `RecipeIngredient` | `/api/v1/recipes/*` | Integrated | Deferred | Vitest Passed (23 recipe tests) | **VERIFIED** |
| 8 | E-commerce, Cart & Direct Checkout | `Cart`, `CartItem`, `CustomerAddress`, `Product`, `ProductCategory`, `ProductVariant`, `Order`, `OrderItem` | `/api/v1/products/*`, `/api/v1/cart/*`, `/api/v1/checkout/*`, `/api/v1/orders/*`, `/api/v1/customers/me/addresses` | Integrated (`DirectCartCheckoutModal`, `DirectOrderTrackingModal`, `CustomerHome`, `PackagedFoodsSection`) | API Contract Ready | Vitest Passed (41 commerce tests, 95 total) | **VERIFIED** |
| 9 | Subscriptions & Kerala Mess | `MessAccount`, `MessSubscriptionPlan`, `MessSubscription`, `MessDailyOrder`, `MealPauseRequest`, `WalletAccount` | `/api/v1/mess/*` | Mock / Partial | Deferred | Pending Phase 5 | **DEFERRED** |
| 10 | Chef & KDS Workstation | `KitchenStation`, `KitchenOrderTicket`, `KitchenBatch` | `/api/v1/kds/*` | Mock / Partial | Deferred | Pending Phase 5 | **DEFERRED** |
| 11 | Nutritionist Workstation | `DietPlanRequest`, `DietPlan`, `HealthBiometrics`, `Recipe` | `/api/v1/diets/*`, `/api/v1/recipes/*` | Integrated | API Contract Ready | Vitest Passed | **VERIFIED** |
| 12 | Procurement & Inventory | `InventoryItem`, `StockMovement` | `/api/v1/procurement/*` | Mock / Partial | Deferred | Pending Phase 5 | **DEFERRED** |
| 13 | Delivery & Logistics Fleet | `DeliveryAssignment` | `/api/v1/delivery/*` | Mock / Partial | Deferred | Pending Phase 5 | **DEFERRED** |
| 14 | POS Cashier Billing | `POSTransaction`, `CashDrawerShift` | `/api/v1/pos/*` | Mock / Partial | Deferred | Pending Phase 5 | **DEFERRED** |
| 15 | Bakery & FMCG ERP | `FMCGBatch`, `DispatchChallan` | `/api/v1/fmcg/*` | Mock / Partial | Deferred | Pending Phase 5 | **DEFERRED** |
| 16 | Tepache Brewery ERP | `TepacheTank`, `TepacheBrewBatch`, `BottleReturn` | `/api/v1/tepache/*` | Mock / Partial | Deferred | Pending Phase 5 | **DEFERRED** |
| 17 | Swiggy/Zomato Aggregators | `AggregatorOrder` | `/api/v1/orders/*` | Mock / Partial | Deferred | Pending Phase 5 | **DEFERRED** |
| 18 | MD Command Center | Enterprise Telemetry Service | `/api/v1/md/*` | Mock / Partial | Deferred | Pending Phase 5 | **DEFERRED** |
| 19 | HRM & Payroll | `HRMEmployee`, `AttendanceRecord`, `PayrollRecord` | `/api/v1/hrm/*` | Mock / Partial | Deferred | Pending Phase 5 | **DEFERRED** |
| 20 | Financial Ledger & Reports | `FinancialTransaction` | `/api/v1/finance/*` | Mock / Partial | Deferred | Pending Phase 5 | **DEFERRED** |
| 21 | Admin CMS | `CMSBanner`, `CMSMedia`, `MealPlanDefinition` | `/api/v1/cms/*` | Mock / Partial | Deferred | Pending Phase 5 | **DEFERRED** |
| 22 | Payment Gateway & SMS OTP | N/A | External API Stubs | Mock / Client-side | Deferred | Pending Integration | **EXTERNAL SETUP REQUIRED** |

---

## 📈 System Completion Overview

- **Foundation Stabilization Phase**: 100% (**VERIFIED**)
- **Phase 1 (Database Core & Auth)**: 100% (**VERIFIED**)
- **Phase 2 (Customer Profile & Biometrics)**: 100% (**VERIFIED**)
- **Phase 3 (Diet & Nutrition Workflow)**: 100% (**VERIFIED**)
- **Phase 4A (Recipe & Nutrition Catalog)**: 100% (**VERIFIED**)
- **Phase 4B (Product Commerce, Server Cart & Order Foundation)**: 100% (**VERIFIED**)
  - Controlled Prisma migration applied (`20261005143000_phase4b_commerce_cart_order`).
  - Commercial product catalog seeded (22 products, 22 variants across 8 categories including FMCG packaged goods, ₹10 Tepache glass bottle deposits, and prepared bowls).
  - Server-authoritative Decimal-safe `PricingService` powering both `/checkout/preview` and `/orders` endpoints.
  - Authenticated Customer server cart (`Cart`, `CartItem`) with logical item merging and strict ownership isolation.
  - Customer addresses API (`/api/v1/customers/me/addresses`) with default address management and soft deletion.
  - Checkout preview API (`POST /api/v1/checkout/preview`) returning structured monetary breakdown without mutating database or creating orders.
  - Transactional order creation (`POST /api/v1/orders`) with idempotency key protection (`Order.idempotencyKey`), immutable `OrderItem` commercial snapshots, and immutable `deliveryAddressSnapshot`.
  - Customer order history & detail APIs (`/api/v1/orders/my-orders`, `/api/v1/orders/:orderId`) with strict customer ownership scoping.
  - Frontend integration (`DirectCartCheckoutModal`, `DirectOrderTrackingModal`) wired to real backend services (`cartService`, `addressService`, `orderService`, `productService`).
  - 41 automated integration tests in `commerce.test.ts` (95 total suite tests passing across foundation, diet, recipe, and commerce).
- **Phase 5 (Subscriptions & Kitchen KDS)**: Deferred

---

## 🔄 Stabilization Checkpoint Log
- **2026-10-01**: **Phase 4A Recipe & Nutrition Catalog Completed & Verified**
  - Controlled Prisma migration `20261001140000_phase4a_recipe_nutrition_catalog` created and applied.
  - 120 source recipes normalized and seeded into `recipes`, `ingredients`, and `recipe_ingredients`.
- **2026-10-05**: **Phase 4B Product Commerce, Server Cart & Order Foundation Completed & Verified**
  - Controlled Prisma migration `20261005143000_phase4b_commerce_cart_order` created and applied.
  - Built server-authoritative Decimal-safe pricing service and server-backed cart domain.
  - Implemented customer address management, checkout preview, and transactional order creation with idempotency and snapshot protection.
  - Integrated frontend components (`DirectCartCheckoutModal`, `DirectOrderTrackingModal`) with backend API services.
  - Executed quality gate: `prisma validate` 🚀, `prisma migrate status` (6 migrations up to date), backend `tsc` (0 errors), frontend `tsc` (0 errors), `npm run build` (built in 23.43s), mobile `tsc` (0 errors), full Vitest suite passing (95/95 tests passing), clean migration replay against isolated disposable DB `protein_bowl_test_db` verified.

---

## 🔎 Onboarding Audit Corrections (2026-10-07, Claude Code migration)

Verified by running the quality gates: `prisma validate` OK, `prisma migrate status` (6 migrations, up to date), backend/web/mobile `tsc` 0 errors, web build OK, Vitest **95/95** (foundation 12, diet 19, recipe 23, commerce 41). The matrix above is retained; the following qualifications apply and take precedence:

- **Per-module test counts in the matrix** for rows 1–2 (7 / 4) are not traceable to files; actual counts are per file (foundation = 12 covering auth + customer + foundation).
- **Mobile columns marked "Integrated" / "API Contract Ready" → SCAFFOLD.** `apps/mobile` is a single 277-line `App.tsx` with demo credentials, hardcoded `localhost` API URL and a fake wallet balance. No mobile tests.
- **Row 8 (Commerce) is VERIFIED for backend behaviour only.** Pricing defaults (₹40 delivery, ₹499 free-delivery threshold, 5% fallback tax, ₹0 packaging; ₹10 Tepache deposit in seed data) are **PRODUCT DECISION REQUIRED**. The earlier-cited ₹25 packaging fee is not in code. Payment gateway: **MISSING/DEFERRED** (orders are created with `status=PENDING`, `paymentStatus=PENDING`; no PAID path). `Payment.status` schema default `"SUCCESS"` is unsafe and must be fixed before use.
- **Seed counts:** dev DB currently holds 23 products/23 variants (11 categories); this document previously said 22. Recipes 120 / RecipeIngredient 606 / Ingredient 350 confirmed.
- **Rows 9–21 (ERP/Mess/KDS/etc.):** backend routes + schema exist as thin untested CRUD (**SCAFFOLD**) and web dashboards run on `src/data/mock*.ts` (**MOCK**); "DEFERRED" remains correct for production workflows.
- **Web integration is PARTIAL:** `App.tsx` still seeds profile/requests/orders and ERP state from mock constants; several customer components still read static data files.
- **Security gaps recorded (unfixed):** cart routes use `requireRole([CUSTOMER])` (SUPER_ADMIN passes); diet customer routes and mess routes lack a customer-role guard; CORS reflects any origin with credentials; register/refresh not rate-limited. See `CLAUDE.md` §9.

---

## 🛡️ Phase 4C — Security & Commerce Hardening (2026-10-07)

Backend tests 132/132; backend/web/mobile `tsc` clean; web build OK; migration chain replayed on a disposable DB with no drift.

| Item | Status |
|------|--------|
| Customer-context authorization (cart, profile, addresses, checkout, orders): SUPER_ADMIN/staff blocked | **VERIFIED** |
| Diet customer routes require CUSTOMER; nutritionist workflow unchanged | **VERIFIED** |
| Mess customer routes: CUSTOMER + legacy MESS_CUSTOMER only; staff blocked; gate-pass staff access unchanged | **VERIFIED** |
| CORS allow-list + Origin check on state-changing requests | **VERIFIED** (production origin = deployment configuration required) |
| Rate limits: login/register/refresh/general (env-configurable) | **VERIFIED** |
| JSON body limit 256kb, 413/400 error mapping | **VERIFIED** |
| `Payment.status` default PENDING (migration `20261007100318_phase4c_payment_status_safe_default`) | **VERIFIED** |
| Seed production guard; dev-only demo credentials / Demo Access (web), `__DEV__` gating (mobile) | **VERIFIED** (frontend gating is UX hygiene; demo strings confirmed absent from the production web bundle) |
| Shared Prisma singleton in all application modules | **VERIFIED** |
| MESS_CUSTOMER to CUSTOMER reconciliation | **DEFERRED** (legacy role kept; Option A is the target) |
| Order/checkout-specific rate limits, Payment status enum, real OTP/social login, ERP validation | **DEFERRED** |
| Pricing values (delivery fee, free-delivery threshold, fallback tax, packaging, Tepache deposit, payment methods) | **PRODUCT DECISION REQUIRED** |

The security gaps listed in "Onboarding Audit Corrections" above (cart role bypass, unprotected diet/mess customer routes, open CORS, missing rate limits/body limit, Payment default) are resolved by this phase.

---

## 🔎 Master Completion Audit Corrections (2026-10-08)

See `PROJECT_COMPLETION_ROADMAP.md` for the full matrix. Corrections that supersede earlier statements in this file:

- **Row 8 (E-commerce, Cart & Direct Checkout) — Web Frontend is PARTIAL, not "Integrated".** The storefront (`PackagedFoodsSection`, `TepacheDrinksSection`, `CustomerHome`) uses mock products and a local cart; no component calls `CartService.addItem` or `ProductService`. `DirectCartCheckoutModal` creates orders from the (empty) server cart, so order creation from the UI returns `400 EMPTY_CART`. Addresses and order history are real. Backend remains VERIFIED. Target: Phase 5.
- `MessService`, `MDService`, `KDSService` and `ProductService` web services exist but have no UI consumers.
- Rows 9–21: backends are SCAFFOLD (unwired/untested). Nothing creates `KitchenOrderTicket`, `DeliveryAssignment`, `Subscription`, `MessSubscription`/`MessDailyOrder`, `InventoryItem`, `WorkoutPlan` or `AuditLog` rows. Swiggy/Zomato has **no backend routes**. There is no Super Admin / staff provisioning API.
- Row 22 and Payments: **MISSING** (no initiate/verify/webhook).

---

## 🛒 Phase P5 — Customer Storefront ↔ Server Commerce (2026-10-08)

Supersedes the "Row 8 — Web Frontend is PARTIAL" correction above for the customer purchase path.

| Item | Status |
|------|--------|
| Storefront product browsing from `GET /products` (loading / empty / error+retry; no mock fallback) | **VERIFIED** |
| Server-backed cart (hydrate, add, quantity, remove, clear) — single authoritative cart | **VERIFIED** |
| Login required to purchase; public browsing; no guest cart | **VERIFIED** (guest-cart merge NOT implemented — product decision) |
| Address select/create (owned addresses) | **VERIFIED** |
| Checkout totals from `POST /checkout/preview` (displayed verbatim, never recomputed) | **VERIFIED** |
| Order creation via server cart, idempotency key reused on retry, double-submit guarded | **VERIFIED** |
| Persisted order confirmation, history and detail; status shown exactly as stored | **VERIFIED** |
| Web automated tests (Vitest + Testing Library, 43 tests) | **VERIFIED** |
| Manual E2E browser → API → PostgreSQL (executed 2026-10-08) | **VERIFIED** — one order, cart consumed, no Payment row, PENDING/PENDING |
| Payment, order lifecycle, KDS, delivery, inventory, subscriptions, mobile commerce | **NOT STARTED / DEFERRED** (unchanged) |
| Pricing values (tax, delivery fee/threshold, packaging, Tepache deposit, payment methods) | **PRODUCT DECISION REQUIRED** — web now displays whatever the server returns; none is hard-coded in the web path |
| Product content (ingredients, allergens, shelf life, images), prepared-bowl storefront section, reorder | **MISSING** |

Remaining mock/static dependencies near this path: `CustomerHome` combo offers (`mockData`) and static recipe menu (`recipeDatabase`); `App.tsx` `guestOrders`/`orders` mock state feeding ERP and diet-order screens; dead file `DirectGuestOrderModal.tsx` (unused).

Maintenance note (not part of P5): `npm audit` at the repo root reports 1 high-severity transitive advisory in `source-map-js` (GHSA-68fv-2mgg-jv7q, DoS via source-map section offsets). Not addressed in P5; schedule for a later dependency/security maintenance pass.

---

## 🛡️ P6A — Staff identity, authorization, branch scope & audit foundation (2026-10-08)

Backend 183/183 (p6a 51 new), web 50/50 (7 new), `tsc` ×3 clean, web build OK, migration chain (8) replayed on a disposable DB with no drift. **Only P6A is VERIFIED; P6B and P6C remain pending.**

| Item | Status |
|------|--------|
| Database-authoritative authentication (inactive/suspended/soft-deleted users rejected on the next request; roles read from current DB assignments, JWT role claims ignored) | **VERIFIED** |
| Refresh/login reject inactive and soft-deleted users; refresh denial revokes all sessions and is audited | **VERIFIED** |
| `EmployeeBranchAssignment` (many-to-many) + idempotent backfill of legacy primary branch (dev: 18/18) + AuditLog indexes | **VERIFIED** |
| Role-scope and permission catalogues (SUPER_ADMIN global, MD global read-only, facility roles branch-scoped, DELIVERY self) | **VERIFIED** |
| Branch scope applied to KDS, procurement, POS, delivery endpoints (omitted branch ≠ all branches; foreign branch → 403; MD cannot mutate; driver self-scope) | **VERIFIED** (existing endpoints only — their business workflows remain SCAFFOLD) |
| Customer health data least privilege (SUPER_ADMIN/MD/unassigned staff denied; audited nutritionist access) | **VERIFIED** |
| `AuditService` (append-only, redacts secrets, atomic with transactions when given a tx client) | **VERIFIED** (full admin-event coverage arrives in P6B) |
| `/auth/rbac-test` not registered in production; web role-demo switcher DEV-only; production UI-role guard | **VERIFIED** |
| Existing-data identity audit: 0 users hold both customer and staff roles (dev and test DBs) | **VERIFIED** |
| Staff admin APIs, invitations, CLI bootstrap, password step-up, 12-char policy, audit read API | **P6B — PENDING** |
| Super Admin workspace, `super_admin` UI role | **P6C — VERIFIED** (see the P6C section) |
| Staff 2FA | **DEFERRED** (authentication/platform security completion phase) |
| SUPER_ADMIN health break-glass | **NOT IMPLEMENTED** (requires separate design) |

Notes: SUPER_ADMIN no longer has the nutritionist workstation routes (consequence of D4). Mess gate-pass still allows MD (review in the Mess phase). Dev DB still holds the P5 manual-E2E order and address as test data.

---

## 🧑‍💼 P6B — Staff administration APIs & secure onboarding (2026-10-08)

Backend 263/263 (new: p6b 60, p6b.isolated 12, ratelimit-p6b 3, invite-config 5), web 50/50 (unchanged), `tsc` ×3 clean, web build OK, 9-migration chain replayed on a disposable DB with no drift. **P6A and P6B are VERIFIED; P6C (web workspace) is VERIFIED — see the next section.**

| Item | Status |
|------|--------|
| `StaffInvitation` model/migration (`20261008091939_p6b_staff_invitation`) — only the token SHA-256 is stored | **VERIFIED** |
| Staff create/invite → PENDING account with unusable placeholder credential; manual one-time hand-off (`deliveryMode: "manual"`, nothing emailed) | **VERIFIED** |
| `POST /auth/staff/accept-invite` (public, rate-limited, uniform safe errors, atomic single-use activation, session revocation) | **VERIFIED** |
| 12-character staff password policy (customer policy unchanged) | **VERIFIED** |
| Staff list/detail/update (server-side pagination, search, status/role/branch filters; no secrets, HR data or customers) | **VERIFIED** |
| Role assign/revoke with guardrails (SUPER_ADMIN/CUSTOMER/MESS_CUSTOMER never assignable, no self-change, no mixed identity, last-role protection) | **VERIFIED** |
| Branch assign/revoke with primary-branch consistency; branch administration (create/update/deactivate policy) | **VERIFIED** |
| Activate/deactivate (reason, session + invitation revocation, last-SUPER_ADMIN protection incl. concurrent race) | **VERIFIED** |
| Invitation reissue (PENDING only; not a password-reset path) | **VERIFIED** |
| Password step-up proof (short-lived, user- and password-bound) on create/reissue/role/**branch**/deactivate/activate | **VERIFIED** (time-limited, not single-use; never logged/audited) |
| Production `INVITE_DELIVERY` must be explicit (missing/unsupported fails startup); dev/test default `manual`; manual mode never claims email | **VERIFIED** |
| CLI-only SUPER_ADMIN bootstrap (`npm run admin:bootstrap`) | **VERIFIED** (tested on a disposable database) |
| `/staff/me`, permission catalogue, audit history API (SUPER_ADMIN-only, output re-sanitized) | **VERIFIED** |
| Audit events for all admin mutations, written transactionally; secrets never audited | **VERIFIED** |
| Super Admin web workspace, accept-invite page, step-up UI, `super_admin` UI role | **P6C — VERIFIED** (see the P6C section) |
| Email invitation delivery | **DEFERRED** (P14; adapter seam `InvitationDelivery` exists) |
| Staff 2FA; single-use step-up proofs | **DEFERRED** |

Notes: dev DB has 0 audit rows and 0 invitations from P6B work (all P6B testing ran against the test DB and disposable databases). Production MUST set `INVITE_DELIVERY=manual` explicitly (startup validation fails otherwise).

---

## 🛡️ P6C — Production Super Admin web workspace (2026-10-08)

Backend 263/263 (unchanged), web **127/127** (50 earlier + 77 new: adminService 9, accept-invite 9, workspace/step-up 50, security/static 9), `tsc` ×3 clean, web build OK, 9 migrations (none added), `git diff --check` clean. Manual end-to-end run against the local dev stack completed (below).

| Item | Status |
|------|--------|
| Dedicated Super Admin workspace on the real P6B APIs; `super_admin` UI role separate from MD (SUPER_ADMIN no longer renders the MD dashboard; MD never renders the admin workspace) | **VERIFIED** |
| Authorization UX: not-authorized screen for every non-SUPER_ADMIN; no admin API call and no admin data rendered before the session resolves and holds SUPER_ADMIN | **VERIFIED** |
| Staff list: server-side search/status/role/branch filters + pagination; staff detail; profile edit (no step-up) | **VERIFIED** |
| Invite staff (SUPER_ADMIN/CUSTOMER/MESS_CUSTOMER not offered; branches required for branch roles) with manual one-time hand-off ("NO EMAIL WAS SENT"); reissue shows a NEW link; links never persisted | **VERIFIED** |
| Role assign/revoke, branch assign/revoke, activate/deactivate (reason + confirmation), reissue — all through step-up; backend guardrail errors surfaced | **VERIFIED** |
| `StepUpProvider`/`StepUpDialog`: memory-only proof, `X-Step-Up-Token` only, discarded on logout/user change/reload/rejection, shared prompt for concurrent actions | **VERIFIED** |
| Public `/staff/accept-invite`: fragment token captured then scrubbed, password policy errors, uniform invalid-invitation message, success → staff sign-in | **VERIFIED** |
| Branch administration (create/edit/deactivate with confirmation; `BRANCH_HAS_ACTIVE_STAFF` shown) | **VERIFIED** |
| Audit log UI (SUPER_ADMIN-only, server-side filters/pagination, read-only, secrets redacted) and informational permissions view | **VERIFIED** |
| Consistent 401/403/409/422/429/network handling; duplicate-mutation prevention | **VERIFIED** |
| Production bundle contains no demo admin credentials, no `setupToken`, no role-demo sandbox | **VERIFIED** |
| Staff 2FA, email delivery, single-use step-up, staff password self-service | **DEFERRED** |
| Static `/staff/accept-invite` needs an SPA fallback in production hosting | **PRODUCT/DEPLOYMENT NOTE** |

Backend change: none. Web fix made along the way: `ApiClient` no longer refresh-retries a `401 STEP_UP_FAILED` (a wrong step-up password is not an expired session). Test intentionally updated: `roleGuard.test.tsx` previously asserted SUPER_ADMIN may present the MD dashboard; it now asserts the separation.

**Manual E2E (dev stack, 2026-10-08):** SUPER_ADMIN login → Admin workspace listed real staff → invite with wrong step-up password rejected (session kept) → correct password → temp CHEF created with Kochi branch, "NO EMAIL WAS SENT" + one-time link shown, dismissal removed it from the DOM, no browser storage used → link opened: fragment scrubbed, weak/common and name-containing passwords rejected by the server, strong password activated the account, link not reusable → temp CHEF signed in, saw only the Chef dashboard; `/admin/*` returned 403 for the CHEF → SUPER_ADMIN assigned POS (step-up), revoked POS (proof reused, no second prompt), assigned and revoked Kozhikode → deactivation needed reason + confirmation → afterwards the old CHEF access token returned 401 `ACCOUNT_INACTIVE` and login returned 403 → audit UI showed STAFF_CREATED, STAFF_INVITED, STAFF_INVITATION_ACCEPTED, ROLE_ASSIGNED/REVOKED, BRANCH_ASSIGNED/REVOKED, STAFF_DEACTIVATED, STEP_UP_FAILED, STAFF_INVITATION_REJECTED with no secrets.

**Temporary dev records left in the dev DB (not cleaned up):** User `p6c.temp.chef@proteinbowl.test` (id `631c7b83-756c-4501-ae3d-f3e8afe0fefb`, status DEACTIVATED, role CHEF) with its EmployeeProfile (`1366d928-5b72-42a1-be90-ee9dc2794da8`) and Kochi branch assignment, one StaffInvitation (`b256f5fb-5f28-4363-8420-163b0bf4fb57`, USED), refresh-token rows (from the E2E logins), and 10 audit rows (audit is append-only by design). Dev servers were stopped afterwards.

---

## 💳 P7 — Order lifecycle, payments, refunds: DESIGN REVIEWED · NOT IMPLEMENTED (2026-10-08)

Design review only. No application code, schema or migration changed. Baseline re-verified at 5f4617e: backend 263/263, web 127/127, all `tsc` clean, web build OK, 9 migrations up to date, clean tree.

| Area (current code) | Classification |
|---|---|
| Checkout preview + order creation use server pricing (client sends no prices/totals) | **WORKING** |
| `PricingService` Decimal math; fees/threshold/tax fallback hard-coded in code (₹40, ₹499, 5 %), packaging ₹0, no minimum order, no discounts persisted | **PARTIAL / PRODUCT DECISION REQUIRED** |
| Order creation transaction, address + item snapshots | **WORKING** |
| Idempotency (global unique key, no fingerprint, race → 500, cart not locked, random fallback key) | **PARTIAL / UNSAFE edge cases** |
| `paymentMethod` accepted as any string | **UNSAFE (low)** |
| Payment model (one table, no provider ids, no webhook/refund tables, `method` NOT NULL, no `updatedAt`) | **PLACEHOLDER** (0 rows in dev) |
| Order status machine | **MISSING**; KDS/delivery services write `Order.status` directly (no rules, non-atomic, no audit) → **UNSAFE** |
| KOT / delivery assignment creation, branch routing (`kitchenBranchId` never set), stock checks | **MISSING** |
| Cancellation, refunds, COD, receipts, webhook handling | **MISSING** |
| Web checkout: server totals, order placed as PENDING, honest "payment not available yet" copy | **WORKING** (no payment UI) |
| Legacy web mocks with ₹40/₹499/₹25/5 %: `DirectGuestOrderModal` (not referenced anywhere), `CheckoutModal` (subscription mock) | **MOCK / dead code** |

**Recommended split:** P7A pricing policy + order lifecycle foundation → P7B payment provider, verification, webhooks (+COD primitive) → P7C cancellation + refunds → P7D web payment/cancel/refund UI. First implementation subphase: **P7A**.

**Decisions required (recommended default → blocks):**
P7-D1 tax mode inclusive vs exclusive (keep exclusive-as-built until the accountant decides) → P7A · P7-D2 per-product rates, remove code fallback → P7A · P7-D3 delivery/packaging taxable (default: no, pending accountant) → P7A · P7-D4 delivery fee + free threshold (owner supplies values; threshold on pre-tax item subtotal) → P7A · P7-D5 packaging fee, order-level flat → P7A · P7-D6 minimum order value and basis → P7A · P7-D7 max quantity per line/order → P7A · P7-D8 order confirmation timing (online: auto on verified payment; COD: auto when enabled) → P7A/B · P7-D9 payment expiry (default 30 min) → P7A/B · P7-D10 retry policy (default: retries within expiry, max 5 attempts) → P7B · P7-D11 provider (Razorpay, adapter + mock first) → live P7B only · P7-D12 methods (whatever Razorpay checkout enables; no wallet) → P7B · P7-D13 auto-capture (yes) → P7B · P7-D14 COD enabled (default off; primitive built) → P7B · P7-D15 COD collection authority (assigned DELIVERY driver in P9, POS in P15, never arbitrary) → P9/P15 · P7-D16 customer cancellation window/statuses → P7C · P7-D17 staff cancellation authority (SUPER_ADMIN with reason + step-up in P7; CHEF reject in P8) → P7C · P7-D18 refund eligibility incl. delivery fee and deposit → P7C · P7-D19 partial refunds (SUPER_ADMIN only) → P7C · P7-D20 container deposit refund mechanics (roadmap D4) → P7C/P16 · P7-D21 branch routing (roadmap D8) → P8 (P7 leaves branch nullable, PREPARING refuses without it) · P7-D22 receipts/GST invoice format → P7D/P17 · P7-D23 INR only.

External credentials: none needed for P7A/P7C or for P7B with the Mock provider. Live Razorpay key id/secret/webhook secret are **BLOCKED_BY_EXTERNAL_SERVICE** until supplied; they must never enter Git.

---

## 🧾 P7A — Commerce policy & order lifecycle foundation: VERIFIED (2026-10-10)

P7B (payments/webhooks), P7C (cancellation/refunds) and P7D (web payment UI) are **NOT IMPLEMENTED**. No Razorpay code, no payment schema, no refund model.

Backend **399/399** (263 earlier + 59 `p7a.unit` + 66 `p7a` + 10 `p7a.tax` + 1 `p7a.migration`), web **136/136** (127 + 9), `tsc` ×3 clean, web build OK, **11 migrations** (two added: `20261010113056_p7a_order_lifecycle_foundation` and the correction `20261010120451_p7a_remove_tax_rate_defaults`), no drift (replayed on a scratch DB; dev DB diff = none), manual E2E on the dev stack passed (22/22 API checks + KDS/gate checks).

| Item | Status |
|------|--------|
| `CommercePolicy` + provider (env-backed, validated at startup; production has no defaults; tests inject) | **VERIFIED** |
| `PricingService` policy-driven, Decimal-safe, explicit HALF_UP per-line rounding; ₹40 / ₹499 / 5 % fallback removed from code | **VERIFIED** |
| Immutable `Order.pricingSnapshot` (policy, tax mode, fee rules, limits, SHA-256 policy hash) | **VERIFIED** |
| Minimum order (preview reports enabled/required/met/shortfall; creation enforces `MINIMUM_ORDER_NOT_MET`) | **VERIFIED** (value = PRODUCT DECISION) |
| Quantity validation (no coercion), per-line and per-cart caps, money-overflow guard | **VERIFIED** |
| `paymentMethod` allow-list (ONLINE/COD), `COD_NOT_ALLOWED` by policy | **VERIFIED** |
| Idempotency: key required, bounded format, customer-scoped unique, request fingerprint, `IDEMPOTENCY_KEY_REUSED`, no cross-customer leak | **VERIFIED** |
| Concurrency: per-customer row lock; same-key, different-key and cart-edit races tested on the real DB; order-number collision retry | **VERIFIED** |
| `OrderTransitionService` + typed status catalogue; payment gate; role/branch/ownership rules; `OrderEvent`; `ORDER_CREATED` / `ORDER_STATUS_CHANGED` audit (transactional) | **VERIFIED** |
| KDS and delivery order-status writes routed through the transition service (atomic with the ticket/assignment) | **VERIFIED** |
| Customer order DTO (no idempotency key/fingerprint/snapshot/ids), customer-safe timeline | **VERIFIED** |
| Audit redaction extended (signature, cvv, cvc, vpa, card) | **VERIFIED** |
| No silent tax default: `Product.taxRate` / `OrderItem.taxRate` have no schema/database default (NOT NULL kept, stored values preserved); creation without an explicit rate fails; seeds/fixtures explicit | **VERIFIED** |
| Real fee/threshold/packaging/min-order/quantity caps/tax rates/COD/cancellation window | **PRODUCT DECISION REQUIRED** (placeholders are development-only) |
| Payment provider, verification, webhook, COD confirmation | **P7B — NOT IMPLEMENTED** |
| Cancellation workflow, refunds | **P7C — NOT IMPLEMENTED** |
| Web payment/retry/cancel/refund UI | **P7D — NOT IMPLEMENTED** |
| KOT creation, branch routing (`kitchenBranchId` never set), delivery assignment creation, stock checks | **P8 / P9 / P12 — NOT IMPLEMENTED** |

**Intentional changes to existing tests (3):** commerce #35 (a second customer reusing the key used to get 409; keys are now customer-scoped, so it must neither replay nor reveal the first order), commerce #33 (now sends the required idempotency key so it still tests an invalid address) and p6a #8c (the Branch A kitchen order fixture is now paid/confirmed/branch-routed, because the kitchen may only start eligible orders). Commerce #28 now counts only the customer's orders (it was flaky against parallel test files).

**Mutation checks (temporary, restored):** removing each of the following made at least one test fail — customer ownership filter (2), fingerprint comparison (3), checkout row lock (1), payment gating (5), transition allow-list (5), role guard (2), branch-scope check (1), DTO leak (2), minimum-order enforcement (1), quantity validation (4), customer-scoped key lookup (2), COD policy check (2).

**Tax-default correction (review finding):** the 0.05 column defaults on `products.taxRate` and `order_items.taxRate` were dropped by a second, tiny P7A migration (the first P7A migration was already applied to dev/test, and Prisma offers no supported way to re-apply an edited migration: `migrate resolve` refuses it and `status`/`deploy` do not even notice the edit, so editing it would have silently left dev/test with the old defaults or required hand-editing `_prisma_migrations`, which project rules forbid). Dev and test databases were brought up to date with plain `migrate deploy`; before/after snapshots of every product and order-item tax value are identical (dev: 23 products at 0.0500, 3 order items at 0.0500; test: 206 products, 370 order items). Production code never relied on the default; only `prisma/seed.ts` and two commerce test fixtures did, and they now pass explicit rates.

**Unresolved production configuration (nothing invented):** `COMMERCE_TAX_MODE` (EXCLUSIVE only is supported), per-product tax rates (explicit per product; existing demo/seed products carry an explicit stored 0.05 that is demo data, not policy), delivery fee, free-delivery threshold (or disabled), packaging fee, minimum order, max quantity per line/cart, COD enabled, fee taxability (must stay untaxed).

**Dev records created by the E2E (not cleaned up):** customer `customer@proteinbowl.in`: order `PB-261010-SFEYV5` (id `a82f1dd9-dfb6-4c73-b3c2-134a1eb25571`, PENDING/PENDING, ONLINE) with its creation `OrderEvent` and `ORDER_CREATED` audit row, one kitchen ticket fixture `KOT-P7A-E2E-*` (QUEUED) attached to that order in the Kochi branch (used to prove the kitchen cannot start an unpaid order), one leftover cart line, and login refresh tokens. The earlier P5 dev order received a backfilled creation event by the migration. Dev DB now: 2 orders, 2 order events, 1 KOT, 0 payments.
