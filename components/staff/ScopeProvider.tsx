"use client";

import {
  createContext,
  useContext,
  useMemo,
} from "react";
import type { UserRole } from "@/lib/client/types";

/**
 * SCHOOL SCOPE FOR STAFF REQUESTS
 * ===============================
 *
 * School scope comes only from the authenticated school account. Platform accounts
 * have no school context; every school API independently enforces that boundary.
 */

type ScopeValue = {
  role: UserRole;
  /** The account's school, or null for a platform administrator. */
  schoolId: string | null;
  isSuperAdmin: boolean;
  withScope: (path: string) => string;
  activeSchoolName: string | null;
};

const ScopeContext = createContext<ScopeValue | null>(null);
const withScope = (path: string) => path;

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
  const schoolId = isSuperAdmin ? null : school?.id ?? null;

  const value = useMemo<ScopeValue>(
    () => ({
      role,
      schoolId,
      isSuperAdmin,
      withScope,
      activeSchoolName: isSuperAdmin ? null : school?.name ?? null,
    }),
    [
      role,
      schoolId,
      isSuperAdmin,
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
  return role === "SCHOOL_ADMIN";
}
