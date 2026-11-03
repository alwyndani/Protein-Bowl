# Sandbox verification plan (Razorpay test mode, Resend, Docker, CI)

Status: **written, not yet executed.** Nothing here needs a live credential or a real transaction. Run it against a scratch database on your own machine
(for example `pb_ci_test`, or a new `pb_sandbox`), never against the development or a production database. Production payment reconciliation
stays disabled: `--apply` of `scripts/reconcilePaymentsProd.ts` is refused in production by `reconcileApplyGate.ts` until you lift that gate after step A is signed off.

## A. Razorpay TEST mode (payments, refunds, cancellation, expiry)

Prerequisites: a Razorpay account in **Test Mode**; Dashboard → Account & Settings → API Keys → generate **test** keys (`rzp_test_…`);
Settings → Payment Methods (UPI visibility is an account setting, see CLAUDE.md history); a public HTTPS URL for the webhook (a tunnel to the local API).

1. Server environment for the sandbox run (shell variables, never committed): `NODE_ENV=development`, `DATABASE_URL=<scratch db>`, `PAYMENT_PROVIDER=razorpay`,
   `RAZORPAY_KEY_ID=rzp_test_…`, `RAZORPAY_KEY_SECRET=…`, `RAZORPAY_WEBHOOK_SECRET=<a random string you choose and also enter in the dashboard>`,
   `PAYMENT_REFUND_INLINE_SUBMIT=true`, `UNPAID_ORDER_EXPIRY_MINUTES=2` (to observe expiry quickly), plus the `COMMERCE_*` development values.
2. Dashboard → Webhooks: URL `https://<tunnel>/api/v1/payments/webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`, events `payment.authorized`, `payment.captured`, `payment.failed`, `refund.created`, `refund.processed`, `refund.failed`. Account must be on **auto-capture**.
3. Test matrix (record result + order number for each in PROGRESS.md):
   | # | Scenario | Expected |
   |---|---|---|
   | 1 | Web: place order → Pay → test card success | order PAID + CONFIRMED, payment panel shows confirmed, webhook row PROCESSED |
   | 2 | Close the checkout without paying | "Payment not completed", Pay Now still offered only after the backend refreshes |
   | 3 | Pay, then kill the browser tab before verification | webhook (or `payments:reconcile:prod` dry run, then reconciliation) settles it; never a second charge offered while CONFIRMING |
   | 4 | Failed test card | order stays PENDING, retry allowed |
   | 5 | Customer cancels a CONFIRMED paid order | order CANCELLED, full refund REQUESTED → PROCESSING → PROCESSED (`refund.processed` webhook), `paymentStatus=REFUNDED` |
   | 6 | Customer requests cancellation of an ACCEPTED order; Super Admin approves / declines | approve: cancelled + full refund; decline: reason visible, order unchanged |
   | 7 | Leave an order unpaid > `UNPAID_ORDER_EXPIRY_MINUTES` and run `npm run orders:expire-unpaid` | order CANCELLED, no refund; an order with a payment attempt in flight is NOT expired |
   | 8 | Replay the same webhook (dashboard "resend") | IGNORED/duplicate, no second state change |
   | 9 | Mobile (EAS dev build, test key id only): pay, dismiss, check status | same outcomes as 1–2; the key SECRET never appears in the app |
4. Reconciliation check: `cd server && npm run payments:reconcile:prod` (**dry run** by default: classifies due payments, writes nothing). Only the dry run is in scope; `--apply` stays gated.
5. Evidence to attach: order numbers, `GET /api/v1/admin/payments` rows, the structured `"area":"payments"` log lines, Razorpay test dashboard payment/refund ids.

## B. Resend (email) test configuration

1. Resend account → API Keys → create a key with "sending access". For a first test use the sandbox sender `onboarding@resend.dev` (delivers only to your own account email); for real recipients verify a domain (SPF/DKIM) and use `no-reply@<domain>`.
2. Environment: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=re_…`, `EMAIL_FROM="Protein Bowl <onboarding@resend.dev>"`, `WEB_BASE_URL=http://localhost:3000` (the link origin; HTTPS in production), `INVITE_DELIVERY=email` to also test staff invitations.
3. Checks: (a) web "Forgot password" with your account email → mail arrives, link is `<WEB_BASE_URL>/reset-password#token=…`, the page opens, the new password works, old sessions are signed out, the link cannot be used twice; (b) an unknown address returns the same 202 and sends nothing; (c) mobile "Forgot password" triggers the same mail and the link opens the web page; (d) staff invitation mail (SUPER_ADMIN invite) arrives and is single-use; (e) with `EMAIL_PROVIDER=none` nothing is sent and the API still answers 202.
4. Never paste the API key into chat, a file in the repo, or a log.

## C. Docker

On a machine with Docker (not available on the author's machine):
```bash
docker build -t protein-bowl-api:test server          # must finish without errors
docker run --rm protein-bowl-api:test node -e "console.log('image runs')"
# migrations as an explicit step, against a scratch database only:
docker run --rm -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/pb_sandbox?schema=public" protein-bowl-api:test prisma migrate deploy
```
`server/.dockerignore` keeps `.env*`, `node_modules`, `dist` and `src/tests` out of the build context. The `docker` job in `.github/workflows/ci.yml` runs the build on every push/PR.

## D. CI (GitHub Actions)

Jobs: `web` (typecheck, tests, build), `server` (generate, typecheck, migrate, seed, test; migration suites excluded), `server-migrations` (the 8 migration suites against the job's own throwaway Postgres on port 5433), `docker` (image build), `mobile` (typecheck, tests). To verify: push a branch, open a PR, confirm all five jobs are green; failures are triaged from the job log. Not yet executed anywhere.

## E. Sign-off checklist before production readiness can be claimed
- [ ] A.1–A.9 recorded as passed; B.3 passed; C and D green; migration suites green on a disposable instance.
- [ ] Production values set and reviewed: `docs/OPERATIONS.md` §1 (secrets ≥ 32 chars, CORS origins, `TRUST_PROXY`, live Razorpay keys only at launch, `PAYMENT_REFUND_INLINE_SUBMIT`, `COMMERCE_*` business policy approved by the owner).
- [ ] Backup + restore drill performed (`docs/OPERATIONS.md` §4) and rollback rehearsed.
- [ ] Open business decisions closed (D-INV1..5 are inventory only and do not block launch of the existing scope).
