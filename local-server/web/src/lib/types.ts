export type SetupState = {
  configured: boolean
  pinSet: boolean
  staged: boolean
  schoolName: string | null
  localServerName: string | null
  cloudBaseUrl: string
  appVersion: string
  studentUrl: string
  addresses: string[]
  firewallRulePresent: boolean | null
}

export type CloudExam = {
  id: string
  title: string
  subject: string
  classLevel: string
  durationMins: number
  mode: string
  questionCount: number
  studentCount?: number
  startWindow: string | null
  endWindow: string | null
}

export type AdminExam = {
  id: string
  title: string
  subject: string
  classLevel: string
  durationMins: number
  pulledAt: string
  questionCount: number
}

export type AdminStatus = {
  configured: boolean
  pinSet: boolean
  school: { id: string; name: string; slug: string } | null
  localServer: { id: string; name: string } | null
  cloudBaseUrl: string | null
  appVersion: string
  autoPush: boolean
  studentUrl: string
  addresses: string[]
  port: number
  qrDataUrl: string
  firewallRulePresent: boolean | null
  clockSkewSeconds: number | null
  exams: AdminExam[]
  sessions: {
    byStatus: Record<string, number>
    pending: number
    inProgress: number
  }
  lastPulledAt: string | null
  lastPushedAt: string | null
}

export type Student = {
  id: string
  regNumber: string
  fullName: string
  classLevel: string
}

export type StudentExam = {
  id: string
  title: string
  subject: string
  classLevel: string
  durationMins: number
  questionCount: number
  windowState: 'OPEN' | 'NOT_YET_OPEN' | 'CLOSED'
  attempts: { used: number; allowed: number; remaining: number }
  activeSession: { id: string; secondsRemaining: number } | null
  canStart: boolean
}

export type PaperOption = { id: string; text: string }

export type PaperQuestion = {
  id: string
  text: string
  type: string
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
  exam: { id: string; title: string; subject: string; classLevel: string; durationMins: number }
  questions: PaperQuestion[]
  savedAnswers: { questionId: string; selectedOptionIds: string[] }[]
  serverTime: string
}

export type SubmitPayload = {
  score: number
  maxScore: number
  percentage: number
  answeredCount: number
  totalQuestions: number
  unansweredCount: number
}

export type SubmitResult = {
  session: { id: string; status: string; submittedAt: string }
  result: SubmitPayload
  exam: { id: string; title: string }
}
