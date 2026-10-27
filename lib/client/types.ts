import type { ClassLevel, ExamMode, QuestionType, SessionStatus, UserRole } from '@/lib/core/domain'

/**
 * Response shapes for the routes the UI calls.
 *
 * Hand-written rather than inferred: the handlers in `app/api` build their payloads
 * inline (`return ok({ ... })`), so there is no exported type to import, and Prisma's
 * `Date` fields arrive here as ISO strings after JSON transport. Every timestamp is
 * therefore typed `string`, which is what it actually is by the time a component sees it.
 *
 * Keep these in step with the routes they mirror â€” the file names are noted per block.
 */

export type { ClassLevel, ExamMode, QuestionType, SessionStatus, UserRole }

export const CLASS_LEVELS: readonly ClassLevel[] = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3']
export const EXAM_MODES: readonly ExamMode[] = ['ONLINE', 'OFFLINE_LAN', 'HYBRID']

export type PageMeta = { page: number; pageSize: number; total: number; totalPages: number }

export type WindowState = 'OPEN' | 'NOT_YET_OPEN' | 'CLOSED'

/* ------------------------------------------------------------------ *
 * Auth â€” app/api/auth/**
 * ------------------------------------------------------------------ */

export type SchoolSummary = { id: string; name: string; slug: string; logoUrl?: string | null }

export type StaffMe = {
  user: { id: string; email: string; fullName: string; role: UserRole; createdAt: string }
  school: SchoolSummary | null
  permissions: {
    canManageSchools: boolean
    canManageStaff: boolean
    canManageStudents: boolean
    canReadStudentPins: boolean
    canManageExams: boolean
  }
}

export type StudentMe = {
  student: { id: string; regNumber: string; fullName: string; classLevel: ClassLevel }
  school: SchoolSummary
  sessionType: 'student'
  activeSession: {
    id: string
    examId: string
    examTitle: string
    subject: string
    startedAt: string
    secondsRemaining: number
  } | null
}

export type StaffLoginResult = {
  user: { id: string; email: string; fullName: string; role: UserRole }
  school: SchoolSummary | null
  expiresIn: string
}

/** POST /api/auth/staff/change-password */
export type ChangePasswordResult = {
  changed: true
  /**
   * Always false: sessions are stateless JWTs with no blocklist, so a password change
   * cannot end sessions already issued to other devices.
   */
  otherSessionsRevoked: boolean
  note: string
  expiresIn: string
}

export type StudentLoginResult = {
  student: { id: string; regNumber: string; fullName: string; classLevel: ClassLevel }
  school: SchoolSummary
  sessionType: 'student'
  expiresIn: string
}

/* ------------------------------------------------------------------ *
 * Student exam-taking â€” app/api/student/**
 * ------------------------------------------------------------------ */

export type StudentExamListItem = {
  id: string
  title: string
  subject: string
  classLevel: ClassLevel
  durationMins: number
  mode: ExamMode
  questionCount: number
  startWindow: string | null
  endWindow: string | null
  windowState: WindowState
  attemptsUsed: number
  attemptsRemaining: number
  activeSession: { id: string; startedAt: string; secondsRemaining: number } | null
  canStart: boolean
  canResume: boolean
}

export type StudentExamList = {
  student: { id: string; fullName: string; classLevel: ClassLevel }
  exams: StudentExamListItem[]
  serverTime: string
}

/** No `isCorrect` anywhere â€” the server's STUDENT_PAPER_SELECT has no such field. */
export type PaperOption = { id: string; text: string }

export type PaperQuestion = {
  id: string
  text: string
  type: QuestionType
  points: number
  options: PaperOption[]
}

export type StartExamResult = {
  session: {
    id: string
    startedAt: string
    deadline: string | null
    secondsRemaining: number
    resumed: boolean
  }
  exam: { id: string; title: string; subject: string; classLevel: ClassLevel; durationMins: number }
  questions: PaperQuestion[]
  savedAnswers: { questionId: string; selectedOptionIds: string[] }[]
  serverTime: string
}

export type SubmitResultPayload = {
  score: number
  maxScore: number
  percentage: number
  answeredCount: number
  totalQuestions: number
  unansweredCount: number
}

