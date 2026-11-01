# Platform access and student admissions verification

Verified on 1 November 2026 against an isolated PostgreSQL 16 database and a local production build. This is the current role-boundary reference; earlier school-selection rollout reports describe the previous behavior.

## Completed workflows

- Super Admin signs in at `/staff/platform`. Its navigation contains Platform dashboard, Schools and My account.
- The dashboard reports total schools, students and teachers, plus active/paused school counts. Teacher totals include deactivated teacher accounts and exclude school administrators and parents.
- Onboarding requires the first School Admin and creates both records atomically. Subsequent school updates accept only `isActive` for pause/reactivation.
- Platform accounts cannot enter school SMS or CBT pages or APIs. Query parameters, signed legacy selection cookies and a stored `schoolId` cannot bypass the boundary. Their own password-change endpoint remains available.
- Pausing a school blocks already-issued cloud staff, student and parent sessions and the existing hall-sync gate. Reactivation restores access to retained records.
- Active form teachers can admit students into their current form arms. Subject assignments alone grant no admission rights. Their student list is restricted to active current placements in those arms and excludes existing PINs and profile details.
- Admission and import do not grant teachers profile editing, photos, placement changes, session activation, staff management or parent-account administration.
- CSV/XLSX/XLS imports save class arm, PIN, date of birth, gender, address, guardian name, relationship, phone and email. The sample includes all fields and nursery-through-secondary examples.
- CSV text credentials and formatted Excel PINs retain leading zeros; date-formatted Excel cells support both date systems. Invalid fields produce row-specific errors using actual spreadsheet row numbers.
- Imports create students, profiles, placements and guardian links in one transaction. Guardian matching is school-scoped, siblings share an account, and existing PINs/account status are preserved. New parents start with PIN `1234`.
- Dry runs write nothing. Invalid rows reject the whole batch. Authorization is checked again at commit, and injected guardian/enrollment failures roll back all affected records.
- SMS imports now provide the full preview, row-error report, guardian summary and downloadable credentials used by CBT imports.

## Checks

| Check | Result |
| --- | --- |
| Unit tests (`pnpm test`) | 56 passed |
| Database integration tests | 75 passed across platform, admissions, foundations, calendar, staff, structure, complete SMS, guardian onboarding, parents, notices and fees suites |
| Production-browser workflows | 7 passed in Chromium/Edge |
| TypeScript and production build | Passed |
| ESLint | 0 errors; 12 existing warnings |
| LAN boundary check | Passed |
| Report-PDF deployment tracing | Passed for staff, student and parent routes |
| Guide generation | 26 A4 pages with 17 linked sections; content and pagination reviewed |

The new focused integration commands are `pnpm test:platform-access` and `pnpm test:sms-admissions`. Set `SMS_TEST_DATABASE_URL` to an isolated migrated database before running integration suites. On Windows, the build's Prisma generation was run after integration processes exited to avoid locking the query-engine DLL.

Browser checks covered role-specific sign-in and navigation, direct-page redirects, onboarding with its first administrator, pause/reactivation, Super Admin password changes, form-teacher admission, invalid and successful roster uploads, complete profile previews, sibling matching, and credential downloads. Inspected platform, schools, admission and roster-preview screens reflowed at 320px without page-level horizontal overflow. Data tables scroll within their containers.

## Accessibility and color observations

### Use text colors with sufficient contrast

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | `app/staff/schools/SchoolsAdmin.tsx:388` | The existing 12px password-length hint uses `text-outline` (`#747964`) on `#f3f3f6`. | Pending color-design review. Measured contrast is **4.06:1**, below **4.5:1**. | WCAG 1.4.3 requires 4.5:1 for normal-sized text; this secondary hint is harder to read. |

Automated accessibility audits of the inspected dashboard, onboarding form, school status controls, admission form and roster preview found this contrast issue and no other violations. Manual screen-reader testing, complete keyboard-only traversal, dark-mode contrast and the hosted deployment are **Not verified**.

**Approve** for the inspected platform and school-role workflows; the medium contrast finding remains recorded above.
