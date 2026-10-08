# Protein Bowl — Project Completion Roadmap

> Master Completion Audit, performed against checkpoint `e298b67` (branch `main`, 2026-10-08).
> Method: source inspection of `server/` (routes, services, schema, 7 migrations, 7 test files), `src/` (web), `apps/mobile/`, plus a live run of the quality gates. **The repository is the source of truth; this document replaces optimistic claims in `README.md` / `IMPLEMENTATION_STATUS.md` where they differ (see §0).**
> Status vocabulary: `VERIFIED` · `PARTIAL` · `SCAFFOLD` · `MOCK` · `MISSING` · `BLOCKED_BY_EXTERNAL_SERVICE` · `PRODUCT_DECISION_REQUIRED`.

---

## 0. Headline findings (read first)

1. **The customer purchase flow is not working end-to-end in the web UI.** The backend cart/checkout/order APIs are verified (42 commerce tests), but **nothing in `src/` ever calls `CartService.addItem` or `ProductService`**. The storefront (`PackagedFoodsSection`, `TepacheDrinksSection`, `CustomerHome`) sells **mock products from `mockBakeryFMCGData.ts` / `recipeDatabase.ts` into local React state**. At checkout, `DirectCartCheckoutModal` calls `OrderService.createOrder`, which builds the order from the **server-side cart — which is empty** → `400 EMPTY_CART`. `IMPLEMENTATION_STATUS.md` row 8 ("Web Frontend: Integrated") therefore **over-claims**; the correct web status is `PARTIAL` (address + order-history calls are real; catalog + cart + totals are mock/local).
2. **Four web services exist but have no UI consumers:** `ProductService`, `MessService`, `MDService`, `KDSService`. Their backends exist; no component imports them.
3. **No order ever reaches the kitchen.** There is **no code that creates a `KitchenOrderTicket`**, a `DeliveryAssignment`, a `Subscription`, a `MessSubscription` / `MessDailyOrder`, an `InventoryItem`, a `WorkoutPlan`, or an `AuditLog` row. The KDS/Delivery/Mess endpoints can only read/update rows that nothing creates (other than seed data).
4. **Backend ERP modules are thin CRUD with real authorization gaps** (§9): any DELIVERY user can read/update *any* delivery; KDS has no branch scoping; POS trusts a client-supplied `totalAmount`; Tepache hard-codes a ₹10 refund; Mess hard-codes an ₹85 refund and lets a user self-approve their Mess account.
5. **No Super Admin UI exists.** The web `UserRole` type has no `super_admin` (a SUPER_ADMIN login is mapped to the mock **MD dashboard**); there is no user/role/branch/product administration API at all. Staff accounts exist only via the dev seed. **There is currently no production way to create a staff user.**
6. **Mobile is a demo shell** (one 277-line `App.tsx`; login, product list, mess plans, order list, KOT list, pause-meal; fake wallet constant). Mobile depends on stable APIs, so it is scheduled in slices after those APIs exist.
7. **Unsafe schema defaults of the same family as the fixed `Payment.status`:** `PayrollRecord.status` defaults `PAID`, `FMCGBatch.qcStatus` defaults `PASSED`, `MessAccount.isApproved` defaults `true`, `MealPauseRequest.status` defaults `APPROVED`. Also `CustomerProfile.walletBalance` duplicates `WalletAccount.balance` (two sources of truth).

**Overall estimated completion (verified-functionality basis): ~20–25 %.** Verified end-to-end backend: 6 customer-side domains (auth, profile/health, diet, recipes, product read, cart/checkout/order create). Everything operational (kitchen, delivery, inventory, procurement, POS, FMCG, Tepache, aggregators, HR, finance, MD, admin, CMS), payments, subscriptions/Mess, support/ratings/notifications/uploads, and mobile is scaffold or mock. Approximate share of the 21-item platform list in the master directive that is genuinely functional for a real user today: Customer Portal ~35 %, Nutritionist workspace ~55 %, Chef recipe workspace ~40 %, everything else ≤10 %.

Quality gates re-run for this audit: backend `132/132` tests pass; `git status` clean at `e298b67`.

---

## 1. Domain completion matrix

Legend — Backend/Database/Web/Mobile: `✔` real & tested/verified · `◐` partial · `S` scaffold (code exists, untested/unwired) · `M` mock · `✘` missing.
"Target" = phase in §6.