export type SubmitExamResult = {
  session: { id: string; status: SessionStatus; submittedAt: string }
  result: SubmitResultPayload
  exam: { id: string; title: string }
}

export type SessionHeartbeat = {
  session: {
    id: string
    status: SessionStatus
    startedAt: string
    submittedAt: string | null
    deadline: string | null
    secondsRemaining: number
  }
  progress: { answeredCount: number; totalQuestions: number; unansweredCount: number }
  autoSubmitted: SubmitResultPayload | null
  result: { score: number | null; maxScore: number | null } | null
  serverTime: string
}

export type SaveAnswerResult = {
  saved: true
  questionId: string
  selectedOptionIds: string[]
  secondsRemaining: number
  serverTime: string
}

export type StudentResultItem = {
  sessionId: string
  status: SessionStatus
  startedAt: string
  submittedAt: string | null
  score: number | null
  maxScore: number | null
  percentage: number | null
  exam: {
    id: string
    title: string
    subject: string
    classLevel: ClassLevel
    durationMins: number
  }
}

export type StudentResults = { results: StudentResultItem[]; meta: PageMeta }

/* ------------------------------------------------------------------ *
 * Staff â€” exams, questions, sessions
 * ------------------------------------------------------------------ */

export type Exam = {
  id: string
  title: string
  subject: string
  classLevel: ClassLevel
  durationMins: number
  mode: ExamMode
  maxAttempts: number
  shuffleQuestions: boolean
  shuffleOptions: boolean
  startWindow: string | null
  endWindow: string | null
  isPublished: boolean
  createdAt: string
  updatedAt: string
  createdBy: { id: string; fullName: string } | null
  _count: { questions: number; examSessions: number }
}

export type ExamList = { exams: Exam[]; meta: PageMeta }

/** GET /api/exams/[examId] â€” adds the derived figures the authoring UI needs. */
export type ExamDetail = {
  exam: Exam
  /** What a student would score out of, for a pre-publish sanity check. */
  totalPoints: number
  canPublish: boolean
}

export type AuthoredOption = { id: string; text: string; isCorrect: boolean; orderIndex: number }

export type AuthoredQuestion = {
  id: string
  text: string
  type: QuestionType
  points: number
  orderIndex: number
  createdAt: string
  options: AuthoredOption[]
}

export type QuestionList = {
  exam: { id: string; title: string; classLevel: ClassLevel; isPublished: boolean }
  questions: AuthoredQuestion[]
  totalPoints: number
}

/** A row as the .xlsx parser produces it, echoed back to /import verbatim. */
export type QuestionDraft = {
  text: string
  type: QuestionType
  points: number
  options: { text: string; isCorrect: boolean }[]
}

/** `RowIssue` from lib/import/questions-xlsx.ts â€” anchored to a spreadsheet cell. */
export type RowIssue = {
  /** 1-based row as the teacher sees it in Excel (the header is row 1). */
  row: number
  column: string
  code: string
  message: string
}

export type UploadPreview = {
  exam: { id: string; title: string; classLevel: ClassLevel }
  file: { filename: string; sizeBytes: number }
  summary: {
    totalRows: number
    validRows: number
    invalidRows: number
    warningCount: number
    existingQuestions: number
  }
  valid: { row: number; question: QuestionDraft; warnings: RowIssue[] }[]
  errors: RowIssue[]
  committed: false
  confirmEndpoint: string
}

export type ImportResult = {
  exam: { id: string; title: string; classLevel: ClassLevel; isPublished: boolean }
  mode: 'APPEND' | 'REPLACE'
  imported: number
  optionsCreated: number
  replacedQuestions: number
  totalQuestions: number
  totalPoints: number
  committed: true
  nextStep: string
}

export type PublishResult = {
  exam: {
    id: string
    title: string
    classLevel?: ClassLevel
    isPublished: boolean
    questionCount?: number
  }
  changed: boolean
  visibleTo?: string
}

export type SecurityFlag = { type: string; at: string }

export type ExamSessionRow = {
  id: string
  student: { id: string; regNumber: string; fullName: string; classLevel: ClassLevel }
  status: SessionStatus
  startedAt: string
  submittedAt: string | null
  answeredCount: number
  score: number | null
  maxScore: number | null
  percentage: number | null
  deadline: string | null
  secondsRemaining: number
  awaitingAutoSubmit: boolean
  securityFlagCount: number
  securityFlags: SecurityFlag[]
  localServerId: string | null
  syncedAt: string | null
}

