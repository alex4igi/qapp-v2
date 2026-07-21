import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Spinner, type Column } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { EmitFacturaModal, type LineDraft } from './EmitFacturaModal'
import { emiteClient, listClientiPending, listFacturi, type ClientPendingRow } from './api'
import type { FacturaRow } from './types'

const fmt = (n: number) =>
  n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Facturare „la cerere": încasările clienților cu marcajul „vrea factură lunară"
// (setat pe fișa clientului sau din portal), indiferent de metodă, fără factură emisă.
export function ClientiTab() {
  const queryClient = useQueryClient()
  const [confirmRow, setConfirmRow] = useState<ClientPendingRow | null>(null)
  const [lines, setLines] = useState<LineDraft[]>([])
  const [emitError, setEmitError] = useState<string | null>(null)

  const facturi = useQuery({
    queryKey: ['facturi-fgo', 'client'],
    queryFn: () => listFacturi('client'),
  })
  const pending = useQuery({
    queryKey: ['facturi-fgo', 'client-pending'],
    queryFn: () => listClientiPending(),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['facturi-fgo', 'client'] })
    queryClient.invalidateQueries({ queryKey: ['facturi-fgo', 'client-pending'] })
  }

  const openEmit = (r: ClientPendingRow) => {
    setEmitError(null)
    setLines(
      r.linii.length
        ? r.linii.map((l) => ({ denumire: l.denumire, suma: l.suma }))
        : [{ denumire: '', suma: r.suma }],
    )
    setConfirmRow(r)
  }

  const emit = useMutation({
    mutationFn: () => emiteClient(confirmRow!.incasare_id, lines),
    onSuccess: ({ result }) => {
      if (result.status === 'eroare') {
        setEmitError(result.error ?? 'Eroare la emitere.')
        invalidate()
        return
      }
      setConfirmRow(null)
      invalidate()
    },
    onError: (e: unknown) => setEmitError(humanizeError(e, 'Eroare la emitere.')),
  })

  const reemit = useMutation({
    mutationFn: (r: FacturaRow) =>
      emiteClient(
        r.incasare_id!,
        (r.linii ?? []).map((l) => ({ denumire: l.articol ?? '', suma: l.suma })),
      ),
    onSuccess: () => invalidate(),
  })

  const rows = facturi.data ?? []
  const pendingRows = pending.data ?? []

  const columns: Column<FacturaRow>[] = [
    { header: 'Data', cell: (r) => r.data_tranzactie, sortValue: (r) => r.data_tranzactie },
    { header: 'Client', cell: (r) => r.client_nume, sortValue: (r) => r.client_nume },
    {
      header: 'Sumă',
      className: 'text-right whitespace-nowrap',
      cell: (r) => `${fmt(r.suma)} ${r.valuta}`,
      sortValue: (r) => r.suma,
    },
    {
      header: 'Status',
      cell: (r) =>
        r.status === 'Eroare' ? (
          <span className="text-red-700" title={r.eroare_mesaj ?? ''}>
            ✗ {r.eroare_mesaj?.slice(0, 60)}
          </span>
        ) : (
          <span className="text-green-700">✓ {r.factura_fgo}</span>
        ),
      sortValue: (r) => r.status,
    },
    {
      header: '',
      className: 'text-right',
      cell: (r) =>
        r.status === 'Eroare' && r.incasare_id ? (
          <Button
            variant="secondary"
            className="text-xs"
            disabled={reemit.isPending}
            onClick={() => reemit.mutate(r)}
          >
            Reemite
          </Button>
        ) : null,
    },
  ]

  const pendingColumns: Column<ClientPendingRow>[] = [
    { header: 'Data', cell: (r) => r.data, sortValue: (r) => r.data },
    { header: 'Client', cell: (r) => r.client_nume, sortValue: (r) => r.client_nume },
    { header: 'Metodă', cell: (r) => r.metoda, sortValue: (r) => r.metoda },
    {
      header: 'Descriere',
      cell: (r) => (
        <span>
          {r.linii.length ? r.linii.map((l) => l.denumire).join('; ') : 'Necunoscut'}
          {!r.certain && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
              alege articolul
            </span>
          )}
        </span>
      ),
    },
    {
      header: 'Sumă',
      className: 'text-right whitespace-nowrap',
      cell: (r) => `${fmt(r.suma)} RON`,
      sortValue: (r) => r.suma,
    },
    {
      header: '',
      className: 'text-right',
      cell: (r) => (
        <Button variant="primary" className="text-xs" onClick={() => openEmit(r)}>
          Emite factură
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">De facturat ({pendingRows.length})</h3>
        <p className="text-sm text-muted">
          Încasările clienților cu marcajul „vrea factură lunară" (setat pe fișa clientului),
          de la data activării încolo, care nu au încă factură. Atenție: un transfer bancar
          facturat aici va apărea și în extras — acolo se apasă „Ignoră".
        </p>
        {pending.isLoading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={pendingColumns}
            rows={pendingRows}
            rowKey={(r) => r.incasare_id}
            emptyMessage="Nimic de facturat — nicio încasare nouă la clienții cu factură lunară."
          />
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Facturi emise la cerere</h3>
        {facturi.isLoading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.ref}
            emptyMessage="Nicio factură emisă la cerere încă."
          />
        )}
      </div>

      <EmitFacturaModal
        open={confirmRow !== null}
        clientNume={confirmRow?.client_nume ?? ''}
        lines={lines}
        onLinesChange={setLines}
        onConfirm={() => emit.mutate()}
        pending={emit.isPending}
        error={emitError}
        onClose={() => setConfirmRow(null)}
      />
    </div>
  )
}