| Domain | Status | Backend | Database | Web | Mobile | Tests | Security | Mock dependency | External dependency | Business decision | Target |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Auth** | PARTIAL | ✔ register/login/refresh/logout/me, JWT+rotating refresh, rate limits | ✔ User, UserRoleAssignment, RefreshToken | ◐ real `AuthContext`; web OTP step is a local mock; no password reset | ◐ login only | ✔ 12 + hardening | ✔ strong; gaps: no password reset, no email/phone verification, refresh accepted via body | Web OTP (auto-filled 4821) | Email/SMS provider for reset + OTP (EXTERNAL) | OTP/verification policy | P6 (staff provisioning), P14 (reset/verify) |
| **Customer Profile** | VERIFIED | ✔ `/customers/me/profile`, addresses CRUD | ✔ CustomerProfile, CustomerAddress | ✔ wizard/tab/addresses call API | ✘ | ✔ | ✔ `requireCustomerRole`, JWT-derived identity | `INITIAL_CUSTOMER_PROFILE` seeds `App.tsx` state | — | — | P19 (cleanup) |
| **Health** | VERIFIED (data) / MISSING (reports) | ✔ biometrics, BMI/BMR/TDEE/macros server-side | ✔ HealthBiometrics (blood-test values as fields) | ✔ wizard/tab | ✘ | ✔ | ✔ least-privilege via diet claim | `healthCalculator.ts` duplicates calc in FE | Object storage for lab-report files | Lab-report retention/consent | P14 |
| **Diet** | VERIFIED (backend) / PARTIAL (web) | ✔ request→claim→plan→revise→approve, snapshots | ✔ DietPlanRequest/Plan/Day/Meal | ◐ builder, review, nutritionist dashboard use API; `App.tsx` still seeds `INITIAL_DIET_PLAN_REQUESTS`; no plan→order/subscription link | ✘ | ✔ 19 | ✔ strong (claim + role + ownership) | `INITIAL_DIET_PLAN_REQUESTS`; builder pricing local (`calculatedPrice` sent by client) | — | Diet-plan pricing & subscription billing | P5 (remove mock), P10 (subscription) |
| **Recipe** | VERIFIED (backend) / PARTIAL (web) | ✔ public + staff projections, Chef/Admin CRUD, SUPER_ADMIN publish | ✔ 120 recipes/350 ingr/606 links | ◐ Chef + Nutritionist use API; customer menu uses static `recipeDatabase.ts` | ✘ | ✔ 23 | ✔ no cost/SOP in public DTO | `recipeDatabase`, `costEngine.ts` (FE costing) | — | Recipe→Product mapping rules | P5, P12 (costing) |
| **Product** | PARTIAL | ◐ public read only (`GET /products`, `/categories`, `/:slug`); **no create/update/publish/price API** | ✔ Product/Variant/Category (23/23/11 seeded) | **M** `ProductService` unused; storefront on `mockBakeryFMCGData` | M (lists via API) | ✔ read paths | ✔ public DTO | `FMCG_PACKAGED_PRODUCTS`, Tepache mock | Object storage for images | Catalog ownership (who edits prices) | P5 (read wiring), P17 (admin CRUD) |
| **Cart** | PARTIAL | ✔ server cart (customer-only) | ✔ Cart/CartItem | **M** local state in `App.tsx`; `CartService.addItem` never called | ✘ | ✔ | ✔ SUPER_ADMIN blocked | `DirectCartItem[]` local state | — | Max qty / stock reservation | P5 |
| **Checkout** | PARTIAL | ✔ `/checkout/preview` + pricing service (Decimal) | ✔ | **M** UI computes its own totals; preview endpoint not called | ✘ | ✔ | ✔ client prices ignored | local totals in modal | — | **GST, delivery fee/threshold, packaging, deposit, min order** | P5 + decisions |
| **Orders** | PARTIAL | ◐ create (idempotent, snapshot), my-orders, detail; **no cancel, no status machine, no staff order list/confirm** | ✔ Order/OrderItem | ◐ history/tracking modal real; creation fails (empty cart, §0.1) | ◐ list only | ✔ 42 | ✔ ownership | `INITIAL_ORDERS`, `INITIAL_DIRECT_ORDERS` | — | Cancellation/refund/confirmation rules | P5, P7 |
| **Payments** | MISSING | ✘ no initiate/verify/webhook; `Payment` table unused | ◐ `Payment` model (PENDING default); no gateway-event/webhook/refund tables | **M** UI shows UPI/COD/card tiles with no effect | ✘ | ✔ default only | ✔ never auto-PAID (tested) | simulated "payment success" screen | **Payment gateway (BLOCKED_BY_EXTERNAL_SERVICE)** | **Provider, methods, COD policy, refunds** | P7 |
| **Subscriptions** | MISSING | ✘ | ◐ `Subscription` model, no billing link | ✘ | ✘ | ✘ | — | — | Payments | Billing cadence, pause/cancel/renewal | P10 |
| **Kerala Mess** | SCAFFOLD | ◐ plans (public), account, register, pause-meal, gate-pass verify; **no enrollment, no daily-order generation**; self-approval; ₹85 hard-coded refund; wallet read-modify-write | ◐ MessAccount/Plan/Subscription/DailyOrder/PauseRequest/Wallet(+Tx) | **M** `MessCustomerPortal` on `mockKeralaMessData`; `MessService` unused | M (plans, pause) | ✘ no mess tests (only authz tests) | ◐ routes guarded (Phase 4C); business-logic gaps | `mockKeralaMessData.ts` (1123 lines) | Payments | **Pause cut-off, refund amount, approval, plans, billing, hostel mgmt** | P10 |
| **Trainer** | MISSING | ✘ no routes | — | **M** `TrainerDashboard` (995 lines) | ✘ | ✘ | — (no trainer↔customer assignment model) | `mockFitnessData.ts` | Video session provider (EXTERNAL) | Trainer assignment model | P13 |
| **Workout** | MISSING | ✘ no routes | ✔ WorkoutPlan/Day/Exercise | **M** `WorkoutPlanTab` (1122 lines) | ✘ | ✘ | — | `INITIAL_WORKOUT_PLAN` | Image/video storage | — | P13 |
| **Chef** | PARTIAL | ◐ recipe CRUD ✔; no batch/prep APIs | ◐ KitchenBatch (no linkage to KOT/inventory) | ◐ recipes real; batches/KDS `M` | ✘ | ✔ recipes | ✔ recipe roles | `INITIAL_PRODUCTION_BATCHES`, mess kitchen batches | — | Production workflow | P8 |
| **KDS / KOT** | SCAFFOLD | S list + status update (no creation, no branch scoping, no transition rules) | ◐ KitchenOrderTicket | **M** (`KDSService` unused) | M (kot list) | ✘ | ✘ chef sees all branches; includes customer PII | mock KDS in `ChefDashboard` | Real-time push (SSE/WS — self-hosted) | Order→branch routing; prep SLA | P8 |
| **Inventory** | SCAFFOLD | S read items + stock movement (no create/adjust/validate; negative qty accepted) | ◐ InventoryItem/StockMovement | **M** `inventoryDatabase.ts` (1183 lines) | ✘ | ✘ | ◐ role-gated | `inventoryDatabase.ts` | — | UoM, wastage rules, costing method | P12 |
| **Procurement** | SCAFFOLD | S (same as inventory) — **no supplier/PO/GRN** | ✘ no Supplier/PurchaseOrder/GoodsReceipt models | **M** `ProcurementDashboard` (2272 lines) | ✘ | ✘ | ◐ | `inventoryDatabase.ts` | — | Approval limits, vendor terms | P12 |
| **Delivery** | SCAFFOLD | S list + status (no assignment creation; **any driver sees/updates all**) | ◐ DeliveryAssignment | **M** `DeliveryDashboard` | ✘ | ✘ | ✘ ownership missing | mock delivery lists | Maps/GPS provider (EXTERNAL, if live tracking) | Fleet model, zones, fees | P9 |
| **POS** | SCAFFOLD | S create transaction trusting client `totalAmount`; fake `receiptUrl`; no items/branch auth | ◐ POSTransaction, CashDrawerShift (unused), no line-items | **M** `POSDashboard` (1314 lines) | ✘ | ✘ | ✘ client-trusted money | `mockPOSData.ts` | Receipt printer (optional) | Guest-sale/GST/payment-split policy | P15 |
| **Bakery / FMCG** | SCAFFOLD | S batches + challans read; `qcStatus` defaults PASSED | ◐ FMCGBatch, DispatchChallan (no link to Product/inventory) | **M** `BakeryFMCGDashboard` (2013 lines) | ✘ | ✘ | ◐ | `mockBakeryFMCGData.ts` | — | Production→Product stock rule | P16 |
| **Tepache** | SCAFFOLD | S tanks + telemetry + bottle return (**₹10 hard-coded**) | ◐ TepacheTank/BrewBatch/BottleReturn | **M** `TepacheBreweryDashboard` (1121 lines) | ✘ | ✘ | ◐ | `mockTepacheData.ts` | — | **Deposit amount/policy** | P16 |
| **Swiggy / Zomato** | MISSING | ✘ **no routes** (docs claim `/orders/*`) | ◐ AggregatorOrder only | **M** `SwiggyZomatoAggregatorPortal` | ✘ | ✘ | — | `mockOmnichannelData.ts` | **Swiggy/Zomato partner APIs (BLOCKED_BY_EXTERNAL_SERVICE)** | Commission model, menu sync | P18 |
| **MD Dashboard** | SCAFFOLD | S one `/md/metrics` aggregate (revenue counts only `PAID` → always 0 today) | n/a (aggregates) | **M** `MDDashboard`, `MultiKitchenOverviewModule` | ✘ | ✘ | ✔ role-gated | `cloudKitchensData`, mock | — | KPI definitions | P17 |
| **Finance** | SCAFFOLD | S list + create voucher (no validation/audit/immutability) | ◐ FinancialTransaction | **M** `FinancialsModule` (1996 lines) | ✘ | ✘ | ◐ | mock ledger | — | Scope (ledger vs reporting), GST filing | P17 |
| **HRM** | SCAFFOLD | S employees list + attendance upsert (no leave/payroll API) | ◐ HRMEmployee, Attendance, Payroll (`status` default PAID) | **M** `HRMModule` (3235 lines) | ✘ | ✘ | ◐ | `mockData` HR arrays | — | Payroll rules, statutory deductions | P17 |
| **Admin (SUPER_ADMIN)** | MISSING | ✘ no user/role/branch/product admin APIs | ◐ AuditLog table (never written) | ✘ no `super_admin` role in web | ✘ | ✘ | — | — | — | Provisioning workflow, 2FA policy | P6 |
| **CMS** | SCAFFOLD | S banners read/create (no update/delete/media create) | ◐ CMSBanner/Media/MealPlanDefinition | M hero video via localStorage | ✘ | ✘ | ◐ | `localStorage` hero video URL | Object storage | Content ownership | P17 |
| **Notifications** | MISSING | ✘ | ✘ no model | ✘ | ✘ | ✘ | — | toasts/alerts only | **Email/SMS/Push providers (EXTERNAL)** | Channels & templates | P14 |
| **Uploads** | MISSING | ✘ (JSON limit 256kb; no upload route) | ✘ no metadata model | ✘ | ✘ | ✘ | — | blob URLs | **Object storage (EXTERNAL)** | Retention, allowed types | P14 |
| **Support** | MISSING | ✘ | ✘ no model | M (UI text only) | ✘ | ✘ | — | — | — | SLA, categories | P14 |
| **Ratings** | MISSING | ✘ | ✘ no model | M | ✘ | ✘ | — | — | — | Moderation | P14 |
| **Referrals** | PARTIAL | ◐ code generated at register, `referredByCode` stored; **no reward logic** | ◐ fields on CustomerProfile | M | ✘ | ◐ | ◐ | — | — | **Reward rules** | P14 |
| **Wallet** | PARTIAL/SCAFFOLD | ◐ pause-refund credit only; **no top-up/debit**; non-atomic balance update | ◐ WalletAccount/Tx **plus** duplicate `CustomerProfile.walletBalance` | M | M (fake 450) | ✘ | ◐ | fake balance | Payments (top-up) | Wallet policy | P10 |
| **Mobile** | SCAFFOLD | — | — | — | single screen file | `tsc` only | ◐ SecureStore OK; demo creds now `__DEV__` only | fake wallet const | Expo/EAS, push (EXTERNAL) | Mobile scope per slice | P11, P20 |
| **Deployment** | MISSING | — | — | — | — | — | CORS/origin config ready | — | Hosting, DB, secrets, domain (EXTERNAL) | Prod domain, region | P22 |

