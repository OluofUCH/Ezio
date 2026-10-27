# Product Requirements Document: CBT Platform (Multi-Tenant, Online + Offline LAN)

**Version:** 1.0
**Author:** Olubiyi David Itunu
**Status:** Draft — Fresh Build

---

## 1. Overview

A multi-tenant Computer-Based Test (CBT) platform for schools, supporting two exam-taking modes:

- **Online** — students take exams over the internet, hitting the platform directly.
- **Offline (LAN)** — a local server deployed on the school's network hosts the exam for a hall of student devices with no internet dependency, syncing results back to the cloud once connectivity returns.

Each school is a tenant with its own admins, teachers, students, and exams, isolated within a shared database.

### 1.1 Problem Statement

Nigerian schools running computer-based exams face two recurring blockers: unreliable internet during exam windows, and the cost/complexity of purpose-built exam hardware (like JAMB CBT centers use). Most existing school CBT tools assume constant connectivity, which doesn't hold for many secondary schools running exams on a LAN of shared computers or a single ICT lab.

### 1.2 Goals

- Let a school run an exam entirely offline on a local network, then sync results when internet is available.
- Let a school run exams normally online with no extra setup.
- Support multiple schools on one platform, each fully isolated from the others.
- Keep the security model basic and practical — malpractice deterrence, not lockdown-browser-grade proctoring.

### 1.3 Non-Goals (v1)

- Full proctoring (webcam monitoring, AI cheating detection)
- Payment/billing infrastructure
- Native mobile apps (web-first, responsive)
- Question banks shared across schools / marketplace

---

## 2. Users & Roles

| Role | Access |
|---|---|
| **Super Admin** | Platform owner. Onboards schools, manages platform-wide settings. |
| **School Admin** | Manages their school: teachers, students, local servers, subscription/plan. |
| **Teacher** | Creates/manages exams and questions for their school, views results. |
| **Student** | Logs in with reg number + PIN, takes exams, views own results. |

Admins and teachers authenticate via email/password (`User` model). Students authenticate via **registration number + PIN** — the same credential pair for both online and offline exams (see schema notes below).

---

## 3. Core User Flows

### 3.1 School Onboarding
1. Super Admin creates a `School` record (or School Admin self-registers, pending approval).
2. School Admin adds Teachers.
3. School Admin bulk-imports Students (CSV: reg number, name, class) — PINs auto-generated or admin-set.

### 3.2 Exam Creation (Teacher)
1. Teacher creates an `Exam` — title, subject, **class level (required, fixed set: JSS1–JSS3, SS1–SS3)**, duration, mode (Online / Offline / Hybrid), attempt limit, availability window.
2. Teacher adds Questions — primarily via **bulk upload (.xlsx template)**; manual single-question entry available for edits/one-offs. See 4.2a for template spec. Questions belong to the exam, so they inherit its class level — no per-question class tagging needed.
3. Teacher reviews the parsed question list (preview screen) before confirming import — catches formatting mistakes before they become live questions.
4. Teacher publishes the exam.

**Class-level rule:** every exam is tied to exactly one class (e.g. "JS2"). A student only ever sees and can take exams matching their own `classLevel` — this is enforced at the query level (`WHERE schoolId = ? AND classLevel = student.classLevel`), not just a UI filter, so it can't be bypassed by a student hitting the API directly.

### 3.3 Online Exam (Student)
1. Student logs in with reg number + PIN via the school's portal.
2. Sees available exams filtered to their own class level and within the active window (e.g. a JSS2 student never sees SS1 exams).
3. Starts exam → questions served shuffled (if enabled), timer starts, auto-submits on time-up.
4. Answers saved to server as they go (avoids full data loss on disconnect).
5. Submission is scored immediately (auto-gradable question types).

### 3.4 Offline/LAN Exam (Student)
1. **Pre-exam (requires internet, done in advance):** School Admin/Teacher syncs the exam + student roster to a `LocalServer` device sitting in the exam hall. Only the relevant class's roster and exam need to be synced (e.g. syncing a JSS2 exam only requires JSS2 students' data).
2. **Exam day (no internet needed):** Student devices connect to the LocalServer's LAN IP. Student logs in with reg number + PIN — validated against locally cached data.
3. Exam proceeds identically to online mode, but all reads/writes hit the LocalServer, not the cloud.
4. On submission, session is marked `SUBMITTED` locally with `syncedAt: null`.
5. **Post-exam (whenever internet returns):** LocalServer pushes all unsynced sessions/answers to the cloud API, authenticated via its `deviceKey`. Cloud upserts using `localServerId + localId` to avoid duplicates.
6. Once synced, results appear in the School Admin/Teacher dashboard like any online exam.

### 3.5 Result Review
- Teacher/Admin view results per exam: score distribution, per-question stats, flagged sessions.
- Student views their own past results only.

---

## 4. Functional Requirements

