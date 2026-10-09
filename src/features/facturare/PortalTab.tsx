import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Spinner, type Column } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { EmitFacturaModal, type LineDraft } from './EmitFacturaModal'
import {
  emitePortal,
  listFacturi,
  listPortalPending,
  retryPortal,
  type PortalPendingRow,
} from './api'
import type { FacturaRow } from './types'
import { IncasareFgo } from './IncasareFgo'

const fmt = (n: number) =>
  n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function PortalTab() {
  const queryClient = useQueryClient()
  const [confirmRow, setConfirmRow] = useState<PortalPendingRow | null>(null)
  const [lines, setLines] = useState<LineDraft[]>([])
  const [emitError, setEmitError] = useState<string | null>(null)

  const facturi = useQuery({
    queryKey: ['facturi-fgo', 'portal'],
    queryFn: () => listFacturi('portal'),
  })
  const pending = useQuery({
    queryKey: ['facturi-fgo', 'portal-pending'],
    queryFn: () => listPortalPending(),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['facturi-fgo', 'portal'] })
    queryClient.invalidateQueries({ queryKey: ['facturi-fgo', 'portal-pending'] })
  }

  const retry = useMutation({
    mutationFn: (orderRef: string) => retryPortal(orderRef),
    onSuccess: () => invalidate(),
  })

  const openEmit = (r: PortalPendingRow) => {
    setEmitError(null)
    setLines(r.linii.map((l) => ({ denumire: l.denumire, suma: l.suma })))
    setConfirmRow(r)
  }

  const emit = useMutation({
    mutationFn: () => emitePortal(confirmRow!.order_ref, lines),
    onSuccess: () => {
      setConfirmRow(null)
      invalidate()
    },
    onError: (e: unknown) => setEmitError(humanizeError(e, 'Eroare la emitere.')),
  })

  const rows = facturi.data ?? []
  const pendingRows = pending.data?.items ?? []

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
          <div className="flex flex-col gap-0.5">
            <span className="text-green-700">✓ {r.factura_fgo}</span>
            <IncasareFgo row={r} />
          </div>
        ),
      sortValue: (r) => r.status,
    },
    {
      header: '',
      className: 'text-right',
      cell: (r) =>
        r.status === 'Eroare' ? (
          <Button
            variant="secondary"
            className="text-xs"
            disabled={retry.isPending}
            onClick={() => retry.mutate(r.ref)}
          >
            Reemite
          </Button>
        ) : null,
    },
  ]

  const pendingColumns: Column<PortalPendingRow>[] = [
    { header: 'Data', cell: (r) => r.data, sortValue: (r) => r.data },
    { header: 'Client', cell: (r) => r.client_nume, sortValue: (r) => r.client_nume },
    {
      header: 'Descriere',
      cell: (r) => (
        <span>
          {r.descriere}
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
      {pendingRows.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">De facturat ({pendingRows.length})</h3>
          <p className="text-sm text-muted">
            Plăți online confirmate care nu au fost facturate automat. Cazurile clare se
            facturează singure la confirmarea plății; cele marcate „alege articolul" au
            nevoie de articolul FGO ales de recepție înainte de emitere.
          </p>
          <DataTable
            columns={pendingColumns}
            rows={pendingRows}
            rowKey={(r) => r.order_ref}
            emptyMessage=""
          />
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm text-muted">
          Facturile pentru plățile online (portal Netopia) se emit automat la confirmarea
          plății. Aici vezi rezultatul; cele cu eroare pot fi reemise.
        </p>
        {facturi.isLoading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.ref}
            emptyMessage="Nicio factură din portal încă."
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