---

## 2. Role completion matrix

Backend authorization for staff routes uses `requireRole`, which lets SUPER_ADMIN through. Staff-to-branch / staff-to-customer ownership scoping does **not** exist except in the diet claim flow.

| Role | Current functional capabilities (verified) | Missing capabilities | Forbidden capabilities | Target phase |
|---|---|---|---|---|
| **CUSTOMER** | Register/login; profile, addresses, health data; diet request→review→approve; recipe browse (API exists); backend cart/checkout/order create + history | Working purchase flow in UI; payment; tracking beyond a status string; subscriptions; Mess via same account; workout plan; support/ratings; notifications; receipts; lab uploads; mobile parity | Any staff/ERP route; other customers' data; `/me` as staff | P5, P7, P10, P13, P14, P20 |
| **MESS_CUSTOMER** (legacy) | Customer Mess endpoints only (account/register/pause); blocked from diet/commerce | Everything above; **target: retire in favour of CUSTOMER + MessAccount entitlement** | Same as CUSTOMER restrictions | P10 (controlled migration) |
| **SUPER_ADMIN** | Passes every staff `requireRole`; recipe publish; blocked from customer-context APIs | **All administration**: user/role/branch/product/price/CMS admin, audit views, config; admin UI | Customer `/me` impersonation (enforced) | P6, P17 |
| **MD** | Read `/md/metrics`, finance/hrm/pos/kds/delivery/… via role lists (broad) | Real dashboards, drill-downs, KPIs; scoped read model | Unrestricted clinical/health data (diet routes exclude MD ✔) | P17 |
| **NUTRITIONIST** | Unassigned/claimed queues, claim, authorized health-profile read, create/publish/revise plan, recipe browse; verified | Customer messaging, follow-ups, check-ins, plan templates, workload/ SLA, remove `App.tsx` mock requests | Unclaimed customers' health data; ERP; finance | P13 (follow-up), P5 (mock removal) |
| **TRAINER** | None (UI mock only) | Assigned-customer model, workout plan CRUD, progress tracking, customer-visible plans | Clinical notes beyond fitness-relevant context | P13 |
| **CHEF** | Recipe list/create/update (staff projection) | Branch-scoped KOT/KDS queue, prep status workflow, batches, production records | Finance, HR, admin, customer health data | P8 |
| **PROCUREMENT** | Read inventory items; record stock movement (no validation) | Items CRUD, suppliers, PR→PO→GRN, receiving, stock valuation, low-stock | Finance ledger edits; customer data | P12 |
| **DELIVERY** | List assignments / update status (**unscoped to self — vulnerability**) | Self-scoped assignments, pickup/delivery flow, POD, history, failure handling | Other drivers' deliveries; customer health/PII beyond address+phone | P9 |
| **POS** | Create transaction (client-trusted total) | Product selection, server-priced billing, receipts, drawer/shift, guest-sale policy, payment states, gate-pass verification (exists) | Admin/finance edits; kitchen config | P15 |
| **BAKERY_FMCG** | List batches/challans, create batch | Production records, QC workflow, packaging, finished-goods→Product stock, dispatch | Customer data; finance | P16 |
| **TEPACHE_ERP** | Tanks, telemetry update, bottle return (hard-coded ₹10) | Brew-batch lifecycle, bottling, finished goods, dispatch, deposit policy | Customer data; finance | P16 |
| **SWIGGY_ZOMATO** | **Nothing server-side** (no routes; role exists in enum/UI) | Order intake adapter, status sync, stock buffer, commission reconciliation | Customer-portal APIs; finance edits | P18 |

