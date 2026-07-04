# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Alajo Yankee is a community savings platform that modernizes West African Ajo/Susu/Tontine savings traditions for diaspora communities in the US. Members enroll in **contribution pools** with a fixed size, schedule, and amount; once a pool fills, a **rotation** is created with per-member due dates, and members take turns receiving the full pot. Payments are submitted by members and verified by admins or coordinators (members granted pool-scoped admin rights).

It is a full-stack web application with a vanilla JS frontend and a Node.js/Express backend backed by Microsoft SQL Server.

## Commands

```bash
npm install              # Install dependencies
npm run dev              # Start development server with nodemon (auto-reload)
npm start                # Start production server
npm run db:init          # Create / migrate database schema (idempotent, safe to re-run)
npm run db:wipe-runtime  # ⚠️ DESTRUCTIVE — wipe pool/rotation/payment tables (keeps users + lookups)
npm run reminders:run    # Run the contribution due-date reminder job once (3-day + day-of), then exit
```

All scripts pass `--use-system-ca` so Node trusts the OS certificate store (needed when the local network does TLS interception of outbound SMTP/HTTPS).

The server runs on `http://localhost:3000`. There is no build step — the frontend is served as static files from `/client`. There are no test or lint scripts configured.

## Environment Setup

Copy `.env.example` to `.env` and fill in values before running.

**Required:**
- `DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_PORT` — SQL Server connection
- `DB_ENCRYPT=true` for Azure SQL; `DB_TRUST_CERT=true` for local self-signed certs
- `JWT_SECRET` — must be ≥64 chars
- `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS`, `PORT`, `NODE_ENV`, `CORS_ORIGINS`

