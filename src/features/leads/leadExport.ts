import type { Lead } from '@/types/db'

function csvCell(v: string | null | undefined): string {
  return `"${(v ?? '').toString().replace(/"/g, '""')}"`
}

// Exportă o listă de lead-uri ca CSV și declanșează descărcarea.
// BOM-ul UTF-8 asigură afișarea corectă a diacriticelor în Excel.
export function exportLeadsCsv(
  leads: Lead[],
  campaniiById: Map<string, string>,
  filename: string,
): void {
  const headers = [
    'Nume', 'Prenume', 'Telefon', 'Email',
    'Interes', 'Grupa', 'Sursa', 'Observatii',
  ]
  const rows = leads.map((l) =>
    [
      l.nume,
      l.prenume,
      l.telefon,
      l.email,
      l.interes,
      l.grupa_varsta,
      l.sursa ? (campaniiById.get(l.sursa) ?? '') : '',
      l.observatii,
    ]
      .map(csvCell)
      .join(','),
  )
  const csv = [headers.map(csvCell).join(','), ...rows].join('\r\n')
  const blob = new Blob(['﻿' + csv], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