### 4.1 Multi-Tenancy
- All tenant-scoped data (`Exam`, `Student`, `User`, `LocalServer`) carries `schoolId`.
- Enforced at the query layer — every DB call scoped by the authenticated user/student's `schoolId`. No cross-tenant reads.

### 4.2 Exam Engine
- **Class targeting:** every exam has a required `classLevel` (fixed enum: JSS1, JSS2, JSS3, SS1, SS2, SS3). Students only see and can start exams matching their own class — enforced server-side, not just hidden in the UI. Prevents a JSS2 student from accessing an SS1 exam even via direct API call.
- Question types: single choice, multiple choice, true/false (v1 — all auto-gradable, no essay/short-answer to keep grading simple).
- **Text-only in v1** — no image-based questions. `Question.imageUrl` exists in the schema but is unused; deferred to a later version.
- Shuffling: questions and/or options shuffled per student, seeded by `studentId + examId` so it's reproducible for review/audit.
- Timing: hard duration limit, auto-submit on expiry (client countdown + server-side timestamp check to prevent tampering).
- Attempt limits enforced per exam.

#### 4.2a Question Upload (.xlsx)

Primary path for getting questions into an exam. Teacher downloads a fixed template, fills it offline, uploads it.

**Template columns:**

| Column | Required | Notes |
|---|---|---|
| `question` | Yes | Question text |
| `type` | Yes | `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, or `TRUE_FALSE` |
| `optionA` – `optionD` | Yes (A, B min; C, D optional) | Up to 4 options; `TRUE_FALSE` only needs A/B (True/False) |
| `correctOption` | Yes | Letter(s) — e.g. `B`, or `A,C` for multiple choice |
| `points` | No | Defaults to 1 if blank |

**Upload flow:**
1. Teacher uploads `.xlsx` file (parsed with SheetJS/xlsx on the backend).
2. Server validates each row: required fields present, `type` is a valid enum value, `correctOption` references an actual option letter, at least 2 options given.
3. Invalid rows are rejected with a row-by-row error report (not a silent partial import) — teacher fixes and re-uploads.
4. Valid rows shown in a preview screen for teacher confirmation before committing to the DB.
5. On confirm, rows are inserted as `Question` + `Option` records in a single transaction, `orderIndex` assigned by row order.

**Manual entry** (secondary path): a form UI to add/edit a single question at a time — used for touch-ups after bulk import, or building a short exam from scratch without a spreadsheet.

### 4.3 Offline/LAN Sync
- `LocalServer` is provisioned per school (or per exam hall), authenticated via a device key.
- Sync is **pull-down before exam** (roster + exam + questions) and **push-up after exam** (sessions + answers).
- Conflict handling: `localId` + `localServerId` unique constraint prevents duplicate session creation on retry/re-sync.
- Partial sync tolerance: if sync is interrupted, already-synced sessions aren't re-pushed (`syncedAt` check).

### 4.4 Security (Basic Tier)
- Question/option shuffling per student.
- One attempt per exam (configurable).
- Time-boxed sessions, forced auto-submit.
- Tab-switch/window-blur detection, logged as `securityFlags` on the session (visible to teacher, not auto-penalized in v1).
- Reg number + PIN auth (no shared logins between students).

### 4.5 Admin/Reporting
- Bulk student import (CSV).
- Exam results export (CSV).
- Basic dashboard: exams run, pass/fail rate, per-question difficulty (% correct).

---

## 5. Technical Approach

**Stack:** Next.js (TypeScript), Tailwind + shadcn/ui, Prisma + PostgreSQL (Supabase), deployed centrally for the online/cloud side.

**Offline/LAN side:** A lightweight local instance (same Next.js codebase or a trimmed Node/Express server) running on a machine in the exam hall, backed by local SQLite or local Postgres, serving the school's LAN. Pre-loaded with synced exam + roster data; pushes results up once online.

**Data model:** See `schema.prisma` — built around `School` (tenant root), `LocalServer` (sync device), `Student` (regNumber + PIN auth), `Exam`/`Question`/`Option` (content), `ExamSession`/`Answer` (attempts, with `syncedAt`/`localId` for offline reconciliation).

---

## 6. Open Questions

- PIN reset flow: admin-only reset, or self-service via some secondary identifier (DOB, phone)?
- Local server hardware: does the school provide the machine, or is a preconfigured device/image part of the offering?
- Sync frequency: manual "sync now" trigger by admin, or automatic background sync whenever the LocalServer detects internet?
- Pricing model: per school, per student, or per exam — not yet decided, flagged for business-side discussion.

---

## 7. Milestones (Suggested)

1. **M1 — Core online CBT:** multi-tenancy, auth, exam builder, online exam-taking, basic dashboard.
2. **M2 — Offline/LAN mode:** LocalServer provisioning, pre-exam sync, offline exam-taking, post-exam sync reconciliation.
3. **M3 — Polish:** bulk import/export, reporting, basic security flags, PIN reset flows.
