# Protein Bowl — Master Technical Documentation (six-role architecture)

Single overview for a new engineer or reviewer. The code is the source of truth; `CLAUDE.md` holds the engineering rules, `PROGRESS.md` the current status and test results, `docs/OPERATIONS.md` production configuration and jobs, `server/TESTING.md` the isolated test-database procedure, `docs/E2E_CHECKLIST.md` the browser evidence, `docs/PR_READINESS_AUDIT.md` the change-set audit. This file replaces the earlier 823-line handover, which described POS/FMCG/Tepache/MD/HRM/Finance/CMS modules that no longer exist.

## 1. Product
A healthy cloud-kitchen business: customers order protein bowls and packaged items online, subscribe to Kerala Mess meal plans, and receive nutrition and coaching services. One REST API and one PostgreSQL database serve the customer web app and the customer mobile app.

**Roles (exactly six):** `CUSTOMER`, `CHEF`, `NUTRITIONIST`, `TRAINER`, `PROCUREMENT`, `SUPER_ADMIN`. Retired role names (`MESS_CUSTOMER`, `MD`, `DELIVERY`, `POS`, `BAKERY_FMCG`, `TEPACHE_ERP`, `SWIGGY_ZOMATO`) exist only as unused values in the Prisma enum until the approved enum-shrink migration and never authorize anything. A staff account is never a customer; public registration creates CUSTOMER only; staff are invited by SUPER_ADMIN.

**Payment policy:** ONLINE only. No Cash on Delivery, cash collection, pay-at-door, wallet or driver settlement anywhere; `COD` is rejected with `COD_NOT_ALLOWED`. Legacy rows may carry the string `COD`: readable, never payable.

**Removed domains:** POS, Bakery/FMCG ERP, Tepache ERP, MD, HRM, finance ledger, CMS, SRS generator, aggregators, the driver workspace. Packaged-food and Tepache *products* stay in the customer catalogue.

## 2. Architecture
```
/                 Web app (Vite + React 19, Vitest)       src/{components,services,context,utils,hooks,data}
server/           API (Express 4, Prisma 6.19.3, Zod 3)   src/{modules,authz,middleware,config,tests}, prisma/, scripts/
apps/mobile/      Customer app (Expo 52 / RN 0.76.9)      src/{api,auth,commerce,orders,payments,screens,ui}
```
Layering `routes → controller → service`, strict Zod bodies for money and state changes, `AppError(message, status, code)` with stable codes, envelope `{success, message?, data?, error?}`. One Prisma singleton. Money is Decimal only; `pricing.service.ts` with `COMMERCE_*` policy is the single pricing authority and clients only display server values.

## 3. Security model
- **Authentication is database-authoritative:** every request loads the user; inactive or deleted accounts get 401; roles come from current `UserRoleAssignment` rows filtered through `authz/approvedRoles.ts`; JWT role claims are ignored; no approved role → 403 `NO_APPROVED_ROLE`. Access token 15 min; refresh token 7 days, hashed in the database, HttpOnly cookie (web) or JSON body on `/auth/mobile/*` (customer only).
- **Authorization:** static catalogue `authz/permissions.ts` (no implicit SUPER_ADMIN bypass), `requireExactRoles`, `requireCustomerRole`, branch scope (`authz/branchScope.ts`: never trust a client branch id; a foreign branch is 403). Sensitive admin actions need a password step-up proof (`X-Step-Up-Token`).
- **Passwords:** staff 12–128 characters; password reset for any active approved-role account via single-use, hash-only, expiring tokens (`POST /auth/forgot-password` always answers a generic 202; `POST /auth/reset-password` revokes all sessions). Mail provider `EMAIL_PROVIDER` = `none` | `log` (development only) | `resend`; production must set it explicitly.
- Secrets, tokens, passwords, delivery codes, reset links and provider payloads are never logged or audited.

## 4. Core flows
**Order lifecycle.** `OrderTransitionService` is the only writer of `Order.status` after creation (allow-list, actor check, payment gate, compare-and-set, `OrderEvent` + audit). `PaymentSettlementService` is the only path that marks an order paid (verified provider evidence; webhook signature verified over the raw body first; duplicates and late captures are kept and flagged, never auto-refunded).
`PENDING → CONFIRMED → ACCEPTED → PREPARING → READY → DISPATCHED → DELIVERED`, or `CANCELLED`. Unpaid online orders expire after `UNPAID_ORDER_EXPIRY_MINUTES` (default 15; 0 disables) when no sign of payment exists.

**Cancellation and refunds.** The customer may cancel PENDING and CONFIRMED orders. For paid orders in ACCEPTED/PREPARING/READY the customer can only *request* cancellation; SUPER_ADMIN approves (order cancelled and FULL refund intent created atomically) or declines with a reason. Refunds are full refunds only; the provider is contacted after commit and a reconciliation job guarantees completion.

