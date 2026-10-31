BEGIN;
CREATE TYPE "ParentCommentAuthor" AS ENUM ('PARENT', 'TEACHER');

CREATE TABLE "Parent" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "fullName" TEXT NOT NULL,
  "phone" TEXT NOT NULL, "pinHash" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "authVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "ParentStudent" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "parentId" TEXT NOT NULL, "studentId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "ParentComment" (
  "id" TEXT PRIMARY KEY, "schoolId" TEXT NOT NULL, "parentStudentId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL, "author" "ParentCommentAuthor" NOT NULL, "body" VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentComment_body_check" CHECK (length(trim("body")) > 0)
);

CREATE UNIQUE INDEX "Parent_schoolId_id_key" ON "Parent"("schoolId", "id");
CREATE UNIQUE INDEX "Parent_schoolId_phone_key" ON "Parent"("schoolId", "phone");
CREATE UNIQUE INDEX "ParentStudent_schoolId_id_key" ON "ParentStudent"("schoolId", "id");
CREATE UNIQUE INDEX "ParentStudent_schoolId_parentId_studentId_key" ON "ParentStudent"("schoolId", "parentId", "studentId");
CREATE INDEX "ParentStudent_schoolId_studentId_isActive_idx" ON "ParentStudent"("schoolId", "studentId", "isActive");
CREATE UNIQUE INDEX "ParentComment_schoolId_id_key" ON "ParentComment"("schoolId", "id");
CREATE INDEX "ParentComment_thread_idx" ON "ParentComment"("schoolId", "parentStudentId", "createdAt", "id");

ALTER TABLE "Parent" ADD CONSTRAINT "Parent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParentStudent" ADD CONSTRAINT "ParentStudent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParentStudent" ADD CONSTRAINT "ParentStudent_schoolId_parentId_fkey" FOREIGN KEY ("schoolId", "parentId") REFERENCES "Parent"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ParentStudent" ADD CONSTRAINT "ParentStudent_schoolId_studentId_fkey" FOREIGN KEY ("schoolId", "studentId") REFERENCES "Student"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ParentComment" ADD CONSTRAINT "ParentComment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParentComment" ADD CONSTRAINT "ParentComment_schoolId_parentStudentId_fkey" FOREIGN KEY ("schoolId", "parentStudentId") REFERENCES "ParentStudent"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ParentComment" ADD CONSTRAINT "ParentComment_schoolId_teacherId_fkey" FOREIGN KEY ("schoolId", "teacherId") REFERENCES "User"("schoolId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
COMMIT;
