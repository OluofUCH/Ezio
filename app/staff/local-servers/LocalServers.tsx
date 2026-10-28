'use client'

import { useState, type FormEvent } from 'react'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { LoadingPanel, Spinner } from '@/components/ui/Spinner'
import { ActiveSchoolBanner, SchoolGate } from '@/components/staff/SchoolGate'
import { useScope } from '@/components/staff/ScopeProvider'
import { ApiClientError, api, errorMessage } from '@/lib/client/api'
import { formatDate, formatRelative } from '@/lib/client/format'
import { useApi } from '@/lib/client/useApi'
import type {
  LocalServer,
  LocalServerCreated,
  LocalServerList,
  RotateKeyResult,
  SetupCodeResult,
} from '@/lib/client/types'

/** A device seen within a day is treated as healthy; beyond that, worth a look. */
const RECENT_MS = 24 * 60 * 60 * 1000

const HALL_SERVER_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_HALL_SERVER_DOWNLOAD_URL?.trim() ||
  'https://github.com/OluofUCH/Ezio/releases/latest/download/CBT-Hall-Server-Setup-0.1.1.exe'

const HALL_SERVER_GUIDE_URL =
  process.env.NEXT_PUBLIC_HALL_SERVER_GUIDE_URL?.trim() ||
  'https://github.com/OluofUCH/Ezio/blob/main/packaging/windows/README.md'

const HALL_SERVER_CHECKSUM_URL =
  process.env.NEXT_PUBLIC_HALL_SERVER_CHECKSUM_URL?.trim() ||
  'https://github.com/OluofUCH/Ezio/releases/latest/download/SHA256SUMS.txt'

type SetupState = {
  serverId: string
  name: string
  code: string
  expiresAt: string
  warning: string
  cloudAddress: string
}

export function LocalServers() {
  return (
    <SchoolGate>
      <LocalServersBody />
    </SchoolGate>
  )
}

