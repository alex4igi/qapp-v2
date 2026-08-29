import type { ReconciliereRow } from './api'

function csvCell(v: string | number | null | undefined): string {
  return `"${(v ?? '').toString().replace(/"/g, '""')}"`
}

// Exportă tabelul de reconciliere ca CSV, ca agenția să-l pună lângă exportul
// propriu din Ads Manager. BOM UTF-8 pentru diacritice corecte în Excel.
export function exportReconciliereCsv(
  rows: ReconciliereRow[],
  filename: string,
): void {
  const headers = [
    'Zi', 'Platforma', 'Campanie ads', 'Sursa CRM',
    'Leads in CRM', 'Contactati', 'Au venit', 'Inscrisi',
    'Evenimente primite', 'Create', 'Duplicate', 'Respinse',
  ]
  const body = rows.map((r) =>
    [
      r.zi, r.platforma, r.campanieAds, r.sursaCrm,
      r.leadsInCrm, r.contactati, r.prezenti, r.convertiti,
      r.intakeEvenimente, r.intakeCreat, r.intakeDuplicat, r.intakeRespins,
    ].map(csvCell).join(','),
  )
  const csv = '﻿' + [headers.map(csvCell).join(','), ...body].join('\n')

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
