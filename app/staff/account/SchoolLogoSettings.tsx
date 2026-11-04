'use client'

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { SchoolLogo } from '@/components/ui/SchoolLogo'
import { Spinner } from '@/components/ui/Spinner'
import { api, errorMessage } from '@/lib/client/api'
import type { SchoolLogoResult } from '@/lib/client/types'
import { SCHOOL_LOGO_EXTENSIONS, SCHOOL_LOGO_MAX_BYTES } from '@/lib/validation/school-logo'

export function SchoolLogoSettings({ school }: { school: SchoolLogoResult['school'] }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [logoUrl, setLogoUrl] = useState(school.logoUrl)
  const [selection, setSelection] = useState<{ file: File; previewUrl: string } | null>(null)
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => { setLogoUrl(school.logoUrl) }, [school.logoUrl])
  useEffect(() => {
    return () => { if (selection) URL.revokeObjectURL(selection.previewUrl) }
  }, [selection])

  function chooseLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setSelection(null)
    setError(null)
    setNotice(null)
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!SCHOOL_LOGO_EXTENSIONS.includes(extension)) {
      setError('Choose a PNG, JPEG or WebP image.')
      return
    }
    if (file.size === 0 || file.size > SCHOOL_LOGO_MAX_BYTES) {
      setError(file.size === 0 ? 'The selected file is empty.' : 'Choose an image smaller than 2 MB.')
      return
    }
    setSelection({ file, previewUrl: URL.createObjectURL(file) })
  }

  async function saveLogo(event: FormEvent) {
    event.preventDefault()
    if (!selection || busy) return
    setBusy('save')
    setError(null)
    setNotice(null)
    try {
      const form = new FormData()
      form.append('file', selection.file)
      const result = await api.post<SchoolLogoResult>('/api/school/logo', form)
      setLogoUrl(result.school.logoUrl)
      setSelection(null)
      setNotice('School logo saved. It will appear for your school’s admins, teachers, students and parents.')
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function removeLogo() {
    if (!logoUrl || busy) return
    setBusy('remove')
    setError(null)
    setNotice(null)
    try {
      const result = await api.delete<SchoolLogoResult>('/api/school/logo')
      setLogoUrl(result.school.logoUrl)
      setSelection(null)
      setNotice('School logo removed.')
      router.refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card p-6 md:p-8" aria-labelledby="school-logo-heading">
      <h2 id="school-logo-heading" className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
        <Icon name="school" className="text-primary" />
        School logo
      </h2>
      <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
        Add your school’s logo to the header and sidebar for all school roles.
      </p>

      {error ? <Alert tone="danger" className="mt-4">{error}</Alert> : null}
      {notice ? <Alert tone="success" className="mt-4">{notice}</Alert> : null}

      <form onSubmit={saveLogo} className="mt-6 flex flex-col items-start gap-5 sm:flex-row" aria-busy={busy !== null}>
        <SchoolLogo logoUrl={selection?.previewUrl ?? logoUrl} schoolName={school.name} size={96} />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="break-words font-label-md text-label-md font-bold text-on-surface">
              {selection ? selection.file.name : logoUrl ? school.name : 'No school logo yet'}
            </p>
            <p id="school-logo-hint" className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
              PNG, JPEG or WebP, up to 2 MB. A square image works best.
            </p>
            {selection ? <p className="mt-1 font-label-sm text-label-sm text-on-surface-variant">Preview only — save to apply this logo.</p> : null}
          </div>

          <input ref={inputRef} type="file" accept={SCHOOL_LOGO_EXTENSIONS.join(',')} onChange={chooseLogo} disabled={busy !== null} hidden />
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()} disabled={busy !== null} aria-describedby="school-logo-hint">
              <Icon name="add_photo_alternate" size={20} />
              {logoUrl || selection ? 'Choose another logo' : 'Choose logo'}
            </button>
            {selection ? (
              <>
                <button type="submit" className="btn-primary" disabled={busy !== null}>
                  {busy === 'save' ? <Spinner size={20} /> : <Icon name="save" size={20} />}
                  {busy === 'save' ? 'Saving…' : 'Save logo'}
                </button>
                <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => { setSelection(null); setError(null) }}>Cancel</button>
              </>
            ) : logoUrl ? (
              <button type="button" className="btn-secondary" disabled={busy !== null} onClick={removeLogo}>
                {busy === 'remove' ? <Spinner size={20} /> : <Icon name="delete" size={20} />}
                {busy === 'remove' ? 'Removing…' : 'Remove logo'}
              </button>
            ) : null}
          </div>
        </div>
      </form>
    </section>
  )
}
