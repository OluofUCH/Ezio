-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "localServerId" TEXT NOT NULL,
    "localServerName" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "schoolSlug" TEXT NOT NULL,
    "lastPulledAt" DATETIME,
    "lastPushedAt" DATETIME,
    "cloudTimeAtPull" DATETIME
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "classLevel" TEXT NOT NULL,
    "durationMins" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "shuffleQuestions" BOOLEAN NOT NULL,
    "shuffleOptions" BOOLEAN NOT NULL,
    "maxAttempts" INTEGER NOT NULL,
    "startWindow" DATETIME,
    "endWindow" DATETIME,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "pulledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    CONSTRAINT "Question_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    CONSTRAINT "Option_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "regNumber" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "classLevel" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "DeviceSession" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "DeviceSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    "score" REAL,
    "maxScore" REAL,
    "securityFlags" TEXT,
    "syncedAt" DATETIME,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ExamSession_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examSessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT,
    "selectedOptionIds" TEXT,
    "answeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCorrect" BOOLEAN,
    "pointsAwarded" REAL,
    CONSTRAINT "Answer_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "ExamSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Question_examId_idx" ON "Question"("examId");

-- CreateIndex
CREATE INDEX "Option_questionId_idx" ON "Option"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_regNumber_key" ON "Student"("regNumber");

-- CreateIndex
CREATE INDEX "DeviceSession_studentId_idx" ON "DeviceSession"("studentId");

-- CreateIndex
CREATE INDEX "ExamSession_examId_studentId_idx" ON "ExamSession"("examId", "studentId");

-- CreateIndex
CREATE INDEX "ExamSession_syncedAt_idx" ON "ExamSession"("syncedAt");

-- CreateIndex
CREATE INDEX "Answer_examSessionId_idx" ON "Answer"("examSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_examSessionId_questionId_key" ON "Answer"("examSessionId", "questionId");
