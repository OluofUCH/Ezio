"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import type { UserRole } from "@/lib/client/types";

/**
 * SCHOOL SCOPE FOR STAFF REQUESTS
 * ===============================
 *
 * `requireSchoolScope` (lib/auth/session.ts) derives the school from the account for a
 * SCHOOL_ADMIN or TEACHER — nothing the client sends can influence it. SUPER_ADMIN is the
 * one exception: having no school of their own, they must name one with `?schoolId=`, and
 * SMS uses its authenticated, signed school selection instead of a query parameter.
 *
 * This context is the client half of that arrangement. `withScope` appends the parameter
 * for a super admin and returns the path untouched for everyone else — so a page is
 * written once and the privileged case is handled in a single place rather than at every
 * call site, where forgetting it would produce a confusing 403.
 *
 * The shell supplies the school resolved by the shared SMS context. CBT therefore
 * follows the same selection rather than keeping a second localStorage preference.
 * The CBT API still independently verifies the caller's role and school scope.
 */

type ScopeValue = {
  role: UserRole;
  /** The school every request targets, or null when a super admin has not chosen one. */
  schoolId: string | null;
  isSuperAdmin: boolean;
  /** True when a super admin still needs to pick a school before pages can load. */
  needsSchoolChoice: boolean;
  withScope: (path: string) => string;
  activeSchoolName: string | null;
};

const ScopeContext = createContext<ScopeValue | null>(null);

export function ScopeProvider({
  role,
  school,
  children,
}: {
  role: UserRole;
  school: { id: string; name: string } | null;
  children: React.ReactNode;
}) {
  const isSuperAdmin = role === "SUPER_ADMIN";
  const schoolId = school?.id ?? null;

  const withScope = useCallback(
    (path: string) => {
      if (!isSuperAdmin || !schoolId) return path;
      // Respect a query string the caller already built.
      return `${path}${path.includes("?") ? "&" : "?"}schoolId=${encodeURIComponent(schoolId)}`;
    },
    [isSuperAdmin, schoolId],
  );

  const value = useMemo<ScopeValue>(
    () => ({
      role,
      schoolId,
      isSuperAdmin,
      needsSchoolChoice: isSuperAdmin && !schoolId,
      withScope,
      activeSchoolName: school?.name ?? null,
    }),
    [
      role,
      schoolId,
      isSuperAdmin,
      withScope,
      school?.name,
    ],
  );

  return (
    <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
  );
}

export function useScope(): ScopeValue {
  const value = useContext(ScopeContext);
  if (!value)
    throw new Error(
      "useScope must be used inside a ScopeProvider (app/staff/layout.tsx).",
    );
  return value;
}

/** Role predicates, mirroring `canManageSchool` / `canReadStudentPins` on the server. */
export function canManageSchool(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN";
}
