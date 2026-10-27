import { useEffect, useState } from 'react'
import { ApiError, api, errorMessage } from '../lib/api'
import type { AdminStatus, CloudExam } from '../lib/types'
import { Alert, Brand, Icon, Loading, Modal, Spinner } from '../components/ui'

export function AdminConsole() {
  const [status, setStatus] = useState<AdminStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function loadStatus() {
    try {
      const next = await api<AdminStatus>('GET', '/api/admin/status')
      setStatus(next)
      setNeedsLogin(false)
      setError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setNeedsLogin(true)
      else setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  useEffect(() => {
    if (!status) return
    const timer = window.setInterval(() => {
      api<AdminStatus>('GET', '/api/admin/status')
        .then(setStatus)
        .catch(() => undefined)
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [status?.school?.id])

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <Brand />
          <Loading message="Opening the admin console…" />
        </div>
      </main>
    )
  }

  if (needsLogin || !status) {
    return (
      <LoginScreen
        onSignedIn={async () => {
          setLoading(true)
          await loadStatus()
        }}
        error={error}
      />
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Brand />
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Icon name="wifi" size={14} /> Hall ready
            </span>
            <button
              className="btn-secondary px-3 py-2"
              onClick={async () => {
                await api('POST', '/api/admin/logout').catch(() => undefined)
                setStatus(null)
                setNeedsLogin(true)
              }}
            >
              <Icon name="logout" size={18} /> Sign out
            </button>
          </div>
        </header>

        {error ? <Alert tone="danger" title="Admin action failed" onDismiss={() => setError(null)}>{error}</Alert> : null}
        {notice ? <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert> : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="card lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="label">School</p>
                <h1 className="mt-1 text-2xl font-bold text-on-surface">{status.school?.name ?? 'Paired hall'}</h1>
                <p className="mt-1 text-sm text-on-surface-variant">{status.localServer?.name ?? 'This computer'}</p>
              </div>
              <div className="rounded-xl bg-surface-container px-3 py-2 text-right">
                <p className="text-xs text-on-surface-variant">Version</p>
                <p className="font-mono text-sm font-semibold">{status.appVersion}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="label">Student address</p>
                <p className="mt-1 break-all font-mono text-lg font-bold text-primary">{status.studentUrl}</p>
                <p className="mt-1 text-xs text-on-surface-variant">Share on the hall board or scan the code.</p>
              </div>
              <div className="flex items-center justify-center rounded-xl border border-outline-variant/60 bg-surface p-3">
                <img src={status.qrDataUrl} alt={`QR code for ${status.studentUrl}`} className="h-36 w-36" />
              </div>
            </div>

            {status.firewallRulePresent === false ? (
              <Alert tone="warning" title="Firewall may block students">
                Allow “CBT Hall Server” through Windows Firewall on private networks.
              </Alert>
            ) : null}
          </section>

          <section className="card">
            <p className="label">Live hall status</p>
            <dl className="mt-3 space-y-3">
              <Metric label="Writing now" value={status.sessions.inProgress} icon="groups" tone="text-secondary" />
              <Metric label="Awaiting upload" value={status.sessions.pending} icon="cloud_upload" tone="text-status-pending" />
              <Metric label="Staged exams" value={status.exams.length} icon="description" tone="text-primary" />
              <Metric
                label="Clock difference"
                value={status.clockSkewSeconds === null ? '—' : `${status.clockSkewSeconds}s`}
                icon="schedule"
                tone={Math.abs(status.clockSkewSeconds ?? 0) > 60 ? 'text-error' : 'text-on-surface'}
              />
            </dl>
            <p className="mt-3 text-xs text-on-surface-variant">
              Last download: {formatTime(status.lastPulledAt)} · Last upload: {formatTime(status.lastPushedAt)}
            </p>
          </section>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Actions status={status} onDone={setStatus} setError={setError} setNotice={setNotice} />
          <Exams status={status} setStatus={setStatus} setError={setError} setNotice={setNotice} />
        </div>

        <p className="mt-6 text-center text-xs text-on-surface-variant">
          This console is restricted to this computer. Student devices can only reach the exam portal.
        </p>
      </div>
    </main>
  )
}

function LoginScreen({ onSignedIn, error }: { onSignedIn: () => Promise<void>; error: string | null }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Brand /></div>
        <section className="card animate-fade-in">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-container/40 text-primary">
              <Icon name="admin_panel_settings" filled size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-on-surface">Invigilator sign in</h1>
              <p className="text-sm text-on-surface-variant">This computer only</p>
            </div>
          </div>
          {error ? <Alert tone="danger" onDismiss={() => setLocalError(null)}>{error}</Alert> : null}
          {localError ? <Alert tone="danger" onDismiss={() => setLocalError(null)}>{localError}</Alert> : null}
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault()
              setBusy(true)
              setLocalError(null)
              try {
                await api('POST', '/api/admin/login', { pin }, { auth: false })
                await onSignedIn()
              } catch (err) {
                setLocalError(errorMessage(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            <label className="block">
              <span className="label mb-1.5 block">Invigilator PIN</span>
              <input
                className="input text-center font-mono text-xl tracking-[0.3em]"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                autoFocus
                required
              />
            </label>
            <button className="btn-primary w-full py-3" disabled={busy || pin.length < 6}>
              {busy ? <Spinner size={18} /> : <Icon name="login" size={20} />}
              {busy ? 'Signing in…' : 'Open admin console'}
            </button>
          </form>
        </section>
        <p className="mt-4 text-center text-xs text-on-surface-variant">
          Forgot the PIN? Re-run the setup wizard on this computer: <span className="font-mono">/setup</span>
        </p>
      </div>
    </main>
  )
}

function Metric({ label, value, icon, tone }: { label: string; value: number | string; icon: string; tone: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon name={icon} filled size={22} className={tone} />
      <div className="flex flex-1 items-center justify-between gap-3">
        <dt className="text-sm text-on-surface-variant">{label}</dt>
        <dd className={`text-xl font-bold ${tone}`}>{value}</dd>
      </div>
    </div>
  )
}

function Actions({
  status,
  onDone,
  setError,
  setNotice,
}: {
  status: AdminStatus
  onDone: (status: AdminStatus) => void
  setError: (message: string | null) => void
  setNotice: (message: string | null) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [modal, setModal] = useState<'backup' | 'push' | null>(null)

  async function run(name: string, fn: () => Promise<string>) {
    setBusy(name)
    setError(null)
    setNotice(null)
    try {
      const message = await fn()
      setNotice(message)
      onDone(await api<AdminStatus>('GET', '/api/admin/status'))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card">
      <p className="label">Actions</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          className="btn-primary justify-start"
          disabled={busy !== null}
          onClick={() => setModal('push')}
        >
          {busy === 'push' ? <Spinner size={18} /> : <Icon name="cloud_upload" size={20} />}
          {busy === 'push' ? 'Uploading…' : 'Upload results'}
        </button>
        <button
          className="btn-secondary justify-start"
          disabled={busy !== null}
          onClick={() =>
            void run('sweep', async () => {
              const result = await api<{ autoSubmitted: number; flagged: number }>('POST', '/api/admin/sweep')
              return `Checked expired sittings: ${result.autoSubmitted} auto-submitted, ${result.flagged} flagged.`
            })
          }
        >
          {busy === 'sweep' ? <Spinner size={18} /> : <Icon name="timer" size={20} />}
          Check timeouts
        </button>
        <button
          className="btn-secondary justify-start"
          disabled={busy !== null}
          onClick={() => setModal('backup')}
        >
          {busy === 'backup' ? <Spinner size={18} /> : <Icon name="save" size={20} />}
          Back up database
        </button>
        <button
          className={`justify-start ${status.autoPush ? 'btn-primary' : 'btn-secondary'}`}
          disabled={busy !== null}
          onClick={() =>
            void run('auto', async () => {
              const result = await api<{ autoPush: boolean }>('POST', '/api/admin/auto-push', { enabled: !status.autoPush })
              return result.autoPush
                ? 'Automatic upload enabled. It runs after the last exam closes, when this PC has internet.'
                : 'Automatic upload disabled.'
            })
          }
        >
          {busy === 'auto' ? <Spinner size={18} /> : <Icon name="autorenew" size={20} />}
          Auto-upload: {status.autoPush ? 'on' : 'off'}
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-on-surface-variant">
        Upload never sends a sitting that is still in progress. The manual button always works, even when auto-upload is off.
      </p>

      <Modal open={modal === 'push'} title="Upload finished results?" onClose={() => setModal(null)}>
        <p className="text-sm text-on-surface-variant">
          This sends every closed, unsynced sitting to the cloud. You can retry safely; the cloud rejects duplicates by their local id.
        </p>
        <div className="mt-5 flex gap-2">
          <button className="btn-secondary flex-1" onClick={() => setModal(null)}>Cancel</button>
          <button
            className="btn-primary flex-1"
            onClick={() => {
              setModal(null)
              void run('push', async () => {
                const result = await api<{ attempted: number; created: number; updated: number; rejected: unknown[] }>(
                  'POST',
                  '/api/admin/push',
                )
                return `Uploaded ${result.attempted}: ${result.created} new, ${result.updated} updated, ${result.rejected.length} rejected.`
              })
            }}
          >
            Upload now
          </button>
        </div>
      </Modal>

      <Modal open={modal === 'backup'} title="Save a database backup?" onClose={() => setModal(null)}>
        <p className="text-sm text-on-surface-variant">
          A copy will be written to <span className="font-mono">C:\ProgramData\CBT\backups</span>. Copy it to a USB drive before reimaging this computer.
        </p>
        <div className="mt-5 flex gap-2">
          <button className="btn-secondary flex-1" onClick={() => setModal(null)}>Cancel</button>
          <button
            className="btn-primary flex-1"
            onClick={() => {
              setModal(null)
              void run('backup', async () => {
                const result = await api<{ filename: string; sizeBytes: number }>('POST', '/api/admin/backup')
                return `Backup saved: ${result.filename} (${Math.round(result.sizeBytes / 1024)} KB).`
              })
            }}
          >
            Create backup
          </button>
        </div>
      </Modal>
    </section>
  )
}

function Exams({
  status,
  setStatus,
  setError,
  setNotice,
}: {
  status: AdminStatus
  setStatus: (status: AdminStatus) => void
  setError: (message: string | null) => void
  setNotice: (message: string | null) => void
}) {
  const [cloudExams, setCloudExams] = useState<CloudExam[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function loadCloud() {
    setError(null)
    try {
      const data = await api<{ exams: CloudExam[] }>('GET', '/api/admin/exams')
      setCloudExams(data.exams)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function pull(exam: CloudExam) {
    setBusy(exam.id)
    setError(null)
    try {
      await api('POST', '/api/admin/pull', { examId: exam.id })
      setNotice(`Downloaded ${exam.title}.`)
      setStatus(await api<AdminStatus>('GET', '/api/admin/status'))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3">
        <p className="label">Staged papers</p>
        <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => void loadCloud()}>
          <Icon name="cloud_download" size={16} /> Download more
        </button>
      </div>

      {status.exams.length === 0 ? (
        <p className="mt-3 text-sm text-on-surface-variant">No papers downloaded yet. Use “Download more” while this PC has internet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-outline-variant/40">
          {status.exams.map((exam) => (
            <li key={exam.id} className="flex items-center gap-3 py-3">
              <Icon name="description" filled className="text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-on-surface">{exam.title}</p>
                <p className="text-xs text-on-surface-variant">
                  {exam.classLevel} · {exam.subject} · {exam.questionCount} questions · downloaded {formatTime(exam.pulledAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {cloudExams ? (
        <div className="mt-4 rounded-xl border border-outline-variant/60 bg-surface-container-low p-3">
          <p className="mb-2 text-xs font-semibold text-on-surface-variant">Available from the cloud</p>
          {cloudExams.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No published LAN exams are available.</p>
          ) : (
            <ul className="space-y-2">
              {cloudExams.map((exam) => (
                <li key={exam.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{exam.title}</span>
                  <button className="btn-secondary px-2.5 py-1 text-xs" disabled={busy !== null} onClick={() => void pull(exam)}>
                    {busy === exam.id ? <Spinner size={14} /> : 'Download'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}

function formatTime(value: string | null): string {
  if (!value) return 'never'
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}
