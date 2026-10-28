import { useEffect, useState, type ReactNode } from 'react'
import { api, errorMessage } from '../lib/api'
import type { CloudExam, SetupState } from '../lib/types'
import { Alert, Brand, Icon, Loading, Spinner, StepBadge } from '../components/ui'

type Step = 'loading' | 'claim' | 'pin' | 'stage' | 'ready'

export function SetupWizard() {
  const [state, setState] = useState<SetupState | null>(null)
  const [step, setStep] = useState<Step>('loading')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    try {
      const next = await api<SetupState>('GET', '/api/setup/state', undefined, { auth: false })
      setState(next)
      setStep(!next.configured ? 'claim' : !next.pinSet ? 'pin' : next.staged ? 'ready' : 'stage')
    } catch (err) {
      setError(errorMessage(err))
      setStep('claim')
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  if (step === 'loading') {
    return (
      <Shell>
        <Loading message="Checking this hall serverâ€¦" />
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Brand />
          <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface-variant">
            v{state?.appVersion ?? '0.1.1'}
          </span>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-2">
          <Step active={step === 'claim' || step === 'pin' || step === 'stage' || step === 'ready'} done={step !== 'claim'} label="Pair" />
          <Step active={step === 'pin' || step === 'stage' || step === 'ready'} done={step === 'stage' || step === 'ready'} label="Protect" />
          <Step active={step === 'stage' || step === 'ready'} done={step === 'ready'} label="Prepare" />
        </div>

        {error ? <Alert tone="danger" title="Something needs attention" onDismiss={() => setError(null)}>{error}</Alert> : null}
        {notice ? <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert> : null}

        {step === 'claim' ? (
          <ClaimStep
            state={state}
            busy={busy}
            onClaim={async (code, cloudUrl) => {
              setBusy(true)
              setError(null)
              try {
                await api('POST', '/api/setup/claim', { setupCode: code, cloudBaseUrl: cloudUrl || undefined }, { auth: false })
                setNotice('This hall is paired with the school.')
                await refresh()
              } catch (err) {
                setError(errorMessage(err))
              } finally {
                setBusy(false)
              }
            }}
          />
        ) : null}

        {step === 'pin' ? (
          <PinStep
            busy={busy}
            onSave={async (pin) => {
              setBusy(true)
              setError(null)
              try {
                await api('POST', '/api/setup/pin', { pin }, { auth: false })
                setNotice('Invigilator PIN saved.')
                await refresh()
              } catch (err) {
                setError(errorMessage(err))
              } finally {
                setBusy(false)
              }
            }}
          />
        ) : null}

        {step === 'stage' ? <StageStep state={state} onStaged={refresh} /> : null}

        {step === 'ready' && state ? <ReadyStep state={state} /> : null}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-12">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-1.5 bg-primary" />
      {children}
      <p className="mx-auto mt-10 max-w-3xl text-center text-xs text-on-surface-variant">
        Setup and admin pages work only on this computer. Student devices use the hall address shown at the end.
      </p>
    </main>
  )
}

function Step({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${active ? 'border-primary/40 bg-primary/5' : 'border-outline-variant/60 bg-surface'}`}>
      <StepBadge number={label === 'Pair' ? 1 : label === 'Protect' ? 2 : 3} active={active} done={done} />
      <span className={active ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}>{label}</span>
    </div>
  )
}

function ClaimStep({
  state,
  busy,
  onClaim,
}: {
  state: SetupState | null
  busy: boolean
  onClaim: (code: string, cloudUrl: string) => void
}) {
  const [code, setCode] = useState('')
  const [cloudUrl, setCloudUrl] = useState(state?.cloudBaseUrl ?? '')

  useEffect(() => {
    if (state?.cloudBaseUrl && !cloudUrl) setCloudUrl(state.cloudBaseUrl)
  }, [state?.cloudBaseUrl])

  return (
    <section className="card animate-fade-in">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/40 text-primary">
          <Icon name="link" filled size={26} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Pair this hall</h1>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            On the school dashboard, open <strong>Local servers</strong>, create this hall, and copy its one-time setup code.
          </p>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          onClaim(code, cloudUrl.trim())
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className="label mb-1.5 block">Setup code</span>
          <input
            className="input text-center font-mono text-xl tracking-[0.25em] uppercase"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="XXXXX-XXXXX"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            required
          />
          <span className="mt-1.5 block text-xs text-on-surface-variant">The code expires after 30 minutes and works once.</span>
        </label>

        <label className="block">
          <span className="label mb-1.5 block">Cloud address</span>
          <input
            className="input"
            type="url"
            value={cloudUrl}
            onChange={(event) => setCloudUrl(event.target.value)}
            placeholder="https://your-school.cbt.example"
            required
          />
          <span className="mt-1.5 block text-xs text-on-surface-variant">
            The address of the school platform that issued the code. It is normally shown on the school dashboard.
          </span>
        </label>

        {state?.firewallRulePresent === false ? (
          <Alert tone="warning" title="Windows Firewall may block student devices">
            The installer normally opens port 4000. If students cannot connect later, allow â€œCBT Hall Serverâ€ through Windows Firewall.
          </Alert>
        ) : null}

        <button className="btn-primary w-full py-3" disabled={busy || code.trim().length < 8}>
          {busy ? <Spinner size={18} /> : <Icon name="link" size={20} />}
          {busy ? 'Pairingâ€¦' : 'Pair this hall'}
        </button>
      </form>
    </section>
  )
}

function PinStep({ busy, onSave }: { busy: boolean; onSave: (pin: string) => void }) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const mismatch = confirm.length > 0 && pin !== confirm

  return (
    <section className="card animate-fade-in">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/40 text-primary">
          <Icon name="pin" filled size={26} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Protect the admin console</h1>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            Choose a PIN the invigilator will use on this computer to stage exams, push results and make backups. Students never see it.
          </p>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!mismatch) onSave(pin)
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className="label mb-1.5 block">Invigilator PIN</span>
          <input
            className="input font-mono text-lg tracking-widest"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6,8}"
            maxLength={8}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            placeholder="6 to 8 digits"
            autoFocus
            required
          />
        </label>
        <label className="block">
          <span className="label mb-1.5 block">Confirm PIN</span>
          <input
            className="input font-mono text-lg tracking-widest"
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value.replace(/\D/g, ''))}
            required
          />
          {mismatch ? <span className="mt-1.5 block text-xs font-semibold text-error">The two PINs do not match.</span> : null}
        </label>
        <button className="btn-primary w-full py-3" disabled={busy || pin.length < 6 || pin !== confirm}>
          {busy ? <Spinner size={18} /> : <Icon name="lock" size={20} />}
          {busy ? 'Savingâ€¦' : 'Save PIN and continue'}
        </button>
      </form>
    </section>
  )
}

function StageStep({ state, onStaged }: { state: SetupState | null; onStaged: () => Promise<void> }) {
  const [exams, setExams] = useState<CloudExam[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string[]>([])

  useEffect(() => {
    api<{ exams: CloudExam[] }>('GET', '/api/setup/exams', undefined, { auth: false })
      .then((data) => {
        setExams(data.exams)
        setSelected(new Set(data.exams.map((exam) => exam.id)))
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  async function stage() {
    setBusy(true)
    setError(null)
    const pulled: string[] = []
    try {
      for (const examId of selected) {
        await api('POST', '/api/setup/pull', { examId }, { auth: false })
        pulled.push(examId)
        setDone([...pulled])
      }
      await onStaged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card animate-fade-in">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/40 text-primary">
          <Icon name="download" filled size={26} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Download exam papers</h1>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            Do this while this computer still has internet. After this step the hall can run entirely offline.
          </p>
        </div>
      </div>

      {error ? <Alert tone="danger" title="Could not load exams" onDismiss={() => setError(null)}>{error}</Alert> : null}
      {state?.firewallRulePresent === false ? (
        <Alert tone="warning" title="Firewall warning">Student devices may not be able to connect. Allow â€œCBT Hall Serverâ€ through Windows Firewall.</Alert>
      ) : null}

      {exams === null ? (
        <Loading message="Fetching published examsâ€¦" />
      ) : exams.length === 0 ? (
        <Alert tone="warning" title="No published LAN exams yet">
          Publish an OFFLINE_LAN or HYBRID exam on the school dashboard, then return to this page.
        </Alert>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => {
            const checked = selected.has(exam.id)
            return (
              <label
                key={exam.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                  checked ? 'border-primary bg-primary/5' : 'border-outline-variant/60 bg-surface hover:bg-surface-container-low'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(selected)
                    if (next.has(exam.id)) next.delete(exam.id)
                    else next.add(exam.id)
                    setSelected(next)
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-on-surface">{exam.title}</span>
                    <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs font-semibold text-on-surface-variant">{exam.classLevel}</span>
                  </span>
                  <span className="mt-1 block text-sm text-on-surface-variant">
                    {exam.subject} Â· {exam.questionCount} question{exam.questionCount === 1 ? '' : 's'} Â· {exam.durationMins} min
                  </span>
                  {done.includes(exam.id) ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      <Icon name="check_circle" filled size={14} /> Downloaded
                    </span>
                  ) : null}
                </span>
              </label>
            )
          })}
        </div>
      )}

      <button className="btn-primary mt-5 w-full py-3" onClick={() => void stage()} disabled={busy || selected.size === 0 || exams === null}>
        {busy ? <Spinner size={18} /> : <Icon name="cloud_download" size={20} />}
        {busy ? `Downloading ${done.length}/${selected.size}â€¦` : `Download ${selected.size} selected exam${selected.size === 1 ? '' : 's'}`}
      </button>
    </section>
  )
}

function ReadyStep({ state }: { state: SetupState }) {
  return (
    <section className="card animate-fade-in">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/40 text-primary">
          <Icon name="check_circle" filled size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">This hall is ready</h1>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            {state.schoolName} Â· {state.localServerName}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <p className="label">Student address</p>
        <p className="mt-1 break-all font-mono text-xl font-bold text-primary">{state.studentUrl}</p>
        <p className="mt-2 text-sm text-on-surface-variant">Write this on the board. Students open it in a browser on the hall network.</p>
      </div>

      {state.firewallRulePresent === false ? (
        <Alert tone="warning" title="Windows Firewall may be blocking the hall">
          Allow â€œCBT Hall Serverâ€ on private networks. Without it, students cannot reach {state.studentUrl}.
        </Alert>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <a className="btn-primary flex-1" href="/admin">
          <Icon name="admin_panel_settings" size={20} /> Open admin console
        </a>
        <a className="btn-secondary flex-1" href="/">
          <Icon name="open_in_new" size={20} /> Preview student portal
        </a>
      </div>
      <p className="mt-4 text-center text-xs text-on-surface-variant">
        Admin console: <span className="font-mono">http://localhost:{new URL(state.studentUrl).port || '4000'}/admin</span>
      </p>
    </section>
  )
}

