-- REVIEW BEFORE APPLYING. Additive cloud-only SMS rollout.
-- The sole new column on an existing table is nullable. No existing data is reset.
BEGIN;
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE');
CREATE TYPE "ResultStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED');
CREATE TYPE "ScoreSource" AS ENUM ('MANUAL', 'CBT');
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL_STAFF', 'ROLE', 'CLASS_ARM');
ALTER TABLE "AssessmentComponent" ADD COLUMN "isActive" BOOLEAN;

CREATE TABLE "StudentProfile" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "studentId" TEXT NOT NULL,
 "dateOfBirth" DATE, "gender" TEXT, "address" TEXT, "guardianName" TEXT,
 "guardianRelationship" TEXT, "guardianPhone" TEXT, "guardianEmail" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "StudentPhoto" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "studentId" TEXT NOT NULL,
 "mimeType" TEXT NOT NULL, "data" BYTEA NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "StudentPhoto_size_check" CHECK (octet_length("data") <= 262144),
 CONSTRAINT "StudentPhoto_type_check" CHECK ("mimeType" = 'image/jpeg')
);
CREATE TABLE "Attendance" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "enrollmentId" TEXT NOT NULL,
 "termId" TEXT NOT NULL, "date" DATE NOT NULL, "status" "AttendanceStatus" NOT NULL,
 "markedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "GradeBand" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "minScore" DECIMAL(5,2) NOT NULL,
 "maxScore" DECIMAL(5,2) NOT NULL, "grade" TEXT NOT NULL, "remark" TEXT NOT NULL,
 "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "GradeBand_range_check" CHECK ("minScore" >= 0 AND "maxScore" <= 100 AND "minScore" <= "maxScore")
);
CREATE TABLE "TermResultPolicy" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "termId" TEXT NOT NULL,
 "components" JSONB NOT NULL, "gradeBands" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ResultSubmission" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "classArmId" TEXT NOT NULL,
 "subjectId" TEXT NOT NULL, "termId" TEXT NOT NULL, "policyId" TEXT NOT NULL,
 "status" "ResultStatus" NOT NULL DEFAULT 'DRAFT', "submittedById" TEXT, "approvedById" TEXT,
 "publishedById" TEXT, "submittedAt" TIMESTAMP(3), "approvedAt" TIMESTAMP(3), "publishedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "Score" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "enrollmentId" TEXT NOT NULL,
 "termId" TEXT NOT NULL, "subjectId" TEXT NOT NULL, "componentId" TEXT NOT NULL,
 "submissionId" TEXT NOT NULL, "value" DECIMAL(6,2) NOT NULL, "source" "ScoreSource" NOT NULL DEFAULT 'MANUAL',
 "examId" TEXT, "sourceSessionId" TEXT, "sourceSyncVersion" INTEGER, "updatedById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Score_value_check" CHECK ("value" >= 0 AND "value" <= 100)
);
CREATE TABLE "ScoreAuditLog" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "scoreId" TEXT NOT NULL, "actorUserId" TEXT NOT NULL,
 "oldValue" DECIMAL(6,2), "newValue" DECIMAL(6,2) NOT NULL, "oldSource" "ScoreSource",
 "newSource" "ScoreSource" NOT NULL, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ReportCard" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "enrollmentId" TEXT NOT NULL, "termId" TEXT NOT NULL,
 "classArmId" TEXT NOT NULL, "total" DECIMAL(10,2) NOT NULL, "average" DECIMAL(5,2) NOT NULL,
 "position" INTEGER NOT NULL, "subjectCount" INTEGER NOT NULL, "status" "ResultStatus" NOT NULL DEFAULT 'APPROVED',
 "teacherRemark" TEXT, "principalRemark" TEXT, "snapshot" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
 "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "publishedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ReportCard_totals_check" CHECK ("total" >= 0 AND "average" BETWEEN 0 AND 100 AND "position" > 0 AND "subjectCount" > 0)
);
CREATE TABLE "Announcement" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "title" TEXT NOT NULL, "body" TEXT NOT NULL,
 "audience" "AnnouncementAudience" NOT NULL, "targetRole" "UserRole", "classArmId" TEXT, "authorId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Announcement_audience_check" CHECK (
  ("audience"='ALL_STAFF' AND "targetRole" IS NULL AND "classArmId" IS NULL) OR
  ("audience"='ROLE' AND "targetRole" IS NOT NULL AND "classArmId" IS NULL) OR
  ("audience"='CLASS_ARM' AND "targetRole" IS NULL AND "classArmId" IS NOT NULL))
);
CREATE TABLE "OfflineRosterGrant" (
 "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "localServerId" TEXT NOT NULL, "examId" TEXT NOT NULL,
 "studentId" TEXT NOT NULL, "classLevel" "ClassLevel" NOT NULL,
 "firstPulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastPulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "StudentProfile_schoolId_id_key" ON "StudentProfile"("schoolId","id");
CREATE UNIQUE INDEX "StudentProfile_schoolId_studentId_key" ON "StudentProfile"("schoolId","studentId");
CREATE UNIQUE INDEX "StudentPhoto_schoolId_id_key" ON "StudentPhoto"("schoolId","id");
CREATE UNIQUE INDEX "StudentPhoto_schoolId_studentId_key" ON "StudentPhoto"("schoolId","studentId");
CREATE INDEX "Attendance_schoolId_termId_date_idx" ON "Attendance"("schoolId","termId","date");
CREATE UNIQUE INDEX "Attendance_schoolId_id_key" ON "Attendance"("schoolId","id");
CREATE UNIQUE INDEX "Attendance_schoolId_enrollmentId_date_key" ON "Attendance"("schoolId","enrollmentId","date");
CREATE INDEX "GradeBand_schoolId_isActive_idx" ON "GradeBand"("schoolId","isActive");
CREATE UNIQUE INDEX "GradeBand_schoolId_id_key" ON "GradeBand"("schoolId","id");
CREATE UNIQUE INDEX "TermResultPolicy_schoolId_id_key" ON "TermResultPolicy"("schoolId","id");
CREATE UNIQUE INDEX "TermResultPolicy_schoolId_termId_key" ON "TermResultPolicy"("schoolId","termId");
CREATE INDEX "ResultSubmission_schoolId_termId_status_idx" ON "ResultSubmission"("schoolId","termId","status");
CREATE UNIQUE INDEX "ResultSubmission_schoolId_id_key" ON "ResultSubmission"("schoolId","id");
CREATE UNIQUE INDEX "ResultSubmission_scope_key" ON "ResultSubmission"("schoolId","classArmId","subjectId","termId");
CREATE INDEX "Score_schoolId_submissionId_idx" ON "Score"("schoolId","submissionId");
CREATE UNIQUE INDEX "Score_schoolId_id_key" ON "Score"("schoolId","id");
CREATE UNIQUE INDEX "Score_cell_key" ON "Score"("schoolId","enrollmentId","termId","subjectId","componentId");
CREATE INDEX "ScoreAuditLog_schoolId_scoreId_createdAt_idx" ON "ScoreAuditLog"("schoolId","scoreId","createdAt");
CREATE UNIQUE INDEX "ScoreAuditLog_schoolId_id_key" ON "ScoreAuditLog"("schoolId","id");
CREATE INDEX "ReportCard_schoolId_classArmId_termId_status_idx" ON "ReportCard"("schoolId","classArmId","termId","status");
CREATE UNIQUE INDEX "ReportCard_schoolId_id_key" ON "ReportCard"("schoolId","id");
CREATE UNIQUE INDEX "ReportCard_schoolId_enrollmentId_termId_key" ON "ReportCard"("schoolId","enrollmentId","termId");
CREATE INDEX "Announcement_schoolId_createdAt_idx" ON "Announcement"("schoolId","createdAt");
CREATE UNIQUE INDEX "Announcement_schoolId_id_key" ON "Announcement"("schoolId","id");
CREATE UNIQUE INDEX "OfflineRosterGrant_schoolId_id_key" ON "OfflineRosterGrant"("schoolId","id");
CREATE UNIQUE INDEX "OfflineRosterGrant_scope_key" ON "OfflineRosterGrant"("schoolId","localServerId","examId","studentId");
CREATE UNIQUE INDEX "Exam_schoolId_id_key" ON "Exam"("schoolId","id");
CREATE UNIQUE INDEX "LocalServer_schoolId_id_key" ON "LocalServer"("schoolId","id");

ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_schoolId_studentId_fkey" FOREIGN KEY ("schoolId","studentId") REFERENCES "Student"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "StudentPhoto" ADD CONSTRAINT "StudentPhoto_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentPhoto" ADD CONSTRAINT "StudentPhoto_schoolId_studentId_fkey" FOREIGN KEY ("schoolId","studentId") REFERENCES "Student"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_schoolId_enrollmentId_fkey" FOREIGN KEY ("schoolId","enrollmentId") REFERENCES "Enrollment"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_schoolId_termId_fkey" FOREIGN KEY ("schoolId","termId") REFERENCES "Term"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeBand" ADD CONSTRAINT "GradeBand_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TermResultPolicy" ADD CONSTRAINT "TermResultPolicy_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TermResultPolicy" ADD CONSTRAINT "TermResultPolicy_schoolId_termId_fkey" FOREIGN KEY ("schoolId","termId") REFERENCES "Term"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ResultSubmission" ADD CONSTRAINT "ResultSubmission_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultSubmission" ADD CONSTRAINT "ResultSubmission_schoolId_classArmId_fkey" FOREIGN KEY ("schoolId","classArmId") REFERENCES "ClassArm"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ResultSubmission" ADD CONSTRAINT "ResultSubmission_schoolId_subjectId_fkey" FOREIGN KEY ("schoolId","subjectId") REFERENCES "Subject"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ResultSubmission" ADD CONSTRAINT "ResultSubmission_schoolId_termId_fkey" FOREIGN KEY ("schoolId","termId") REFERENCES "Term"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ResultSubmission" ADD CONSTRAINT "ResultSubmission_schoolId_policyId_fkey" FOREIGN KEY ("schoolId","policyId") REFERENCES "TermResultPolicy"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ResultSubmission" ADD CONSTRAINT "ResultSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultSubmission" ADD CONSTRAINT "ResultSubmission_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultSubmission" ADD CONSTRAINT "ResultSubmission_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Score" ADD CONSTRAINT "Score_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Score" ADD CONSTRAINT "Score_schoolId_enrollmentId_fkey" FOREIGN KEY ("schoolId","enrollmentId") REFERENCES "Enrollment"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Score" ADD CONSTRAINT "Score_schoolId_termId_fkey" FOREIGN KEY ("schoolId","termId") REFERENCES "Term"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Score" ADD CONSTRAINT "Score_schoolId_subjectId_fkey" FOREIGN KEY ("schoolId","subjectId") REFERENCES "Subject"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Score" ADD CONSTRAINT "Score_schoolId_componentId_fkey" FOREIGN KEY ("schoolId","componentId") REFERENCES "AssessmentComponent"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Score" ADD CONSTRAINT "Score_schoolId_submissionId_fkey" FOREIGN KEY ("schoolId","submissionId") REFERENCES "ResultSubmission"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Score" ADD CONSTRAINT "Score_schoolId_examId_fkey" FOREIGN KEY ("schoolId","examId") REFERENCES "Exam"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Score" ADD CONSTRAINT "Score_sourceSessionId_fkey" FOREIGN KEY ("sourceSessionId") REFERENCES "ExamSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Score" ADD CONSTRAINT "Score_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScoreAuditLog" ADD CONSTRAINT "ScoreAuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScoreAuditLog" ADD CONSTRAINT "ScoreAuditLog_schoolId_scoreId_fkey" FOREIGN KEY ("schoolId","scoreId") REFERENCES "Score"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ScoreAuditLog" ADD CONSTRAINT "ScoreAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_schoolId_enrollmentId_fkey" FOREIGN KEY ("schoolId","enrollmentId") REFERENCES "Enrollment"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_schoolId_termId_fkey" FOREIGN KEY ("schoolId","termId") REFERENCES "Term"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ReportCard" ADD CONSTRAINT "ReportCard_schoolId_classArmId_fkey" FOREIGN KEY ("schoolId","classArmId") REFERENCES "ClassArm"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_schoolId_classArmId_fkey" FOREIGN KEY ("schoolId","classArmId") REFERENCES "ClassArm"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfflineRosterGrant" ADD CONSTRAINT "OfflineRosterGrant_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfflineRosterGrant" ADD CONSTRAINT "OfflineRosterGrant_schoolId_localServerId_fkey" FOREIGN KEY ("schoolId","localServerId") REFERENCES "LocalServer"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "OfflineRosterGrant" ADD CONSTRAINT "OfflineRosterGrant_schoolId_examId_fkey" FOREIGN KEY ("schoolId","examId") REFERENCES "Exam"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "OfflineRosterGrant" ADD CONSTRAINT "OfflineRosterGrant_schoolId_studentId_fkey" FOREIGN KEY ("schoolId","studentId") REFERENCES "Student"("schoolId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
COMMIT;
