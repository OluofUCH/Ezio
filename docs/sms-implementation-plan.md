# SMS implementation plan

Status: V1 Phases 1–6 are implemented and verified on isolated databases and
production builds. See `docs/sms-phase-1.md`, `docs/sms-phase-2.md` and
`docs/sms-phases-3-6.md`. Live migration/backfills remain a separate reviewed rollout.

## Existing foundations

- Reuse the cloud Next.js App Router application, PostgreSQL/Prisma database, School
  tenant, staff User accounts, and separate Student identities.
- Reuse email/password staff authentication and school slug + registration number +
  PIN student authentication (`lib/auth`). Student remains a separate principal;
  form teacher is an assignment, not a new role.
- Extend the single Prisma tenant extension in `lib/tenant.ts`. Its existing
  unknown-model pass-through is not suitable for new SMS models.
- Reuse Zod, `lib/api.ts`, `lib/client/api.ts`, the shell and Tailwind design tokens.
- Extend the admin-only student importer (`lib/import/students-csv.ts` and
  `app/api/students/import/route.ts`). It currently accepts CSV/XLSX/XLS, previews
  validation, rejects duplicate registrations, and commits the entire batch.
- Preserve the CBT contracts described in `PRD.md` and `docs/offline-lan.md`.

## Boundaries

SMS pages will live under `app/(sms)/sms/{staff,student}`; SMS APIs under
`app/(sms)/api/sms/{staff,student}`. The literal URL prefixes avoid route collisions.
Handlers stay thin. Services and validation live under `src/modules/{school-setup,
students,staff,attendance,results,cbt-results,announcements,dashboards}` with common
transaction/context utilities in `src/modules/shared`.

Every new model, including joins and audit records, has `schoolId`. Queries use an
authenticated scoped client; tenant-aware foreign keys and service checks enforce
same-school relationships. Teacher writes also require the relevant subject/arm/
session assignment; attendance requires `ClassArm.formTeacherId`. Student reads
inject their own identity and require published results. Announcement queries
require staff authentication, including direct detail requests.

The existing LAN package has its own SQLite schema, Express server and Vite UI.
Keep SMS and cloud Prisma out of its dependency graph, schema, payloads and bundle.
The cloud can reuse portable CBT rules; portable rules cannot import SMS modules.

## Migration and backfill

1. Prepare additive migration SQL and show it before applying it. New columns on
   existing tables start nullable. Do not reset databases or drop existing data.
2. Add AcademicSession, Term, ClassArm, Subject and Enrollment. Introduce a minimal
   AssessmentComponent table now so nullable `Exam.componentId` has a real FK;
   configuration and results behavior belong to Phase 4.
3. Keep `Exam.subject` and add optional subject/term/component links. Preserve
   `Student.classLevel` and the existing JSS1–SS3 enum.
4. Provide a dry-run-by-default, rerunnable, per-school backfill. Require explicit
   session dates and default arm mappings. Create baseline enrollments from the
   current roster and Subjects from existing labels; do not invent old history,
   terms, components or subject aliases. Keep existing student IDs and credentials.
5. Add compatibility writes to the existing cloud roster and exam-label paths so
   data does not drift while later UI phases await review. Schools without an
   initialized academic session continue to use the existing CBT roster behavior.
6. Verify preservation, tenant relationships, enrollment/class consistency and
   rerun behavior. Tighten required constraints only in a later reviewed migration
   after the backfill and compatible writers are deployed. Exam links stay optional.

Enrollments are effective-dated versions, not a unique student/session pair:
intra-session changes must preserve history. A student's current placement is
projected to `Student.classLevel` in the same transaction. Historical/future
enrollments must not silently change the current CBT class.

## Phases

1. **Foundations:** additive schema, migration review, tenant enforcement, backfill,
   compatibility writes, pnpm/lint/test baseline and CBT regression verification.
2. **Management:** academic setup, teacher profiles and assignments, form teachers,
   student bio-data/plain guardian fields/photo/admission number, enrollment
   transitions, and transactional arm-aware bulk import. Add SMS-scoped TanStack
   Query and shadcn/ui components using the existing design tokens.
3. **Attendance:** PRESENT/ABSENT/LATE, unique enrollment/date records, form-teacher
   authorization, date/term validation and per-term/own-student summaries.
4. **Results:** components totaling 100, grade bands, decimal scores, per-arm/subject/
   term DRAFT → SUBMITTED → APPROVED → PUBLISHED workflow, approval locking,
   ScoreAuditLog, tied positions, report snapshots/remarks and authorized PDF export.
   Admin corrections must update affected totals, ranks and report output together.
5. **CBT bridge:** linked exam metadata, BEST/LAST imports into the correct term's
   enrollment, assignment checks, two-decimal scaling and atomic lock checks.
   Missing attempts stay blank. Manual overrides flip CBT source to MANUAL and are
   audited. Finalized online attempts qualify; offline attempts qualify after sync.
6. **Announcements/dashboards:** staff-only role/arm audiences; admin enrollment,
   attendance and submission metrics; teacher assignment/action summaries; student
   own published results and attendance.

Each phase reports changed files, migrations, manual verification, check results
and unresolved decisions, then stops for review.

## Conflicts and decisions

- This checkout uses npm lockfiles, custom UI and `useApi`; shadcn/ui, TanStack
  Query, lint and a unit-test runner are not configured. Introduce these in the
  phases above. pnpm must retain independent cloud/LAN generated clients; Windows
  staging currently assumes npm's `node_modules/.prisma` layout.
- The default session/arm mapping must be supplied by the operator. Admission
  number versus existing login registration number, and transfer semantics, need
  confirmation before the management phase.
- Current cloud sync compares the exam class with the student's current class
  before idempotency handling. Promotion can reject late uploads or retries.
  Agree a cloud-side historical eligibility strategy and rollout procedure before
  enabling new placement-transition APIs. Heartbeats cannot prove a hall is empty.
- Super Admin's existing CBT selector uses a validated query parameter. Phase 2A
  adds an owner-bound signed school-selection cookie for SMS data requests while
  preserving the existing CBT authentication/selection behavior.
- Exam total points are calculated from Questions, not stored on Exam. Attempt
  maxScore is a historical snapshot. The bridge must detect denominator mismatch.
  Online attempts normally have null syncedAt and must not be excluded by a
  blanket non-null filter.
- Before results/bridge implementation, confirm ranking convention (proposed
  1, 2, 2, 4), missing-mark and approval-completeness rules, correction/publication
  policy, BEST/LAST tie-breaks, and the definition of a finished exam.
- Student photo storage and the PDF renderer are new integrations to settle in
  their respective phases. Published report snapshots must retain historical
  component and grade-band meaning.

## Verification

After each phase run pnpm typecheck, lint, unit tests, smoke, smoke-sync and
smoke-security, plus LAN server/web typechecks. Run cloud/LAN build and packaging
boundary checks when their inputs change. The existing HTTP smoke suites modify
data and consume attempts: use isolated, repeatable fixtures, not live school data.

Cover tenant/relationship and cross-class denials, student announcement/publication
denials, enrollment/class projection and import rollback, grading/rounding/ties,
workflow/lock races, and CBT selection/sync/provenance. Database-dependent checks
wait for review of the migration and an explicitly selected test database.
