# SMS Phase 2 — small increments

## 2A: SMS school context and calendar APIs

Status: implemented and verified. The calendar screen and its client integration
are now implemented in 2B below.

### Endpoints

| Method | URL | Purpose |
| --- | --- | --- |
| POST | `/api/sms/staff/school-context` | Super Admin selects an existing school through a signed, owner-bound cookie |
| GET | `/api/sms/staff/academic-sessions` | List the authenticated school's sessions and their terms |
| POST | `/api/sms/staff/academic-sessions` | Create an academic session with `isCurrent: false` |
| POST | `/api/sms/staff/academic-sessions/[sessionId]/terms` | Create a term inside a same-school academic session |

All routes live in `app/(sms)`. School administrators use the school attached to
their live staff account. Super Admin selects a school through an authorized
endpoint; subsequent data requests derive schoolId from the signed selection,
not a URL/body parameter. The selection cookie cannot authenticate on its own,
cannot be reused by another account, and cannot retarget a school administrator.
Live role/account changes are rechecked on every request. Super Admin retains
management of inactive schools; inactive school accounts are refused.

Session and term inputs reject schoolId, activation flags and nested data. Dates
must be real YYYY-MM-DD dates in ascending order. Terms must lie inside their
session, have unique names/order, and cannot overlap, including concurrent writes.
Shared serializable transactions and the existing tenant client enforce these rules.

Current-session switching belongs with class-arm/enrollment initialization and
rollover. Calendar creation alone cannot change the current session or CBT class
placement. No migration was added for this increment.

### Files

- `app/(sms)/api/sms/staff/school-context/route.ts`
- `app/(sms)/api/sms/staff/academic-sessions/route.ts`
- `app/(sms)/api/sms/staff/academic-sessions/[sessionId]/terms/route.ts`
- `src/modules/shared/{school-context,school-scope-token,calendar-date}.ts`
- `src/modules/shared/authorization.ts`
- `src/modules/school-setup/{calendar,calendar-validation,backfill-config}.ts`
- `tests/sms-calendar.test.ts`
- `tests/integration/sms-calendar.test.ts`
- `package.json` (`test:sms-calendar` command)

### Verification

- Typecheck: passed.
- Lint: zero errors; 12 warnings in existing code.
- Unit tests: 16 passed.
- Calendar route/database tests: 7 passed.
- Existing SMS foundation database tests: 7 passed.
- Production Next.js build: passed, including all three new route registrations.
- LAN module/private-client boundary check: passed.

The database tests used the retained isolated PostgreSQL instance and invoked the
real route handlers with signed staff/student tokens. They covered tenant spoofing,
foreign parent IDs, student/teacher denials, invalid/overlapping dates, concurrent
terms, cookie ownership, role changes and account/school deactivation. The bounded
test run stopped its database afterward. Live Supabase data was not used.

Run these against an explicitly selected, Phase-1-migrated test database:

```powershell
pnpm typecheck
pnpm lint
pnpm test
$env:SMS_TEST_DATABASE_URL = '<isolated test database URL>'
pnpm test:sms-calendar
pnpm test:sms-db
```

### Manual API check

Use the existing staff login on a test instance. A Super Admin first posts
`{"schoolId":"<school ID>"}` to `/api/sms/staff/school-context` and retains the
returned HttpOnly cookie. School admins need no selection step.

1. POST a session with `name`, `startDate` and `endDate`; expect 201 and
   `isCurrent: false`.
2. POST a term under the returned session ID with those three fields plus
   `orderIndex`; expect 201.
3. GET the session list; expect the term nested under its session.
4. Try a term outside the session dates, a duplicate order, or overlapping dates;
   expect 409. A foreign school's session ID must return 404.
5. Repeat calendar requests with a teacher or student session; expect denial.

## 2B: Calendar screen and school selector

Status: implemented and verified. Open **School setup** from an administrator's
CBT sidebar, or visit `/sms/staff/calendar` on a migrated instance.

### Delivered

