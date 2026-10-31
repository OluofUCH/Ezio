BEGIN;
CREATE TYPE "FeeStatus" AS ENUM ('OWING', 'PAID');
CREATE TABLE "StudentFee" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "termId" TEXT NOT NULL,
  "status" "FeeStatus" NOT NULL DEFAULT 'OWING', "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "StudentFee_schoolId_id_key" ON "StudentFee"("schoolId", "id");
CREATE UNIQUE INDEX "StudentFee_schoolId_studentId_termId_key" ON "StudentFee"("schoolId", "studentId", "termId");
CREATE INDEX "StudentFee_schoolId_termId_status_idx" ON "StudentFee"("schoolId", "termId", "status");
ALTER TABLE "StudentFee" ADD CONSTRAINT "StudentFee_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentFee" ADD CONSTRAINT "StudentFee_schoolId_studentId_fkey" FOREIGN KEY ("schoolId", "studentId") REFERENCES "Student"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "StudentFee" ADD CONSTRAINT "StudentFee_schoolId_termId_fkey" FOREIGN KEY ("schoolId", "termId") REFERENCES "Term"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "StudentFee" ADD CONSTRAINT "StudentFee_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
