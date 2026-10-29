import { NextResponse, type NextRequest } from 'next/server'

const STAFF_COOKIE = 'cbt_staff'
const STUDENT_COOKIE = 'cbt_student'

/**
 * Routing guard — UX only, deliberately not a security boundary.
 *
 * This checks that a session cookie is *present*, not that it is valid. The real
 * enforcement lives in `requireStaff` / `requireStudent` (lib/auth/session.ts), which
 * verify the JWT signature, re-read the account, and scope every query to a school.
 * Every `/api` route already goes through them, so a forged cookie gets an empty
 * dashboard and a 401 from each fetch — never data.
 *
 * The split matters because the two checks answer different questions. Middleware runs
 * on the edge before the page renders and only needs to decide "send them to /login or
 * not"; verifying a token here would duplicate the authority and invite the two copies
 * to drift. It also keeps the cookie names as the single coupling point, matching
 * lib/auth/cookies.ts.
 *
 * Staff and student cookies are separate (see lib/auth/cookies.ts), so a teacher can
 * hold an admin session and a test-student session in one browser — which is why each
 * area checks only its own cookie rather than "any session".
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // `/exam/*` is the runner. It sits outside `/student` so it renders without the
  // navigation shell — a student mid-paper should have nowhere to click away to — but
  // it is a student surface and guarded by the same cookie.
  const isStudentArea = pathname.startsWith('/student') || pathname.startsWith('/exam') || pathname.startsWith('/sms/student')
  const isStaffArea = pathname.startsWith('/staff') || pathname.startsWith('/sms/staff')

  if (!isStudentArea && !isStaffArea) return NextResponse.next()

  const cookieName = isStudentArea ? STUDENT_COOKIE : STAFF_COOKIE
  if (req.cookies.get(cookieName)?.value) return NextResponse.next()

  const login = new URL('/login', req.url)
  // Preselect the correct credentials. Successful sign-in always opens SMS;
  // users can return to their exams from the CBT module after authentication.
  login.searchParams.set('as', isStudentArea ? 'student' : 'staff')

  return NextResponse.redirect(login)
}

export const config = {
  /**
   * Pages only. `/api` is excluded because those routes must answer with a JSON 401
   * from `lib/api.ts` — redirecting a fetch to an HTML login page would surface as an
   * unreadable-response error in the client instead of a clear "session expired".
   */
  matcher: ['/student/:path*', '/exam/:path*', '/staff/:path*', '/sms/student/:path*', '/sms/staff/:path*'],
}
