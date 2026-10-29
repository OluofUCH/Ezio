"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { ApiClientError, api, errorMessage } from "@/lib/client/api";
import type { StaffLoginResult, StudentLoginResult } from "@/lib/client/types";
import { portalHome } from "@/src/modules/shared/navigation";

type Tab = "student" | "staff";

/** Remembers the school code so a student at a shared lab machine types it once. */
const SLUG_KEY = "Ezio:school-slug";

export function LoginForm({
  initialTab,
}: {
  initialTab: Tab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [schoolSlug, setSchoolSlug] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    try {
      const remembered = window.localStorage.getItem(SLUG_KEY);
      if (remembered) setSchoolSlug(remembered);
    } catch {
      // Private-mode browsers throw on localStorage access. The field just starts empty.
    }
  }, []);

  function switchTab(next: Tab) {
    setTab(next);
    setError(null);
    setFieldErrors({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      if (tab === "student") {
        const result = await api.post<StudentLoginResult>(
          "/api/auth/student/login",
          {
            // The server upper-cases the reg number and lower-cases the slug itself
            // (lib/validation/common.ts), so no normalisation is duplicated here.
            schoolSlug,
            regNumber,
            pin,
          },
        );

        try {
          window.localStorage.setItem(SLUG_KEY, result.school.slug);
        } catch {
          /* non-fatal */
        }

        router.replace(portalHome("STUDENT"));
      } else {
        const result = await api.post<StaffLoginResult>(
          "/api/auth/staff/login",
          {
            email,
            password,
          },
        );

        // The SMS dashboard includes school selection for Super Admin. Every staff
        // role starts here and opens CBT from the shared workspace navigation.
        router.replace(portalHome(result.user.role));
      }

      // Drops the router cache so the authenticated shell re-renders with the new session.
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFieldErrors(err.fieldErrors());
      }
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="font-headline-lg text-headline-lg text-on-surface">
        Welcome back
      </h1>
      <p className="mb-8 mt-2 font-body-md text-body-md text-on-surface-variant">
        Sign in to your school portal.
      </p>

      <div
        className="mb-8 flex gap-1 rounded-lg bg-surface-container p-1"
        role="tablist"
      >
        <TabButton
          active={tab === "student"}
          onClick={() => switchTab("student")}
        >
          Student
        </TabButton>
        <TabButton active={tab === "staff"} onClick={() => switchTab("staff")}>
          Admin / Teacher
        </TabButton>
      </div>

      {error ? (
        <Alert tone="danger" className="mb-6" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <form onSubmit={submit} className="space-y-5" noValidate>
        {tab === "student" ? (
          <>
            <Field
              id="schoolSlug"
              label="School code"
              icon="domain"
              value={schoolSlug}
              onChange={setSchoolSlug}
              placeholder="e.g. grace-academy"
              autoComplete="organization"
              hint="Ask your school office if you are not sure."
              error={fieldErrors.schoolSlug}
              required
            />
            <Field
              id="regNumber"
              label="Registration number"
              icon="badge"
              value={regNumber}
              onChange={setRegNumber}
              placeholder="e.g. EDU-2024-001"
              autoComplete="username"
              autoCapitalize="characters"
              error={fieldErrors.regNumber}
              required
            />
            <Field
              id="pin"
              label="PIN"
              icon="dialpad"
              type="password"
              value={pin}
              onChange={setPin}
              placeholder="4–8 digits"
              autoComplete="current-password"
              inputMode="numeric"
              error={fieldErrors.pin}
              required
            />
          </>
        ) : (
          <>
            <Field
              id="email"
              label="Institutional email"
              icon="mail"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="admin@school.edu.ng"
              autoComplete="username"
              error={fieldErrors.email}
              required
            />
            <Field
              id="password"
              label="Password"
              icon="lock"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete="current-password"
              error={fieldErrors.password}
              required
            />
          </>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn-primary mt-2 w-full py-3"
        >
          {busy ? <Spinner size={20} /> : null}
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-8 border-t border-surface-variant pt-6 text-center">
        <p className="font-label-sm text-label-sm text-outline">
          {tab === "student"
            ? "Forgotten your PIN? Your school administrator can reset it for you."
            : "Trouble signing in? Contact your platform administrator."}
        </p>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? "flex-1 rounded-md border-b-2 border-primary-container bg-white py-2 font-label-md text-label-md text-on-surface shadow-sm transition-all"
          : "flex-1 rounded-md py-2 font-label-md text-label-md text-on-surface-variant transition-all hover:text-on-surface"
      }
    >
      {children}
    </button>
  );
}

type FieldProps = {
  id: string;
  label: string;
  icon: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  autoCapitalize?: string;
  inputMode?: "numeric" | "text";
  hint?: string;
  error?: string;
  required?: boolean;
};

function Field({
  id,
  label,
  icon,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  autoCapitalize,
  inputMode,
  hint,
  error,
  required,
}: FieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block font-label-md text-label-md text-on-surface-variant"
      >
        {label}
      </label>
      <div className="relative">
        <Icon
          name={icon}
          size={20}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
        />
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoCapitalize={autoCapitalize}
          inputMode={inputMode}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-lg border-2 bg-[#F9FAFB] py-3 pl-10 pr-4 font-body-md text-body-md outline-none transition-colors focus:bg-white ${
            error
              ? "border-error"
              : "border-transparent focus:border-primary-container"
          }`}
        />
      </div>
      {error ? (
        <p
          id={`${id}-error`}
          className="mt-1 font-label-sm text-label-sm text-error"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={`${id}-hint`}
          className="mt-1 font-label-sm text-label-sm text-outline"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
