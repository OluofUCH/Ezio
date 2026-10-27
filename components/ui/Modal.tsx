'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  icon?: string
  iconTone?: 'primary' | 'danger'
  children?: ReactNode
  footer?: ReactNode
  /** Suppress backdrop/Escape dismissal while a request is in flight. */
  busy?: boolean
}

/**
 * Confirmation dialog.
 *
 * Focus is moved into the panel on open and Escape closes it, because the most
 * consequential use of this component is the exam submit confirmation — a student
 * who cannot dismiss a dialog they opened by mistake loses exam time.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  iconTone = 'primary',
  children,
  footer,
  busy = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    // Stop the page behind the dialog from scrolling under it.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, busy, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onClose()
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md animate-fade-in rounded-2xl bg-surface-container-lowest p-8 shadow-2xl outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        {icon ? (
          <div
            className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full ${
              iconTone === 'danger'
                ? 'bg-error-container/40 text-error'
                : 'bg-primary-container/25 text-on-primary-container'
            }`}
          >
            <Icon name={icon} size={32} filled />
          </div>
        ) : null}

        <h2 className="text-center font-headline-md text-headline-md font-bold text-on-surface">{title}</h2>

        {description ? (
          <p className="mt-2 text-center font-body-md text-body-md text-on-surface-variant">{description}</p>
        ) : null}

        {children ? <div className="mt-6">{children}</div> : null}
        {footer ? <div className="mt-6 flex flex-col gap-3">{footer}</div> : null}
      </div>
    </div>
  )
}
