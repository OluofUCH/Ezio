# SMS Phases 3–6 — implementation and verification

Status: implemented and verified against isolated PostgreSQL databases and real
production builds. All three approved SMS migrations have since been applied to
live Supabase. Application deployment and live school backfills remain pending;
see [sms-live-rollout.md](sms-live-rollout.md) for the rollout record.

## Phase 2 completion

The remaining Phase 2 work now includes:

- teacher account creation/activation, optional phone and qualification profiles,
  teaching assignments and form-teacher designation
- student bio-data and plain guardian fields, size-limited database photos,
  admission/registration number continuity and PIN preservation
- enrollment history for admission, promotion, repeat, arm transfer, withdrawal
  and transfer out; receiving schools create their own tenant-owned student record
- academic-session rollover that refuses incomplete staged placements and keeps
  Student.classLevel synchronized with the activated enrollment
- arm-aware CSV/XLSX import using an optional `arm` column, with default-arm fallback

## Phase 3 — attendance

- PRESENT/ABSENT/LATE roll calls are unique per enrollment/date.
- Teachers can mark only arms where they are the current form teacher. School
  administrators can review/correct all arms.
- Dates must be within the selected term and not in the future.
- Rosters are resolved from effective-dated enrollment history for the attendance
  date; transferred or withdrawn students do not silently move old marks.
- Staff dashboards and student records show term summaries. Late counts as attended
  for the attendance-rate metric; empty summaries remain blank rather than zero.

## Phase 4 — results and report cards

- Assessment components are configurable and validated to total exactly 100.
- Active grade bands must cover 0.00–100.00 without gaps/overlaps.
- Each term freezes a JSON policy snapshot the first time scores are entered, so
  later school configuration changes cannot reinterpret historical reports.
- Scores use two-decimal decimal arithmetic. Teachers are checked against their
  active teacher account and exact session + arm + subject assignment.
- Per-subject workflow is DRAFT → SUBMITTED → APPROVED → PUBLISHED. Every student
  in the term-end arm roster must have every component before submit/approval.
- Approved/published scores are teacher-locked. Admin corrections require a reason,
  write ScoreAuditLog and atomically recompute affected reports while preserving
  publication status, per the approved policy.
- Report cards finalize once all subjects assigned to the arm/session are approved.
  Competition ranking is 1,2,2,4. Snapshots retain component, grade-band, student,
  class and school meaning. Reports support remarks and authorized Unicode PDF export.
- Students can query/download only their own PUBLISHED report cards.

## Phase 5 — CBT results bridge

- Existing Exams can be linked to a Subject, Term and optional default component.
- BEST or LAST finalized attempts are scaled as
  `session.score / current exam total * component maxScore`, rounded half-up to two
  decimals. BEST ties retain the latest attempt. Online attempts qualify normally;
  offline attempts qualify only after cloud sync.
- Students without attempts remain blank. Historical denominator mismatches,
  out-of-term sittings, missing enrollment and locked targets are reported/skipped.
- CBT score provenance stores exam, sitting and sync version. Re-import is idempotent.
  Manual correction flips source to MANUAL and adds an audit record.
- OfflineRosterGrant records exactly which class roster a hall downloaded. Late
  uploads from a student subsequently promoted/withdrawn are accepted only when a
  grant or historical enrollment proves eligibility. Reconciliation now checks
  idempotency before class eligibility and atomically compare-and-sets syncVersion.

## Phase 6 — announcements and dashboards

- Announcements are staff-only and target ALL_STAFF, a staff role, or staff attached
  to a class arm through form-teacher/teaching assignments. Student endpoints always
  return 403, including direct detail attempts.
- Admin dashboard: enrollment counts, attendance rate, and result progress per teacher.
- Teacher dashboard: assigned class/subjects, form arms and score-entry status.
- Student dashboard: current placement, own published reports/PDF and attendance.

## Routes and modules

Pages are under `app/(sms)/sms/{staff,student}`. APIs are under
`app/(sms)/api/sms/{staff,student}`. Core services are under:

- `src/modules/students`, `staff`, `attendance`, `results`, `cbt-results`
- `src/modules/announcements`, `dashboards`, `school-setup`, `workspace`
- shared tenant/auth/context/transaction logic under `src/modules/shared`

The LocalServer schema, Vite UI and routes contain no SMS models or code. Only the
existing portable CBT modules remain shared.

## Migrations and backfills

Reviewed migrations:

1. `20261028110000_sms_foundations`
2. `20261029120000_sms_staff_assignments`
3. `20261029180000_sms_remaining_modules`

The third migration creates new tables/enums and adds only nullable
`AssessmentComponent.isActive` to an existing table. It performed no destructive
operation and preserved every existing row in migration verification.

Backfills:

```powershell
pnpm sms:backfill --config '<school-specific-config.json>' --dry-run
pnpm sms:backfill --config '<school-specific-config.json>' --apply
pnpm sms:backfill-results --school '<schoolId>'
pnpm sms:backfill-results --school '<schoolId>' --apply
```

The results backfill was verified: dry run made no write; apply changed legacy null
component activity values to true. Do not add/apply the later `isActive NOT NULL
DEFAULT true` migration until every live school reports zero null rows. Keeping that
constraint out of this migration chain is deliberate: `prisma migrate deploy` cannot
pause between pending migrations to run a school-specific backfill.
The guarded future SQL is shown at
[`docs/migrations/assessment-component-active-required.sql`](migrations/assessment-component-active-required.sql);
it is intentionally not part of the deployable Prisma migration chain yet.

## Verification summary

| Check | Result |
| --- | --- |
| Schema migration preservation | All existing rows preserved; Prisma diff empty |
| Unit tests | 31 passed |
| Database/API integration | 38 passed across five suites |
| Existing online CBT smoke | 42 passed |
| Existing cloud/LAN sync smoke | 48 passed |
| Existing security smoke | 66 passed |
| SMS browser coverage | 31 scenarios passed across calendar/setup/full portals |
| Automated desktop/mobile accessibility | Zero violations in inspected flows |
| Cloud production build | Passed, 55 routes/pages generated |
| LAN web/server production build | Passed |
| LAN private-client/SMS exclusion check | Passed |

Integration checks covered cross-tenant IDs/FKs, teacher/class permissions,
student announcements denial, workflow transitions, completeness/locking races,
audit/provenance, tied ranking, grade boundaries, PDF generation, arm imports,
withdrawal/rollover and actual late offline reconciliation after transfer out.

The sync smoke's fixture-dependent cross-class case remains skipped because the
pulled roster intentionally contains only the exam class. Dedicated integration
tests exercise both wrong-class rejection and historically-authorized late upload.

## Manual verification

1. Migrate an isolated test/staging database and run both backfill dry runs.
2. Configure one school: session/terms, six default arms, subjects, teachers and assignments.
3. Import an arm-aware roster; upload a photo; promote/repeat/transfer/withdraw test students.
4. Sign in as a form teacher and mark attendance. Verify another teacher is denied.
5. Configure CA/Exam components and grade bands. Enter complete marks, submit,
   approve all arm subjects, publish, correct one score as admin and inspect audit/revision.
6. Download the report PDF as staff and as its student; try another student ID and
   an unpublished report and confirm denial.
7. Link a finished exam, import BEST then repeat; confirm no duplicate and provenance.
8. Post each announcement audience. Confirm intended staff see it and students get 403.
9. Repeat the documented real hall pull → offline sitting → push round trip before rollout.

## Residual rollout decisions

- Path to Success session dates and A/B/C arms with default A are approved; obtain
  explicit configuration before initializing any additional school.
- Optional `arms` lists create all known arms while `defaultArms` selects the
  fallback used by level-only legacy imports/actions.
- Review report-card visual branding/content with a real school before production printing.
- Promote the deferred `AssessmentComponent.isActive` constraint migration only
  after live backfill verification.
