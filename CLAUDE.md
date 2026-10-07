# CLAUDE.md — Protein Bowl

Persistent engineering instructions for Claude Code. Everything below was verified against the repository on 2026-10-07 (onboarding audit). The code is the source of truth; `README.md`, `ARCHITECTURE.md` and `IMPLEMENTATION_PLAN.md` are aspirational blueprints and over-claim in places (see "Doc reliability").

## 1. Purpose
Protein Bowl is a food-tech platform: customer web app, React Native mobile app, one Express REST API, one PostgreSQL database, and internal ERP/operations modules, gated by RBAC. Web and mobile MUST share the same backend and database. This is an existing project migrated from Antigravity IDE — never rebuild, replace architecture, or delete modules that look incomplete.

## 2. Repository structure
```
/                     Web app (Vite + React). Root package.json, vite.config.ts, tsconfig.json
  src/                App.tsx (876 lines, still holds most demo state), components/{common,customer,erp,mess},
                      services/ (API clients), context/AuthContext.tsx, data/ (mock + static data), utils/
  server/             Backend API (own package.json, tsconfig, vitest.config.ts)
    prisma/           schema.prisma, migrations/, seed.ts, seedRecipes.ts, seedProducts.ts
    src/app.ts        Express app (exported; server.ts calls listen)
    src/config/       env.ts (Zod-validated env), database.ts (shared Prisma singleton)
    src/middleware/   auth, rbac, validate, error, rateLimiter
    src/modules/<domain>/  routes -> controller -> service (+ validator for some)
    src/tests/        foundation, diet, recipe, commerce (+ setup.ts)
  apps/mobile/        Expo app: single App.tsx (277 lines) + src/services/{api,storage}.ts
  scripts/, public/   SRS docx generator and output
  dist/, node_modules/  build output / deps (gitignored)
```
No monorepo tooling: three independent npm packages (root, `server/`, `apps/mobile/`). `packages/shared` from IMPLEMENTATION_PLAN.md does NOT exist. Root also has a stale `bun.lock` next to `package-lock.json` (use npm).

## 3. Exact versions (from package files / installed)
- Node v22.12.0; TypeScript 5.8.3 (server & web, `~5.8.2`); mobile TS `^5.3.3`
- Web: React `^19.0.1`, Vite `^6.2.3`, Tailwind `^4.1.14`, recharts `^3.10`, motion, lucide-react; root also lists express/@google/genai/docx/dotenv (generator scripts; not the API)
- Backend: Express `^4.21.2`, Prisma + @prisma/client **6.19.3** (declared `^6.4.0`), Zod `^3.24`, jsonwebtoken `^9`, bcryptjs `^2.4.3`, helmet `^8`, express-rate-limit `^7.5`, cookie-parser, cors; ESM (`"type":"module"`, NodeNext, imports use `.js` suffix)
- Tests: Vitest **5.0.3**, Supertest `^7.3`
- Mobile: Expo `~52`, React Native `0.76.6`, React `18.3.1`, expo-secure-store `~14`
- DB: PostgreSQL on localhost:5432; dev DB `protein_bowl_db`, test DB `protein_bowl_test_db`
- Do NOT upgrade major versions without explicit instruction. (Prisma prints a deprecation warning for `package.json#prisma`; leave it.)

## 4. Backend architecture
- Base path `/api/v1`. Mounted: auth, customers, products, recipes, cart, checkout, orders, mess, diets, kds, procurement, delivery, pos, fmcg, tepache, md, hrm, finance, cms, plus `GET /health`.
- Layering: `*.routes.ts` (middleware chain) → `*.controller.ts` → `*.service.ts`. Zod validators exist for auth, customer, diet, recipe, cart, order only.
- Response envelope: `{success, message?, data?, error?}`; `ApiResponse` helper in `utils/apiResponse.ts`, though cart/order controllers call `res.json` directly. Errors: throw `AppError(message, status, code)`; `errorHandler` maps `AppError` and `ZodError` (422).
- Monetary logic: `modules/commerce/pricing.service.ts` (Decimal-safe, shared by checkout preview and order creation).
- Order creation is transactional, idempotent (`Order.idempotencyKey`, header `x-idempotency-key`), snapshots OrderItem and delivery address.
- Prisma: all application services/controllers use the shared singleton (`import { prisma } from '../../config/database.js'`; logs `error`/`warn` only, `error` in production). Never add `new PrismaClient()` to app code. Intentional standalone clients remain only in `prisma/seed*.ts` scripts and test fixtures (`src/tests/*`).

