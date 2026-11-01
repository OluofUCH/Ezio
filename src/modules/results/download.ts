function filenamePart(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const clean = value.normalize('NFKC').replace(/[\p{Cc}\p{Cs}]/gu, '').replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '')
  return Array.from(clean).slice(0, 80).join('') || fallback
}

export function reportDownloadHeaders(snapshot: unknown, studentName?: string) {
  const data = snapshot && typeof snapshot === 'object' ? snapshot as Record<string, unknown> : {}
  const name = [filenamePart(studentName ?? data.student, 'Student'), filenamePart(data.session, 'Session'), filenamePart(data.term, 'Term'), 'Report card'].join(' - ') + '.pdf'
  const ascii = name.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\x20-\x7e]/g, '')
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, value => `%${value.charCodeAt(0).toString(16).toUpperCase()}`)
  return { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`, 'cache-control': 'private, no-store' }
}
