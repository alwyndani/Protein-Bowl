# End-to-end checklist on the running application (isolated database, mock payments)

Status (updated 2026-11-02): **customer journeys C1–C15 have been executed in the built-in browser** against the isolated API with mock payments. Their results are recorded in the dated browser run logs below (from "Browser run log" to the "Sixth pass"), not in the "Result" column of the table in section A, which is left blank. **Not executed in a browser:** the payment itself (needs the Razorpay sandbox), paid-order cancellation and refunds, the staff journeys (section X), a real API outage, and the mobile app on a device; the logs mark these NOT TESTED or BLOCKED. Everything else described elsewhere as "tested" is *automated* (supertest against a real PostgreSQL for the server; jsdom with mocked services for the web; jest for mobile). A journey counts as **browser-verified** only when a person or Claude has driven it here and recorded the result in this file. Claude cannot start long-running processes from its sandbox (the guard blocks background commands, terminal injection and writing `.claude/launch.json`), so you start the two processes and then either follow this list or ask Claude to drive the browser.

## Start (two terminals, from the repo root; PostgreSQL must be running locally)
**PowerShell, terminal 1 (API):**
```powershell
cd <repository root>
$env:PB_TEST_PG_PASSWORD = 'postgres'    # only if your local postgres password is different (letters/digits/._~- only); skip otherwise
npm --prefix server run e2e:api
```
Expect: `[e2e] database: localhost:5432/pb_ci_test (validated isolated), payments: mock, email: log, api port 5000` then `Protein Bowl Server running`. Check `http://localhost:5000/api/v1/health` → `healthy`. If it prints `REFUSED: ...` nothing was started.

**PowerShell, terminal 2 (web):**
```powershell
cd <repository root>
$env:VITE_API_BASE_URL = 'http://localhost:5000/api/v1'   # pins the web to this API even if a .env.local points elsewhere
npm run dev
```
Open `http://localhost:3000` in a **wide window (at least 1024 px)**: the header's "Track Orders" button is hidden on narrower screens (it is `hidden lg:flex`). **Git Bash equivalents:** `PB_TEST_PG_PASSWORD=postgres npm --prefix server run e2e:api` and `VITE_API_BASE_URL=http://localhost:5000/api/v1 npm run dev`. Stop both with Ctrl-C.

`server/scripts/startIsolatedApi.ts` refuses to start unless the target validates as the isolated database `pb_ci_test`; the process environment overrides `server/.env`; payments are the in-process MOCK provider and email is only printed to the API terminal.

**Accounts.** The seeded demo accounts' password is whatever `SEED_DEFAULT_PASSWORD` held when `pb_ci_test` was seeded (the documented default `Password123!` was rejected for `customer@proteinbowl.in`, so assume it differs). For the customer journeys register FRESH accounts (below); staff journeys need a password reset first (journey X1). **Nothing in the sign-up, sign-in or staff forms is prefilled any more** (development included): every field starts empty.