---

## 3. Mock-data dependency inventory (runtime)

| Mock source | Consumers | Replaced by | Phase |
|---|---|---|---|
| `mockData.ts` (464 lines: orders, profile, combos, diet requests, batches, HR) | `App.tsx`, `CustomerHome`, `ChefDashboard`, `MDDashboard`, … | Real APIs per domain | P5–P17 |
| `mockBakeryFMCGData.ts` (1038) | `PackagedFoodsSection`, `BakeryFMCGDashboard`, `App.tsx` | `/products` + FMCG API | P5, P16 |
| `mockTepacheData.ts` (502) | `TepacheDrinksSection`, `TepacheBreweryDashboard` | `/products` + Tepache API | P5, P16 |
| `mockKeralaMessData.ts` (1123) | `App.tsx`, `MessCustomerPortal`, `ChefDashboard` | Mess + KDS APIs | P10, P8 |
| `mockPOSData.ts` (501) | `POSDashboard` | POS API | P15 |
| `mockOmnichannelData.ts` (572) | `OmnichannelSalesModule`, Swiggy/Zomato portal, `App.tsx` | Orders + aggregator APIs | P18 |
| `mockFitnessData.ts` (291) | `CustomerDashboard`, `WorkoutPlanTab`, `TrainerDashboard` | Workout API | P13 |
| `mockDirectOrdersData.ts` (188) | `App.tsx`, tracking modal | Orders API | P5 |
| `inventoryDatabase.ts` (1183) | Procurement/inventory UI | Inventory API | P12 |
| `cloudKitchensData.ts` (556) | branch selector, `MultiKitchenOverviewModule` | Branch API | P6 |
| `recipeDatabase.ts` + `data/recipes/*` (static) | `CustomerHome`, `DietPlanBuilder`, `NutritionistDashboard`, `ChefDashboard`, `IngredientPriceCalculator` | `/recipes` API (static files stay as seed source) | P5, P13 |
| `costEngine.ts`, `healthCalculator.ts` | Calculator UIs | Server calculations | P12, P19 |
| Fake wallet 450 (mobile), `INITIAL_*` states in `App.tsx` (876 lines) | Whole shell | Real data + `App.tsx` decomposition | P19, P20 |
| Web OTP (4821), social-login stub | `AuthModal` (dev-only gated) | Real OTP provider | P14 |
| `localStorage` hero video URL | `CinematicHeroAnimation` | CMS media | P17 |
| Role-demo switcher + role-driven dashboards (`currentRole` state; staff screens render purely on UI state) | `App.tsx`, `BrandHeader` | Backend-driven role + data (UI hiding is not security — APIs already guarded) | P6, P19 |

---

## 4. Inventories of what is missing

### 4.1 Missing APIs
- **Auth:** password reset, email/phone verification, OTP, session list/revoke.
- **Admin:** user CRUD, role assign/revoke, staff provisioning, branch CRUD, employee↔branch assignment, product/category/variant/price/publish CRUD, system config, audit-log read.
- **Orders:** customer cancel, staff order list/detail, confirm/reject, status transitions with role + state rules, invoice/receipt.
- **Payments:** initiate, verify, webhook, refund, reconciliation, payment status read.
- **Kitchen:** KOT creation from confirmed order, assignment, branch-scoped queue, batch CRUD, prep records.
- **Delivery:** assignment create/assign, self-scoped list, pickup, deliver/fail, history, POD upload.
- **Mess:** enrollment/purchase, schedule/daily-order generation, resume, history, wallet top-up/debit, admin approvals, gate-pass issue.
- **Subscriptions:** create/pause/resume/cancel/renew, billing run.
- **Trainer/Workout:** trainer assignment, workout CRUD, progress logs.
- **Inventory/Procurement:** item CRUD, supplier, PR/PO/GRN, stock adjust/transfer, low-stock, valuation.
- **POS:** catalog lookup, priced bill with line items, shift open/close, receipt.
- **FMCG/Tepache:** batch lifecycle, QC, packaging, finished goods, dispatch, bottle-deposit rules, brew-batch CRUD.
- **Aggregators:** all (webhook intake, status push, reconcile).
- **HRM:** leave, payroll run, employee CRUD. **Finance:** reports, expense, receipts. **MD:** richer aggregates. **CMS:** update/delete, media create.
- **Customer extras:** support tickets, ratings, notifications, referrals rewards, uploads, nutritionist chat.

