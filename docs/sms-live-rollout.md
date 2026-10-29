# SMS live rollout

Check the configured Supabase target with `prisma migrate status` before every
rollout. Do not run migration deploy until a current backup/snapshot exists and
the matching application build is ready to deploy immediately afterward.

## Rollout record — 2026-10-29

- The operator confirmed a backup and approved the three reviewed SMS migrations.
- All three were applied to live Supabase. All six repository migrations are
  applied, the Prisma schema diff is empty, and the before/after school, student
  and exam inventory is unchanged.
- Path to Success is approved for session `2026/2027`, from `2026-09-01` through
  `2027-07-31`, with arms A/B/C and default A at every level JSS1–SS3. Its config is
  stored outside version control.
- The live dry run reports 18 arms, 5 enrollments, 2 subjects and 2 exam links to
  create, with zero conflicts. No live backfill has been applied.
- Commit/push and matching application deployment must finish before initializing
  the school. Other schools still require their own approved configuration.

## Required inputs

For every school returned by `pnpm sms:inventory`:

- approved current academic-session name, start date and end date
- the real arm list and one default fallback arm for each level JSS1–SS3

Copy `docs/sms-backfill-config.example.json` to an operator-owned file outside
version control for each school. Do not use guessed arm names on live records.

## Deployment sequence

```powershell
# Read-only inventory and status
pnpm sms:inventory
pnpm exec prisma migrate status

# 1. Take and verify a Supabase backup/snapshot.
# 2. Apply only after reviewing all three pending migration.sql files.
pnpm exec prisma migrate deploy

# 3. Deploy the matching application build before activating any school.

# 4. Initialize each school, one at a time.
pnpm sms:backfill --config "<school-config.json>" --dry-run
pnpm sms:backfill --config "<school-config.json>" --apply
pnpm sms:backfill --config "<school-config.json>" --dry-run

# 5. Backfill nullable assessment-component activity.
pnpm sms:backfill-results --school "<schoolId>"
pnpm sms:backfill-results --school "<schoolId>" --apply

# 6. Run health checks and the manual CBT/LAN verification in docs/sms-phases-3-6.md.
```

The future NOT NULL SQL in
`docs/migrations/assessment-component-active-required.sql` is intentionally not a
deployable Prisma migration. Promote it only in a later release after every school
has completed the results backfill and a database-wide null check is clean.

## Rollback

The migrations are forward-only and additive. Rolling back the application does
not roll back the database. If migration application itself fails, stop deployment
and inspect Prisma migration state; do not reset the database. Restore the snapshot
only when forward repair is unsafe.
