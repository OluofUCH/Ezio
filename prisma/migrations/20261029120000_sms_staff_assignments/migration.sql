-- REVIEW BEFORE APPLYING. Cloud-only, additive Phase 2D migration.
-- Existing User accounts, roles, credentials, enrollments and CBT data are untouched.
-- Optional profile values stay nullable. Profiles are created lazily; no data backfill.
BEGIN;

CREATE TABLE "TeacherProfile" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "phone" TEXT,
  "qualifications" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeacherProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeachingAssignment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "classArmId" TEXT NOT NULL,
  "academicSessionId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeachingAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeacherProfile_schoolId_id_key" ON "TeacherProfile" ("schoolId", "id");
CREATE UNIQUE INDEX "TeacherProfile_schoolId_userId_key" ON "TeacherProfile" ("schoolId", "userId");
CREATE UNIQUE INDEX "TeachingAssignment_schoolId_id_key" ON "TeachingAssignment" ("schoolId", "id");
CREATE UNIQUE INDEX "TeachingAssignment_scope_key" ON "TeachingAssignment" ("schoolId", "teacherId", "subjectId", "classArmId", "academicSessionId");
CREATE INDEX "TeachingAssignment_teacher_session_idx" ON "TeachingAssignment" ("schoolId", "teacherId", "academicSessionId", "isActive");
CREATE INDEX "TeachingAssignment_arm_session_subject_idx" ON "TeachingAssignment" ("schoolId", "classArmId", "academicSessionId", "subjectId");

ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_schoolId_userId_fkey" FOREIGN KEY ("schoolId", "userId") REFERENCES "User"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_schoolId_teacherId_fkey" FOREIGN KEY ("schoolId", "teacherId") REFERENCES "User"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_schoolId_subjectId_fkey" FOREIGN KEY ("schoolId", "subjectId") REFERENCES "Subject"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_schoolId_classArmId_fkey" FOREIGN KEY ("schoolId", "classArmId") REFERENCES "ClassArm"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_schoolId_academicSessionId_fkey" FOREIGN KEY ("schoolId", "academicSessionId") REFERENCES "AcademicSession"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ClassArm.formTeacherId already exists. Designation is an authorized application
-- update to that field, not a new role or another authentication model.
COMMIT;
