export function formatRON(value: number | null | undefined): string {
  const n = value ?? 0
  return `${n.toLocaleString('ro-RO')} RON`
}

// Formatterele de dată standard ale aplicației. Null/undefined → '—'.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// Luna facturată (ex. „iulie 2026") — pt. înrolări, unde data e ziua 1 a lunii.
export function formatMonth(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ro-RO', {
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