## 5. Database architecture
`server/prisma/schema.prisma` (~1100 lines, 57 models+enums). Notable: User/UserRoleAssignment/RefreshToken/AuditLog; CustomerProfile/HealthBiometrics/CustomerAddress; DietPlanRequest/DietPlan/DietPlanDay/DietPlanMeal; Recipe/Ingredient/RecipeIngredient; ProductCategory/Product/ProductVariant; Cart/CartItem; Order/OrderItem/Payment; Mess*/Wallet*; KitchenOrderTicket; Inventory/StockMovement; DeliveryAssignment; POS*; FMCG*; Tepache*; HRM*; FinancialTransaction; CMS*. Many ERP models exist only as schema + thin CRUD.
Order `status` and `paymentStatus` are **String** columns (not DB enums); `Payment.status` now defaults to `"PENDING"` (migration `20261007100318`; Phase 4C). No code writes `Payment` yet. Payment enum design is deferred.
Current dev DB (verified read-only): 120 Recipe, 350 Ingredient, 606 RecipeIngredient, 23 Product, 23 ProductVariant, 11 ProductCategory, 41 User (21 CUSTOMER), 0 Order/Cart/DietPlan.

## 6. Authentication
- Access JWT (15m default) via `Authorization: Bearer`; refresh token (7d) stored hashed-in-DB (`RefreshToken`), sent as HttpOnly cookie `pb_refresh_token` (body `refreshToken` also accepted — used by mobile), rotated on refresh.
- Web keeps access token in memory only (`ApiClient`). Mobile uses expo-secure-store.
- Rate limits (per IP, env-configurable `RL_*`): login 20/15min, register 10/hour, refresh 60/15min, general `/api/v1` 600/15min (health exempt). Limits are effectively off under `NODE_ENV=test` unless a test sets `RL_*_MAX` before importing the app (see `ratelimit*.test.ts`). `RL_DISABLED=true` works only outside production. Set `TRUST_PROXY` when behind a reverse proxy.
- Public registration allows only `CUSTOMER` or `MESS_CUSTOMER`. Staff accounts come from seed/admin only.

## 7. RBAC roles (`RoleEnum`, verified)
CUSTOMER, MESS_CUSTOMER, SUPER_ADMIN, MD, NUTRITIONIST, TRAINER, CHEF, PROCUREMENT, DELIVERY, POS, BAKERY_FMCG, TEPACHE_ERP, SWIGGY_ZOMATO. Do not change role semantics.
Middleware (`auth.middleware.ts`): `authenticateToken`; `requireRole([...])` (**staff/admin APIs only — SUPER_ADMIN always passes**); `requireCustomerRole` (literal CUSTOMER; no SUPER_ADMIN bypass); `requireExactRoles([...])` (listed roles only; no bypass). `rbac.middleware.ts` also has `requireRoles` (SUPER_ADMIN bypass; used only in `auth.routes`). RULE: customer-context endpoints must use `requireCustomerRole`/`requireExactRoles`, never `requireRole`.
`MESS_CUSTOMER` is LEGACY / DEPRECATED FOR FUTURE RECONCILIATION. Target (decided): CUSTOMER is the canonical customer identity for Customer Portal AND Kerala Mess; Mess entitlement = the customer's MessAccount. Until a controlled future migration, customer Mess endpoints accept CUSTOMER and legacy MESS_CUSTOMER; MESS_CUSTOMER is not accepted on diet/commerce/profile APIs. Do not delete or rewrite the role without an approved phase.

## 8. Customer vs staff boundaries
One customer account, two customer experiences (Customer Portal, Kerala Mess). Customers never get staff/ERP permissions. Public register cannot mint staff roles. Customer-private routes derive identity from `req.user.userId` (JWT) → `CustomerProfile` lookup; never accept `customerId` from the client. SUPER_ADMIN must not be able to use `/me` customer endpoints (order, checkout, customers/me use `requireCustomerRole`; see §9 for gaps).