**Kitchen.** SUPER_ADMIN routes a paid order to a branch; CHEF (own branches) accepts → prepares → ready.

**Delivery.** There is no driver role. SUPER_ADMIN operates delivery (dispatch, verify the customer's 6-digit Delivery Code, report failure, retry/resume, take over legacy jobs, mark undeliverable → cancel + full refund, exceptional override). DELIVERED is reachable only through a verified `DeliveryProof`. The customer sees derived labels only (on the way, delivery issue, retry planned, delivered) and a code that is never stored in clear (HMAC only).

**Kerala Mess.** A customer feature on the CUSTOMER identity: approved mess account, plans, paid subscription, meals, pause, chef batches, SUPER_ADMIN-operated bulk delivery and handover; ONLINE only.

**Nutrition.** Customer request → NUTRITIONIST claims (race-safe) → reads the assigned client's health profile (audited) → publishes plan versions. Health data is visible only to the claiming nutritionist; SUPER_ADMIN has no break-glass.

**Coaching.** SUPER_ADMIN assigns trainer ↔ customer; TRAINER manages workout plans only for assigned clients (no health data); the customer logs progress.

**Procurement.** Suppliers, purchase orders DRAFT → ORDERED → PARTIALLY_RECEIVED/RECEIVED or CANCELLED; goods receipt writes receipt, stock movements and stock in one transaction; stock never negative; branch-scoped.

**Health profile.** Derived figures (BMI, BMR, TDEE, calories, macros, water) are always recalculated from saved inputs, never read from stored columns; calories and macros appear only with a date of birth and an explicit male/female gender. Nothing is invented: a missing value is "Not provided". A customer who skips the health step keeps the date of birth and gender entered at registration (basics-only save, no health profile row). Women-only yes/no questions and "Do you exercise regularly?" are tri-state (unanswered is stored as NULL, never as No, and shown as "Not provided"); the customer health profile shows and edits them, and a saved answer is never silently reset. (Storing an unanswered exercise question as NULL needs the third prepared migration.)

## 5. API surface (`/api/v1`)
Auth `auth`, `auth/mobile`; customer `customers`, `cart`, `checkout`, `orders` (create, list, detail, cancel, cancellation-request, refunds, payment attempts, delivery code); catalogue `products`, `recipes`; Kerala Mess `mess`, `mess/kitchen`; nutrition `diets`; coaching `trainer`; procurement `procurement`; kitchen `kds`; staff `staff`; administration `admin` (staff and branches, step-up, audit, payments, refunds, cancellation requests, kitchen routing, delivery operations, mess administration and delivery); public webhook `payments/webhook`. The exact route list is in `server/src/modules/*/*.routes.ts` and is mounted in `server/src/app.ts`; there are no `/pos`, `/fmcg`, `/tepache`, `/md`, `/hrm`, `/finance` or `/cms` routes.

## 6. Data
`server/prisma/schema.prisma`. Migrations are forward-only and applied with `prisma migrate deploy` only; never `db push`, never `migrate reset` on a non-disposable database, never edit an applied migration. Three migrations are prepared and not yet applied to any non-disposable database (administrator-operated delivery columns; trainer, procurement, cancellation-request and password-reset tables; nullable `hasExercise` so an unanswered question is not stored as "No"). Drafts for the enum shrink and retired-table drop are under `server/prisma/proposed/`.

## 7. Web and mobile
Web services live in `src/services/*Service.ts` over `ApiClient`; a failed request is never treated as success; server-derived state is displayed as received. Role workspaces: customer dashboard, Chef, Nutritionist, Trainer, Procurement and SUPER_ADMIN administration; the UI guard (`utils/roleGuard.ts`) is UX only, the API is the authority. Mobile is customer-only: tokens in SecureStore/memory, endpoint strings confined to API modules, no logging.

## 8. Testing
Web `node automation/run-web-tests.mjs`, `npm run typecheck:web`, `npm run build`; mobile `cd apps/mobile && npx tsc --noEmit && npm test`; server `npm run typecheck:server` and the integration suite, which runs only against the isolated database named by `TEST_DATABASE_URL` (`server/TESTING.md`). Current counts are in `PROGRESS.md`. Browser evidence and its limits: `docs/E2E_CHECKLIST.md`.

## 9. Known gaps
Razorpay sandbox verification not started; two browser checks outstanding; CI workflow and Docker image never executed; mobile app never run on a device; two prepared migrations unapplied; stale-stub deletion and `.gitattributes` pending approval (`docs/PR_READINESS_AUDIT.md`).