**Optional (notifications fall back to console-log stubs if missing OR if the npm packages aren't installed — DB rows in `Notifications` are written either way):**
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — Nodemailer email transport
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` — Twilio SMS
- `PUBLIC_URL` — base URL used to build password-reset links in emails
- `REMINDER_HOUR_UTC` — hour (0–23 UTC) the in-process reminder scheduler fires (default 13)
- `REMINDERS_DISABLED=true` — turn the in-process scheduler off (e.g. when an external cron owns it)
- `REMINDER_TRIGGER_SECRET` — shared secret guarding `POST /api/reminders/run`. Unset ⇒ the endpoint returns 503 (disabled). Must match the secret held by the external scheduler.

## Deployment (Azure App Service + GitHub Actions)

Deploys run via `.github/workflows/azure-webapps-node.yml` (build + `azure/webapps-deploy`) on every push to `main`. Runtime config (`SMTP_*`, `DB_*`, `JWT_SECRET`, `REMINDER_TRIGGER_SECRET`, …) lives in **Azure → App Service → Configuration → Application settings**, NOT in the repo — `.env` is local-only and not deployed.

**Reminder job on Azure** — the in-process scheduler (`reminderScheduler.js`) is an `unref`'d daily `setTimeout`, so it only fires if the worker is resident at `REMINDER_HOUR_UTC`. Azure unloads idle workers unless **Always On** is enabled (Basic tier or higher). Two mechanisms keep reminders reliable, and they coexist safely (the job is idempotent via the `ContributionReminder` ledger, so double-firing never double-sends):

1. **Always On** keeps the worker warm so the in-process timer survives to fire.
2. **`.github/workflows/reminders.yml`** — a scheduled GitHub Actions cron (13:00 UTC daily + manual `workflow_dispatch`) that `curl`s `POST {APP_BASE_URL}/api/reminders/run` with the `x-reminder-secret` header. This is the reliable trigger and needs neither Always On nor a warm worker (the request itself wakes the app).

GitHub-side config for the reminder workflow: repo **secret** `REMINDER_TRIGGER_SECRET` (same value as the Azure App Setting) and optional repo **variable** `APP_BASE_URL` (defaults to `https://alajoyankee.azurewebsites.net`; set to `https://alajoyankee.com` for the custom domain — use the hostname that responds 200 directly, not one that 301-redirects, since redirects can drop the POST body/header). GitHub cron is best-effort (can be delayed/skipped), so keeping the in-process scheduler on as a backstop is recommended over setting `REMINDERS_DISABLED=true`.

## Architecture

### Request Flow

```
Browser → Express (app.js)
  ├── Security middleware: Helmet, CORS, rate-limit, body-size limit (10KB)
  ├── /api/* → routes/ → controllers/ → services/ + db.js (mssql)
  └── * → Static files from /client (SPA fallback to index.html)
```

### Backend (`server/`)

| File | Role |
|------|------|
| `app.js` | Express entry point — mounts all middleware and routes |
| `config/db.js` | Connection pool + `query(sql, params)` for one-shot queries; `withTransaction(fn)` (SERIALIZABLE) + `txQuery(tx, sql, params)` for multi-step transactions |
| `config/initDb.js` | Schema + idempotent migrations + lookup-data seed (run via `npm run db:init`) |
| `middleware/auth.js` | `authenticateToken` (JWT) + `requireAdmin` (role gate) |
| `middleware/errorHandler.js` | Global error handler; suppresses stack traces in production; maps SQL `2627`/`2601` (duplicate key) → 409 |
| `services/rotationEngine.js` | Pure date math (next Monday, etc.) + `createRotationForPool(tx, …)` to seed `Rotation` + `RotationDetail` rows |
| `services/notificationService.js` | `sendEmail`, `sendSMS`, `notifyUser`. Lazy-loads `nodemailer`/`twilio`; falls back to console + DB-row stub if either is unavailable |
| `services/reminderService.js` | `sendDueReminders()` — builds + dispatches the 3-day-before and day-of contribution reminders for open rotations. Idempotent via the `ContributionReminder` claim table; skips members who already logged a payment |
| `services/reminderScheduler.js` | In-process self-arming daily timer (`REMINDER_HOUR_UTC`, default 13:00 UTC) that runs `sendDueReminders()`. `start()` is called from `app.js`; disable with `REMINDERS_DISABLED=true`. Same job also runs via `npm run reminders:run` |
| `controllers/reminderController.js` | HTTP trigger for `sendDueReminders()`: `requireReminderSecret` (constant-time shared-secret guard, no JWT — fails closed to 503/401) + `runReminders` (awaits the job, returns its summary). Lets an external scheduler drive the reminder job over HTTP |
| `controllers/` | One file per resource (`auth`, `user`, `contact`, `pool`, `rotation`, `payment`, `notification`, `admin`, `reminder`) |
| `routes/` | Thin route definitions with express-validator rules |

**No ORM** — raw SQL with named parameterized queries through `mssql`. Add tables in `initDb.js` and run `npm run db:init`.

### Database (15 tables)

**Identity / messaging**
- `Users` — accounts; `Role` is `'member'` or `'admin'`; `IsActive` for soft-disable; tracks `Phone` and `LastLoginAt`
- `CoordinatorAssignment` — `(UserID, PoolID)` junction granting admin-style rights scoped to specific pools. A coordinator is a `member`-role user with one or more rows here.
- `ContactMessages` — public contact form
- `RefreshTokens` — schema present, not yet used by app logic
- `PasswordResetTokens` — SHA-256-hashed token, 30-min TTL, single-use

**Pool configuration (lookup tables, admin-managed)**
- `PoolSize` — e.g. `Standard Circle (10 members)`
- `RotationSchedule` — e.g. `Weekly (7 days)`
- `ContributionAmount` — e.g. `$500`

**Pool runtime**
- `ContributionPool` — `Status ∈ {open, filled, completed}`; tied to one row from each lookup table
- `ContributionPoolEnrollment` — `(PoolID, UserID, Rank)` with `UNIQUE(PoolID, UserID)` and `UNIQUE(PoolID, Rank)`
- `Rotation` — created when pool fills; `Status ∈ {started, in-progress, completed}`; one rotation per pool (`UNIQUE(PoolID)`)
- `RotationDetail` — **one row per "collection event" (rank → recipient).** `UserID` is the recipient who collects on `MemberCollectionDate`. N rows per rotation.
- `RotationDetailContribution` — **one row per (collection event × member).** `UserID` is the contributor; `ContributionDueDate` equals the parent's `MemberCollectionDate`. **N×N rows per rotation** — every member contributes on every collection date.

**Payments + notifications**
- `Payments` — `(RotationID, UserID, MemberToBePaid, Amount, Status)`. `UserID` = payer, `MemberToBePaid` = recipient (the rank-K member collecting on this date). `Status ∈ {Pending, Verified, Failed}`. Natural key: `(RotationID, UserID, MemberToBePaid)`.
- `Notifications` — `Type ∈ {Email, SMS}`; `IsSent` + `SentAt` track delivery vs. stub
- `ContributionReminder` — idempotency ledger for due-date reminders. One row per `(RotationDetailContributionID, ReminderType ∈ {'3day','dueday'})` with `UNIQUE(RotationDetailContributionID, ReminderType)`. The daily job "claims" a reminder with an INSERT (duplicate key ⇒ already sent), giving at-most-once delivery across restarts / repeat runs.

### Frontend (`client/`)

11 plain HTML pages (`index`, `about`, `services`, `contact`, `signin`, `signup`, `forgot-password`, `reset-password`, `dashboard`, `join-pool`, `payments`). No framework, no bundler.

- `css/` — split into `base.css`, `layout.css`, `components.css`, `forms.css`, `responsive.css` (breakpoints: 1200px / 768px / 480px)
- `js/main.js` — shared utilities: toast, alert helpers, navbar, `apiRequest()`, `Auth` localStorage helpers, validation helpers
- `js/auth.js` — signup + signin (loaded on those pages only)
- `js/forgot-password.js` / `js/reset-password.js` — token-based reset flow
- `js/dashboard.js` — auth guard, panel switching, overview cards (Total Saved / Active Groups / Next Contribution), notification bell, savings panel
- `js/admin.js` — admin console (loaded on dashboard; activates only when `user.role === 'admin'`)
- `js/join-pool.js` — enrollment form + active-pool list
- `js/payments.js` — pay-now table + payment history
- `js/contact.js` — contact form

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Create account (name + email + phone + password) |
| POST | `/api/auth/login` | — | Sign in, returns JWT |
| POST | `/api/auth/forgot-password` | — | Request reset email (always 200, no enumeration) |
| POST | `/api/auth/reset-password` | — | Consume token + set new password |
| GET | `/api/users/profile` | JWT | Current user profile |
| POST | `/api/contact` | — | Submit contact message |
| GET | `/api/messages` | JWT | Paginated contact messages |
| GET | `/api/pools/options` | JWT | Active lookup data for the enrollment form |
| POST | `/api/pools/enroll` | JWT | Find-or-create open pool, assign rank, fill → start rotation (transactional) |
| GET | `/api/pools/active` | JWT | Caller's active enrollments |
| GET | `/api/rotations/current` | JWT | Caller's `started` / `in-progress` rotations with their `RotationDetail` |
| GET | `/api/rotations/history` | JWT | Caller's `completed` rotations |
| POST | `/api/payments/submit` | JWT | Body `{ rotationDetailContributionID, amount }`. Server derives `MemberToBePaid` from the parent `RotationDetail.UserID`. |
| GET | `/api/payments/mine` | JWT | Caller's payment history + verified/pending totals |
| GET | `/api/payments/pending` | Admin / Coordinator | Pending payments (scoped to assigned pools for coordinators) |
| POST | `/api/payments/verify` | Admin / Coordinator | Mark `Verified` or `Failed` (scoped to assigned pools for coordinators) |
| GET | `/api/notifications/mine` | JWT | Caller's notifications (most recent first) |
| GET | `/api/admin/config` | Admin | All lookup-table rows |
| POST | `/api/admin/config/{pool-sizes,schedules,amounts}` | Admin | Add a lookup row |
| PATCH | `/api/admin/config/{pool-sizes,schedules,amounts}/:id/active` | Admin | Toggle `IsActive` |
| GET | `/api/admin/pools` | Admin / Coordinator | All pools (scoped to assigned pools for coordinators) |
| GET | `/api/admin/rotations` | Admin / Coordinator | All rotations (scoped to assigned pools for coordinators) |
| POST | `/api/reminders/run` | Secret | Fire the due-date reminder job. Guarded by `REMINDER_TRIGGER_SECRET` (via `x-reminder-secret` header or `Authorization: Bearer`), not JWT. Called by the GitHub Actions cron |
| GET | `/health` | — | Server health check |

## Core business logic (PRD §4)

**Enrollment** — `controllers/poolController.enroll` runs inside `withTransaction(SERIALIZABLE)`:
1. Validate the three lookup IDs are real and active.
2. Reject if user is already enrolled in a pool with the same `(PoolSize, Schedule, Amount)` whose status is `open` or `filled`.
3. `SELECT ... FROM ContributionPool WHERE … AND Status = 'open'`. SERIALIZABLE holds range locks on this read so two parallel enrollments cannot both think the pool has a free slot.
4. If no open pool exists, insert one.
5. `Rank = COUNT(enrollments) + 1`; insert `ContributionPoolEnrollment`.
6. If `Rank == PoolSizeValue`, mark pool `filled` and call `rotationEngine.createRotationForPool` (still inside the same transaction).

Defense in depth:
- DB unique constraints `UQ_Enrollment_PoolUser` + `UQ_Enrollment_PoolRank` would surface as 409 via the global error handler if the txn was somehow defeated.
- A defensive `if (nextRank > PoolSizeValue)` guard returns 409 so the user retries.

**Rotation dates** — `services/rotationEngine.computeRotationDates`:
- `RotationStartDate` = next Monday strictly **after** the fill date (filling on a Monday jumps to the following Monday).
- `LastContributionDate` = `StartDate + (PoolSize − 1) × ValueInDays`, snapped forward to a Monday if the schedule isn't a multiple of 7.
- `RotationEndDate` = first Friday strictly after `LastContributionDate`.
- Per-rank `MemberCollectionDate` = `StartDate + (Rank − 1) × ValueInDays`. Each contribution row inherits this same date as its `ContributionDueDate`.

**N×N model** — `services/rotationEngine.createRotationForPool` writes both:
- N `RotationDetail` rows (one per rank) — each row is a *collection event* identifying who receives the pot on that date.
- N×N `RotationDetailContribution` rows — for every collection event × every member, one row identifying that member's obligation to pay on that date. Inserted in the same transaction as the RotationDetail rows.

So a pool of 5 with $500 contribution generates 5 collection events and 25 contribution rows. Each member pays 5 × $500 = $2,500 across the rotation and collects $2,500 once on their own collection date.

**Verification** — `controllers/paymentController.verify` runs inside a transaction:
1. Stamp the payment with `VerifiedBy` and the new status.
2. If `Verified` and rotation is `started`, advance to `in-progress`.
3. If verified-payment count == `RotationDetailContribution` count (i.e. all N×N obligations met), mark `Rotation` and `ContributionPool` as `completed` and notify all members.

## Notifications (PRD §6)

Trigger points already wired:

| Event | Trigger location |
|-------|------------------|
| Welcome | `authController.register` after insert |
| Pool joined | `poolController.enroll` post-commit |
| Rotation started | `poolController.enroll` post-commit, when `filled` |
| Payment verified / failed | `paymentController.verify` post-commit |
| Rotation completed | `paymentController.verify` post-commit, when last verified payment lands |
| Password reset | `authController.forgotPassword` |
| Contribution due in 3 days | `reminderService.sendDueReminders` (daily job) — per member, per upcoming due date |
| Contribution due today | `reminderService.sendDueReminders` (daily job) — per member, on the due date |

The daily reminder job is driven by two coexisting mechanisms — the in-process `reminderScheduler` timer and the `POST /api/reminders/run` HTTP trigger (fired by the GitHub Actions cron). Both call the same idempotent `sendDueReminders`, so running both never double-sends. See **Deployment** above.

Always use `notifyUser({ user, subject, message })` (sends email + SMS in parallel via `Promise.allSettled`) or the lower-level `sendEmail`/`sendSMS`. Notifications are **always fire-and-forget from the request thread** — never `await` them in a request handler; failures are logged, and a `Notifications` row is persisted with `IsSent=0` for retry/audit.

## Extending the API

1. Add controller: `server/controllers/newController.js` — use `query` for one-shot reads/writes, `withTransaction` + `txQuery` when multiple statements must be atomic.
2. Add route file: `server/routes/newResource.js` with express-validator rules. Use `authenticateToken` for member-gated routes and add `requireAdmin` for admin-only routes.
3. Mount in `server/app.js`.
4. If you need new tables, add them in `config/initDb.js` (idempotent `IF NOT EXISTS` for tables; idempotent `IF NOT EXISTS … ALTER TABLE` for column migrations) and run `npm run db:init`.
5. To send notifications from new code paths, `require('../services/notificationService')` and call `notifyUser`.

## Conventions

- Make **at least one admin** per environment by running `UPDATE Users SET Role = 'admin' WHERE Email = '<email>'` directly — there is no in-app role escalation.
- Assign a **coordinator** by inserting into `CoordinatorAssignment` directly — there is no in-app coordinator assignment UI. A coordinator stays `Role='member'` but gains admin-style rights scoped to the assigned pool(s): they see only their pools, rotations, and pending payments in the admin console, and they can verify payments on rotations of those pools. They cannot edit lookup-table configuration. One user can coordinate many pools (one row per pool). Example: `INSERT INTO CoordinatorAssignment (UserID, PoolID) VALUES (42, 17);`. Scope is enforced server-side via `loadCoordinatorScope` + `requireAdminOrCoordinator` middleware.
- New SQL queries must use named parameters (`@name`) and pass types via the `{ type: sql.X, value: … }` shape — never concatenate values into the SQL string.
- All dates touched by the rotation engine are anchored at UTC midnight; do not introduce local-timezone Date arithmetic on them.
- Public-facing error messages must not leak implementation details (e.g. forgot-password always returns the same generic 200 to prevent email enumeration).
