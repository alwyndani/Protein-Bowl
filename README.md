# Protein Bowl

Food-tech platform for personalised nutrition and online food ordering: a customer web app, a React Native customer app, one Express REST API and one PostgreSQL database. Access is controlled by **exactly six roles**.

| Role | What they do |
|---|---|
| **CUSTOMER** | Browse and order (online payment only), track orders, cancel eligible orders and receive full refunds, give the Delivery Code at handover, request a diet plan, follow trainer workout plans and log progress, Kerala Mess subscriptions |
| **CHEF** | Branch kitchen queue: accept → start preparing → mark ready; Kerala Mess batches |
| **NUTRITIONIST** | Claim diet requests, read the assigned client's health profile (audited), build and publish plans |
| **TRAINER** | Manage workout plans for the clients a Super Admin assigned; see client progress |
| **PROCUREMENT** | Suppliers, purchase orders, goods receipt into stock, stock adjustments, low-stock dashboard (own branches only) |
| **SUPER_ADMIN** | Staff, roles and branches, kitchen routing, audit log, payments/refunds, delivery operations (dispatch, handover verification, failed-delivery resolution), Mess administration, trainer assignments |

Retired and removed: POS, Bakery/FMCG ERP, Tepache ERP, driver workspace, MD, aggregator portal, HRM, finance, CMS, SRS generator. Packaged-food and Tepache **products** remain in the customer catalogue.

## Repository

```
/                 Web app (Vite + React 19 + Tailwind 4)         tests: npm test
server/           API (Express 4, Prisma 6, PostgreSQL, Zod)       tests: see server/TESTING.md
apps/mobile/      Customer app (Expo 52, React Native)             tests: npm test
docs/OPERATIONS.md  Production configuration, scheduled jobs, backup/restore, rollback
PROGRESS.md       Current state, test results, blockers (single tracker)
CLAUDE.md         Engineering rules and the detailed history of each phase
```

## Run locally

```bash
npm install && npm run dev                       # web on :3000
cd server && npm install && cp .env.example .env # then edit; npx prisma migrate deploy; npm run prisma:seed; npm run dev   # API on :5000
cd apps/mobile && npm install && npx expo start  # needs EXPO_PUBLIC_API_URL
```

## Checks

```bash
npm run typecheck:web && npm test && npm run build      # web
npm run typecheck:server                                 # server (after prisma generate)
cd apps/mobile && npx tsc --noEmit && npm test           # mobile
```

Server integration tests need an **isolated** database: set `TEST_DATABASE_URL` (see `server/TESTING.md`). They refuse the development and shared databases.

## Key rules

- Backend authorisation is authoritative; the database decides roles on every request.
- Online payment only (Razorpay). Orders become paid only through verified provider evidence; refunds are always full.
- Money is computed on the server with Decimal arithmetic; clients display server values.
- Staff accounts are created by invitation (manual link or email), never by public registration. Password reset is available for all active accounts.
- Secrets live in environment variables only; production refuses to start with missing or unsafe configuration.
