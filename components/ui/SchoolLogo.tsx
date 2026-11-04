'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'

/** A contained school mark with the existing school icon as its empty/error state. */
export function SchoolLogo({ logoUrl, schoolName, size = 40 }: {
  logoUrl?: string | null
  schoolName?: string
  size?: number
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const source = logoUrl && logoUrl !== failedUrl ? logoUrl : null

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg ${source ? 'border border-border-subtle bg-white p-1' : 'bg-primary-container'}`}
      style={{ width: size, height: size }}
    >
      {source ? (
        <Image
          src={source}
          alt={`${schoolName ?? 'School'} logo`}
          width={size}
          height={size}
          unoptimized
          className="h-full w-full object-contain"
          onError={() => setFailedUrl(source)}
        />
      ) : <Icon name="school" filled size={Math.round(size * 0.6)} className="text-on-surface" />}
    </div>
  )
}
