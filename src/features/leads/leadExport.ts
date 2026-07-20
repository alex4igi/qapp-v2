import type { Lead } from '@/types/db'
import { formatDateTime } from '@/lib/format'
import { STATUS_CONFIG, SUB_STATUS_OPTIONS } from './constants'
import { prezentaLead, ultimContactMeta } from './leadColumns'

function csvCell(v: string | number | null | undefined): string {
  return `"${(v ?? '').toString().replace(/"/g, '""')}"`
}

// Exportă o listă de lead-uri ca CSV și declanșează descărcarea.
// BOM-ul UTF-8 asigură afișarea corectă a diacriticelor în Excel.
//
// Coloanele urmează ordinea din vederea Listă, ca fișierul să fie recognoscibil
// când owner-ul lucrează pe hârtie sau în Excel.
export function exportLeadsCsv(
  leads: Lead[],
  campaniiById: Map<string, string>,
  filename: string,
  prezentaByLead?: Map<string, string>,
): void {
  const headers = [
    'Nume', 'Prenume', 'Parinte', 'Telefon', 'Email', 'Locatie',
    'Status', 'Sub-status', 'Ultim contact', 'Nr contactari',
    'Demo', 'Neprezentari', 'Interes', 'Grupa', 'Sursa', 'Observatii', 'Adaugat',
  ]
  const rows = leads.map((l) =>
    [
      l.nume,
      l.prenume,
      l.nume_parinte,
      l.telefon,
      l.email,
      l.locatia,
      STATUS_CONFIG[l.status]?.label ?? l.status,
      l.sub_status
        ? (SUB_STATUS_OPTIONS.find((o) => o.value === l.sub_status)?.label ?? '')
        : '',
      // Dată absolută, nu relativă: CSV-ul se citește și peste o săptămână.
      l.ultima_contactare_la ? formatDateTime(l.ultima_contactare_la) : 'Niciodata',
      ultimContactMeta(l).nr,
      prezentaLead(l, prezentaByLead).label,
      l.nr_neprezentari ?? 0,
      l.interes,
      l.grupa_varsta,
      l.sursa ? (campaniiById.get(l.sursa) ?? '') : '',
      l.observatii,
      formatDateTime(l.created),
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