### 4.2 Missing database capability
`Supplier`, `PurchaseRequest`, `PurchaseOrder`, `GoodsReceipt`, `PaymentEvent/WebhookLog`, `Refund`, `SupportTicket(+Message)`, `Rating`, `Notification`, `UploadedFile`, `LeaveRequest`, `TrainerAssignment` (or `trainerId` on customer), `WorkoutProgressLog`, order-status history (`OrderEvent`), KOT item lines/timestamps, branch-scoped staff mapping for all roles, product↔inventory/recipe consumption mapping, POS line items, aggregator↔branch link, coupon/discount, order-level tax breakdown, idempotency for payments/webhooks. Safe-default fixes: `PayrollRecord.status`, `FMCGBatch.qcStatus`, `MessAccount.isApproved`, `MealPauseRequest.status`; reconcile `CustomerProfile.walletBalance` vs `WalletAccount.balance`; promote status strings to enums where stable (only with approval).

### 4.3 Missing Web integration
Product catalog → API; server cart; checkout preview/totals; payment step; real tracking; subscription flows; Mess portal; Workout tab; all 11 ERP dashboards; MD/Finance/HRM/Omnichannel; Super Admin console; support/ratings/notifications; removal of mock `App.tsx` state; web test harness (none exists).

### 4.4 Missing Mobile integration
Everything except login/products/mess plans/orders/KOT list/pause-meal stubs: registration, profile/health, diet, cart/checkout/payment, order tracking, Mess (real), workout, support, push, `EXPO_PUBLIC_API_URL` config, navigation structure, error/loading/empty states, tests.

---

## 5. Security gaps (open)

| # | Gap | Where | Fix phase |
|---|---|---|---|
| S1 | DELIVERY role can list/update **any** delivery; `driverId` is a client query param | `delivery.*` | P9 |
| S2 | KDS has no branch scoping; any CHEF/MD sees all tickets; full `customerProfile` (name, dob, gender, address, wallet) is included | `kds.service.ts` | P8 |
| S3 | POS trusts client `totalAmount`/`cashReceived`; fake `receiptUrl` | `pos.*` | P15 |
| S4 | Mess: `registerAccount` self-approves (`isApproved: true`); unvalidated bodies; hard-coded ₹85; duplicate/late pause not blocked; wallet balance updated read-modify-write (race) | `mess.*` | P10 |
| S5 | Tepache refund hard-coded ₹10, client-supplied `customerProfileId` | `tepache.service.ts` | P16 |
| S6 | ERP bodies unvalidated (finance voucher, procurement movement incl. negative qty, HRM, FMCG, KDS status via `Error`) | all ERP modules | each ERP phase |
| S7 | Staff-to-branch/customer scoping absent outside diet | platform | P6 |
| S8 | AuditLog never written (role changes, publishing, finance, payments, inventory adjustments) | platform | P6, extended per phase |
| S9 | No production staff provisioning; dev seed password is the only path | platform | P6 |
| S10 | Unsafe schema defaults (PayrollRecord PAID, FMCG PASSED, MessAccount approved, PauseRequest APPROVED) | schema | with owning phase |
| S11 | Refresh token also accepted in request body (needed for mobile) | auth | P11/P20 review |
| S12 | UI role switcher/role-driven rendering; staff screens show mock data without backend identity | web | P6/P19 (backend already authoritative) |
| S13 | No password reset / email verification / 2FA for staff | auth | P14 / P6 |
| S14 | Production CORS origin, `TRUST_PROXY`, secrets management are deployment configuration | deploy | P22 |
| S15 | No web/mobile automated tests; no CI | repo | P5 (harness), P21 |

---

## 6. Product decisions required (consolidated)

| # | Decision | Blocks |
|---|---|---|
| D1 | GST/tax rules per product category; default fallback rate (currently 5 %) | P5, P7 |
| D2 | Delivery fee (₹40) and free-delivery threshold (₹499); zone-based? | P5 |
| D3 | Packaging fee (currently ₹0; old UI ₹25) | P5 |
| D4 | Tepache bottle deposit (₹10) and return/refund mechanics | P5, P16 |
| D5 | Accepted payment methods; **COD allowed?**; provider choice | P7 |
| D6 | Refund & cancellation rules (who can cancel when, partial refunds) | P7 |
| D7 | Minimum order value | P5 |
| D8 | Order→branch routing (nearest hub? customer selects?) and serviceable pincodes | P8, P9 |
| D9 | Order confirmation policy (auto-confirm on payment vs staff accept) | P7 |
| D10 | Kerala Mess: plans, pricing, approval of hostel accounts, pause cut-off, refund per meal, max pauses, daily-order generation time, gate-pass format, billing cadence | P10 |
| D11 | MESS_CUSTOMER retirement/migration timing | P10 |
| D12 | Diet-plan pricing/subscription billing, plan expiry | P10 |
| D13 | Trainer assignment model and scope of trainer data access | P13 |
| D14 | Inventory UoM, wastage rules, costing method (FIFO/avg), recipe consumption timing | P12 |
| D15 | Procurement approval limits/vendor terms | P12 |
| D16 | POS guest sales, split payments, GST invoice format | P15 |
| D17 | HR scope (leave types, payroll components, statutory deductions) | P17 |
| D18 | Finance scope (reporting vs ledger) and GST filing | P17 |
| D19 | Notification channels/templates; support SLA; rating moderation; referral rewards | P14 |
| D20 | Lab-report retention/consent policy | P14 |
| D21 | Production domain(s), hosting, region | P22 |

## 7. External credentials / services required

| Service | Needed for | Plan |
|---|---|---|
| **Payment gateway** (Razorpay/Stripe/other — D5) | P7 | Build provider-adapter + sandbox/mock provider + webhook verification now; live test **BLOCKED_BY_EXTERNAL_SERVICE** |
| Email provider (SMTP/SES/…) | reset, receipts, notifications | adapter + console provider for dev |
| SMS/OTP provider | OTP, delivery updates | adapter + dev provider |
| Push (FCM/APNs/Expo) | mobile notifications | adapter |
| Object storage (S3-compatible) | lab reports, POD, product/profile images | `StorageProvider` abstraction + local-disk dev provider |
| Maps/GPS | live delivery tracking | **do not fake**; only if D-decision requires; otherwise status-only |
| Swiggy/Zomato partner APIs | P18 | adapter + safe mock; **BLOCKED_BY_EXTERNAL_SERVICE** for live |
| Hosting / managed Postgres / secrets / domain / TLS | P22 | EXTERNAL |
| Expo EAS / app-store accounts | mobile release | EXTERNAL |

