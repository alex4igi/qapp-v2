import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Spinner, type Column } from '@/components/ui'
import { listFacturi, retryPortal } from './api'
import type { FacturaRow } from './types'

const fmt = (n: number) =>
  n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function PortalTab() {
  const queryClient = useQueryClient()

  const facturi = useQuery({
    queryKey: ['facturi-fgo', 'portal'],
    queryFn: () => listFacturi('portal'),
  })

  const retry = useMutation({
    mutationFn: (orderRef: string) => retryPortal(orderRef),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['facturi-fgo', 'portal'] }),
  })

  const rows = facturi.data ?? []

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

  return (
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
  )
}
