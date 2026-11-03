# Protein Bowl — Operations guide

Status: written, **not yet exercised in a real deployment**. Nothing here has been run against production.

## 1. Required production configuration (server)

Set as environment variables (never committed). The server **refuses to start** in production when a required value is missing.

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV=production` | yes | |
| `DATABASE_URL` | yes | Dedicated production database and role |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | yes | ≥ 32 random chars each, different from each other |
| `CORS_ALLOWED_ORIGINS` | yes | Exact origins, comma separated (no wildcard) |
| `TRUST_PROXY` | behind a proxy | e.g. `1` |
| `INVITE_DELIVERY` | yes | `manual` or `email` (`email` needs a real `EMAIL_PROVIDER`) |
| `EMAIL_PROVIDER` | yes | `resend` (production), or `none` (disables reset email). `log` is refused in production |
| `RESEND_API_KEY`, `EMAIL_FROM` | when `resend` | Verified sender domain |
| `WEB_BASE_URL` / `STAFF_INVITE_BASE_URL` | recommended | Origin used in emailed links (reset, invitation) |
| `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | yes | `mock` is refused in production. Use **test** keys until launch sign-off |
| `PAYMENT_REFUND_INLINE_SUBMIT` | yes | `true` or `false` |
| `DELIVERY_PROOF_SECRET` | yes | ≥ 32 chars (HMAC key for Delivery Codes) |
| `COMMERCE_*` (tax mode, fees, thresholds, caps) | yes | Business policy; see `server/.env.example` |
| `MOBILE_MIN_APP_VERSION` | optional | `MAJOR.MINOR.PATCH` |
| `PASSWORD_RESET_TTL_MINUTES`, `PASSWORD_RESET_COOLDOWN_SECONDS`, `INVITE_TTL_HOURS`, `STEP_UP_TTL_SECONDS` | optional | Defaults 60 min / 60 s / 72 h / 300 s |
| `UNPAID_ORDER_EXPIRY_MINUTES` | optional | Default 15; `0` disables expiry |

Web (build time): `VITE_API_BASE_URL` (a production build without it uses the same origin, `/api/v1`, never localhost); `VITE_CONTACT_ADDRESS`, `VITE_CONTACT_PHONE`, `VITE_CONTACT_EMAIL` (shown in the footer only when set; no placeholder contact is built in). JWT secrets must be ≥ 32 characters and different from each other in production. Mobile: `EXPO_PUBLIC_API_URL` (https in production), Razorpay **key id** only (never a secret).
Razorpay dashboard: webhook URL `https://<api>/api/v1/payments/webhook` subscribed to payment and `refund.*` events; account on auto-capture.
Hosting: serve the web app with an SPA fallback so `/staff/accept-invite` and `/reset-password` return `index.html`.

## 2. Scheduled jobs

Run the same image/commands from any scheduler (cron, Kubernetes CronJob, ECS scheduled task). Every job is idempotent and safe to re-run.

| Job | Command (from `server/`) | Schedule | Why |
|---|---|---|---|
| Payment + refund reconciliation | `npx tsx scripts/reconcilePaymentsProd.ts --apply` | every minute | Settles captures whose webhook/browser verification was lost, submits refunds, resolves UNKNOWN states; writes a `PAYMENT_RECONCILIATION_RUN` audit row. **Required** for correctness. Without `--apply` it is a read-only DRY RUN (classifies each due payment: would settle / nothing at provider / authorized only / failed / amount or currency mismatch / duplicate / provider error) — run that first. The older `reconcilePayments.ts` keeps a temporary target guard and must not be scheduled. **Release gate:** this entry point is not considered production-verified until `paymentReconcile.test.ts` has passed on the isolated database |
| Unpaid-order expiry | `npx tsx scripts/expireUnpaidOrders.ts` | every minute | Cancels abandoned unpaid online orders after `UNPAID_ORDER_EXPIRY_MINUTES` (default 15, `0` = off) when no payment evidence exists |
| Kerala Mess day close | `npx tsx scripts/closeMessDay.ts` | daily 00:10 Asia/Kolkata | Closes unresolved stops, marks expired meals NOT_DELIVERED, completes subscriptions |
| Mess meal backfill (legacy subscriptions only) | `npx tsx scripts/generateMessMeals.ts --all-active` | manual, once | New purchases generate meals at activation |

Container form: `docker run --rm --env-file prod.env protein-bowl-api tsx scripts/reconcilePayments.ts`.
Alert on structured log lines with `"area":"payments"` and on the review counts printed by the reconciliation job.
A payment captured after an order was expired/cancelled is kept and flagged `AFTER_CANCELLATION` for a SUPER_ADMIN-approved refund (never lost, never auto-refunded).

## 3. Deploy

1. Build and tag: `docker build -t protein-bowl-api:<version> server`.
2. **Back up first** (section 4).
3. Apply migrations with the deploy command only (never `migrate dev`/`db push`/`reset`): `npx prisma migrate deploy` with the production `DATABASE_URL`, from the same image tag: `docker run --rm --env-file prod.env protein-bowl-api:<version> npx prisma migrate deploy`.
4. Start the new API containers; check `GET /api/v1/health`; run a smoke test (sign in, list products, place an order with test keys).
5. Enable/keep the scheduled jobs.

## 4. Backup and restore (PostgreSQL)

- Nightly logical backup plus WAL/point-in-time recovery if the host offers it. Keep ≥ 14 daily and 12 monthly copies, encrypted, in a different account/region.
- Take a backup immediately before every migration: `pg_dump --format=custom --file=pb-<timestamp>.dump "$DATABASE_URL"`.
- **Restore drill (do it before launch and quarterly):** create an empty scratch database, `pg_restore --no-owner --dbname=<scratch> pb-<timestamp>.dump`, start the API against it, verify login and a recent order. Never restore over production without an incident decision.
- Back up the secrets store separately. Losing `DELIVERY_PROOF_SECRET` invalidates outstanding Delivery Codes (customers re-issue); losing JWT secrets signs everyone out.

## 5. Rollback

- **Application:** redeploy the previous image tag. Additive migrations stay compatible with the previous version.
- **Database:** migrations are forward-only. If a migration must be undone, restore the pre-migration backup into a scratch database, verify, and follow the incident process; do not hand-edit `_prisma_migrations`.
- **Feature flags/config:** payment provider, email provider and invitation mode are configuration; revert the variable and restart.
- After any rollback re-run the smoke test and confirm the reconciliation job is healthy.

## 6. Monitoring

Health: `GET /api/v1/health`. Logs: structured JSON for payments/refunds; ship stdout to your log service. Alert on: 5xx rate, `/payments/webhook` failures, reconciliation backlog (orders `CONFIRMING` for > 15 min), refunds in `REVIEW`/`UNKNOWN`, repeated `TOO_MANY_REQUESTS` on auth routes, `PASSWORD_RESET_EMAIL_FAILED` audit events.