---

## 8. Dependency graph

```
Auth (✔) ─► Customer Profile/Health (✔) ─► Diet (✔) ───────────────┐
        └─► P6 Staff/Branch/Admin foundation ──────────────────────┐ │
Recipe (✔) ─► Product (read ✔)                                     │ │
P5 Storefront↔Server commerce (web) ─► Orders (create ✔)           │ │
        │                                                           │ │
        ▼                                                           ▼ ▼
P7 Order lifecycle + Payments ──► P8 KOT/KDS (needs confirmed order + branches from P6)
        │                               │
        │                               ├─► P9 Delivery (needs READY order + drivers from P6)
        │                               └─► P12 Inventory consumption (Recipe + KDS)
        ├─► P10 Mess + Subscriptions (needs Payments, KDS, background jobs, wallet)
        ├─► P15 POS (needs priced catalog + Payments states)
        └─► P17 MD / Finance (needs Orders + Payments + operational data)
P12 Inventory/Procurement ─► P16 FMCG / Tepache (finished goods → Product stock)
P13 Trainer/Workout (needs P6 assignments) ; P14 Support/Ratings/Notifications/Uploads (needs providers)
P18 Aggregators (needs Orders + KDS + Inventory buffer)
Mobile slice 1 (P11) needs stable P5–P9 APIs; slice 2 (P20) needs P10, P13, P14.
P19 mock elimination / App.tsx decomposition follows all domain phases.
P21 full-system tests ─► P22 deployment.
```

Why this order: customer revenue path first (P5→P7), then fulfilment chain (P8→P9), then the biggest customer product (Mess/Subscriptions, P10) once payments + kitchen exist; mobile slice 1 right after the customer can order/pay/track; internal ERP depth after the customer chain works; integrations and polish last.

---

## 9. Phase plan

All phases follow the Git workflow in the directive (implement → gates → report → approval → commit → push). Every phase **must also run** the baseline: `prisma validate`, `migrate status`, backend `tsc`, `npm test` (≥ current count), web `tsc` + build, mobile `tsc` if touched. Any migration follows the Phase 4C safe procedure (create-only, verify directory sorts after `20261007100318`, inspect SQL, replay on disposable DB, no drift, then apply to dev **and test DB**).

### Phase 5 — Customer Storefront ↔ Server Commerce (web)  ← **NEXT**
- **Goal:** a real customer can browse real products, fill a server cart, preview server-computed totals, place an order that persists, and view it — with no mock product/cart/totals.
- **Modules:** Product, Cart, Checkout preview, Orders (web), diet-request mock removal.
- **Database:** none expected (possibly a `Product.isFeatured`/ordering field — avoid unless needed).
- **Backend:** verify public product DTO shape for UI needs (images, variants, deposit flag, nutrition link via `recipeId`); add `GET /orders/:id` shape needed by tracking; optional `PATCH` of nothing else. Keep pricing values as-is (D1–D3, D7 unresolved → shown as "configured by server").
- **Web:** wire `PackagedFoodsSection`/`TepacheDrinksSection`/`CustomerHome` to `ProductService`; replace local `DirectCartItem[]` with `CartService` (add/update/remove, merge guest→server cart on login); `DirectCartCheckoutModal` uses `/checkout/preview` for all money values; address selection; order success from server data; tracking modal real; remove `INITIAL_ORDERS/INITIAL_DIRECT_ORDERS/INITIAL_DIET_PLAN_REQUESTS` runtime use; loading/error/empty states; introduce web test harness (Vitest + React Testing Library) for cart/checkout.
- **Mobile:** none (APIs unchanged).
- **Security:** keep customer-only guards; confirm no client price/total is sent or trusted; guest browsing allowed but cart/checkout require CUSTOMER.
- **Tests:** backend: product DTO leakage test (no cost/internal fields), cart merge idempotence, order-from-UI-shaped payload; web: component tests for add-to-cart → preview → order; one E2E-style integration test script against the API.
- **Migration:** none.
- **Mocks removed:** FMCG/Tepache product mocks, local cart, local totals, mock orders/diet requests in `App.tsx`.
- **External:** none. **Decisions:** D1–D3, D7 can ship as server-configured values flagged in UI; do not hide them as policy.
- **Done:** purchase works from the browser against a clean DB; order appears in history; status shows `PENDING / paymentStatus PENDING`; all 132+ tests + new tests pass; docs corrected.

### Phase 6 — Staff, Branch & Admin Foundation
- **Goal:** production-capable identity administration for staff and branch scoping.
- **Modules:** SUPER_ADMIN user/role admin, branches, employee↔branch, audit log writes, branch-scope helper.
- **Database:** likely none (EmployeeProfile/KitchenBranch/AuditLog exist); maybe `EmployeeProfile` role-branch constraints; avoid destructive changes.
- **Backend:** `/admin/users` (create staff, assign/revoke role, deactivate, reset-password-by-admin), `/admin/branches`, `/admin/audit`; `requireBranchScope` helper; write `AuditLog` for role/user/branch changes; Zod validation; password policy.
- **Web:** minimal Super Admin console (users, roles, branches) — add `super_admin` UI role; remove role-demo switcher dependence (role derived from backend identity only); staff login without demo.
- **Mobile:** none.
- **Security:** SUPER_ADMIN-only; cannot demote self/last admin; audit everything; no customer impersonation.
- **Tests:** authz matrix for every admin route; audit rows written; last-admin protection.
- **Migration:** only if a missing column is proven necessary.
- **Mocks removed:** `cloudKitchensData` branch list at runtime; demo staff presets.
- **External:** none. **Decisions:** provisioning workflow, 2FA policy (D-list).
- **Done:** a SUPER_ADMIN can create a CHEF for branch X in production without seed scripts; all actions audited.