- Server-guarded SMS layout using the existing AppShell and staff authentication.
- Session/term lists, empty/loading/error states, retry controls, and creation forms.
- SMS-scoped TanStack Query and shadcn/ui Button/Input/Label primitives adapted to
  existing Tailwind tokens. Input dates remain calendar dates across time zones.
- Searchable, paginated Super Admin school selection backed by the signed cookie.
  School changes cancel/remove previous calendar queries and reset open forms.
- A request-context precondition protects against another tab switching school or
  account while a form is open. `x-sms-context` can only reject a stale request;
  authentication and tenant scope still come from the verified session/cookie.
- Shared shell skip link, one primary heading, mobile focus trapping/restoration,
  inert background content, and reduced-motion handling.

No migration was added. Session activation still belongs to class-arm/enrollment
setup; creating a session does not switch the student's current placement.

### Files added/updated for 2B

- `app/(sms)/sms/staff/{layout.tsx,calendar/page.tsx}`
- `src/modules/school-setup/ui/{CalendarScreen,CalendarForm,SchoolSelector}.tsx`
- `src/modules/school-setup/ui/types.ts`
- `src/modules/shared/ui/SmsWorkspace.tsx`
- `src/modules/shared/{context-key,page-context,school-context}.ts`
- `components/ui/{button,input,label}.tsx`, `lib/utils.ts`, `components.json`
- `components/shell/AppShell.tsx`, `components/ui/Spinner.tsx`, `app/staff/layout.tsx`
- `lib/client/api.ts`, `tailwind.config.ts`, package manifest and pnpm lockfile
- `tests/integration/sms-calendar.test.ts` (stale-context protection)

### 2B verification

| Check | Result |
| --- | --- |
| Typecheck / production build | Passed; `/sms/staff/calendar` registered |
| Lint | Zero errors; 12 warnings in existing code |
| Unit tests | 16 passed |
| Calendar API/database tests | 8 passed |
| Foundation database regression | 7 passed |
| Real browser UI scenarios | 13 passed |
| Automated accessibility audits | Zero violations on desktop and at 320px |
| LAN private-client/module boundary | Passed |

Browser scenarios covered session and term creation, inline validation/focus,
server error recovery, retry, mobile navigation, cache/draft clearing on school
switch, cross-tab stale-write rejection, and teacher/unauthenticated page guards.
Screenshots were reviewed on desktop and mobile. Tests used isolated fixtures and
the temporary database; browser and server processes were stopped afterward.

### Manual UI verification

1. Sign in as School Admin, open **School setup**, and confirm the school name.
2. Add a session with its name/dates, then add a term. Confirm the lists update and
   the new session is marked **Not current**.
3. Submit reversed dates or an overlapping term; confirm clear feedback and that
   entered values remain available to correct. Cancel should restore focus.
4. Sign in as Super Admin, search/select a school, then change schools. Confirm
   the previous calendar and any open draft disappear.
5. Change the selected school in a second tab while the first has an open form.
   The first form must request a reload instead of writing to the other school.
6. At mobile width, open navigation with the keyboard, cycle Tab/Shift+Tab, and
   close with Escape. Focus should return to the navigation button.

## 2C: Class arms and subjects

Status: implemented and verified. Open **Classes & subjects** in the SMS sidebar,
or visit `/sms/staff/classes-subjects`.

### Delivered

- List and create class arms with a required JSS1–SS3 level and arm name.
- Explicit default-arm selection per level, with one default enforced by a
  serializable transaction and the existing partial unique index. This changes
  the fallback for future level-only roster entries after SMS initialization;
  it does not move existing enrollments or change Student.classLevel.
- List and create subjects, showing the number of linked CBT exams. Case and
  whitespace normalization matches existing CBT subject resolution; aliases such
  as Maths/Mathematics remain distinct, and exam labels are preserved.
- Admin-only APIs with authenticated tenant/context checks, duplicate handling,
  and concurrent-write protection.
