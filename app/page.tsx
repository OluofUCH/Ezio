import { redirect } from 'next/navigation'

export default function HomePage() {
  // There is no marketing surface in this build; every entry point is authenticated.
  // The middleware sends an unauthenticated visitor here from /student or /staff, and
  // the login page routes them onward by role once they are in.
  redirect('/login')
}