### Phase 7 — Order Lifecycle & Payments
- **Goal:** safe order state machine and real payment flow with a provider adapter.
- **Modules:** Orders (cancel/confirm/transition), Payments, refunds (design), receipts.
- **Database:** `PaymentEvent`/webhook log (idempotent), `Refund`, `OrderEvent` history; promote Order/Payment status to constrained values only if approved; **one migration per concern, replayed**.
- **Backend:** status transition table with allowed roles; payment initiate → gateway order/ref; `POST /payments/verify` (server-side signature check); `POST /payments/webhook` (raw-body signature, idempotent); failure + retry; reconciliation job; COD handling per D5; server decides `PAID`; receipts/invoice read.
- **Web:** payment step with provider checkout (sandbox), pending/failed/retry states, receipt view, cancel order.
- **Mobile:** none yet (slice 1 follows).
- **Security:** never trust client success; verify signatures; raw-body route exempt from JSON limit parse order; secrets via env only; rate limits on payment endpoints.
- **Tests:** webhook replay/idempotency, bad signature, amount mismatch, race (verify vs webhook), cancellation rules, regression that nothing flips PAID without verification.
- **Migration:** yes (see above).
- **External:** **payment gateway credentials (BLOCKED_BY_EXTERNAL_SERVICE for live)** — ship adapter + mock/sandbox provider.
- **Decisions:** D5, D6, D9.
- **Done:** sandbox payment drives order `PAID` only via verified server path; documented live-test checklist.

### Phase 8 — Kitchen, KOT & KDS
- **Goal:** confirmed orders appear on the right branch's KDS; chefs progress them.
- **Database:** KOT lines/timestamps if needed; `Order.kitchenBranchId` routing used; `KitchenBatch` linkage.
- **Backend:** create KOT on order confirmation (transactionally); branch-scoped queue; transition rules (QUEUED→PREPARING→READY→…); sync order status; SSE stream (self-hosted) for KDS; remove customer PII from KOT DTO (name + items only).
- **Web:** `ChefDashboard` KDS tab on API + SSE; batches via API; loading/empty/error.
- **Mobile:** none. **Security:** branch scope (S2); chef sees only own branch.
- **Tests:** KOT creation idempotency; cross-branch denial; transition validation; PII absent.
- **Mocks removed:** mock KDS/batches in `ChefDashboard`. **Decisions:** D8. **External:** none.
- **Done:** order confirm → KOT → READY updates order, all authorization-tested.

### Phase 9 — Delivery
- **Goal:** fulfilment-ready orders are assigned to and completed by the right driver.
- **Backend:** create/assign `DeliveryAssignment` (dispatcher = SUPER_ADMIN/MD or branch role), self-scoped driver queue, pickup/in-transit/delivered/failed transitions, history; DTO limited to address + phone + order summary; POD as URL/reference (uploads in P14). **No fake GPS.**
- **Web:** `DeliveryDashboard` real; customer tracking shows real status timeline.
- **Security:** fix S1 (driver identity from JWT → EmployeeProfile; no client `driverId`). **Tests:** cross-driver denial, state machine, order status sync.
- **Mocks removed:** delivery mocks. **Decisions:** D8 (zones/fleet). **External:** Maps only if live tracking approved.
- **Done:** order DELIVERED by assigned driver only; customer sees real timeline.

### Phase 10 — Kerala Mess & Subscriptions (incl. identity reconciliation)
- **Goal:** one CUSTOMER account with Mess entitlement via `MessAccount`; paid enrollment, daily meals, pauses, gate pass.
- **Database:** safe defaults (`isApproved`, pause `status`), reconcile wallet duplication, idempotent daily-order generation keys, ledger constraints; migration for MESS_CUSTOMER → CUSTOMER **as a separate, approved data migration** (never destructive).
- **Backend:** enroll/purchase (via P7 payments), approval workflow, daily `MessDailyOrder` generation job (cron, idempotent), pause/resume with cut-off, wallet ledger with atomic row-level update, gate-pass issue/verify (POS/Chef), history, subscription (diet) create/pause/cancel/renew.
- **Web:** `MessCustomerPortal` and subscription UI on API. **Mobile:** deferred to slice 2.
- **Security:** ownership on every Mess object; staff approval by admin only; no self-approval; server-side money.
- **Tests:** dedicated Mess suite (none exists), concurrency on wallet, pause cut-off boundaries, gate-pass replay.
- **Mocks removed:** `mockKeralaMessData`. **External:** payments (P7). **Decisions:** D10–D12.
- **Done:** a CUSTOMER enrolls, pays, receives daily entitlements, pauses (refund per approved rule), uses gate pass; legacy accounts migrated safely.

### Phase 11 — Mobile Slice 1: Customer Commerce Core
- **Goal:** real Expo customer app for auth, catalog, cart, checkout/payment, orders, tracking.
- **Work:** navigation, auth with SecureStore, API client with refresh, `EXPO_PUBLIC_API_URL`, product/cart/checkout/payment (provider SDK per P7), orders/tracking, loading/error/empty, no backend-logic duplication, remove demo credentials, remove KOT tab from customer app.
- **Tests:** component/unit tests + manual device checklist; `tsc`. **External:** Expo/EAS, payment SDK sandbox.
- **Done:** order placed and tracked from a device against the same DB.

### Phase 12 — Inventory & Procurement
- **Database:** `Supplier`, `PurchaseRequest`, `PurchaseOrder`(+lines), `GoodsReceipt`(+lines); inventory item CRUD fields; recipe→ingredient→inventory mapping use.
- **Backend:** item CRUD, movement validation (types, non-negative, atomic), PR→PO→GRN with approvals, low-stock/expiry, recipe-based consumption from KOT (per D14), stock valuation; audit adjustments.
- **Web:** `ProcurementDashboard` + inventory screens on API; server-side costing replaces `costEngine`.
- **Security:** role + branch scoping; adjustments audited. **Tests:** movement atomicity, negative stock guard, PO state machine.
- **Mocks removed:** `inventoryDatabase.ts` runtime use. **Decisions:** D14–D15.

### Phase 13 — Trainer, Workout & Nutritionist Follow-up
- **Database:** trainer↔customer assignment, workout progress logs.
- **Backend:** trainer queue, WorkoutPlan CRUD (model exists), customer read, progress logging; nutritionist follow-up/check-ins and plan templates.
- **Web:** `TrainerDashboard`, `WorkoutPlanTab`, nutritionist follow-up on API. **Security:** trainer sees only assigned customers and only fitness-relevant data. **Tests:** assignment scoping suite. **Mocks removed:** `mockFitnessData`. **Decisions:** D13. **External:** video-session provider (optional).

