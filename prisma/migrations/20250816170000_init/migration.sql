-- ============================================================
-- CBT PLATFORM — INITIAL SCHEMA
-- ============================================================
-- Generated from prisma/schema.prisma, plus one hand-written index at the end
-- that Prisma's schema language cannot express (see "PARTIAL UNIQUE INDEX").
--
-- Verified statement-for-statement against
--   prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma
-- so Prisma sees no drift after `migrate deploy`. The partial index is the only
-- deliberate addition.

CREATE SCHEMA IF NOT EXISTS "public";

-- ---------- ENUMS ----------

CREATE TYPE "ClassLevel" AS ENUM ('JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3');
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER');
CREATE TYPE "ExamMode" AS ENUM ('ONLINE', 'OFFLINE_LAN', 'HYBRID');
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE');
CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'FLAGGED');

-- ---------- TENANCY ----------

CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "School_slug_key" ON "School"("slug");
CREATE INDEX "School_slug_idx" ON "School"("slug");

CREATE TABLE "LocalServer" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSeenIp" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalServer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LocalServer_deviceKey_key" ON "LocalServer"("deviceKey");
CREATE INDEX "LocalServer_schoolId_idx" ON "LocalServer"("schoolId");

-- ---------- USERS & ROLES ----------

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_schoolId_idx" ON "User"("schoolId");
CREATE INDEX "User_email_idx" ON "User"("email");

CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "regNumber" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "classLevel" "ClassLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Student_schoolId_idx" ON "Student"("schoolId");
CREATE INDEX "Student_schoolId_classLevel_idx" ON "Student"("schoolId", "classLevel");
CREATE UNIQUE INDEX "Student_schoolId_regNumber_key" ON "Student"("schoolId", "regNumber");

-- ---------- EXAM STRUCTURE ----------

CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "classLevel" "ClassLevel" NOT NULL,
    "durationMins" INTEGER NOT NULL,
    "mode" "ExamMode" NOT NULL DEFAULT 'HYBRID',
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT true,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT true,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "startWindow" TIMESTAMP(3),
    "endWindow" TIMESTAMP(3),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Exam_schoolId_idx" ON "Exam"("schoolId");
CREATE INDEX "Exam_schoolId_classLevel_idx" ON "Exam"("schoolId", "classLevel");

CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'SINGLE_CHOICE',
    "imageUrl" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Question_examId_idx" ON "Question"("examId");

CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Option_questionId_idx" ON "Option"("questionId");

-- ---------- EXAM TAKING + OFFLINE SYNC ----------

CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "localId" TEXT,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "localServerId" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "securityFlags" JSONB,
    "syncedAt" TIMESTAMP(3),
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExamSession_examId_idx" ON "ExamSession"("examId");
CREATE INDEX "ExamSession_studentId_idx" ON "ExamSession"("studentId");
CREATE INDEX "ExamSession_examId_studentId_idx" ON "ExamSession"("examId", "studentId");
CREATE INDEX "ExamSession_syncedAt_idx" ON "ExamSession"("syncedAt");
CREATE UNIQUE INDEX "ExamSession_localServerId_localId_key" ON "ExamSession"("localServerId", "localId");

CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT,
    "selectedOptionIds" JSONB,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCorrect" BOOLEAN,
    "pointsAwarded" DOUBLE PRECISION,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Answer_examSessionId_idx" ON "Answer"("examSessionId");
CREATE UNIQUE INDEX "Answer_examSessionId_questionId_key" ON "Answer"("examSessionId", "questionId");

-- ---------- FOREIGN KEYS ----------

ALTER TABLE "LocalServer" ADD CONSTRAINT "LocalServer_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Exam" ADD CONSTRAINT "Exam_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict, not Cascade: deleting a teacher must not silently delete the exams
-- they authored, along with every session and score attached to them.
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Question" ADD CONSTRAINT "Question_examId_fkey"
    FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Option" ADD CONSTRAINT "Option_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_examId_fkey"
    FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_localServerId_fkey"
    FOREIGN KEY ("localServerId") REFERENCES "LocalServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Answer" ADD CONSTRAINT "Answer_examSessionId_fkey"
    FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Answer" ADD CONSTRAINT "Answer_selectedOptionId_fkey"
    FOREIGN KEY ("selectedOptionId") REFERENCES "Option"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- PARTIAL UNIQUE INDEX — hand-written, not generated by Prisma
-- ============================================================
-- Guarantees at most ONE in-progress session per (exam, student).
--
-- Prisma's `@@unique([localServerId, localId])` does not cover online sessions:
-- both columns are NULL there and Postgres treats NULLs as distinct, so two
-- concurrent /start requests would both insert and quietly burn two attempts.
--
-- A partial index cannot be expressed in the Prisma schema language, so it lives
-- here. `app/api/student/exams/[examId]/start/route.ts` depends on it directly:
-- it catches the resulting P2002 and resumes the winning session.
--
-- Submitted/auto-submitted/flagged rows are outside the predicate, so a student
-- with attempts remaining can still start a fresh sitting.
CREATE UNIQUE INDEX "ExamSession_one_active_per_student_exam"
    ON "ExamSession" ("examId", "studentId")
    WHERE "status" = 'IN_PROGRESS';
