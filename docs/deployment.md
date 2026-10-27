# Cloud Deployment

How to deploy the online CBT platform: the Next.js API/UI, Supabase Postgres, and the
scheduled maintenance job. For the offline hall machine, see
[`../packaging/windows/README.md`](../packaging/windows/README.md) and
[`offline-lan.md`](offline-lan.md).

The cloud is the system of record. The hall server is a cache plus an upload queue; it
is never exposed to the internet and never holds the only copy of a submitted result
after a successful push.

---

## 1. Prerequisites

- Node.js 20 or newer.
- A Supabase project (or any PostgreSQL 14+ database).
- A host for the Next.js app: Vercel is the intended target, but any Node host works.
- A generated JWT secret and a cron secret.

Generate secrets locally:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Use a different value for each secret. Never commit `.env`.

---

## 2. Environment

Copy `.env.example` to `.env` for local work, and set the same variables in the hosting
provider for production.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Pooled Postgres connection used by the app. On Supabase use port `6543` with `pgbouncer=true&connection_limit=1`. |
| `DIRECT_URL` | Yes | Direct/session connection used by Prisma Migrate and the seed. On IPv4-only networks use the session pooler on port `5432`. |
| `JWT_SECRET` | Yes | Signs staff and student sessions. At least 32 characters. Rotating it signs everyone out. |
| `STAFF_SESSION_TTL` | No | Staff session lifetime, default `8h`. |
| `STUDENT_SESSION_TTL` | No | Student session lifetime, default `6h`. Keep it longer than the longest exam. |
| `MAX_UPLOAD_BYTES` | No | Maximum `.xlsx`/`.csv` upload size, default 2 MiB. |
| `MAX_IMPORT_ROWS` | No | Maximum rows per bulk import, default 500. |
| `TRUST_PROXY` | Production behind a proxy | Set to `1` on Vercel or any reverse proxy so login throttling uses the real client IP. |
| `CRON_SECRET` | Yes for cron | Bearer secret required by `GET /api/maintenance`. |
| `SEED_SUPER_ADMIN_EMAIL` | Seed only | Bootstrap super-admin email. |
| `SEED_SUPER_ADMIN_PASSWORD` | Production seed | Must be unique, at least 12 characters, and not the sample value. |
| `SEED_DEMO_PASSWORD` | Dev seed only | Password for the demo school accounts. Never set in production. |
| `SEED_DEMO_DEVICE_KEY` | Dev seed only | Fixed device key for the demo hall. Never set in production. |
| `SMOKE_BASE_URL` | Smoke tests only | Base URL the smoke scripts call. |

Notes:

- The `DATABASE_URL` pooler must include `pgbouncer=true`. Without it Prisma's prepared
  statements fail on the Supabase transaction pooler.
- Prisma Migrate cannot run through the transaction pooler. It uses `DIRECT_URL`.
- Supabase's `db.<ref>.supabase.co` direct host is IPv6-only. On an IPv4-only network,
  point `DIRECT_URL` at the session pooler on port `5432` instead.
- Set `TRUST_PROXY=1` only when a trusted proxy overwrites `X-Forwarded-For`. Otherwise
  a caller can choose their own throttle bucket.

---

## 3. Database setup

Run these against the production database from a trusted machine or a CI job. Do not
run the seed with the default `NODE_ENV` unless you intend to create demo data.

```bash
npm ci
npx prisma migrate deploy
```

Then create the first platform super admin. On PowerShell:

```powershell
$env:NODE_ENV='production'
$env:SEED_SUPER_ADMIN_PASSWORD='<unique-password-at-least-12-chars>'
npm run db:seed
```

With `NODE_ENV=production` the seed skips the demo school, demo students and demo hall,
and refuses to continue if the super-admin password is weak or still the sample value.
Sign in as that account immediately and change the password from the account page.

Do not run `npm run db:seed` with `NODE_ENV` unset against production: that path creates
the demo school and predictable demo credentials.

---

## 4. Build and deploy

```bash
npm ci
npm run build
npm start
```

The production build performs `prisma generate` and `next build`. The app requires the
Node.js runtime (not the Edge runtime) for Prisma, bcrypt and SheetJS.

### Vercel

1. Import the repository and set the environment variables from section 2.
2. Set `TRUST_PROXY=1`.
3. Deploy. `vercel.json` schedules `GET /api/maintenance` daily at `03:17` UTC.
4. Set `CRON_SECRET` in the project; Vercel sends it as a Bearer token to the cron.
5. Use `/api/health` as the uptime check. It returns `200` only when the app can reach
   Postgres.

