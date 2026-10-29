-- REVIEW BEFORE APPLYING. Additive cloud migration; no backfill or LAN changes.
-- Existing Exam links stay nullable, including after the later constraint phase.
-- Partial unique indexes/checks below are intentionally maintained in SQL.

BEGIN;

CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');
CREATE TYPE "EnrollmentReason" AS ENUM (
  'INITIAL', 'LEGACY_BACKFILL', 'PLACEMENT_CHANGE', 'PROMOTION', 'REPEAT', 'TRANSFER', 'WITHDRAWAL'
);

ALTER TABLE "Exam"
  ADD COLUMN "subjectId" TEXT,
  ADD COLUMN "termId" TEXT,
  ADD COLUMN "componentId" TEXT;

CREATE TABLE "AcademicSession" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicSession_dates_check" CHECK ("startDate" <= "endDate"),
  CONSTRAINT "AcademicSession_name_check" CHECK (length(btrim("name")) > 0)
);

CREATE TABLE "Term" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicSessionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Term_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Term_dates_check" CHECK ("startDate" <= "endDate"),
  CONSTRAINT "Term_order_check" CHECK ("orderIndex" > 0),
  CONSTRAINT "Term_name_check" CHECK (length(btrim("name")) > 0)
);

CREATE TABLE "ClassArm" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "level" "ClassLevel" NOT NULL,
  "name" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "formTeacherId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClassArm_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClassArm_name_check" CHECK (length(btrim("name")) > 0)
);

CREATE TABLE "Subject" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subject_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Subject_name_check" CHECK (length(btrim("name")) > 0 AND length(btrim("normalizedName")) > 0)
);

CREATE TABLE "Enrollment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "academicSessionId" TEXT NOT NULL,
  "classArmId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "reason" "EnrollmentReason" NOT NULL DEFAULT 'INITIAL',
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Enrollment_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "Enrollment_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "Enrollment_current_check" CHECK (NOT "isCurrent" OR "effectiveTo" IS NULL)
);

CREATE TABLE "AssessmentComponent" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "maxScore" DECIMAL(5,2) NOT NULL,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentComponent_maxScore_check" CHECK ("maxScore" > 0 AND "maxScore" <= 100),
  CONSTRAINT "AssessmentComponent_name_check" CHECK (length(btrim("name")) > 0)
);

-- Existing primary IDs already guarantee these keys are unique. The composite
-- keys let new FKs enforce the tenant boundary rather than merely validate IDs.
CREATE UNIQUE INDEX "User_schoolId_id_key" ON "User" ("schoolId", "id");
CREATE UNIQUE INDEX "Student_schoolId_id_key" ON "Student" ("schoolId", "id");
CREATE UNIQUE INDEX "AcademicSession_schoolId_id_key" ON "AcademicSession" ("schoolId", "id");
CREATE UNIQUE INDEX "AcademicSession_schoolId_name_key" ON "AcademicSession" ("schoolId", "name");
CREATE INDEX "AcademicSession_schoolId_isCurrent_idx" ON "AcademicSession" ("schoolId", "isCurrent");
CREATE UNIQUE INDEX "AcademicSession_one_current_per_school" ON "AcademicSession" ("schoolId") WHERE "isCurrent";
CREATE UNIQUE INDEX "Term_schoolId_id_key" ON "Term" ("schoolId", "id");
CREATE UNIQUE INDEX "Term_schoolId_academicSessionId_name_key" ON "Term" ("schoolId", "academicSessionId", "name");
CREATE UNIQUE INDEX "Term_schoolId_academicSessionId_orderIndex_key" ON "Term" ("schoolId", "academicSessionId", "orderIndex");
CREATE UNIQUE INDEX "ClassArm_schoolId_id_key" ON "ClassArm" ("schoolId", "id");
CREATE UNIQUE INDEX "ClassArm_schoolId_level_name_key" ON "ClassArm" ("schoolId", "level", "name");
CREATE INDEX "ClassArm_schoolId_level_isDefault_idx" ON "ClassArm" ("schoolId", "level", "isDefault");
CREATE INDEX "ClassArm_schoolId_formTeacherId_idx" ON "ClassArm" ("schoolId", "formTeacherId");
CREATE UNIQUE INDEX "ClassArm_one_default_per_level" ON "ClassArm" ("schoolId", "level") WHERE "isDefault";
CREATE UNIQUE INDEX "Subject_schoolId_id_key" ON "Subject" ("schoolId", "id");
CREATE UNIQUE INDEX "Subject_schoolId_normalizedName_key" ON "Subject" ("schoolId", "normalizedName");
CREATE UNIQUE INDEX "Enrollment_schoolId_id_key" ON "Enrollment" ("schoolId", "id");
CREATE UNIQUE INDEX "Enrollment_student_session_sequence_key" ON "Enrollment" ("schoolId", "studentId", "academicSessionId", "sequence");
CREATE INDEX "Enrollment_schoolId_studentId_isCurrent_idx" ON "Enrollment" ("schoolId", "studentId", "isCurrent");
CREATE INDEX "Enrollment_schoolId_academicSessionId_classArmId_idx" ON "Enrollment" ("schoolId", "academicSessionId", "classArmId");
CREATE UNIQUE INDEX "Enrollment_one_current_per_student" ON "Enrollment" ("schoolId", "studentId") WHERE "isCurrent";
CREATE UNIQUE INDEX "AssessmentComponent_schoolId_id_key" ON "AssessmentComponent" ("schoolId", "id");
CREATE UNIQUE INDEX "AssessmentComponent_schoolId_name_key" ON "AssessmentComponent" ("schoolId", "name");
CREATE INDEX "Exam_schoolId_subjectId_idx" ON "Exam" ("schoolId", "subjectId");
CREATE INDEX "Exam_schoolId_termId_idx" ON "Exam" ("schoolId", "termId");
CREATE INDEX "Exam_schoolId_componentId_idx" ON "Exam" ("schoolId", "componentId");

ALTER TABLE "AcademicSession" ADD CONSTRAINT "AcademicSession_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Term" ADD CONSTRAINT "Term_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Term" ADD CONSTRAINT "Term_schoolId_academicSessionId_fkey" FOREIGN KEY ("schoolId", "academicSessionId") REFERENCES "AcademicSession"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ClassArm" ADD CONSTRAINT "ClassArm_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassArm" ADD CONSTRAINT "ClassArm_schoolId_formTeacherId_fkey" FOREIGN KEY ("schoolId", "formTeacherId") REFERENCES "User"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_schoolId_studentId_fkey" FOREIGN KEY ("schoolId", "studentId") REFERENCES "Student"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_schoolId_academicSessionId_fkey" FOREIGN KEY ("schoolId", "academicSessionId") REFERENCES "AcademicSession"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_schoolId_classArmId_fkey" FOREIGN KEY ("schoolId", "classArmId") REFERENCES "ClassArm"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AssessmentComponent" ADD CONSTRAINT "AssessmentComponent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_schoolId_subjectId_fkey" FOREIGN KEY ("schoolId", "subjectId") REFERENCES "Subject"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_schoolId_termId_fkey" FOREIGN KEY ("schoolId", "termId") REFERENCES "Term"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_schoolId_componentId_fkey" FOREIGN KEY ("schoolId", "componentId") REFERENCES "AssessmentComponent"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- No existing data is updated here. The separately reviewed backfill initializes
-- schools explicitly. Do not infer terms/components for old exams or make these
-- optional links NOT NULL. Further enrollment constraints belong to a later rollout.

COMMIT;
