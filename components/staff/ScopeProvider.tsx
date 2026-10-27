"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { UserRole } from "@/lib/client/types";

/**
 * SCHOOL SCOPE FOR STAFF REQUESTS
 * ===============================
 *
 * `requireSchoolScope` (lib/auth/session.ts) derives the school from the account for a
 * SCHOOL_ADMIN or TEACHER — nothing the client sends can influence it. SUPER_ADMIN is the
 * one exception: having no school of their own, they must name one with `?schoolId=`, and
 * that is the only place in the codebase where a school id is read from a request.
 *
 * This context is the client half of that arrangement. `withScope` appends the parameter
 * for a super admin and returns the path untouched for everyone else — so a page is
 * written once and the privileged case is handled in a single place rather than at every
 * call site, where forgetting it would produce a confusing 403.
 *
 * The chosen school is a UI preference and lives in `localStorage`. It grants nothing: the
 * server still verifies the role behind the cookie and that the named school exists, so
 * editing the stored value gets a non-super-admin exactly the 403 they had before.
 */

const ACTIVE_SCHOOL_KEY = "Ezio:active-school";

type ScopeValue = {
  role: UserRole;
  /** The school every request targets, or null when a super admin has not chosen one. */
  schoolId: string | null;
  isSuperAdmin: boolean;
  /** True when a super admin still needs to pick a school before pages can load. */
  needsSchoolChoice: boolean;
  withScope: (path: string) => string;
  setActiveSchool: (schoolId: string, name?: string) => void;
  activeSchoolName: string | null;
};

const ScopeContext = createContext<ScopeValue | null>(null);

export function ScopeProvider({
  role,
  ownSchoolId,
  ownSchoolName,
  children,
}: {
  role: UserRole;
  ownSchoolId: string | null;
  ownSchoolName: string | null;
  children: React.ReactNode;
}) {
  const isSuperAdmin = role === "SUPER_ADMIN";
  const [chosen, setChosen] = useState<{
    id: string;
    name: string | null;
  } | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    try {
      const raw = window.localStorage.getItem(ACTIVE_SCHOOL_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: unknown; name?: unknown };
      if (typeof parsed.id === "string" && parsed.id) {
        setChosen({
          id: parsed.id,
          name: typeof parsed.name === "string" ? parsed.name : null,
        });
      }
    } catch {
      // Corrupt or unavailable storage just means "no school chosen yet".
    }
  }, [isSuperAdmin]);

  const setActiveSchool = useCallback((schoolId: string, name?: string) => {
    const record = { id: schoolId, name: name ?? null };
    setChosen(record);
    try {
      window.localStorage.setItem(ACTIVE_SCHOOL_KEY, JSON.stringify(record));
    } catch {
      // Non-fatal — the choice simply does not survive a reload.
    }
  }, []);

  const schoolId = isSuperAdmin ? (chosen?.id ?? null) : ownSchoolId;

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
      setActiveSchool,
      activeSchoolName: isSuperAdmin ? (chosen?.name ?? null) : ownSchoolName,
    }),
    [
      role,
      schoolId,
      isSuperAdmin,
      withScope,
      setActiveSchool,
      chosen,
      ownSchoolName,
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