## 9. Security rules and known gaps
Rules: backend authorization + ownership checks are authoritative; frontend hiding is not security; never leak costing/clinical notes/SOP/supplier/ERP metadata in public DTOs; least-privilege for health data (diet health-profile access is limited to NUTRITIONIST/SUPER_ADMIN with claim checks in `diet.service`).
Phase 4C (2026-10-07) fixed: cart/diet/mess customer-role guards (SUPER_ADMIN and staff are blocked from customer-context APIs); CORS allow-list + Origin check on state-changing requests (`CORS_ALLOWED_ORIGINS`, falls back to `CLIENT_URL` outside production; production startup fails without it; no-Origin requests such as mobile/curl are allowed; a disallowed origin gets no CORS headers, mutating requests get 403 `ORIGIN_NOT_ALLOWED`); auth + general rate limits; `JSON_BODY_LIMIT` (default 256kb; oversized -> 413, malformed JSON -> 400); invalid HTTP `4404` in mess controller; Payment default; seed production guard (`prisma/seedGuard.ts`: NODE_ENV=production seeds only recipes/products, never demo users); web/mobile demo credentials gated behind `import.meta.env.DEV` / `__DEV__`; shared Prisma singleton.
Body limit rationale: legitimate max today is a 7-day nutritionist plan (~20-45KB); a verbose 30-day, 6-meals/day plan is ~90KB; the validators allow up to 365 days (~1MB) but no UI sends that. Binary/lab-report uploads need a dedicated upload route later, not bigger JSON limits.
Remaining concerns (not fixed; need approval/phase):
1. Frontend guards (`IS_DEV`, `__DEV__`) are UX hygiene only; backend never depends on them.
2. Web OTP step is a local mock (auto-filled "4821"; no backend OTP); `App.tsx`/ERP dashboards use mock data. Mobile wallet balance is still a fake constant (450). Mobile production needs `EXPO_PUBLIC_API_URL`.
3. Production CORS origin(s) are deployment configuration — not decided/known yet.
4. Dev/seed accounts still use the documented dev password; never use outside development. `seed.ts` also seeds non-production demo operational data (branches, tanks, mess plans).
5. ERP service modules (kds/pos/procurement/...) remain thin, unvalidated CRUD (no Zod, plain `Error`), no tests. Mess controllers take unvalidated bodies.
6. Refresh tokens are accepted from cookie OR body (needed by mobile); consider tightening later. `Payment.status` is still a free String.
7. No per-endpoint order/checkout rate limits (decision: not yet).
8. `.env` files are gitignored; keep it so.

## 10. VERIFIED modules (code + passing tests)
- Auth/refresh/RBAC foundation (foundation.test.ts, 12 tests). Phase 4C hardening tests: hardening.test.ts (31), ratelimit.test.ts (4), ratelimit-general.test.ts (1).
- Customer profile + biometrics + addresses CRUD; BMI/BMR/TDEE/macros in `utils/biometricsCalculator.ts` (server-authoritative).
- Diet request → nutritionist claim → plan create/version → customer approve/revise, immutable meal snapshots (diet.test.ts, 19).
- Recipe & nutrition catalog: 120 recipes in Postgres, public vs staff projections, Chef/SUPER_ADMIN mutation, publish = SUPER_ADMIN only (recipe.test.ts, 23).
- Commerce foundation: products/categories (public), server cart, checkout preview, transactional idempotent orders, order history/detail with ownership scoping (commerce.test.ts, 41).
- Migration chain (6 migrations, in sync with dev DB).

"VERIFIED" means backend behaviour is tested; it does NOT imply production-ready pricing, payments, or mobile/web parity.

## 11. PARTIAL
- Web commerce/diet/health UI: `DirectCartCheckoutModal`, `DirectOrderTrackingModal`, `DietPlanBuilder`, `CustomerPlanReview`, `HealthProfile*`, `NutritionistDashboard` (publish), `ChefDashboard` (recipes) call real services, but `App.tsx` still seeds profile/requests/orders and many tabs from mock constants, and `CustomerHome`, `PackagedFoodsSection`, `CustomerDashboard`, `DietPlanBuilder` still read static `data/` files.
- Backend Kerala Mess (plans, register, pause-meal, gate-pass verify) exists with service logic but no tests and is not the intended production workflow.
- Orders stop at `status=PENDING, paymentStatus=PENDING`; no status-transition workflow.

## 12. SCAFFOLD / MOCK
- ERP backends: kds, procurement, delivery, pos, fmcg, tepache, md, hrm, finance, cms — routes + role guards + simple Prisma reads/writes, no tests, not consumed by real UI (md/kds/mess have a web service file; ERP dashboards run on `src/data/mock*.ts`).
- Web ERP dashboards: MD, Chef (batches), Procurement, POS, Bakery/FMCG, Tepache, Omnichannel, Swiggy/Zomato, HRM, Financials, MultiKitchen, Trainer, Kerala Mess portal — MOCK-driven UI. Preserve them.
- Mobile app: SCAFFOLD (one screen file; hits real endpoints for login/products/mess plans/orders/kots but with hardcoded `localhost` URL, demo credentials, fake wallet). No feature parity.

