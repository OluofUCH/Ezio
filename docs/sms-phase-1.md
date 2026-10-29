# SMS Phase 1 — migration review and verification

## Status

The additive schema, backfill, cloud compatibility services and test tooling are
implemented and verified. The checks below record the original isolated
PostgreSQL 16.14 verification. The approved foundation migration has since been
applied to live Supabase with the other two SMS migrations. Application deployment
and school backfill remain pending; current progress is recorded in
[sms-live-rollout.md](sms-live-rollout.md). Phases 2–6 are implemented.
The implementation plan is in [sms-implementation-plan.md](sms-implementation-plan.md).

## Completed checks

- Cloud Prisma schema validation and client generation passed.
- Cloud, LAN server and LAN web typechecks passed.
- All 12 database-free tests passed.
- Lint passed with zero errors and 12 warnings in existing code.
- Cloud production build passed with a placeholder database URL; LAN web/server
  builds and the private-client/module-boundary check passed.
- Database integration, CLI backfill, the existing HTTP smoke suites and a real
  hall round trip passed against the isolated test environment. No application
  code fixes were needed during this runtime verification.

### Runtime verification — 2026-10-29

| Check | Result |
| --- | --- |
| Migration over existing CBT data | Passed: stored credentials/PINs, classes, exam content, answers, scores, timestamps and class enum preserved; new Exam links initially null |
| CLI backfill | Dry run, apply and repeated apply passed; the rerun created zero enrollments and changed zero exam links |
| `pnpm test:sms-db` | 7 passed, 0 failed |
| `pnpm smoke` | 42 passed, 0 failed |
| `pnpm smoke-sync` | 48 passed, 0 failed; one existing fixture-dependent cross-class case skipped, covered separately below |
| `pnpm smoke-security` | 66 passed, 0 failed, including production Secure-cookie and authenticated maintenance checks |
| Actual compiled LAN server | 30 setup/offline/upload checks passed |

For migration preservation, the three existing migrations and a completed CBT
sitting were loaded before applying the SMS migration. Before/after fingerprints
matched. The CLI backfill then preserved the legacy CBT data while adding a
matching enrollment and subject link.

For the LAN check, the demo school was backfilled and new candidates were created
through the real single-student and CSV APIs. Both produced matching enrollments;
CSV preview remained read-only, the JS2 alias normalized to JSS2, and a leading-zero
PIN was preserved. The real hall app paired and downloaded its roster and paper.

The cloud application was then stopped. Local login, answer saving, resume,
submission, grading and expiry auto-submission all worked. A failed upload kept
both completed sittings pending. After cloud restart, both uploaded successfully,
cloud re-grading matched, security flags/provenance survived, repeated upload was
a no-op, and the student could read their synced result using the same credentials.

Separate checks rejected a same-school SS1 student's upload against the JSS2 exam
and refused local login for a student outside the staged class. The sync payload
contained no SMS exam links or enrollment data.

The temporary PostgreSQL/SQLite data and verification utilities are outside the
workspace. Temporary test services were stopped after verification; their data
was retained. These checks used only isolated databases; see the live rollout
record for subsequent migration progress.

## Files changed

- Data: `prisma/schema.prisma`, the migration linked below, and `prisma/seed.ts`.
- Tenant enforcement: `lib/tenant.ts` and `lib/tenant-policy.ts`.
- Services: `src/modules/shared/{authorization,transaction}.ts`,
  `src/modules/school-setup/{rules,subjects,legacy-exams,backfill-config,backfill}.ts`,
  and `src/modules/students/{enrollments,service}.ts`.
- Compatibility handlers: `app/api/students/route.ts`,
  `app/api/students/[studentId]/route.ts`, `app/api/students/import/route.ts`,
  `app/api/exams/route.ts`, and `app/api/exams/[examId]/route.ts`.
- Checks: `scripts/backfill-sms.ts`, `scripts/check-lan-boundary.mjs`,
  `tests/tenant.test.ts`, `tests/sms-foundations.test.ts`, and
  `tests/integration/sms-foundations.test.ts`.
- Tooling: cloud/LAN package manifests and pnpm lockfiles, `eslint.config.mjs`,
  `next.config.ts`, `.gitignore`, LAN client generator/import/build configuration,
  and `packaging/windows/build.ps1`. npm lockfiles were replaced by pnpm lockfiles.
- Documentation: this report, the implementation plan, deployment/offline guides,
  and LAN/Windows packaging READMEs.

## Migration for review

[`20261028110000_sms_foundations/migration.sql`](../prisma/migrations/20261028110000_sms_foundations/migration.sql)

It creates AcademicSession, Term, ClassArm, Subject, Enrollment and the minimal
AssessmentComponent table needed by Exam's optional component relation. Every new
model carries schoolId. New tenant-aware foreign keys reject cross-school links.

The only new columns on existing tables are **nullable** Exam.subjectId, termId
and componentId. Exam.subject and Student.classLevel remain in place. Composite
unique keys on existing User/Student IDs support tenant-aware foreign keys. New
partial indexes allow one current academic session per school, one default arm
per level, and one current enrollment per student. These indexes and row checks
are SQL-managed, like the existing active-CBT-attempt index.

The SQL is transactional and contains no data updates, drops or resets. The
AssessmentComponent table starts empty; scheme configuration belongs to Phase 4.
There is no LAN database migration. Any later enrollment cutover constraints need
a separate reviewed migration after the backfill, not another automatically
applied migration bundled before the data is ready.

## Tooling