export type ExamSessionList = {
  exam: {
    id: string
    title: string
    subject: string
    classLevel: ClassLevel
    durationMins: number
    isPublished: boolean
  }
  sessions: ExamSessionRow[]
  meta: PageMeta
}

/* ------------------------------------------------------------------ *
 * Staff â€” roster and administration
 * ------------------------------------------------------------------ */

export type Student = {
  id: string
  regNumber: string
  fullName: string
  classLevel: ClassLevel
  createdAt: string
  /** Present only for SCHOOL_ADMIN / SUPER_ADMIN â€” see `canReadStudentPins`. */
  pin?: string
  _count: { examSessions: number }
}

export type StudentList = { students: Student[]; meta: PageMeta; pinsVisible: boolean }

/* -- roster import (POST /api/students/import) -- */

export type ImportSummary = {
  filename: string
  totalRows: number
  validRows: number
  invalidRows: number
  warningCount: number
}

export type StudentImportDryRun = {
  dryRun: true
  summary: ImportSummary
  warnings: RowIssue[]
  preview: {
    row: number
    regNumber: string
    fullName: string
    classLevel: ClassLevel
    pinWillBeGenerated: boolean
  }[]
}

export type StudentCredential = {
  regNumber: string
  fullName: string
  classLevel: ClassLevel
  pin: string
  pinGenerated: boolean
}

export type StudentImportResult = {
  imported: number
  summary: ImportSummary
  warnings: RowIssue[]
  /** The list an admin prints and hands out. */
  credentials: StudentCredential[]
}

/**
 * The payload attached to a 422 `IMPORT_VALIDATION_FAILED`. The import route throws
 * rather than returning when any row is bad â€” nothing is written â€” so this arrives as
 * `ApiClientError.details`, not as a success body.
 */
export type StudentImportFailure = {
  summary: ImportSummary
  errors: RowIssue[]
  warnings: RowIssue[]
}

export type ResetPinResult = {
  student: { id: string; regNumber: string; fullName: string }
  pin: string
}

export type CreatedStudent = { student: Student; pinGenerated: boolean }

export type StaffUser = {
  id: string
  email: string
  fullName: string
  role: UserRole
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count: { examsCreated: number }
}

export type StaffUserList = { users: StaffUser[]; meta: PageMeta }

export type LocalServer = {
  id: string
  name: string
  deviceKeyPrefix: string
  lastSyncedAt: string | null
  lastSeenIp: string | null
  isActive: boolean
  createdAt: string
  pairedAt: string | null
  appVersion: string | null
  isPaired: boolean
  _count: { examSessions: number }
}

export type LocalServerList = { localServers: LocalServer[]; meta: PageMeta }

export type LocalServerCreated = {
  localServer: LocalServer
  setupCode: { value: string; expiresAt: string; warning: string }
  schoolId: string
  nextSteps: Record<string, string>
}

export type SetupCodeResult = {
  localServer: { id: string; name: string; pairedAt: string | null; deviceKeyPrefix: string }
  setupCode: { value: string; expiresAt: string; warning: string }
}

export type RotateKeyResult = {
  localServer: {
    id: string
    name: string
    isActive: boolean
    deviceKeyPrefix: string
    previousKeyPrefix: string
  }
  deviceKey: { value: string; warning: string; setup: string }
  /** Present only when the device still holds sessions it has not pushed. */
  caution?: string
}
export type CreatedUser = { user: StaffUser; schoolId: string }

/* ------------------------------------------------------------------ *
 * Schools â€” SUPER_ADMIN only
 * ------------------------------------------------------------------ */

export type School = {
  id: string
  name: string
  slug: string
  address: string | null
  logoUrl: string | null
  isActive: boolean
  createdAt: string
  _count: { users: number; students: number; exams: number; localServers: number }
}

export type SchoolList = { schools: School[]; meta: PageMeta }

export type CreatedSchool = {
  school: {
    id: string
    name: string
    slug: string
    address: string | null
    logoUrl: string | null
    isActive: boolean
    createdAt: string
    admin: { id: string; email: string; fullName: string; role: UserRole } | null
  }
}