## 13. DEFERRED (do not mark done)
Payment gateway/capture/refunds, SMS OTP, subscriptions, Kerala Mess production workflow, KDS/KOT full workflow, inventory stock movements, procurement integration, delivery fleet/live GPS, mobile parity, aggregator integrations, workout/trainer backend, SSE/WebSocket, background jobs, Docker/CI/CD, production deployment.

## 14. Migration safety rules
Chain (7, all applied to dev and test DBs): `20260924114508_init_phase1`, `20260926120407_add_health_biometrics`, `20261001120000_add_enterprise_platform_models`, `20261001133300_phase3_diet_nutrition_workflow`, `20261001140000_phase4a_recipe_nutrition_catalog`, `20261005143000_phase4b_commerce_cart_order`, `20261007100318_phase4c_payment_status_safe_default`. After creating a migration, immediately check that the generated directory name sorts AFTER the chain tail; if it does not, STOP and report (never rename/repair automatically). New migrations must also be applied to the test DB (`DATABASE_URL=<test db> npx prisma migrate deploy`).
NEVER: `prisma db push`; `migrate reset` on the dev DB; drop the dev DB; rename/edit applied migration folders or SQL; touch `_prisma_migrations`; alter checksums.
Before ANY new migration: inspect migrations → `npx prisma migrate status` → new folder name must sort AFTER `20261007100318` (use a timestamp later than that, mind the dates are in the 2026-10 range) → create with controlled `prisma migrate dev --create-only`, review SQL → replay the whole chain on a disposable DB (e.g. a new scratch database, `migrate deploy`) → only then apply to dev. Back up/snapshot concerns: dev DB holds real seeded data (41 users, recipes).

## 15. Testing
- Run: `cd server && npm test` (vitest run). Last result (after Phase 4C): 7 files, **132/132 passing** (foundation 12, diet 19, recipe 23, commerce 42, hardening 31, ratelimit 4, ratelimit-general 1). Baseline before Phase 4C was 95.
- Tests are integration tests against a real Postgres: `src/tests/setup.ts` hard-forces `protein_bowl_test_db` on localhost. The test DB must exist, be migrated (`DATABASE_URL=<test db> npx prisma migrate deploy`) and seeded. Never point tests at the dev DB.
- There are no web or mobile tests. Every change to auth, RBAC, ownership, pricing, orders or diet must add/keep regression tests; do not delete or weaken existing tests to make them pass.

## 16. Commands
Backend (`cd server`): `npm run dev` (tsx watch, :5000) · `npm run build` (tsc) · `npx tsc --noEmit -p .` · `npm test` · `npx prisma validate` · `npx prisma migrate status` · `npx prisma generate` · `npm run prisma:seed` (idempotent seed; dev only).
Web (root): `npm run dev` (Vite :3000) · `npm run build` · `npm run lint` (= `tsc --noEmit`). Env: `VITE_API_BASE_URL` (default `http://localhost:5000/api/v1`). Production build currently emits one ~2.5 MB JS chunk (warning only).
Mobile (`cd apps/mobile`): `npx expo start` · `npx tsc --noEmit`.
Windows host; bash tool is Git Bash. Use Unix syntax there.

## 17. Money / pricing safety
- Backend is authoritative; never trust client prices/totals. Use `Decimal` (Prisma runtime Decimal), never float arithmetic, for money.
- Current code hard-codes defaults in `PricingService` (unchanged by Phase 4C): delivery fee ₹40, free-delivery threshold ₹499, packaging fee ₹0, fallback tax rate 5% (Product.taxRate default 0.05), container deposit per product/variant (seeded ₹10 for Tepache bottles). These are **PRODUCT DECISION REQUIRED** — do not generalize or hide them as policy; do not add other fees (e.g. the old ₹25 packaging) without a decision.
- Payments: no gateway. Orders must never become PAID automatically. Keep order `status` and `paymentStatus` separate. `Payment.status` now defaults to `PENDING`; a payment must never be marked SUCCESS/PAID without verified gateway confirmation. Payment status enum design is deferred. Do not integrate Razorpay/Stripe/UPI until instructed.

