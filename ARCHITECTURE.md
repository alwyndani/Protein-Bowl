# Architecture

## Components
- **Web** (`src/`): React SPA. API clients in `src/services/*` over `ApiClient` (access token in memory, HttpOnly refresh cookie). Role workspaces: customer portal, `staff/TrainerWorkspace`, `staff/ProcurementWorkspace`, `erp/NutritionistWorkspace`, `erp/ChefDashboard`, `admin/AdminWorkspace`.
- **Mobile** (`apps/mobile`): customer-only app using `/auth/mobile/*` (refresh token in the JSON body, stored in SecureStore), the same commerce, payment, cancellation and Delivery Code endpoints as the web.
- **API** (`server/src`): `routes → controller → service` per module under `/api/v1`; Zod validation; `AppError` with stable codes; shared Prisma singleton; append-only `AuditLog`.
- **Database**: PostgreSQL via Prisma migrations (`server/prisma/migrations`, forward-only).

## Authorisation
`authenticateToken` loads the user from the database on every request (status, soft delete, current roles); JWT role claims are never trusted. Permissions are a static catalogue (`authz/permissions.ts`); branch-scoped roles resolve their branches server-side (`authz/branchScope.ts`) and a client-supplied branch is only ever checked, never trusted. Customer-context endpoints require the literal CUSTOMER role.

## Main flows
- **Order**: server cart → preview (server pricing) → idempotent `POST /orders` → payment session → Razorpay checkout → verification / webhook → `PaymentSettlementService` (only writer of paid state) → `OrderTransitionService` (only writer of order status) → SUPER_ADMIN routes to a branch → CHEF accepts/prepares/readies → SUPER_ADMIN dispatches → customer's Delivery Code verifies delivery.
- **Cancellation/refund**: customer or SUPER_ADMIN cancels; a paid order gets a full refund intent in the same transaction; the provider is contacted after commit; reconciliation guarantees completion.
- **Diet**: customer request → nutritionist claim → plan version → customer approve/revise. Health data is visible only to the claiming nutritionist (access audited).
- **Coaching**: SUPER_ADMIN assigns trainer ↔ customer; the trainer manages plans for assigned customers only; the customer logs progress.
- **Procurement**: purchase order DRAFT → ORDERED → (PARTIALLY_)RECEIVED; each goods receipt writes the receipt, stock movements and stock in one transaction; stock can never go negative.
- **Accounts**: staff via invitation (`StaffInvitation`, hash-only single-use token); password reset via `PasswordResetToken` (hash-only, single-use, expiring) and the mailer (`modules/email`).

## Operations
See `docs/OPERATIONS.md` (configuration, scheduled jobs, backup/restore, rollback) and `server/TESTING.md` (test database isolation).
