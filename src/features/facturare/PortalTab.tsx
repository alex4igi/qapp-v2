import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Modal, Spinner, type Column } from '@/components/ui'
import { listFacturi, listPortalPending, retryPortal, type PortalPendingRow } from './api'
import type { FacturaRow } from './types'

const fmt = (n: number) =>
  n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function PortalTab() {
  const queryClient = useQueryClient()
  const [confirmRow, setConfirmRow] = useState<PortalPendingRow | null>(null)

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

  const emit = useMutation({
    mutationFn: (orderRef: string) => retryPortal(orderRef),
    onSuccess: () => {
      setConfirmRow(null)
      invalidate()
    },
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
          <span className="text-green-700">✓ {r.factura_fgo}</span>
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
    { header: 'Descriere', cell: (r) => r.descriere },
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
        <Button
          variant="primary"
          className="text-xs"
          disabled={emit.isPending}
          onClick={() => setConfirmRow(r)}
        >
          Emite factură
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {pendingRows.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">
            De facturat ({pendingRows.length})
          </h3>
          <p className="text-sm text-muted">
            Plăți online confirmate care nu au fost facturate automat (facturarea
            automată era oprită la momentul plății sau emiterea nu a fost încercată).
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

      <Modal
        open={confirmRow !== null}
        title="Emite factură FGO"
        onClose={() => setConfirmRow(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRow(null)} disabled={emit.isPending}>
              Anulează
            </Button>
            <Button
              variant="primary"
              disabled={emit.isPending}
              onClick={() => confirmRow && emit.mutate(confirmRow.order_ref)}
            >
              {emit.isPending ? 'Se emite…' : 'Confirmă și emite'}
            </Button>
          </>
        }
      >
        {confirmRow && (
          <div className="space-y-2 text-sm">
            <p className="text-muted">Se va emite o factură fiscală reală (FGO + e-Factura):</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted">Client</dt>
              <dd className="font-medium text-ink">{confirmRow.client_nume} (PF)</dd>
              <dt className="text-muted">Descriere</dt>
              <dd className="text-ink">{confirmRow.descriere}</dd>
              <dt className="text-muted">Sumă</dt>
              <dd className="font-medium text-ink">{fmt(confirmRow.suma)} RON</dd>
              <dt className="text-muted">Comandă</dt>
              <dd className="text-ink">{confirmRow.order_ref}</dd>
            </dl>
            {emit.isError && (
              <p className="text-red-700">
                {(emit.error as Error)?.message ?? 'Eroare la emitere.'}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
