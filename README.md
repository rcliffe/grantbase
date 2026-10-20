# Grantbase

A reusable foundation for internal web applications: Next.js App Router, TypeScript, Tailwind CSS, MariaDB via Prisma, and local email/password authentication with server-side sessions and role-based access control.

The first domain feature is **Charities**: a register of charity organisations. Build further features on the same auth, authorisation and data-access layers described below.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components, Server Actions), React 19 |
| Styling | Tailwind CSS 4 with semantic design tokens (`app/globals.css`), light and dark mode |
| Database | MariaDB 11.8 (Docker Compose locally), Prisma 7 with the MariaDB driver adapter, `utf8mb4` everywhere |
| Authentication | [Better Auth](https://www.better-auth.com) 1.7: email/password, database sessions |
| Password hashing | Argon2id (`@node-rs/argon2`, OWASP parameters m=19 MiB, t=2, p=1) |
| Validation | Zod 4, on the server, for every action and CLI input |
| Tests | Vitest, as integration tests against a real MariaDB test database |

### Why Better Auth

- **It is maintained and suits this stack.** It supports Next.js 16, Prisma 7 and MySQL/MariaDB. Lucia, the usual "sessions in your own database" library, is deprecated.
- **It stores sessions in the database.** Auth.js (NextAuth) forces stateless JWT sessions with its Credentials provider, so you can't revoke them on the server. Better Auth stores every session in MariaDB, so sign-out, deactivation and password resets take effect immediately.
- **The pieces that matter can be swapped.** Password hashing is replaced with Argon2id, sign-up is disabled, and role and active-status fields are added to the user model.

Better Auth's HTTP handler (`/api/auth/*`) is deliberately **not mounted**. All flows run through Server Actions calling `auth.api.*`, so:

- no sign-up, admin or password-reset endpoints are exposed;
- Next.js checks the `Origin` of every Server Action request against the `Host`, which provides CSRF protection on top of `SameSite=Lax` cookies.

## Project structure

```
app/                      Routes (UI + Server Action entry points only)
  page.tsx                Public landing page
  sign-in/                Sign-in page and action
  (app)/                  Signed-in area (shared shell: header, sidebar, sign-out)
    dashboard/  account/  forbidden/
    charities/            Charity register (list/search, view, add, edit, delete,
                          CSV export route and import page)
    admin/users/          Administrator-only user management
    grants/               Grants (list with filters and totals, view, add, edit, delete)
    settings/             Grant categories and statuses (pages share settings/_grant-lookups/)
components/
  ui/                     Generic UI primitives (buttons, fields, alerts, cards…)
  shell/                  App chrome: header, sidebar navigation, sign-out
lib/                      Isomorphic, secret-free code: roles, validation, email policy, CSV
server/                   Server-only code (every module imports "server-only")
  env.ts                  Validated environment
  db/client.ts            Prisma client
  auth/                   AUTHENTICATION: Better Auth config, sessions, password hashing,
                          sign-in/out/change-password use-cases, rate limiting
  authz/guards.ts         AUTHORISATION: requireUser(), requireRole(), requireAdmin()
  users/service.ts        User data access + invariants (last admin, session revocation)
  charities/service.ts    Charity data access (search, pagination, unique registration no.)
  charities/csv-import.ts Charity CSV import (validate whole file, then save in one transaction)
  grant-lookups/service.ts Grant categories and statuses (ordering, unique names)
  grants/service.ts       Grant data access (filters, totals, reference checks)
scripts/                  CLI: create administrator, reset password, database backup/restore
prisma/                   Schema and migrations
tests/                    Integration tests
```

### Protecting new pages and actions

Call a guard at the top of **every** protected page, Route Handler and Server Action:

```ts
import { requireUser, requireRole } from "@/server/authz/guards";

export default async function ReportsPage() {
  const user = await requireRole("EDITOR"); // redirects to /sign-in or /forbidden
  // ...
}

export async function saveReport(_prev: FormState, formData: FormData) {
  "use server";
  const user = await requireRole("EDITOR"); // actions are public endpoints: always check
  // validate formData with zod, then call a server/* service
}
```

Layouts and hidden navigation links are **not** a security boundary. The sidebar hides links a role can't use purely for convenience.

Roles form a hierarchy: `ADMINISTRATOR > EDITOR > VIEWER`. `hasRole(role, minimum)` in `lib/roles.ts` is the single comparison.

With Cache Components enabled, anything that reads the session must render inside a `<Suspense>` boundary. **Give each new signed-in route its own `loading.tsx`**, as `dashboard/`, `account/` and the others have. The group-level `app/(app)/loading.tsx` is only a safety net: it doesn't cover navigation between sibling pages, and `next dev` will report such routes as blocking.

## Charities

Each charity has a name, an optional registration number, the year it was established, a brief description, a postal address (two lines, town, county, postcode, country), a contact email and a website. It also records who created and last updated it, and when.

| Action | Minimum role |
| --- | --- |
| View, search, export to CSV | Viewer |
| Add, edit, import from CSV | Editor |
| Delete | Administrator |

These rules live in `CHARITY_PERMISSIONS` (`lib/charities.ts`) and are enforced in every page and Server Action.

Data rules, applied on the server:

- **Registration number:** optional, because exempt and excepted charities have none. It is stored upper-case without spaces, so `sc 012 345` is the same as `SC012345`, and it must be unique when present.
- **Website:** must be an `http(s)` address, and `https://` is added when the scheme is missing. Other schemes (`javascript:`, `data:` …) are rejected, so stored links are safe to render.
- **Email and postcode:** the contact email follows the app's email normalisation; postcodes are stored upper-case.
- **Search:** case-insensitive across name, registration number, town and postcode, with 25 results per page. Input is matched literally, so `%` and `_` are not wildcards.
- **Year established:** four digits, from 1000 to the current year. **Description:** up to 1,000 characters.

### CSV export and import

- **Export** (**Export CSV** on the Charities page, or `/charities/export`) downloads every charity, or only the current search results. The file is UTF-8 with a byte order mark, so Excel opens it correctly. It includes each charity's ID and its created/updated times.
- **Import** (**Import CSV**, `/charities/import`) takes a UTF-8 CSV of up to 2 MB and 5,000 rows. The first row holds column names: the export headers (`Town or city`) or the field names (`town`), ignoring case and spacing. Only `Name` is required.
  - A row with an **ID** updates that charity. A row without one updates the charity with the same **registration number**, or else adds a new charity.
  - Columns missing from the file keep their current values. A column that is present but blank clears the value.
  - Every row goes through the same validation as the form. **Check file** reports what would be created or updated and lists problems by row. **Import** saves the whole file in one transaction, and saves nothing if any row has a problem.
  - Unchanged rows are not rewritten, so re-importing an unedited export changes nothing.
- **Spreadsheet formulas:** exported cells starting with `=`, `+`, `-` or `@` get a leading `'`, so spreadsheet apps show them as text instead of running them. Import removes that apostrophe again.

## Grants

A grant records an application a charity has submitted: its **charity**, **category** and **status**, an optional **purpose** (up to 4,000 characters; lists show its first line), the **date submitted** and **amount requested**, and, once known, the **decision date**, **amount agreed** and **payment date**. It also records who created and last updated it, and when.

| Action | Minimum role |
| --- | --- |
| View, search, filter | Viewer |
| Add, edit | Editor |
| Delete | Administrator |

These rules live in `GRANT_PERMISSIONS` (`lib/grants.ts`) and are enforced in every page and Server Action.

- **Grants** in the sidebar lists all grants, newest first, with search (charity name, registration number or purpose), status and category filters, and totals for the count, amount requested and amount agreed. Totals cover all matching grants, not just the current page.
- Each charity's page lists its grants with totals, and has an **Add grant** button that pre-selects the charity.
- **Amounts** are in pounds to the penny (`DECIMAL(12,2)`). Input such as `2500`, `£2,500.50` or `2 500` is accepted. Amounts are handled as exact decimal strings, never floating-point numbers.
- **Dates** are calendar dates (`DATE`), with no time of day, so they never shift between time zones.
- **Consistency rules:**
  - The decision date can't be before the date submitted.
  - An agreed amount needs a decision date. Record `0` for a declined application.
  - A payment date needs an agreed amount above zero, and can't be before the decision date or the date submitted.
- New grants can only use **active** categories and statuses. A grant keeps an entry that is deactivated later, and can still be edited.
- Charities, categories and statuses that grants refer to **can't be deleted** (the database enforces this with foreign keys). Delete the grants first, or deactivate the category or status instead.

## Grant categories and statuses

Administrators maintain two reference lists under **Settings** in the sidebar (`/settings/grant-categories`, `/settings/grant-statuses`): **Grant categories** (kinds of grant) and **Grant statuses** (the stages a grant moves through). Grants choose from them. Both lists work the same way:

- Each entry has a **name** (unique within its list, ignoring case), an optional **description**, a **badge colour**, and an **active** flag.
- New entries go to the end of the list. The ↑/↓ buttons reorder entries; that order is used wherever the list is shown.
- **Inactive** entries stay on existing grants but won't be offered for new ones. Prefer deactivating to deleting: an entry that grants use can't be deleted.
- When the status list is empty, **Add standard statuses** fills it with Draft, Submitted, Under review, Awarded, Declined, Withdrawn and Closed, which you can then edit.

Only administrators can view or change these lists (`LOOKUP_PERMISSIONS` in `lib/grant-lookups.ts`).

## Local setup

Prerequisites: Node.js 20.9+ (24 recommended), Docker with Compose.

```bash
# 1. Configuration: copy, then replace every placeholder
cp .env.example .env
#    Generate secrets with: openssl rand -base64 32
#    Keep the password/port in DATABASE_URL, SHADOW_DATABASE_URL and TEST_DATABASE_URL
#    in line with the MARIADB_* values.

# 2. Dependencies (also generates the Prisma client)
npm install

# 3. Database (persistent named volume `db-data`; port bound to 127.0.0.1 only)
npm run db:up

# 4. Apply migrations
npm run db:deploy

# 5. Create the first administrator (interactive, password is not echoed)
npm run admin:create

# 6. Start the app
npm run dev        # http://localhost:3000
```

On first start, the database container also creates `<db>_shadow` (for `prisma migrate dev`) and `<db>_test` (for the tests), and grants the app user access to those two only. These init scripts run only when the volume is empty. To start again from scratch, run `docker compose down -v`, which **deletes all data**.

## Database and migrations

| Command | Purpose |
| --- | --- |
| `npm run db:migrate -- --name <change>` | After editing `prisma/schema.prisma`: create and apply a new migration (development) |
| `npm run db:deploy` | Apply pending migrations (CI and production) |
| `npm run db:generate` | Regenerate the Prisma client (runs automatically on `npm install`) |
| `npm run db:studio` | Browse data |
| `npm run db:backup [-- <file>]` | Back up the whole database to `backups/<db>-<timestamp>.sql.gz` (or `<file>`) |
| `npm run db:restore -- <file>` | Replace the whole database with a backup |

All tables use `utf8mb4` / `utf8mb4_unicode_ci`. The server default is set in `docker/mariadb/conf.d/charset.cnf`, and every migration also sets it per table. Every table records `createdAt`/`updatedAt`.

### Backup and restore

`db:backup` and `db:restore` work on the database in `DATABASE_URL`. They use `mariadb-dump` and `mariadb` from the host when installed, and otherwise run them inside the docker compose `db` container. The password reaches the tools in the `MYSQL_PWD` environment variable, never as a command-line argument.

- **Backups** are complete gzipped SQL dumps: schema, data and the Prisma migrations table, taken as one consistent snapshot while the app keeps running. Files are created readable only by you (`0600`), and `backups/` is git-ignored. **They contain password hashes and session tokens**, so store them as carefully as the database itself, and keep copies off the machine.
- **Restore** replaces *everything*, including users, passwords and sessions. It asks you to type the database name to confirm (`--yes` skips this, for scripts), then backs up the current database to `backups/…-before-restore.sql.gz` (`--no-safety-backup` skips this). It then drops every current table and loads the backup. If the backup came from an older version of the app, run `npm run db:deploy` afterwards.

```bash
npm run db:backup
npm run db:restore -- backups/grantbase-20261020-101500.sql.gz
```

Restore isn't atomic: if it fails partway through, restore the safety backup. Stop the app first so nobody writes to the database during the restore.

The `User`, `Session`, `Account` and `Verification` models follow Better Auth's expected field names. Keep those names when extending the models; table names are mapped to snake_case.

## User administration

- **First administrator:** `npm run admin:create`. If an active administrator already exists, it asks for confirmation before creating another.
- **Everything else** happens in the app under **Administration → Users**: creating users (with an initial password), changing roles, deactivating and reactivating accounts, and signing a user out of all sessions.
- **Password reset** (there is no email delivery yet):

  ```bash
  npm run admin:reset-password                    # prompts for the email
  npm run admin:reset-password -- user@example.com
  ```

  This sets a new password and revokes all of the user's sessions.
- **Own password:** users change it on their **Account** page by entering their current password. All of their other sessions are signed out.

Both CLI commands read answers from standard input when it isn't a terminal, so they can be scripted from a secret manager without putting passwords in command-line arguments.

### Rules enforced on the server

- There is no public registration. Only administrators create accounts.
- The last **active** administrator can't be demoted or deactivated. The check locks the administrator rows, so two concurrent demotions can't both succeed.
- Administrators can't deactivate themselves.
- Deactivating a user deletes all of their sessions in the same transaction, and a session-creation hook refuses sessions for inactive users. Session validation also rejects inactive users.
- Emails are normalised (trimmed, Unicode NFC, lower-case) everywhere and are unique.

## Security model

- **Sessions:** a random token is stored in MariaDB and sent in a signed cookie (`gb.session_token`, or `__Secure-gb.session_token` in production). The cookie is `HttpOnly` and `SameSite=Lax`, and `Secure` in production. Every request validates the session against the database; there is no cookie cache.
- **Expiry:** sessions last 12 hours. Server Actions extend a session that is more than an hour old; page views never do. Expired sessions are rejected. Settings are in `server/auth/config.ts`.
- **Sign-in errors** are identical for unknown emails, wrong passwords and deactivated accounts. For unknown emails a dummy hash still runs, to reduce timing differences.
- **Rate limiting** uses fixed windows stored in MariaDB, so it applies across all app instances: 5 attempts per email and 20 per client IP every 15 minutes, plus 5 password-change attempts per user. Bucket keys are SHA-256 hashed, so no raw emails or IPs are stored.
- **Secrets:** password hashes and session tokens are only read inside `server/`. Queries select explicit safe columns, Prisma query logging is off, and CLI and error output never print passwords or connection strings.
- **Headers:** `next.config.ts` sets `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and HSTS in production.

## Development

```bash
npm run dev          # dev server
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm test             # integration tests (needs the database container running)
npm run build        # production build
```

### Tests

The tests run against `TEST_DATABASE_URL`. **They delete all data in it**, so the database name must end in `_test`, or the suite refuses to run. Migrations are applied automatically before the run.

They cover:

- sign-in: cookie flags, generic errors, email normalisation, forged cookies;
- rate limiting per email and per IP;
- sign-out deleting the server-side session;
- expired sessions;
- deactivated accounts, including a surviving session row;
- administrator password reset and self-service password change, both revoking sessions;
- server-side role enforcement in guards and Server Actions, with anonymous, viewer and editor callers;
- the last-administrator rule, including concurrent demotion;
- production cookie and environment rules;
- charities: validation, role enforcement, duplicate registration numbers, search;
- grants: amount and date parsing, consistency rules, role enforcement, active-only categories and statuses, filters, search and totals, and blocked deletes of charities, categories and statuses in use;
- grant categories and statuses: administrator-only changes, unique names, ordering, deactivation and the standard status set;
- CSV reading/writing and formula escaping, export permissions and filtering, and import: creating, matching by ID and registration number, partial columns, all-or-nothing errors, and export → import round trips.

## Production configuration

Required environment variables:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | `mysql://user:pass@host:3306/db`. Use a least-privilege user. |
| `BETTER_AUTH_SECRET` | ≥ 32 random characters. Changing it invalidates all sessions. |
| `BETTER_AUTH_URL` | Public URL. The app refuses to start in production unless it is `https://` (`http://localhost` is allowed for local trials). |
| `TRUSTED_PROXY_COUNT` | Number of reverse proxies that append to `X-Forwarded-For`, usually `1`. With `0` the client can spoof its IP; the per-email limit still applies. |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Required when running more than one instance, so Server Action references work on every instance. |

Deployment outline:

```bash
npm ci
npm run db:deploy
npm run build
npm start            # behind an HTTPS-terminating reverse proxy
```

- Terminate TLS in front of the app. Cookies are `Secure`, so the app only works over HTTPS.
- If a proxy or CDN rewrites the `Host`, configure `serverActions.allowedOrigins` in `next.config.ts`, otherwise the Server Action CSRF check rejects requests.
- Back up the database regularly, e.g. by scheduling `npm run db:backup` and copying the files off the server (see [Backup and restore](#backup-and-restore)). Sessions and rate-limit rows are disposable; users and accounts are not.

## Known limitations

- No email delivery: no self-service password reset, email verification or notifications. Admins reset passwords from the CLI.
- No multi-factor authentication, account-lockout notifications or audit log yet.
- Rate limiting is fixed-window and IP detection depends on `TRUSTED_PROXY_COUNT` being set correctly. The per-email limit can lock a targeted account out for up to 15 minutes; this is the usual trade-off of per-account limits.
- Expired session rows are removed when they are next presented. Rows for sessions that are never presented again stay until cleaned up (`DELETE FROM sessions WHERE expiresAt < NOW()` is safe to schedule).
- Unauthorised pages redirect to `/forbidden` rather than returning HTTP 403. Next.js's `forbidden()` is still experimental.
- The Content-Security-Policy only covers framing, base URI, form targets and plugins. A nonce-based script policy is not configured.
