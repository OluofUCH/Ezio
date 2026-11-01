# Parent portal and fee records

## Deployment

Apply the database migrations before starting the updated application:

```sh
pnpm run prisma:deploy
pnpm run build
pnpm run start
```

The migrations cover nursery/primary class levels, parent accounts and child links, automatic guardian onboarding, parent/teacher comments, parent notices, and per-term fee status records.

The production build also checks that every report-export function includes its Unicode font and package metadata. You can repeat this check after a build with `pnpm run check:report-pdf`.

## Parent accounts

1. A school administrator fills **Guardian name** and **Guardian phone** while admitting a student or editing their profile.
2. Saving the profile creates a parent account with initial PIN **1234**, or links the student to an existing account with the same normalized phone number in that school.
3. Siblings with the same guardian phone share one account. Existing parent PINs are preserved.
4. **Parent accounts** at `/sms/staff/parents` provides account review, contact updates, PIN resets and activation/deactivation. Parent creation and child linking happen through student profiles.

Admission can also save date of birth, gender, address, guardian relationship and guardian email in the same request. Incomplete guardian details can be filled later. Generated guardian links follow profile changes for that student; changing one child's guardian does not move siblings. Updating a parent account's phone keeps its matching generated student profiles in sync.

Parents sign in through the **Parent** option on `/login`, or directly at `/login?as=parent`. Nigerian phone numbers work in local or `+234` form. PINs are stored as hashes; changing a PIN or deactivating an account invalidates its existing sessions.

The parent portal contains:

- **Child results** (`/sms/parent`): each linked child’s published results, teacher/principal remarks and downloadable report cards. Unpublished results are hidden.
- **Teacher comments** (`/sms/parent/comments`): a separate conversation for each parent/child link with the child’s current form teacher.
- **School notices** (`/sms/parent/notices`): school-admin updates addressed to all parents or to parents of a child's current class arm. Staff-only notices are excluded.

Form teachers open **Parent comments** (`/sms/staff/parent-comments`) to read, reply or start a conversation. Parents must be linked to the child, and the child needs an active placement in the current academic session with a form teacher assigned. A change of form teacher transfers access to the current teacher while preserving conversation history.

School admins open **School notices → Post notice** and choose **All parents** or **Parents of a class arm**. For the latter, a class arm is required. Notices are delivered in the parent portal.

## Assessment and roster setup

**Assessment setup** labels the grade fields Min, Max, Grade and Remark. New grade settings preselect A–F: A 70–100, B 60–69.99, C 50–59.99, D 45–49.99, E 40–44.99, F 0–39.99. Grade and Remark use preset dropdowns with a Custom option. Existing saved bands are preserved until explicitly changed and saved.

**Students** and **Import roster** offer a downloadable sample CSV using `regNumber`, `fullName`, `classLevel`, `pin`, and `arm`. Replace the example rows before importing. Complete guardian information in Profile after importing to provision parent access.

## Fees

Staff open **Fees** at `/sms/staff/fees` and select a term. This page records payment status; it does not process payments or store payment-card details.

- Form teachers see and update only their assigned form classes.
- School administrators can review and update all classes, filtering by class level, arm, student name/admission number and **Paid** or **Owing**.
- Students start as **Owing** in each term until marked **Paid**. Each toggle saves immediately and records who last updated it and when.
- Fee status belongs to a student and term, so changing class arms does not reset it. Previous terms retain their own records.
- Class rosters reflect the selected term: today’s placement for an ongoing term, the final placement for a past term, or the starting placement for a future term.

## Dashboard and classes

The school administrator’s dashboard shows **Total students** (registered student records) and **Total staff** (school administrator and teacher accounts in that school). Parent accounts are not counted as staff.

Class options now include Nursery 1–2, Primary 1–6, JSS 1–3 and SS 1–3. The added levels work with class setup, student import, exams and promotion. Promotion progresses from Nursery 2 to Primary 1 and from Primary 6 to JSS 1.

## Verification

```sh
pnpm test
pnpm run typecheck
pnpm run lint
```

For database integration checks, use an isolated PostgreSQL database with all migrations applied and set `SMS_TEST_DATABASE_URL` to its connection string:

```sh
pnpm run test:sms-parents
pnpm run test:sms-onboarding
pnpm run test:sms-notices
pnpm run test:sms-fees
```

These integration tests cover family and school isolation, automatic guardian account creation and sibling linking, default-PIN preservation, parent-notice audiences, published-report/PDF access, two-way comments, account/link revocation, class filtering, fee persistence across terms and arm transfers, and dashboard totals.

## PDF export troubleshooting

The PDF renderer resolves its font relative to the deployed server module and copies student-photo bytes before embedding them. This avoids working-directory-dependent font lookup and a `pdf-lib` JPEG parser failure for sliced byte buffers.

Report views, PDF titles and filenames use the student's name. Downloads use a sanitized name, session and term, including UTF-8 filename support for accented names.

If a hosted export still returns `INTERNAL_ERROR` after redeployment, find the `report_pdf_failed` entry in the function logs. It records the report ID and underlying error without exposing report contents or login credentials in the HTTP response.