Use the pinned pnpm version in package.json. The cloud and existing LAN package
retain independent lockfiles/installations (there is no shared pnpm workspace).

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec prisma generate
pnpm --dir local-server install --frozen-lockfile --ignore-scripts
pnpm --dir local-server exec prisma generate
```

The LAN client now generates to local-server/generated/client and resolves via
`#local-prisma`. Its bundle and Windows staging use that private SQLite client,
not pnpm's shared @prisma/client package. Both LAN bundles reject cloud-only module
imports, and the boundary check verifies the runtime-resolved client model list.

## Reviewed rollout order

1. Review the SQL, live migration history, target database and backup. Run
   `pnpm exec prisma migrate status` against the selected target. Check *all*
   pending migrations before permitting `pnpm exec prisma migrate deploy`.
2. Apply the approved migration to the selected test database and run the checks
   below. This documentation is not approval to migrate the live database.
3. After review, migrate the live database and deploy the compatible cloud code.
   Finish replacing older cloud instances before activating a school's backfill;
   old writers cannot maintain the new enrollment history.
4. Review a dry run for each school, then apply its explicit configuration. Rerun
   the dry run and require zero conflicts/missing enrollments/missing subject links.
5. Review Phase 1 before proceeding to management UI or new transition APIs.

## Backfill configuration

Create an operator-owned JSON file with the school's actual values. All six arm
mappings are required, including levels currently without students, so future
legacy imports have an explicit fallback. Do not infer real arms from class level.

```json
{
  "schoolId": "<actual school ID>",
  "session": {
    "name": "<approved current session name>",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD"
  },
  "defaultArms": {
    "JSS1": "<approved arm>",
    "JSS2": "<approved arm>",
    "JSS3": "<approved arm>",
    "SS1": "<approved arm>",
    "SS2": "<approved arm>",
    "SS3": "<approved arm>"
  }
}
```

```powershell
pnpm sms:backfill --config "school-config.json" --dry-run
# Only after reviewing the target and dry-run report:
pnpm sms:backfill --config "school-config.json" --apply
pnpm sms:backfill --config "school-config.json" --dry-run
```

Omitting both mode flags is a dry run. This script never applies migrations.
It refuses a conflicting current session, different existing session dates or
default arms, inconsistent placement, and enrollment history with no current
record. Existing non-default arm placements are preserved when consistent.

Initialization creates the session and all defaults atomically. Student/exam
backfill transactions are individually resumable: earlier committed work stays
if a later record conflicts. Retry only after inspecting the next dry run.
Enrollments record the current placement observed at backfill time; they do not
reconstruct prior years. Existing IDs, registration numbers, PINs and class levels
are not rewritten. No Terms or assessment components are fabricated.

Subject matching folds whitespace and case, but never merges aliases such as
Maths/Mathematics. The original Exam.subject string remains intact. Review the
reported label variants. Existing links that disagree with their label are
reported as conflicts rather than silently replaced.

## Compatibility behavior

- Existing roster creation/import remains admin-only and create-only. With an
  initialized current session, Students and Enrollments commit together; before
  initialization the existing CBT roster behavior is retained.
- Legacy class edits keep the existing open-attempt guard and append placement
  history while updating Student.classLevel in the same serializable transaction.
  A class-only request uses the explicitly configured default arm for that level.
- Legacy exam creation/subject edits resolve Subject references without changing
  the free-text API or school-wide CBT teacher permissions. Metadata freeze rules
  remain enforced after attempts exist.
- The demo seed also respects current enrollment compatibility if already enabled.
- New promotion/transfer/withdrawal APIs, SMS pages/APIs and arm-aware CSV input
  belong to Phase 2 and have not been introduced here.

## Verification

Database-free checks:

```powershell
pnpm exec prisma validate
pnpm typecheck
pnpm lint
pnpm test
pnpm --dir local-server typecheck
pnpm --dir local-server typecheck:web
pnpm build
pnpm --dir local-server build
pnpm check:lan-boundary
```

After migration approval, select an isolated, migrated test database explicitly:

```powershell
$env:SMS_TEST_DATABASE_URL = '<isolated PostgreSQL connection URL>'
pnpm test:sms-db
```

The integration test creates uniquely named fixtures and removes only its own
records. It tests dry-run non-mutation, repeatable backfill, credential/class
preservation, cross-tenant foreign keys, history, open-attempt guards and bulk
rollback. It does not apply migrations or use DATABASE_URL as a fallback.

Run the existing HTTP suites against a separately running, seeded test instance.
In the terminal where SMS_TEST_DATABASE_URL is configured:

```powershell
if (-not $env:SMS_TEST_DATABASE_URL) { throw 'Select an isolated test database first.' }
$env:DATABASE_URL = $env:SMS_TEST_DATABASE_URL
$env:DIRECT_URL = $env:SMS_TEST_DATABASE_URL
$env:NODE_ENV = 'development'
pnpm db:seed
pnpm dev --port 3100
```

In another terminal (with matching seed credentials if you override the defaults):

```powershell
$env:SMOKE_BASE_URL = 'http://localhost:3100'
pnpm smoke
pnpm smoke-sync
pnpm smoke-security
```

These suites write data; the online smoke also consumes seeded students' attempt
limits. Supply fresh test fixtures between runs instead of resetting live data.
For manual verification, log in as staff/student, compare available exams and
existing results, create/import a roster, verify its enrollment/class projection,
and exercise a real hall pull → offline exam → push → cloud results round trip.

## Decisions still required

- Actual per-school session dates and arm mappings before running the backfill.
- Admission-number semantics, cross-school transfer policy and authenticated
  Super Admin SMS school selection before Phase 2.
- A late-LAN-upload strategy before new placement transitions. Current sync still
  validates the student's current class; a heartbeat does not establish that all
  hall results have arrived. This phase does not change that sync contract.