function LocalServersBody() {
  const { withScope } = useScope()
  const { data, error, loading, refetch } = useApi<LocalServerList>(withScope('/api/local-servers'))

  const [provisionOpen, setProvisionOpen] = useState(false)
  const [rotating, setRotating] = useState<LocalServer | null>(null)
  const [setup, setSetup] = useState<SetupState | null>(null)
  const [issuedKey, setIssuedKey] = useState<{
    name: string
    value: string
    setup: string
    caution?: string
  } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  async function rotate(server: LocalServer) {
    setActionError(null)
    setBusyId(server.id)
    try {
      const result = await api.post<RotateKeyResult>(
        withScope(`/api/local-servers/${server.id}/rotate-key`),
      )
      setIssuedKey({
        name: result.localServer.name,
        value: result.deviceKey.value,
        setup: result.deviceKey.setup,
        caution: result.caution,
      })
      setRotating(null)
      refetch()
    } catch (err) {
      setActionError(errorMessage(err))
      setRotating(null)
    } finally {
      setBusyId(null)
    }
  }

  async function issueCode(server: LocalServer) {
    setActionError(null)
    setBusyId(server.id)
    try {
      const result = await api.post<SetupCodeResult>(
        withScope(`/api/local-servers/${server.id}/setup-code`),
      )
      setSetup({
        serverId: result.localServer.id,
        name: result.localServer.name,
        code: result.setupCode.value,
        expiresAt: result.setupCode.expiresAt,
        warning: result.setupCode.warning,
        cloudAddress: window.location.origin,
      })
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function setActive(server: LocalServer, isActive: boolean) {
    setActionError(null)
    setBusyId(server.id)
    try {
      await api.patch(withScope(`/api/local-servers/${server.id}`), { isActive })
      refetch()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function regenerateCode() {
    if (!setup) return
    setGenerating(true)
    try {
      const result = await api.post<SetupCodeResult>(
        withScope(`/api/local-servers/${setup.serverId}/setup-code`),
      )
      setSetup({
        serverId: result.localServer.id,
        name: result.localServer.name,
        code: result.setupCode.value,
        expiresAt: result.setupCode.expiresAt,
        warning: result.setupCode.warning,
        cloudAddress: setup.cloudAddress,
      })
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <ActiveSchoolBanner />

      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
            Local servers
          </h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Machines that run exams on your school network when there is no internet.
          </p>
        </div>

        <button type="button" onClick={() => setProvisionOpen(true)} className="btn-primary shrink-0">
          <Icon name="add" size={20} />
          Create hall
        </button>
      </header>

      {actionError ? (
        <Alert tone="danger" title="That did not work" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}

      <Alert tone="info" title="How an offline exam runs">
        Create a hall, then install the CBT Hall Server on the exam-hall PC and enter the
        one-time pairing code. Before exam day, the hall pulls the exam and that class&apos;s
        roster. On the day it serves the exam over the LAN with no internet. Afterwards it
        pushes the sessions back up.
      </Alert>

      {loading ? (
        <LoadingPanel message="Loading servers..." />
      ) : error && !data ? (
        <Alert tone="danger" title="Could not load servers">
          {error}
          <button type="button" onClick={refetch} className="mt-3 block font-label-md underline">
            Try again
          </button>
        </Alert>
      ) : data && data.localServers.length > 0 ? (
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
          {data.localServers.map((server) => {
            const recent =
              server.lastSyncedAt !== null &&
              Date.now() - new Date(server.lastSyncedAt).getTime() < RECENT_MS

            return (
              <div key={server.id} className="card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-2 h-3 w-3 shrink-0 rounded-full ${
                        !server.isActive
                          ? 'bg-outline'
                          : !server.isPaired
                            ? 'bg-status-pending'
                            : recent
                              ? 'bg-status-synced shadow-[0_0_8px_rgba(37,99,235,0.5)]'
                              : 'bg-status-pending shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                      }`}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <h2 className="truncate font-headline-md text-headline-md text-on-surface">
                        {server.name}
                      </h2>
                      <p className="font-body-md text-body-md text-on-surface-variant">
                        {server.lastSeenIp ?? 'never connected'}
                      </p>
                    </div>
                  </div>

                  <Badge
                    tone={!server.isActive ? 'neutral' : !server.isPaired ? 'warning' : recent ? 'info' : 'warning'}
                    icon={!server.isActive ? 'block' : !server.isPaired ? 'link_off' : recent ? 'cloud_done' : 'cloud_off'}
                  >
                    {!server.isActive ? 'Disabled' : !server.isPaired ? 'Not paired' : recent ? 'Synced' : 'Sync pending'}
                  </Badge>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border-subtle pt-4">
                  <div>
                    <dt className="font-label-sm text-label-sm text-on-surface-variant">Paired</dt>
                    <dd className="mt-0.5 font-label-md text-label-md text-on-surface">
                      {server.isPaired ? formatRelative(server.pairedAt) : 'Not yet'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-label-sm text-label-sm text-on-surface-variant">Last sync</dt>
                    <dd className="mt-0.5 font-label-md text-label-md text-on-surface">
                      {formatRelative(server.lastSyncedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-label-sm text-label-sm text-on-surface-variant">
                      Sessions synced
                    </dt>
                    <dd className="mt-0.5 font-label-md text-label-md text-on-surface">
                      {server._count.examSessions}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-label-sm text-label-sm text-on-surface-variant">App version</dt>
                    <dd className="mt-0.5 font-label-md text-label-md text-on-surface">
                      {server.appVersion ?? 'unknown'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-label-sm text-label-sm text-on-surface-variant">Key</dt>
                    <dd className="mt-0.5 font-label-md text-label-md text-on-surface">
                      {server.deviceKeyPrefix ? `${server.deviceKeyPrefix}...` : 'not issued'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-label-sm text-label-sm text-on-surface-variant">Created</dt>
                    <dd className="mt-0.5 font-label-md text-label-md text-on-surface">
                      {formatDate(server.createdAt)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap gap-3 border-t border-border-subtle pt-4">
                  <button
                    type="button"
                    onClick={() => void issueCode(server)}
                    disabled={busyId === server.id || !server.isActive}
                    className="btn-secondary flex-1 py-2"
                  >
                    {busyId === server.id ? <Spinner size={18} /> : <Icon name="link" size={18} />}
                    {server.isPaired ? 'Re-pair' : 'Pair hall'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotating(server)}
                    disabled={busyId === server.id}
                    className="btn-secondary flex-1 py-2"
                  >
                    <Icon name="key" size={18} />
                    Rotate key
                  </button>
                  <button
                    type="button"
                    onClick={() => void setActive(server, !server.isActive)}
                    disabled={busyId === server.id}
                    className="btn-secondary flex-1 py-2"
                  >
                    {busyId === server.id ? (
                      <Spinner size={18} />
                    ) : (
                      <Icon name={server.isActive ? 'block' : 'check_circle'} size={18} />
                    )}
                    {server.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="dns"
            title="No local servers yet"
            description="Create one for each exam hall that needs to run without internet."
            action={
              <button type="button" onClick={() => setProvisionOpen(true)} className="btn-primary">
                <Icon name="add" size={20} />
                Create hall
              </button>
            }
          />
        </div>
      )}

      <ProvisionModal
        open={provisionOpen}
        onClose={() => setProvisionOpen(false)}
        onProvisioned={(created) => {
          setProvisionOpen(false)
          setSetup({
            serverId: created.localServer.id,
            name: created.localServer.name,
            code: created.setupCode.value,
            expiresAt: created.setupCode.expiresAt,
            warning: created.setupCode.warning,
            cloudAddress: window.location.origin,
          })
          refetch()
        }}
      />

      <SetupCodeModal
        setup={setup}
        generating={generating}
        onClose={() => setSetup(null)}
        onRegenerate={() => void regenerateCode()}
      />

      <Modal
        open={rotating !== null}
        onClose={() => setRotating(null)}
        title="Rotate this device key?"
        icon="key"
        iconTone="danger"
        description={
          rotating
            ? `${rotating.name} will stop authenticating the moment its current key is replaced. Any results still sitting on the machine stay there safely, but it cannot push them until you reconfigure it with the new key.`
            : undefined
        }
        footer={
          <>
            <button type="button" onClick={() => setRotating(null)} className="btn-primary w-full">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => rotating && void rotate(rotating)}
              className="w-full rounded-lg border-2 border-error py-3 font-label-md text-label-md font-bold text-error transition-colors hover:bg-error-container"
            >
              Issue a new key
            </button>
          </>
        }
      />

      <Modal
        open={issuedKey !== null}
        onClose={() => setIssuedKey(null)}
        title="Copy this key now"
        icon="vpn_key"
        description={`It is shown only this once and cannot be recovered. If it is lost, rotate the key to issue another.`}
      >
        {issuedKey ? (
          <div className="space-y-4">
            <p className="font-label-md text-label-md text-on-surface-variant">{issuedKey.name}</p>

            <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4">
              <code className="block break-all font-mono text-sm text-on-surface">
                {issuedKey.value}
              </code>
            </div>

            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(issuedKey.value)}
              className="btn-secondary w-full"
            >
              <Icon name="content_copy" size={18} />
              Copy to clipboard
            </button>

            <div className="rounded-lg bg-surface-container-low p-4">
              <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                Manual setup
              </p>
              <p className="mt-1 break-all font-body-md text-body-md text-on-surface">
                {issuedKey.setup}
              </p>
            </div>

            {issuedKey.caution ? <Alert tone="warning">{issuedKey.caution}</Alert> : null}

            <button type="button" onClick={() => setIssuedKey(null)} className="btn-primary w-full">
              I have saved it
            </button>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function SetupCodeModal({
  setup,
  generating,
  onClose,
  onRegenerate,
}: {
  setup: SetupState | null
  generating: boolean
  onClose: () => void
  onRegenerate: () => void
}) {
  return (
    <Modal
      open={setup !== null}
      onClose={onClose}
      title="Pair your hall"
      icon="link"
      description={setup ? `${setup.name} - enter this code on the exam-hall PC.` : undefined}
    >
      {setup ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-primary/30 bg-primary-container/10 p-6 text-center">
            <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
              One-time setup code
            </p>
            <p className="mt-2 font-mono text-3xl font-bold tracking-[0.2em] text-on-surface">
              {setup.code}
            </p>
            <p className="mt-2 font-label-sm text-label-sm text-on-surface-variant">
              Expires {new Date(setup.expiresAt).toLocaleTimeString()}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(setup.code)}
            className="btn-secondary w-full"
          >
            <Icon name="content_copy" size={18} />
            Copy code
          </button>

          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
              Cloud address for the hall PC
            </p>
            <code className="mt-1 block break-all font-mono text-sm text-on-surface">
              {setup.cloudAddress}
            </code>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(setup.cloudAddress)}
              className="btn-secondary mt-3 w-full"
            >
              <Icon name="content_copy" size={18} />
              Copy cloud address
            </button>
          </div>

          <Alert tone="info">{setup.warning}</Alert>

          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <p className="font-label-md text-label-md text-on-surface">Need the hall server software?</p>
            <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
              Download the Windows installer for the exam-hall PC. It is about 45 MB and supports
              Windows 10/11 (64-bit).
            </p>
            <a
              href={HALL_SERVER_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-primary mt-3 w-full"
            >
              <Icon name="download" size={18} />
              Download Windows installer
            </a>
            <a
              href={HALL_SERVER_GUIDE_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary mt-2 w-full"
            >
              <Icon name="menu_book" size={18} />
              Open install guide
            </a>
            <a
              href={HALL_SERVER_CHECKSUM_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center justify-center gap-1 font-label-sm text-label-sm text-primary underline underline-offset-2"
            >
              View the SHA-256 checksum
              <Icon name="open_in_new" size={14} />
            </a>
          </div>

          <ol className="space-y-3 font-body-md text-body-md text-on-surface-variant">
            <li>
              <span className="font-semibold text-on-surface">1. Download and install.</span> On the
              exam-hall PC, run the installer as administrator. If Windows SmartScreen warns, verify
              the checksum, then select More info and Run anyway.
            </li>
            <li>
              <span className="font-semibold text-on-surface">2. Open the setup page.</span> The
              installer can open http://localhost:4000/setup for you. Otherwise open it in a browser
              on the same PC.
            </li>
            <li>
              <span className="font-semibold text-on-surface">3. Pair the hall.</span> Enter the code
              and cloud address shown above, then set the invigilator PIN.
            </li>
            <li>
              <span className="font-semibold text-on-surface">4. Download the exams.</span> Keep
              internet connected, select the published exams in the setup wizard, and download them.
            </li>
            <li>
              <span className="font-semibold text-on-surface">5. Go offline.</span> Disconnect
              internet before students log in, then share the LAN address shown in the hall server.
            </li>
          </ol>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onRegenerate}
              disabled={generating}
              className="btn-secondary flex-1"
            >
              {generating ? <Spinner size={18} /> : <Icon name="refresh" size={18} />}
              Generate new code
            </button>
            <button type="button" onClick={onClose} className="btn-primary flex-1">
              Done
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

function ProvisionModal({
  open,
  onClose,
  onProvisioned,
}: {
  open: boolean
  onClose: () => void
  onProvisioned: (created: LocalServerCreated) => void
}) {
  const { withScope } = useScope()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    setFieldErrors({})

    try {
      const created = await api.post<LocalServerCreated>(withScope('/api/local-servers'), { name })
      setName('')
      onProvisioned(created)
    } catch (err) {
      if (err instanceof ApiClientError) setFieldErrors(err.fieldErrors())
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Create a hall" icon="dns">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div>
          <label htmlFor="server-name" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
            Name
          </label>
          <input
            id="server-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Main ICT Lab"
            required
            className="field"
          />
          {fieldErrors.name ? (
            <p className="mt-1 font-label-sm text-label-sm text-error">{fieldErrors.name}</p>
          ) : (
            <p className="mt-1 font-label-sm text-label-sm text-outline">
              Name it after the hall, so an invigilator can tell which machine is which.
            </p>
          )}
        </div>

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner size={20} /> : <Icon name="link" size={20} />}
          {busy ? 'Creating...' : 'Create and get pairing code'}
        </button>
      </form>
    </Modal>
  )
}
