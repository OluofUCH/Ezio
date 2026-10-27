# Claude Code Starter Prompt — CBT Platform Backend

Copy everything below into your first Claude Code session in the project root.

---

I'm building the backend for a multi-tenant CBT (Computer-Based Test) platform for Nigerian secondary schools. Full context is in `PRD.md` and `schema.prisma` in this repo — read both before starting.

**Stack:**
- Next.js (App Router, TypeScript) — API routes for the backend
- Prisma + PostgreSQL (Supabase)
- Zod for request validation
- SheetJS (xlsx) for bulk question upload parsing

**What I need for this session — M1 backend foundation:**

1. **Project setup**
   - Initialize Prisma with the `schema.prisma` already in this repo (don't regenerate it — use it as-is unless you spot a bug, flag it to me first if so)
   - Set up `.env.example` with `DATABASE_URL` and any auth secrets needed
   - Basic folder structure: `/app/api`, `/lib`, `/lib/auth`, `/lib/validation`

2. **Multi-tenancy middleware/helper**
   - A reusable helper that scopes every query by `schoolId`, derived from the authenticated session — not passed as a client-supplied parameter (prevent a school admin from querying another school's data by just changing an ID in the request).

3. **Auth — two separate flows**
   - **Admin/Teacher:** email + password (`User` model), issue a JWT or session token. Standard bcrypt hash + compare.
   - **Student:** regNumber + PIN (`Student` model), scoped to `schoolId`. This is used for both online and offline login, so keep the validation logic in a shared function that a future offline/LocalServer sync module can reuse.
   - Both should return role info so the frontend can route correctly (`SUPER_ADMIN`, `SCHOOL_ADMIN`, `TEACHER`, or student session).

4. **Core CRUD API routes**
   - Schools: create/list (Super Admin only)
   - Users (teachers/admins): create/list/update, scoped to school
   - Students: create/list/update, bulk import via CSV (basic version — full roster CSV import), scoped to school + classLevel
   - Exams: create/list/update/publish, scoped to school + classLevel, enforce `classLevel` is one of the `ClassLevel` enum values
   - Questions: manual create/update/delete for a given exam

5. **Bulk question upload (`.xlsx`)**
   - Endpoint accepts an uploaded `.xlsx` file matching the template in PRD section 4.2a (question, type, optionA–D, correctOption, points)
   - Parse with SheetJS, validate every row server-side (required fields, valid `type` enum, `correctOption` references a real option letter, at least 2 options)
   - Return a structured response: valid rows ready for preview, and a list of row-level errors for invalid ones — do NOT partially commit on validation failure
   - Separate "confirm import" endpoint that takes the previewed/approved rows and inserts `Question` + `Option` records in a single transaction

6. **Exam-taking endpoints**
   - Start session: validates student's classLevel matches the exam's classLevel, creates an `ExamSession`, enforces attempt limit
   - Submit answer: upserts an `Answer` tied to the session (autosave-as-you-go pattern)
   - Submit exam: marks session `SUBMITTED`, calculates score for auto-gradable questions
   - Auto-submit safeguard: a way to check server-side whether the exam duration has been exceeded, independent of client timer (don't trust the browser alone)

**What NOT to build yet:**
- Offline/LAN sync (LocalServer push/pull) — that's M2, separate session
- Frontend/UI — backend only for now
- Reporting/analytics endpoints — M3

**Before you start:** give me a quick plan of the file/folder structure and route list you're going to build, so I can sanity-check it before you generate everything.