## 18. Health-data access
Health biometrics/clinical notes are private to the owning customer; nutritionists access only via diet-request claim flow (`/diets/requests/:id/health-profile`, claim + role checked in service); MD intentionally excluded from routine clinical endpoints. Staff DTOs must not leak to public/customer projections and vice versa. Calculations stay server-side.

## 19. Recipe / Product boundary
Recipe = culinary/nutrition/prep definition. Product = purchasable offering (`Product.recipeId` optional). ProductVariant = SKU. Not every Recipe is a Product and not every Product has a Recipe. No cart/order/payment/inventory logic in Recipe. Recipe source files in `src/data/recipes/` + `recipeDatabase.ts` are import/seed sources (and still used at runtime by several web components — see §20).

## 20. Mock-data policy
Seed/import sources (`server/prisma/seed*.ts`, `src/data/recipes/*`) may remain. Runtime mock dependencies to retire only in approved phases (never opportunistically): `src/App.tsx` (initial state from `mockData`, `mockOmnichannelData`, `mockFitnessData`, `mockDirectOrdersData`, `mockKeralaMessData`); `CustomerHome` (combo offers + `recipeDatabase`); `PackagedFoodsSection` (`mockBakeryFMCGData`); `TepacheDrinksSection`; `CustomerDashboard` (workout/photos/video mocks); `DietPlanBuilder`, `NutritionistDashboard`, `ChefDashboard`, `IngredientPriceCalculator` (`recipeDatabase`); all ERP dashboards; `MessCustomerPortal`; `SwiggyZomatoAggregatorPortal`; `utils/costEngine.ts`, `healthCalculator.ts` (frontend-only calculation duplicates). localStorage: only `CinematicHeroAnimation` (hero video URL/name — UI preference); auth tokens are NOT in web storage. Don't claim a component is production-ready because its UI works.

## 21. Coding conventions
- Backend ESM TS, strict mode; relative imports end in `.js`. Static-class services (`export class XService { static ... }`) and controllers with `try/catch → next(err)`; customer controller/routes use an instance. Folder per domain: `modules/<name>/<name>.{routes,controller,service,validator}.ts`.
- Validate input with Zod (`validateBody`/`validateQuery` or `schema.parse` in controller); throw `AppError` with a stable error code.
- Frontend: React function components, Tailwind classes, `src/services/*Service.ts` over `ApiClient` (`apiClient.ts`, auto-refresh once on 401). Types in `src/types.ts`.
- Tests live in `server/src/tests`, supertest against `app`, `describe/it`, vitest globals on.
- `server/tsconfig.json` excludes tests from `tsc` (tests are type-checked only by Vitest transform, i.e. not at all).
- Match surrounding style; keep comments sparse.

## 22. Definition of Done
1. Scope matches what the user approved; nothing else changed.
2. `prisma validate`, `migrate status` clean; any migration replayed on a disposable DB.
3. `server`: `tsc --noEmit` 0 errors; `npm test` all passing (add tests for new behaviour, incl. negative authz/ownership cases).
4. Web: `npx tsc --noEmit` 0 errors and `npm run build` succeeds. Mobile: `npx tsc --noEmit` if touched.
5. No secrets committed; no `.env` changes; no new mock runtime dependency.
6. `IMPLEMENTATION_STATUS.md` updated conservatively (VERIFIED only with tests/evidence).
7. Report: what changed, what was verified, what remains.

## 23. Rules for future Claude Code sessions
- Start by reading this file, then `git status` and `npx prisma migrate status`. Verify docs against code.
- Do not start a new phase or feature without explicit user approval; one phase at a time.
- Never run destructive DB/git operations (see §14; no `reset --hard`, force push) without explicit approval. Commit/push only when asked.
- Stop and ask when a requirement is a PRODUCT DECISION (pricing, tax, fees, refunds, mess rules).
- Do not delete ERP/mess/mock modules because they look incomplete.
- Keep status vocabulary: VERIFIED / PARTIAL / SCAFFOLD / MOCK / MISSING / DEFERRED / PRODUCT DECISION REQUIRED.
- Doc reliability: IMPLEMENTATION_STATUS.md (with its 2026-10-07 audit note) is the best status source; README/ARCHITECTURE/IMPLEMENTATION_PLAN describe a target design (e.g. `packages/shared`, SSE, node-cron, Expo Router, Docker) that is not implemented.
