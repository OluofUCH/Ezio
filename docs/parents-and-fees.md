# Parent portal and fee records

## Deployment

Apply the database migrations before starting the updated application:

```sh
pnpm run prisma:deploy
pnpm run build
pnpm run start
```

The new migrations add the nursery/primary class levels, parent accounts and child links, parent/teacher comments, and per-term fee status records.

The production build also checks that every report-export function includes its Unicode font and package metadata. You can repeat this check after a build with `pnpm run check:report-pdf`.

## Parent accounts

1. A school administrator opens **Parent accounts** at `/sms/staff/parents`.
2. Choose **Add parent account**, enter the parent’s name, phone number and a 4–8 digit PIN, and select the child.
3. Give the parent the school code displayed on the page, their phone number and their PIN.
4. Use **Manage → Link another child** for siblings. **Edit details / reset PIN** updates login details. Unlinking a child removes that parent’s access to the child’s records.

Parents sign in through the **Parent** option on `/login`, or directly at `/login?as=parent`. Nigerian phone numbers work in local or `+234` form. PINs are stored as hashes; changing a PIN or deactivating an account invalidates its existing sessions.

The parent portal contains:

- **Child results** (`/sms/parent`): each linked child’s published results, teacher/principal remarks and downloadable report cards. Unpublished results are hidden.
- **Teacher comments** (`/sms/parent/comments`): a separate conversation for each parent/child link with the child’s current form teacher.

Form teachers open **Parent comments** (`/sms/staff/parent-comments`) to read, reply or start a conversation. Parents must be linked to the child, and the child needs an active placement in the current academic session with a form teacher assigned. A change of form teacher transfers access to the current teacher while preserving conversation history.

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
pnpm run test:sms-fees
```

These integration tests cover family and school isolation, published-report/PDF access, two-way comments, account/link revocation, form-teacher restrictions, class filtering, fee persistence across terms and arm transfers, and dashboard totals.

## PDF export troubleshooting

The PDF renderer resolves its font relative to the deployed server module and copies student-photo bytes before embedding them. This avoids working-directory-dependent font lookup and a `pdf-lib` JPEG parser failure for sliced byte buffers.

If a hosted export still returns `INTERNAL_ERROR` after redeployment, find the `report_pdf_failed` entry in the function logs. It records the report ID and underlying error without exposing report contents or login credentials in the HTTP response.
