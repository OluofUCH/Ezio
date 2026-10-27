'use client'

import { useState, type FormEvent } from 'react'
import { Alert, Badge } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { ApiClientError, api, errorMessage } from '@/lib/client/api'
import type { ChangePasswordResult, UserRole } from '@/lib/client/types'

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Platform admin',
  SCHOOL_ADMIN: 'School admin',
  TEACHER: 'Teacher',
}

/** Mirrors `passwordSchema` (lib/validation/common.ts) so the rule is stated up front. */
const MIN_LENGTH = 10

export function AccountSettings({
  fullName,
  email,
  role,
  schoolName,
}: {
  fullName: string
  email: string
  role: UserRole
  schoolName: string | null
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [reveal, setReveal] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState<ChangePasswordResult | null>(null)

  /**
   * Confirmation is checked here and nowhere else on purpose — the server has no
   * `confirmPassword` field, because a mistyped repeat is a UI concern, and sending it
   * would only add a value to be validated for no gain (`.strict()` would reject it).
   */
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH
  const unchanged = newPassword.length > 0 && newPassword === currentPassword

  const canSubmit =
    !busy &&
    currentPassword.length > 0 &&
    newPassword.length >= MIN_LENGTH &&
    newPassword === confirmPassword &&
    !unchanged

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return

    setBusy(true)
    setError(null)
    setFieldErrors({})
    setDone(null)

    try {
      const result = await api.post<ChangePasswordResult>('/api/auth/staff/change-password', {
        currentPassword,
        newPassword,
      })

      setDone(result)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setReveal(false)
    } catch (err) {
      if (err instanceof ApiClientError) setFieldErrors(err.fieldErrors())
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
          My account
        </h1>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          Your details and sign-in password.
        </p>
      </header>

      {/* Profile */}
      <section className="card p-6 md:p-8">
        <h2 className="font-headline-md text-headline-md text-on-surface">Details</h2>

        <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <Row label="Name" value={fullName} />
          <Row label="Email" value={email} />
          <Row label="Role" value={<Badge tone={role === 'TEACHER' ? 'neutral' : 'info'}>{ROLE_LABELS[role]}</Badge>} />
          <Row label="School" value={schoolName ?? 'Every school (platform admin)'} />
        </dl>

        <p className="mt-6 font-label-sm text-label-sm text-outline">
          Your name, email and role are managed by a school administrator. Email in particular
          is your sign-in identifier, so changing it is an account transfer rather than an edit.
        </p>
      </section>

      {/* Password */}
      <section className="card p-6 md:p-8">
        <h2 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
          <Icon name="lock" className="text-primary" />
          Change password
        </h2>
        <p className="mb-6 mt-1 font-body-md text-body-md text-on-surface-variant">
          You need your current password to set a new one.
        </p>

        {done ? (
          <Alert tone="success" title="Password changed" className="mb-6" onDismiss={() => setDone(null)}>
            {done.note}
          </Alert>
        ) : null}

        {error ? (
          <Alert tone="danger" title="Could not change your password" className="mb-6" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <form onSubmit={submit} className="max-w-md space-y-5" noValidate>
          <Field
            id="currentPassword"
            label="Current password"
            icon="lock_open"
            type={reveal ? 'text' : 'password'}
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            error={fieldErrors.currentPassword}
          />

          <Field
            id="newPassword"
            label="New password"
            icon="password"
            type={reveal ? 'text' : 'password'}
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            error={
              fieldErrors.newPassword ??
              (tooShort
                ? `Use at least ${MIN_LENGTH} characters.`
                : unchanged
                  ? 'Your new password must be different from your current one.'
                  : undefined)
            }
            hint={`At least ${MIN_LENGTH} characters. Length matters more than symbols — a short phrase you can remember beats "Password1!".`}
          />

          <Field
            id="confirmPassword"
            label="Confirm new password"
            icon="done_all"
            type={reveal ? 'text' : 'password'}
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            error={mismatch ? 'The two passwords do not match.' : undefined}
          />

          <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">
            <input
              type="checkbox"
              checked={reveal}
              onChange={(event) => setReveal(event.target.checked)}
              className="h-4 w-4 accent-[#4a6700]"
            />
            Show passwords
          </label>

          <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
            {busy ? <Spinner size={20} /> : <Icon name="lock_reset" size={20} />}
            {busy ? 'Changing…' : 'Change password'}
          </button>
        </form>

        <p className="mt-6 max-w-md font-label-sm text-label-sm text-outline">
          Signing in elsewhere is not affected immediately — sessions already open on other
          devices stay valid until they expire. Log out on those devices if you need them
          ended straight away.
        </p>
      </section>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-border-subtle pb-3">
      <dt className="font-label-sm text-label-sm text-on-surface-variant">{label}</dt>
      <dd className="mt-1 font-body-md text-body-md text-on-surface">{value}</dd>
    </div>
  )
}

function Field({
  id,
  label,
  icon,
  type,
  value,
  onChange,
  autoComplete,
  error,
  hint,
}: {
  id: string
  label: string
  icon: string
  type: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  error?: string
  hint?: string
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-label-md text-label-md text-on-surface-variant">
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
          autoComplete={autoComplete}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-lg border-2 bg-[#F9FAFB] py-3 pl-10 pr-4 font-body-md text-body-md outline-none transition-colors focus:bg-white ${
            error ? 'border-error' : 'border-transparent focus:border-primary-container'
          }`}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 font-label-sm text-label-sm text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 font-label-sm text-label-sm text-outline">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
