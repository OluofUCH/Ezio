'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage } from '@/lib/client/api'

type State<T> = {
  data: T | null
  error: string | null
  /** True only on the first load, so a refetch does not blank the screen. */
  loading: boolean
  /** True while any fetch is in flight, including a refetch. */
  refreshing: boolean
}

/**
 * GET a path and track loading/error state.
 *
 * The dashboards deliberately read through `/api` rather than the database directly,
 * even though they render inside server components that could query Prisma. The rules
 * those endpoints apply — `canStart`, `windowState`, `attemptsRemaining`, the
 * class-level filter — are security-relevant and already implemented once in
 * `app/api/student/exams/route.ts`. Re-deriving them in a page would create a second
 * copy free to drift from the enforced one, and the copy a student sees is exactly the
 * one that must not disagree with the server.
 *
 * Passing `null` as the path skips the request, which is how a dependent fetch waits
 * for the id it needs.
 */
export function useApi<T>(path: string | null, deps: unknown[] = []): State<T> & { refetch: () => void } {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: path !== null,
    refreshing: false,
  })

  // Bumped to force a refetch without changing the path.
  const [nonce, setNonce] = useState(0)

  /**
   * Guards against a late response from a superseded request overwriting a newer one.
   * The AbortController below covers the common case, but a response already in flight
   * when the abort lands can still resolve, so the generation counter is the backstop.
   */
  const generation = useRef(0)

  const refetch = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (path === null) {
      setState({ data: null, error: null, loading: false, refreshing: false })
      return
    }

    const controller = new AbortController()
    const current = ++generation.current

    setState((previous) => ({ ...previous, refreshing: true, error: null }))

    api
      .get<T>(path, { signal: controller.signal })
      .then((data) => {
        if (current !== generation.current) return
        setState({ data, error: null, loading: false, refreshing: false })
      })
      .catch((err: unknown) => {
        if (current !== generation.current) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        setState((previous) => ({
          // Keep the last good data on a refetch failure — a dropped connection
          // mid-exam should not wipe the screen a student is reading.
          data: previous.data,
          error: errorMessage(err),
          loading: false,
          refreshing: false,
        }))
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps])

  return { ...state, refetch }
}
