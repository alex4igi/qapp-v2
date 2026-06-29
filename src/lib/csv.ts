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

// Parsează un CSV (RFC 4180): câmpuri cu ghilimele, virgule/newline în interior,
// `""` ca ghilimea escapată. Acceptă delimitator , sau ; (detectat din primul rând —
// Excel RO exportă adesea cu ;). Întoarce o matrice de stringuri (primul rând = header).
// Rândurile complet goale sunt ignorate. Strip BOM UTF-8.
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const nlIdx = src.search(/\r?\n/)
  const firstLine = nlIdx === -1 ? src : src.slice(0, nlIdx)
  const delim =
    firstLine.split(';').length > firstLine.split(',').length ? ';' : ','

  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    if (row.some((c) => c.trim() !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delim) {
      pushField()
    } else if (ch === '\n') {
      pushRow()
    } else if (ch === '\r') {
      if (src[i + 1] !== '\n') pushRow()
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) pushRow()
  return rows
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