### Phase 14 — Customer Engagement: Support, Ratings, Notifications, Uploads, Auth Completion
- **Database:** `SupportTicket(+Message)`, `Rating`, `Notification`, `UploadedFile`, referral-reward ledger.
- **Backend:** ticket lifecycle, ratings (verified-purchase), notification service with Email/SMS/Push adapters (+ console dev provider), upload architecture (MIME/size/auth, `StorageProvider`, signed access), lab-report upload & consent, password reset, email/phone verification & real OTP (replace web mock), referral rewards (per D19).
- **Web/Mobile:** corresponding UIs. **Security:** file authz, malware/MIME checks, PII minimization. **External:** email/SMS/push/object storage. **Decisions:** D19–D20.

### Phase 15 — POS
- **Database:** POS line items, shift linkage, receipt record.
- **Backend:** server-priced bill using `PricingService` (fix S3), payment states, receipts, drawer open/close, guest-sale policy (D16), gate-pass verify integration, stock decrement.
- **Web:** `POSDashboard` on API. **Tests:** price-tamper tests, shift reconciliation. **Mocks removed:** `mockPOSData`.

### Phase 16 — Bakery/FMCG & Tepache
- **Database:** safe `qcStatus` default; batch→inventory/finished-goods→`Product` stock linkage; Tepache brew-batch lifecycle; configurable deposit.
- **Backend:** production batch CRUD, QC, packaging, dispatch challans, finished-goods stock feeding storefront availability; Tepache tank/batch/bottling/returns with deposit from config (fix S5, D4).
- **Web:** both dashboards on API. **Mocks removed:** `mockBakeryFMCGData` (ERP part), `mockTepacheData`.

### Phase 17 — MD, Finance, HRM, Admin Console, CMS
- **Backend:** real aggregates from Orders/Payments/KOT/Procurement/Mess; finance reports (revenue, receipts, expense vouchers with validation/immutability); HRM employee CRUD, leave, payroll with safe defaults; CMS banners/media full CRUD; product/category/price admin; config.
- **Web:** `MDDashboard`, `MultiKitchenOverviewModule`, `FinancialsModule`, `HRMModule`, admin product/CMS screens. **Security:** MD gets aggregates, never clinical data; finance edits audited. **Mocks removed:** all remaining dashboard mocks. **Decisions:** D17–D18.

### Phase 18 — Swiggy/Zomato Aggregators
- **Backend:** adapter interface, webhook intake (signature), order normalization into `AggregatorOrder` → KOT, status push, stock buffer, commission reconciliation; safe mock adapter. **Web:** portal on API. **External:** partner credentials (**BLOCKED** for live).

### Phase 19 — Web Mock Elimination & UX Completion
- Decompose `App.tsx`; real routing; remove remaining `INITIAL_*`; accessibility/performance (code-split the 2.5 MB bundle); consistent loading/error/empty; frontend test coverage.

### Phase 20 — Mobile Slice 2: Parity
- Health/diet, Mess, workout, support, notifications, uploads; offline/refresh handling; release builds.

### Phase 21 — Full-System Testing
- E2E (browser + API), load tests on critical paths, security review (OWASP pass), backup/restore drill, data-migration rehearsals, CI pipeline.

### Phase 22 — Deployment & Observability
- Containerization, managed Postgres, secrets, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY`, TLS, logging/metrics/alerts, health/readiness, CI/CD, backups, runbooks. **External:** hosting/domain.

---

## 10. Blockers

**A. Can implement now:** P5, P6, P8–P9 (internal), P12, P13, P15, P16 (internal logic), P17 (internal aggregates), P19, adapters/interfaces for P7/P14/P18.
**B. Product decision required:** D1–D21 (§6). P5 can proceed with server-configured values clearly labelled; P7, P10 cannot be *finalized* without D5/D6/D9/D10.
**C. External credential required:** payment gateway (P7), email/SMS/push (P14), object storage (P14), Swiggy/Zomato (P18), hosting (P22), Expo/EAS (P11/P20). Build adapters + sandbox/dev providers first.
**D. Depends on earlier phase:** KDS←P7/P6; Delivery←P8; Mess←P7,P8; Inventory consumption←P8; MD←P7+operations; Mobile←P5–P9 / P10,P13,P14.

---

## 11. Testing strategy
- Backend: keep ≥132 tests; each phase adds domain, authorization-matrix (role × endpoint × ownership) and negative tests; money/idempotency/concurrency tests where relevant.
- Web (from P5): Vitest + React Testing Library for cart/checkout/auth flows; later Playwright E2E (P21).
- Mobile: type-check each slice; component tests for money-free UI; device smoke checklist.
- Migrations: replay on disposable DB every time; apply to dev **and** test DB.
- Regression gate every phase: `prisma validate`, `migrate status`, backend `tsc`, `npm test`, web `tsc` + build, mobile `tsc` if touched.

## 12. Estimated remaining controlled phases
**18 planned phases (P5–P22)**; realistically 22–26 commits-worth of work because P7 (payments), P10 (Mess/subscriptions), P12 and P17 will each likely split into 2–3 reviewable sub-phases.

## 13. Recommended next phase
**Phase 5 — Customer Storefront ↔ Server Commerce.** Reason: it is the only way a real customer can currently complete the core revenue path; backend is ready; it needs no schema change, no external credential and no unresolved decision that blocks a *labelled* implementation; and it removes the largest false "Integrated" claim. Likely affected files: `src/components/customer/{PackagedFoodsSection,TepacheDrinksSection,CustomerHome,DirectCartCheckoutModal,DirectOrderTrackingModal}.tsx`, `src/App.tsx` (cart/orders state), `src/services/{productService,cartService,orderService}.ts`, `src/types.ts`, a new web test harness (`vitest` config + tests), possibly small DTO additions in `server/src/modules/product/product.service.ts`. Risks: `App.tsx` state coupling (876 lines), guest→logged-in cart merge, pricing values being policy-undecided, deposit lines for Tepache, mock-shaped types (`DirectCartItem`) used widely. Strategy: adapter layer mapping API DTOs to existing UI types first, then remove mocks; backend contract tests before UI changes.