- School switching now clears all school-scoped query data and drafts across the
  calendar and class/subject pages. The global school directory remains separate.
- Inline forms, keyboard focus restoration, mobile layout and accessible feedback.

This slice uses the existing models; **no migration was added**. Session
activation, form-teacher assignment and student placement changes belong to their
subsequent workflow increments.

### Endpoints

| Method | URL | Purpose |
| --- | --- | --- |
| GET / POST | `/api/sms/staff/class-arms` | List/create class arms |
| POST | `/api/sms/staff/class-arms/[armId]/default` | Set the default for this arm's level; body is `{}` |
| GET / POST | `/api/sms/staff/subjects` | List/create subjects |

### Files added/updated for 2C

- `app/(sms)/api/sms/staff/class-arms/{route.ts,[armId]/default/route.ts}`
- `app/(sms)/api/sms/staff/subjects/route.ts`
- `app/(sms)/sms/staff/classes-subjects/page.tsx`
- `src/modules/school-setup/{structure,structure-validation}.ts`
- `src/modules/school-setup/ui/{StructureScreen,StructureForm}.tsx` and `types.ts`
- `src/modules/shared/ui/SmsWorkspace.tsx` and `SchoolSelector.tsx`
- `tests/sms-structure.test.ts`, `tests/integration/sms-structure.test.ts`
- `package.json` (`test:sms-structure` command)

### 2C verification

| Check | Result |
| --- | --- |
| Typecheck / production build | Passed |
| Lint | Zero errors; 12 warnings in existing code |
| Unit tests | 18 passed |
| Class-arm/subject API and database tests | 7 passed |
| Calendar API regression | 8 passed |
| Foundation database regression | 7 passed |
| Browser UI scenarios, including calendar regression | 21 passed |
| Desktop and 320px accessibility audits | Zero violations |
| LAN private-client/module boundary | Passed |

Tests proved that concurrent default changes leave exactly one default, existing
student/enrollment records remain unchanged, and new level-only roster entries use
the selected default. Subject creation reused the existing CBT identity without
rewriting its label. Browser checks covered duplicate feedback, default selection,
school switching, stale subject-write rejection and role guards. A rapid-form
focus-restoration race found during verification was fixed before the passing run.
Temporary fixtures/services were cleaned up; live Supabase data was not used.

### Manual verification

1. Sign in as School Admin and open **Classes & subjects**.
2. Add JSS2 arms A and B. Set A as default, then B; exactly one should be marked
   **Default**. Existing enrollments should keep their original arm.
3. Try adding JSS2 A again with different casing; expect a duplicate error.
4. Add a subject, then repeat its name with different case/spacing; expect a
   duplicate error and retained form values.
5. As Super Admin, switch schools and confirm both setup pages show only the
   selected school's data. A form made stale by another tab must request reload.
6. Check the page at mobile width and complete form/cancel actions by keyboard.

## 2D.1: Staff backend and migration review

Status: schema, services and APIs implemented and verified. The checks below record
the original isolated PostgreSQL verification. The approved staff migration has
since been applied to live Supabase with the other SMS migrations, and the staff
screen is complete. See [sms-live-rollout.md](sms-live-rollout.md) for deployment
and backfill progress.

### Migration for review

[`20261029120000_sms_staff_assignments/migration.sql`](../prisma/migrations/20261029120000_sms_staff_assignments/migration.sql)

This transactional, cloud-only migration creates two tables:

- **TeacherProfile:** one optional profile per existing teacher account, with
  nullable phone and qualification text. Name, email, role and credentials remain
  on the existing User model. Profiles are created when details are first saved;
  no synthetic profile backfill is required.
- **TeachingAssignment:** teacher + subject + class arm + academic session, with
  an isActive flag for revocation/reactivation. The same assignment identity is
  retained when reactivated. Each parent relationship is tenant-aware.

Every new row carries schoolId. The migration adds only new tables and their
indexes/foreign keys; it does not update existing records or reset data.
ClassArm.formTeacherId already exists and is used directly for designation.
No role or LAN schema is added.