### Any Node host

Run `npm run build` then `npm start` behind TLS. Put a reverse proxy in front and set
`TRUST_PROXY=1` only if the proxy strips and rewrites `X-Forwarded-For`. Allow outbound
access to Supabase; no inbound access is needed beyond HTTPS.

---

## 5. First-run checklist

1. `GET /api/health` returns `200`, `ok: true`, `database: "up"`.
2. Sign in as the super admin and change the password.
3. Create the school and its school admin.
4. Confirm the school admin can sign in and sees only that school.
5. Provision a hall from **Local servers**, copy the one-time setup code, and pair the
   hall machine at `http://localhost:4000/setup`.
6. Publish an `OFFLINE_LAN` or `HYBRID` exam and pull it onto the hall machine while it
   has internet.
7. Run an end-to-end test sitting, push the result, and confirm it appears in the
   invigilation/results view with offline provenance.
8. Confirm `GET /api/maintenance` returns `401` without the cron secret and `200` with it.

---

## 6. Security controls in the deployed app

- Security headers and CSP are set in `next.config.ts` for every route.
- Staff and student sessions are HttpOnly, SameSite=Lax cookies. In production they are
  also `Secure`; TLS is required.
- Staff login is throttled per account and per IP; pairing-code claims are throttled per
  IP and per code. Expired throttle rows are purged by the maintenance cron.
- Setup codes are short-lived, single-use, hashed at rest, and returned once.
- Device keys are hashed at rest, shown once, and can be rotated or revoked immediately
  from the dashboard.
- `AuditLog` records credential and provisioning events. It is append-only and is not
  exposed through a public API.
- Sync trust is one-way: the device supplies selections and timestamps, and the cloud
  re-grades against its own answer key. Device-supplied scores are rejected as malformed.
- The hall server binds to the school LAN only. Do not port-forward it or expose it to
  the internet.

---

## 7. Upgrades and rollback

Before a schema change:

1. Take a Supabase backup or snapshot.
2. Apply migrations with `npx prisma migrate deploy`.
3. Deploy the matching application build.
4. Verify `/api/health` and the first-run checklist.
5. Run the smoke suite against a staging database (see below).

Prisma migrations are forward-only; rolling back the app does not undo a migration. If a
release must be reverted after a destructive migration, restore the database snapshot.
Prefer additive migrations so the previous app version can keep serving during a
rolling deploy.

Hall machines do not need a manual database reset. The local server applies SQLite
migrations on startup and baselines a database created by an older `prisma db push`
release. Never re-image a hall machine while the admin console reports sittings awaiting
upload.

---

## 8. Verification and smoke tests

Run these against a seeded, non-production database, never against production:

```bash
npm run smoke           # exam flow, tenant and class-level isolation
npm run smoke-sync      # provisioning, pull, push, re-grading, idempotency
npm run smoke-security  # headers, cookies, pairing, rotation, throttles
```

`smoke-security` exercises the maintenance endpoint only when `CRON_SECRET` is set.
Set `SMOKE_EXPECT_SECURE=1` when the server runs with `NODE_ENV=production` so the
session cookie's `Secure` attribute is required.

For a throwaway check on Supabase, apply the migrations to a temporary schema and seed
that schema instead of the public schema. Drop the schema afterwards. The cloud is the
system of record; do not point the smoke tests at live school data.

---

## 9. Troubleshooting

- **`prepared statement` or pooler errors**: `DATABASE_URL` is missing
  `pgbouncer=true` or is using the direct port where the pooler is required.
- **`prisma migrate` cannot reach the database**: it uses `DIRECT_URL`; check the
  direct/session endpoint and IPv4/IPv6 reachability.
- **429 on every login from one network**: `TRUST_PROXY` is unset or the proxy is not
  sending `X-Forwarded-For`; all callers share the `unknown` bucket.
- **`/api/maintenance` always 401**: `CRON_SECRET` is unset or does not match the
  Authorization header.
- **A hall cannot sync**: check the device key prefix and `isActive` in the dashboard.
  Rotation invalidates the old key immediately; the hall must be reconfigured before it
  can push.
- **Results stuck on a hall machine**: run `npm run push` from the hall server. Rejected
  sittings stay on the machine intentionally; the reason is printed. Do not wipe or
  re-image the machine until the push succeeds.