---
## A. Customer sequence (the priority). Use a NEW email such as `e2e.customer2@example.test` and a phone number nobody has used.
| # | Step | Do | Expect | Result |
|---|---|---|---|---|
| C1 | Registration: validation | Header → sign in → "Sign Up Now". Confirm name, email, phone, date of birth and password are ALL empty. Enter a phone of `12ab`, other fields valid, press "Continue to Health Capture" | message "Enter a valid mobile number (8–15 digits, optional leading +)"; no account created, health step does not open | |
| C2 | Registration: success | Enter a valid phone such as `+91 90000 12345` (any unused 8–15 digit number) and a date of birth, submit | health step "Step 2 of 2" opens; the form shows your name/email, measurements EMPTY (no 0), occupation/work schedule/lifestyle selects on "Choose…" | |
| C3 | Registration: duplicate phone | Open a private window, repeat C1/C2 with a different email but the SAME phone (also try it written with dashes) | clear message "This mobile number is already registered to another account"; no account; health step does not open | |
| C4 | Registration: duplicate email | Repeat with the first email | "Email address is already registered" | |
| C5 | Health profile (first save) | In Step 2 enter height, weight, target weight, choose gender; add one allergy and one medical condition; press "Save Health Profile & Complete Login" | lands on the dashboard; **no values you did not type** appear (check occupation, sleep, steps, circumferences = "Not provided") | |
| C6 | Health figures | Dashboard → Health profile | BMI, BMR, TDEE, target calories and macros are shown and correspond to the date of birth, gender and measurements you entered (change the date of birth in Edit → Save and the figures change). The "not calculated" case (no date of birth/gender saved) is covered by automated tests only: the sign-up form requires both | |
| C7 | Phone edit | Health profile → Edit Health Data → change Mobile Number to another valid unused number → Save Changes; reload the page | new number still shown after reload. Then try another account's number → "already registered to another account" and nothing saved | |
| C8 | Logout / login | Sign out (profile menu), sign in again with the same credentials | straight to the dashboard (no health step); allergy and condition from C5 still present | |
| C9 | Wrong password | Sign out, sign in with a wrong password | "Invalid email or password"; nothing loaded | |
| C10 | Menu | Home menu and the Menu tab | dishes load from the API (published recipes) with computed category counts; stop the API and reload → "The menu could not be loaded" + Retry | |
| C11 | Cart | Open "Packaged foods" / Tepache sections → Add a product, change quantity, add a second | cart shows server prices/totals; reload keeps the cart | |
| C12 | Checkout | Cart → choose/add a delivery address → review totals (server-computed) → "Place order" | order created PENDING / payment NOT_STARTED, order number `PB-…`; totals equal the preview | |
| C13 | Order tracking | Header → "Track Orders" (wide window) | the order appears with status PENDING and "payment required" | |
| C14 | Cancellation (unpaid) | Open the order → "Cancel order" → choose a reason → confirm | status CANCELLED, no refund; order stays in history as cancelled | |
| C15 | Logout | Sign out | back to the signed-out home; Track Orders/cart no longer reachable without signing in | |

### Browser run log — 2026-11-01, Claude driving the in-app browser against `localhost:3000` / `localhost:5000` (test accounts `e2e.customer2@example.test`)
Only what was actually done in the browser is marked PASS. "Browser-verified" applies to these rows only.
| # | Result | Evidence / finding |
|---|---|---|
| C1 | **PASS** | Sign-up form: name, phone, DOB, email, password all EMPTY (read from the DOM); gender select on "Choose…". Phone `12ab` → "Enter a valid mobile number (8–15 digits, optional leading +)", no account, no health step. Copy defect noted: the label reads "Mobile Number (for delivery OTP)" although no OTP exists. |
| C2 | **PASS** | Valid phone → "Step 2 of 2" opened; name/email/phone/DOB/gender prefilled from sign-up, measurements EMPTY (no 0), Occupation/Work Schedule on "Choose…". |
| C3 | NOT TESTED | needs a second signed-out context; the same server rule WAS seen refused in the profile editor (C7 below). Pending a clean run. |
| C4 | NOT TESTED | as C3. |
| C5 | **PASS with FINDING (fixed, retest pending)** | Saved height/weight/target, Asthma, Peanut → dashboard. Finding F1: **main goal ("Maintenance"), activity level ("Sedentary") and food preference ("Non-Vegetarian") were saved although never chosen** (the form had no goal control at all and preselected the other two). Fix applied in `AuthModal` (explicit "Main goal", "Activity level" and "Food preference" selects starting on "Choose…"; saving blocked until goal and activity are chosen; food preference never sent unless chosen) + test. **Retest needed with a fresh sign-up (browser).** |
| C6 | **PASS** | BMI 22, BMR 1339, TDEE 1607 for 168 cm / 62 kg / female / DOB 1992-05-10 (34 y) = the Mifflin-St Jeor result by hand; Occupation, Sleep, circumferences, steps, medications, disliked foods all "Not provided"; mobile shown normalised `+918355501122`. |
| C7 | **PASS** | Edit Health Data → another account's number → "That mobile number is already registered to another account. Your other changes were not saved." (still in edit mode). New unused number → saved; after a full page reload the dashboard shows `+918355501199`. |
| C8 | **PARTIAL** | Sign-out then sign-in → straight to the dashboard (no health step), all stored values present (PASS). Reload restores the session (PASS). **Not completed:** repeated reload checks were disturbed by session interference (below). |
| C9 | NOT TESTED | |
| C10 | **PASS** | Home menu loads from the API (`/recipes?page=1&limit=100`, `page=2`), category counts are computed (15/1/23/15/6/7/…), no error banner. Findings: counts overlap because categories are matched by keyword, so they add up to more than the catalogue; and the recipe list is requested four times per page (hook used twice + StrictMode). The "API down" banner was not exercised (would require stopping your API). |
| C11 | **PARTIAL** | Add product (₹130), add second (₹65), quantity + → subtotal ₹325 (server cart) PASS. **Persistence across reload NOT verified**: after the reload the page was signed in as a different account (below), whose cart is empty. |
| C12–C15 | NOT TESTED | stopped (see below). |