### Backend behavior

- Administrator-only teacher listing and profile updates with explicit public
  field selection; passwords and hashes are never returned.
- Scoped assignment creation, filtering, revocation and reactivation. Creation
  and reactivation require an active same-school TEACHER and valid same-school
  subject/arm/session references.
- Form-teacher designation/clearing on ClassArm, with the same teacher eligibility
  rules. Form teacher is not a separate role.
- Inactive teacher profiles remain manageable. Deactivated or re-roled accounts
  cannot receive a new/reactivated teaching assignment. Existing assignment rows
  remain historical records; future attendance/results permissions must also use
  live account/role checks, not assignment existence alone.
- Existing account creation/password/role management continues through the
  existing staff account APIs; this increment extends those teacher identities.

### Endpoints

| Method | URL | Purpose |
| --- | --- | --- |
| GET | `/api/sms/staff/teachers` | Paginated teacher/profile/form-arm list |
| PATCH | `/api/sms/staff/teachers/[teacherId]/profile` | Set or clear optional profile fields |
| GET / POST | `/api/sms/staff/teaching-assignments` | List/create/reactivate an assignment |
| PATCH | `/api/sms/staff/teaching-assignments/[assignmentId]` | Set isActive without changing parent identities |
| PUT | `/api/sms/staff/class-arms/[armId]/form-teacher` | Set teacherId or clear it with null |

### Files and checks

Added/updated: `prisma/schema.prisma`, the migration above,
`src/modules/staff/{validation,rules,service}.ts`, the five route files above,
`tests/sms-staff.test.ts`, `tests/integration/sms-staff.test.ts`,
`tests/tenant.test.ts`, and the `test:sms-staff` package script.

- Prisma validation/client generation: passed.
- Typecheck: passed.
- Unit tests: 23 passed.
- Lint: zero errors; 12 warnings in existing code.
- Production build and LAN boundary check: passed.
- Staff database/API integration: 8 passed, 0 failed.
- Class/subject, calendar and foundation database regression: 22 passed, 0 failed.

The isolated migration run verified that this was the only pending migration,
then compared every pre-existing table row before and after application. All rows
matched, and both new staff tables started empty. Runtime checks covered profile
clearing without credential changes, tenant/role rejection, inactive-teacher
restrictions, assignment revocation/reactivation, form-teacher eligibility and
concurrent duplicates. The database was stopped afterward with its data retained.
No application code fixes were needed during verification.

To repeat these checks, use an isolated database with the approved migration and
run `pnpm test:sms-staff`. The tests cover profile
preservation, tenant/role checks, active-teacher eligibility, all cross-school
parent links, assignment history/reactivation, form-teacher designation and
concurrent duplicate assignment prevention.

For manual API verification after migration, sign in as School Admin, list
teachers, update phone/qualifications, create and deactivate/reactivate an
assignment, and set/clear a form teacher. Try foreign-school and inactive-teacher
IDs and confirm refusal. The form-teacher field must never change User.role.

## Next checkpoint: 2D.2

Completed with the remaining Phase 2 work. Teacher profiles/assignments/form
teachers, student profiles/photos, arm-aware imports and effective-dated enrollment
transitions are implemented. See `docs/sms-phases-3-6.md` for the consolidated
completion and verification report.
The approved admission-number and late-LAN-upload policies are recorded in the
consolidated report.

## Accessibility review (2B–2C)

No actionable accessibility findings in the inspected calendar, class/subject and mobile-navigation
flows. Verified native labels and computed roles, keyboard form activation/error
focus/cancel restoration, the skip link, mobile focus containment, visible browser
focus indicators, reduced motion, and 320px reflow. Desktop and mobile automated
WCAG A/AA audits reported zero violations.

Manual screen-reader testing, actual 200% browser zoom and forced-colors testing:
**Not verified**. The decision below applies only to inspected keyboard, visual
and automated coverage.

**Approve**
