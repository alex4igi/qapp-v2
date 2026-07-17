import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Modal, Select, Spinner, TextInput, type Column } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { ARTICOLE_FGO } from './constants'
import {
  emitePortal,
  listFacturi,
  listPortalPending,
  retryPortal,
  type PortalPendingRow,
} from './api'
import type { FacturaRow } from './types'

const fmt = (n: number) =>
  n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ART_SET = new Set<string>(ARTICOLE_FGO)
const artOptions = [
  { value: '', label: '— alege articol —' },
  ...ARTICOLE_FGO.map((a) => ({ value: a, label: a })),
]

type LineDraft = { denumire: string; suma: number }

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
  const totalLinii = lines.reduce((a, l) => a + l.suma, 0)
  const allFilled = lines.length > 0 && lines.every((l) => l.denumire.trim().length > 0)

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

      <Modal
        open={confirmRow !== null}
        title="Emite factură FGO"
        onClose={() => setConfirmRow(null)}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRow(null)} disabled={emit.isPending}>
              Anulează
            </Button>
            <Button
              variant="primary"
              disabled={!allFilled || emit.isPending}
              title={!allFilled ? 'Completează articolul pe toate liniile' : undefined}
              onClick={() => emit.mutate()}
            >
              {emit.isPending ? 'Se emite…' : 'Confirmă și emite'}
            </Button>
          </>
        }
      >
        {confirmRow && (
          <div className="space-y-4 text-sm">
            <p className="text-ink">
              Se va emite o factură fiscală reală (FGO + e-Factura) pentru{' '}
              <strong>{confirmRow.client_nume}</strong>.
            </p>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-56 shrink-0">
                    <Select
                      options={artOptions}
                      value={ART_SET.has(l.denumire) ? l.denumire : ''}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, denumire: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <TextInput
                      value={l.denumire}
                      placeholder="Descriere linie factură"
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, denumire: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <div className="w-28 text-right whitespace-nowrap text-ink">{fmt(l.suma)} RON</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted">
              Alege articolul FGO din listă (completează descrierea) sau editează textul liber.
              Firma emitentă: Quasar Dance Studio SRL · TVA 21%.
            </p>
            <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
              <span>Total factură</span>
              <span>{fmt(totalLinii)} RON</span>
            </div>
            {emitError && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-red-700">{emitError}</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