**BLOCKER found during the run: the browser session was swapped by someone else.** The refresh cookie (`pb_refresh_token`) is shared by every tab of this browser pane (same host `localhost`). Twice the session changed to `e2e.customer4@example.test` ("Dup Phone Tester", empty profile) without me signing in as that account: first at the very start (a reload restored it; I signed it out and signed in as customer2) and again between my phone check and my cart check. Source files under `src/components/customer/` (`AuthModal.login.test.tsx`, `HealthProfileTab.tsx`, `HealthProfileTab.test.tsx`) also changed on disk during the run. This looks like another person or session working in the same browser pane and repository at the same time. Journeys cannot be trusted while that continues, so the run was stopped here.

### Browser run log #2 — 2026-11-01, second Claude session driving the same in-app browser (accounts `e2e.customer3@example.test`, `e2e.customer4@example.test`)
**Explains the interference above:** both runs shared one browser pane (one `pb_refresh_token` cookie for `localhost`) and one working tree, so each run could swap the other's session (the "customer4" the first run saw is the account THIS run created) and each run's source edits triggered the other's hot reloads. Treat the two logs as separate runs on separate accounts. Everything below was actually done in the browser; screenshots lag the UI by ~2 s, so every state was re-read after a wait. Evidence that the running API is the isolated `pb_ci_test` database: the storefront lists automated-test fixture products (155 products incl. "P7A tax…", "COD Product", "P11B…") that exist only in the test database.
| # | Result | Evidence / finding |
|---|---|---|
| C1 | **PASS** | All six sign-up fields empty (read from the DOM). Phone `12ab` → "Enter a valid mobile number (8–15 digits, optional leading +)"; no account, health step not opened. |
| C2 | **PASS** | Valid phone → "Step 2 of 2". Measurements empty (no 0 anywhere), Occupation/Work Schedule/lifestyle selects on "Choose…", Main goal/Activity/Food preference on "Choose…", no condition or allergy pre-checked. |
| C3 | **PASS** | Sign-up with another account's number written `+91-95317-20999` → "This mobile number is already registered to another account"; health step not opened; no account created. |
| C4 | **PASS (incidental)** | The first attempt used `e2e.customer2@example.test`, which the other run had already registered → "Email address is already registered" (single `POST /auth/register` → 409). |
| C5 | **PASS** | Chose gender/height/weight/target, PCOS, Peanut, goal and activity → dashboard; everything else "Not provided"; Food Preference "Not provided" (never chosen, never saved). This also **re-tests the other run's finding F1 (fixed): nothing was saved that was not chosen.** |
| C6 | **PASS** | BMI 22, BMR 1329, TDEE 2060, target 1560, protein 112 g, water 2.67 L for 168 cm / 62 kg / female / DOB 1990-06-15 (36 y) / weight-loss / moderate. BMR checked by hand: 10·62 + 6.25·168 − 5·36 − 161 = 1329. |
| C7 | **PASS** | Mobile `+91 95317 20846` → changed to `+91 95317 20999`: saved, normalised `+919531720999`, still shown after a full page reload; allergy and condition untouched. Later, changing it to the number of another account → "That mobile number is already registered to another account. Your other changes were not saved." and the form stayed in edit mode. |
| C8 | **PASS** | Complete profile: sign-out → sign-in → straight to the dashboard (no health step) with mobile, Peanut and PCOS intact. Incomplete profile (`customer4`, no health data saved): sign-in opens the health step PREFILLED with the stored name, mobile and email. A reload restores the session. |
| C9 | **PASS** | Wrong password → "Invalid email or password"; nothing loaded. |
| C10 | **PASS** | Home menu: counts computed from the API (15 / 1 / 23 / 15 / 6 / 7 …); Menu tab: "120 Dishes", 120 cards. Not exercised live: the API-down error banner (needs your API stopped; automated test only). |
| C11 | **PASS** | Added "Honey Mustard Chicken Grill" and "Tofu Sesame Salad" (₹249 each); quantity + → 2 × ₹249 = ₹498, subtotal ₹747 (server cart). After a full reload the header cart still read ₹747 and the cart dialog held the same lines. |
| C12 | **PASS** | New address saved (label "Home" and state "Kerala" are prefilled defaults in that form); review step: subtotal ₹747, tax ₹37.35, delivery ₹0, total ₹784.35 (all server-computed, tax = 5 % of the subtotal); "Place order" → order `PB-261101-EVMXSQ`, "Order placed / Payment pending", totals identical to the review. The "Pay ₹784.35" button was NOT pressed: **paying is BLOCKED here (needs the Razorpay sandbox).** |
| C13 | **PASS** | Header "Track Orders" → the order is listed with "Order placed" / "Payment pending", its lines, totals and address. |
| C14 | **PASS** | "Cancel order" → reason "I changed my mind" → "Order: Cancelled", "Payment: No payment taken", timeline "Order placed / Cancelled". |
| C15 | **PASS** | Sign-out → signed-out home; header "Track Orders" now opens the sign-in dialog; a full reload stays signed out. |
**Defects found in this run, root-caused and fixed (each with an automated regression test and, where noted, a browser re-test):**
1. **"Skip & Launch Dashboard" did nothing.** It ran the same save as "Save…" and, with required fields empty, failed silently (the message sat at the top of the scrolled form). Fix: it now really skips (no save; dashboard opens; the next sign-in shows the health step again, prefilled); validation messages scroll into view. Test: `AuthModal.login.test.tsx` "Skip really skips". **Browser re-test: PASS** (skip → dashboard).
2. **Customers with no stored profile saw "0 cm / 0 kg", "(0 yrs)" and "Activity Level: Sedentary"** on the dashboard (the blank profile's placeholders shown as data). Fix: those rows read "Not provided" until height and weight are stored. Test: `HealthProfileTab.test.tsx`. **Browser re-test: PASS** (customer4: "Not provided" for DOB/Age, Height/Weight, Gender, Activity Level).
3. **Misleading label** "Mobile Number (for delivery OTP)" (no OTP exists) → "Mobile Number". Seen in the browser; the fix is a text change covered by the form tests (not re-viewed after the change).
**Observations, not fixed (decisions or low priority):** (a) a customer who skips the health step loses the date of birth and gender typed at sign-up (they are only saved with the health profile); (b) the address form prefills label "Home" and state "Kerala"; (c) the women-only block shows "No" preselected for pregnancy/breastfeeding/menopause; (d) the recipe list is requested more than once per page load (menu hook used by two components + development StrictMode); (e) category counts overlap because categories are keyword-matched; (f) the storefront in this test database lists 155 products because automated tests leave fixtures behind (a test-database artifact, not a product issue).

### Follow-up fixes and retest — 2026-11-01 (third pass; only ONE session on the browser pane; account `e2e.customer5@example.test`, separate from the customer2 run and the customer3/customer4 run above)
**Status of C4:** the customer2 run never tested it (NOT TESTED); the customer3/customer4 run only hit it incidentally. **C4 still needs a clean, independent duplicate-email retest** (register a brand-new email, then register it again, with no other session on the pane). Not claimed as verified.

| Item | Change | Automated test | Browser |
|---|---|---|---|
| 1. Skip keeps DOB + gender | `skipHealthCapture` now saves only `{dob, gender}` (what was entered); on failure it shows an error and stays open. Server: height/weight/goal/activity are optional together; a basics-only save stores NO health profile row; health details without all four → 422 `HEALTH_PROFILE_INCOMPLETE`. | `AuthModal.login.test.tsx` (blank skip saves nothing; DOB+gender saved, payload exactly `{dob, gender}`; failure keeps the modal) and `server/src/tests/profileBasicsOnly.test.ts` (no bio row, no invented figures, 422, later completion) | **BLOCKED**: the already-running API on :5000 still had the old validator (`PUT` → 422 "heightCm: Required…"); the UI correctly showed the error and stayed open. Restart the API (`cd server && npm run dev`), then retest: register, skip, sign in again, DOB/gender prefilled. |
| 2. Women-only questions unanswered | Selects start on "Choose…" (null); nothing is sent until chosen; server stores NULL and preserves omitted answers | `profileBasicsOnly.test.ts` (NULL when unsent, true/false stored, preserved by later saves). No dedicated web test yet. | **PASS** (customer5): the three selects read "" on the health step. Saved-value display not re-tested. Remaining default: "Do you exercise?" still preselects Yes (`hasExercise` is a non-null column). |
| 3. Address Label/State | No prefilled "Home"/"Kerala"; both required, with placeholders; no silent fallback on submit | `CheckoutFlow.test.tsx` (empty + required, no call without them; typed values sent) | NOT RETESTED in the browser (needs a cart and the checkout step) |
| 4. Duplicate recipe requests | `usePublishedRecipes` shares one in-flight request between `App` and `CustomerHome`; nothing is cached, so a new mount, Retry or reload still refetches | `usePublishedRecipes.test.tsx` (one request for two mounts; reload fetches fresh data) | **PASS**: a fresh load made `GET /recipes?page=1` and `page=2` once each (previously twice) |
| 5. "Mobile Number" label | already changed | form tests | **PASS**: sign-up labels are Full Name, Mobile Number, Date of Birth, Gender, Email Address, Password |

### Fourth pass — 2026-11-01, after the API was restarted with the new validator (one session on the pane; accounts `e2e.customer5`, `e2e.customer6`, `e2e.dup7`, all `@example.test`; no existing record edited, no cleanup, mock payments, Pay never pressed)
| Check | Result | Evidence |
|---|---|---|
| Continue with `e2e.customer5` | **BLOCKED / not continued** | customer5 was left with no DOB/gender: its earlier skip hit the old API (422), and the reload lost the modal state. Sign-in has no DOB field, so a skip test cannot be repeated on it; a fresh sign-up (customer6) was used instead. |
| Skip saves registration DOB + gender (customer6: DOB 1991-03-20, female) | **PASS** | `PUT /customers/me/profile` → 200; dashboard: DOB/Age "1991-03-20 (35 yrs)", Gender "Female", Height/Weight "Not provided". "No health profile row created" is proven by `profileBasicsOnly.test.ts`, not by the browser. |
| Sign out, sign in again | **PASS** | Sign-in → incomplete profile → health step opened with DOB `1991-03-20` and gender `female` prefilled. |
| Fresh checkout: Label/State empty, required, explicit | **PASS** | Placeholders "e.g. Home, Work" / "e.g. Kerala"; values empty; `required` on both; with line 1/city/postal filled the form is invalid and **no `/addresses` request was sent**; after typing Office/Kerala the address saved, review showed "5 Test Road, Kochi, Kerala - 682030", order **PB-261101-557HK5** (₹80, unpaid, "Payment pending") was placed; Pay was not pressed. |
| C4 duplicate email (clean, independent: `e2e.dup7@example.test`) | **PASS** | First `POST /auth/register` → 201; second, same email with a different phone → **409**, UI "Email address is already registered", no health step opened. |
| "Mobile Number" label | **PASS** | Seen in the sign-up form. |
| Women-only selects start unanswered | **PASS** | Three selects read "" (Choose…) on the health step (third pass). |
| Recipe requests per page load | **PASS** | One `/recipes?page=1` + `page=2` set (third pass). |
**NOT TESTED in the browser:** saving a women-only answer and re-displaying it; the "Do you exercise?" default; the API-down banner; everything that needs payment (Razorpay sandbox).
**Automated (fourth pass):** web typecheck 0 errors; **web full suite 60 files / 656 passed**; server typecheck clean; server regression run (profile*, registrationAndCalculation, foundation, hardening) 7 files / 72 passed; earlier this day the full server suite on `pb_ci_test` passed 72 files / 1646 tests.

Automated results (third pass): web typecheck 0 errors; web 60 files / 655 tests (the one failing address test was updated for the new behaviour; checkout files re-run green); server typecheck clean; server full run on `pb_ci_test`: 72 files / 1646 passed. C1–C2, C8 (skip → re-login) and C12 (address step) are NOT re-verified in the browser: see the blockers in rows 1 and 3.

---
### Fifth pass — 2026-11-01 (one session on the pane; accounts `e2e.customer8`, `e2e.customer9`; mock payments; no real payment; API process NOT restarted since the previous pass, web app hot-reloaded)
| Check | Result | Evidence |
|---|---|---|
| O1 follow-up: women-only answers visible and editable on the dashboard | **PASS** | Sign-in as `e2e.customer8` → dashboard → Health profile now shows a "Women's Health (optional)" block: Pregnant No, Breastfeeding Yes, Menopause **Not provided**, Menstrual cycle **Not provided**. Edit Health Data: Pregnant/Breastfeeding preselected No/Yes and offer no "Choose…" (a saved answer cannot be reset); Menopause starts on "Choose…". Set Menopause = No, Save → block shows Menopause No. API read-back: `isPregnant:false, isBreastfeeding:true, isMenopause:false`, `menstrualCycle` absent. |
| "Do you exercise regularly?" has no default | **PASS (sign-up) / PARTIAL (stored)** | New sign-up (`e2e.customer9`, step 2): neither Yes nor No is selected. The dashboard shows an existing saved answer as saved ("Yes" for customer8, saved before this change, preserved). **Not verified live:** that a customer who never answers is *stored* as unanswered — that needs migration `20261101120000_health_exercise_unanswered` (prepared, not applied) and an API restart; until then the old column default stores "No". |
| 401 console errors | **EXPLAINED + one genuine defect fixed** | All 58 were `POST /auth/refresh` → 401 for a visitor with no session (expected "not signed in" answer: the HttpOnly cookie cannot be inspected by the page) fired **twice** per anonymous page load (React StrictMode double effect in development). Fixed: one shared in-flight refresh (`ApiClient.refreshAccessToken`), also used by the 401-retry path (previously a second concurrent request met a 401 without any refresh). Verified: an anonymous reload now sends exactly one refresh (still one expected 401); no other endpoint returned 401. |
| Duplicate GETs at load | **Observed, not changed** | `products`, `products?isTepache=true`, `auth/me`, `customers/me/profile` appear twice per load in development only (StrictMode). `recipes` is shared (one request set). Harmless reads; production builds do not double-run effects. |

### Sixth pass — 2026-11-01 (release-readiness review): no new browser journey was run; changes this pass are covered by automated tests only
Added without browser re-test: the logout-during-refresh guard (session epoch; `apiClient.refresh.test.ts`, 10 tests), the delivery-proof secret production check, the `roleGuard` cleanup, the single-answer-edit preservation tests. **Status classification of browser evidence** (full table in `docs/PR_READINESS_AUDIT.md` §P5.6): **VERIFIED in the browser:** C1–C15 (registration, health profile, skip, address, cart, unpaid order, cancel of an unpaid order, duplicate email/phone, label), women-only answers shown/edited/read back, no default exercise answer on sign-up, one refresh per anonymous page load. **PARTIAL:** API-down banner (simulated by failing `fetch`, not a real outage); "unanswered exercise stored as NULL" (needs migration 3 + API restart). **NOT TESTED in the browser:** payment (Razorpay), paid-order cancellation/refund, staff journeys (§X), a real access-token expiry, mobile on a device.

### OUTSTANDING browser checks (NOT TESTED — to run before the PR is judged complete; one session on the pane, a NEW account such as `e2e.customer8@example.test`)
| ID | Check | Steps | Expected | Result |
|---|---|---|---|---|
| O1 | Women-only answer persistence | Register (gender female), complete the health step choosing e.g. Pregnant = No, Breastfeeding = Yes and leave Menopause on "Choose…", save; open Edit Health Data; sign out and sign in again | The three values are shown exactly as saved: No, Yes and **unanswered (Choose…)** — never No by default; a later save that does not touch them keeps them; also check a second account left entirely unanswered shows all three unanswered | **PARTIAL PASS (2026-11-01, `e2e.customer8@example.test`, female, DOB 1992-07-14).** Chose Pregnant = No, Breastfeeding = Yes, left Menopause and the cycle question on "Choose…"; `PUT /customers/me/profile` → 200; after a full page reload the profile read from the API (using the browser session) returned `isPregnant: false`, `isBreastfeeding: true`, and **no `isMenopause` / `menstrualCycle` at all** (unanswered, not No). **Not verified in the UI:** the dashboard's "Edit Health Data" tab has no women-only fields (they appear only in the sign-up health step and in `HealthProfileWizard`, which this session could not open from the dashboard), so a stored answer is never shown back to the customer there. Finding F2, see the audit. Sign-out/sign-in and the "second account fully unanswered" variant were not repeated. |
| O2 | API-down menu banner | With the web app open on the home page, stop the API (user action), reload the page | The menu shows the error banner "…could not be loaded" with a **Retry** button and no static fallback dishes; after restarting the API, Retry loads the menu without a page reload; no console crash | **PASS, simulated (2026-11-01).** The API was NOT stopped (not possible from this session). Instead `window.fetch` was made to fail for `/recipes` and the menu was re-mounted by returning to the home page: the menu showed **"The menu could not be loaded."** with a **Retry** button and **0** recipe dishes (no static fallback). Restoring `fetch` and pressing Retry loaded **23** dishes and removed the banner, without a page reload. A real API outage (process stopped) was not exercised. Console: 58 `401` resource errors over the session (anonymous `/auth/refresh` calls and the manual refresh used for O1); no script errors. |

---
### What needs the Razorpay sandbox (mock payments cannot do this)
The mock provider lives inside the API process and offers no checkout window, so these steps **cannot be completed in this environment**: pay for an order (Pay Now), see a PAID/CONFIRMED order, customer cancellation of a PAID order and its refund, cancellation requests for ACCEPTED/PREPARING/READY orders, delivery code, and any Chef/kitchen/delivery journey that starts from a paid order. They are listed in `docs/SANDBOX_VERIFICATION.md` §A (nine scenarios). Mock payments ARE enough for everything in section A (C1–C15: unpaid orders and their cancellation) and for the unpaid-order expiry (`npm --prefix server run orders:expire-unpaid` after waiting `UNPAID_ORDER_EXPIRY_MINUTES`, set it low only in a throwaway run).

### What can be tested without any payment at all
Registration, phone/date-of-birth validation, health profile persistence, menu/cart/address/checkout up to "Place order", order list/tracking, unpaid cancellation, password reset, and the staff journeys that do not need a paid order (below).

---
## B. Correcting the existing `e2e.customer1@example.test` account (exact steps; no record is edited by hand)
Its phone and date of birth came from the old development prefill and may be `+91 98765 43210` and/or `1995-04-18`.
1. **Inspect (read-only, optional):** in a terminal with `psql` (your own password): `psql "postgresql://postgres:<password>@localhost:5432/pb_ci_test" -c "SELECT u.email, u.phone, cp.dob, cp.gender FROM users u JOIN customer_profiles cp ON cp.\"userId\" = u.id WHERE u.email = 'e2e.customer1@example.test';"`
2. **Sign in as that customer** in the app. It has a password you chose at registration. If you forgot it: "Forgot password?" → the reset link is printed in the API terminal (not emailed) → open it and set a new one (this changes only that account's password, with your approval).
3. Dashboard → **Health profile** → **Edit Health Data**.
4. Set **Mobile Number** to your real number (8–15 digits, optional leading `+`) and **Date of Birth** to the real date; check **Gender**.
5. **Save Changes.** A number already used by another account is refused with a message and nothing is saved.
6. **Reload the page** and confirm the new phone and date of birth persist and the calculated figures (BMR/TDEE/target) have changed to match.
(Everything is validated server-side and the phone change is audited without the number.)

---
## X. Staff journeys (after the customer sequence)
X1. **Get a staff password.** Seeded staff accounts (`admin@proteinbowl.in` Super Admin, `suresh@proteinbowl.in` Chef, `nutritionist@nutrifitkitchen.in`, `trainer@nutrifitkitchen.in`, `procurement@nutrifitkitchen.in`) use the unknown seed password: use "Forgot password?" on the staff sign-in page for an account (the link is printed in the API terminal), or read `SEED_DEFAULT_PASSWORD` from your own `server/.env` (`Select-String -Path server\.env -Pattern '^SEED_DEFAULT_PASSWORD'`).
| # | Role | Journey | Expected | Needs sandbox? |
|---|---|---|---|---|
| X2 | Chef | Recipe Database → add recipe with every field → save → reload | listed with a "Draft" badge | no |
| X3 | Super Admin | Recipe publishing → publish it | moves to Published | no |
| X4 | Customer | Menu | the published recipe appears; unpublish → it disappears | no |
| X5 | Nutritionist | Claim a diet request (customer first requests a plan) → open the client's health profile → build a plan from empty → finalize | blocked until every day has a dish. With a client whose date of birth and gender (male/female) are saved: the "Calorie Target" shows the server-calculated figure and no manual field appears. With a client whose calories cannot be calculated (gender "Other", or no date of birth/gender saved): the target shows "Not calculated", a "Calorie target (kcal per day)" box appears, and finalize is refused until YOU type a target of 500–10000 kcal; exactly that number is sent (never the plan's dish total, never a default) | no (publishing a plan needs no payment; the customer approving/buying it does) |
| X5b | Customer / Nutritionist | Customer registers choosing gender **Other** | health figures show "not available for this selection yet" for the customer; the nutritionist sees calories "Not provided" / "Not calculated: calculationPolicy" and must type a target (see X5) | no |
| X5c | Nutritionist | A customer whose health row was saved BEFORE the no-assumed-age fix (e.g. `e2e.customer1@example.test` if it was created then) | the nutritionist NEVER sees the old stored calories/macros: only figures recalculated from the customer's CURRENT saved date of birth and gender (or "Not provided") | no |
| X6 | Super Admin | Trainer assignments → assign the trainer to the customer | listed | no |
| X7 | Trainer | Create a workout plan for that customer; customer logs progress | persists across reload | no |
| X8 | Procurement | Supplier → purchase order → mark ordered → receive goods | stock increases; over-receipt refused | no |
| X9 | Super Admin | Staff list; invite staff (link shown once); audit log | works; no email claimed | no |
| X10 | Any | Forgot password → open the logged link → new password → old session ends | works | no |
| X11 | Chef / Super Admin | Kitchen routing, accept → prepare → ready, delivery, refunds | needs a PAID order | **yes** |
| X12 | Customer (mobile) | Same as C1–C15 and password reset on a device | needs a device build | external |
