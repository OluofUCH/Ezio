'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { AppShell } from '@/components/shell/AppShell'
import { ApiClientError, errorMessage } from '@/lib/client/api'
import { portalNavigation } from '@/src/modules/shared/navigation'

export type SmsSchool = { id: string; name: string; isActive: boolean }
export type SmsUser = { id: string; fullName: string; email?: string; regNumber?: string; role: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT' }

export function isContextError(error: unknown): boolean {
  return error instanceof ApiClientError && (error.status === 401 || error.status === 403 ||
    (typeof error.details === 'object' && error.details !== null && 'reason' in error.details && error.details.reason === 'SCHOOL_SCOPE_CHANGED'))
}

export const schoolDataPrefix = (userId: string) => ['sms', userId, 'school-data'] as const
export const calendarKey = (userId: string, schoolId: string) => [...schoolDataPrefix(userId), schoolId, 'calendar'] as const
export const structureKey = (userId: string, schoolId: string) => [...schoolDataPrefix(userId), schoolId, 'structure'] as const

type Workspace = {
  user: SmsUser
  school: SmsSchool | null
  switching: boolean
  scopeProblem: string | null
  beginSelection: () => Promise<void>
  finishSelection: (school: SmsSchool) => void
  cancelSelection: () => void
  reportContextError: (error: unknown) => boolean
}
const WorkspaceContext = createContext<Workspace | null>(null)

export function useSmsWorkspace(): Workspace {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('SMS components require SmsWorkspace.')
  return context
}

type Props = { user: SmsUser; initialSchool: SmsSchool | null; children: ReactNode }

export function SmsWorkspace(props: Props) {
  const [client] = useState(() => new QueryClient({ defaultOptions: {
    queries: { staleTime: 30_000, retry: (count, error) => !(error instanceof ApiClientError && error.status < 500) && count < 1 },
    mutations: { retry: false },
  } }))
  return <QueryClientProvider client={client}><WorkspaceBody {...props} /></QueryClientProvider>
}

function WorkspaceBody({ user, initialSchool, children }: Props) {
  const client = useQueryClient()
  const [school, setSchool] = useState(initialSchool)
  const [switching, setSwitching] = useState(false)
  const [scopeProblem, setScopeProblem] = useState<string | null>(null)
  const beginSelection = useCallback(async () => {
    setSwitching(true)
    setScopeProblem(null)
    await client.cancelQueries({ queryKey: schoolDataPrefix(user.id) })
    client.removeQueries({ queryKey: schoolDataPrefix(user.id) })
  }, [client, user.id])
  const finishSelection = useCallback((selected: SmsSchool) => {
    setSchool(selected)
    setScopeProblem(null)
    setSwitching(false)
  }, [])
  const cancelSelection = useCallback(() => setSwitching(false), [])
  const reportContextError = useCallback((error: unknown) => {
    if (!isContextError(error)) return false
    setScopeProblem(errorMessage(error))
    void client.cancelQueries({ queryKey: schoolDataPrefix(user.id) })
    client.removeQueries({ queryKey: schoolDataPrefix(user.id) })
    return true
  }, [client, user.id])
  const value = useMemo(() => ({ user, school, switching, scopeProblem, beginSelection, finishSelection, cancelSelection, reportContextError }),
    [user, school, switching, scopeProblem, beginSelection, finishSelection, cancelSelection, reportContextError])

  return (
    <WorkspaceContext.Provider value={value}>
      <AppShell
        nav={portalNavigation(user.role)}
        portalLabel={school?.name ?? 'School management'}
        userName={user.fullName}
        userMeta={`${user.role.replaceAll('_', ' ')} · ${user.email ?? user.regNumber ?? ''}`}
        logoutPath={user.role === 'STUDENT' ? '/api/auth/student/logout' : '/api/auth/staff/logout'}
      >
        {children}
      </AppShell>
    </WorkspaceContext.Provider>
  )
}
