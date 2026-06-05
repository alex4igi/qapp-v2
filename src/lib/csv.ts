// Generează un CSV (RFC 4180-style) și forțează descărcarea în browser.
// Folosim BOM UTF-8 ca Excel să detecteze corect diacritica.

type CsvCell = string | number | null | undefined

function escape(v: CsvCell): string {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n\r;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: CsvCell[][],
): void {
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((r) => r.map(escape).join(',')),
  ]
  const csv = '﻿' + lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
