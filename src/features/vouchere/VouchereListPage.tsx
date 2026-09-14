import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  TextInput,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import type { Voucher } from '@/types/db'
import { VoucherForm } from './VoucherForm'
import { listVouchere, PAGE_SIZE } from './api'

function valabilitate(v: Voucher): string {
  if (!v.data_inceperii && !v.data_expirarii) return '—'
  return `${v.data_inceperii ?? '…'} → ${v.data_expirarii ?? '…'}`
}

const columns: Column<Voucher>[] = [
  {
    header: 'Cod',
    cell: (v) => <span className="font-medium">{v.cod_voucher}</span>,
    sortValue: (v) => v.cod_voucher?.toLowerCase(),
  },
  {
    header: 'Stare',
    cell: (v) =>
      v.activ ? (
        <span className="text-green-700">Activ</span>
      ) : (
        <span className="text-quasar-gray">Închis</span>
      ),
    className: 'w-24',
    sortValue: (v) => (v.activ ? 0 : 1),
  },
  { header: 'Tip', cell: (v) => v.tip ?? '—', className: 'w-24', sortValue: (v) => v.tip?.toLowerCase() },
  {
    header: 'Valoare',
    cell: (v) => (v.valoare != null ? String(v.valoare) : '—'),
    className: 'w-24',
    sortValue: (v) => v.valoare ?? 0,
  },
  { header: 'Tip plată', cell: (v) => v.tip_enrollment ?? '—', className: 'w-28', sortValue: (v) => v.tip_enrollment },
  {
    header: 'Condiție',
    cell: (v) => (v.cerinta_eligibilitate === 'trupa' ? 'Doar membrii trupelor' : '—'),
    sortValue: (v) => v.cerinta_eligibilitate,
  },
  { header: 'Valabilitate', cell: valabilitate, sortValue: (v) => v.data_inceperii },
  {
    header: 'Utilizări',
    cell: (v) => (v.numar_utilizari != null ? String(v.numar_utilizari) : '—'),
    className: 'w-24',
    sortValue: (v) => v.numar_utilizari ?? 0,
  },
]

export function VouchereListPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Voucher | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['vouchere', { search, page }],
    queryFn: () => listVouchere({ search, page }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  return (
    <div>
      <PageHeader
        title="Vouchere"
        subtitle={data ? `${data.total} vouchere` : undefined}
        actions={
          <Button onClick={() => setFormOpen(true)}>+ Voucher nou</Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <TextInput
          placeholder="Caută după cod sau descriere…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-red-600">
          Eroare la încărcare: {humanizeError(error)}
        </p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.rows ?? []}
            rowKey={(v) => v.id}
            onRowClick={(v) => setEditing(v)}
            emptyMessage="Niciun voucher."
          />

          <div className="mt-4 flex items-center justify-between text-sm text-quasar-gray">
            <span>
              Pagina {page + 1} din {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ← Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Următor →
              </Button>
            </div>
          </div>
        </>
      )}

      {formOpen && (
        <VoucherForm open onClose={() => setFormOpen(false)} />
      )}
      {editing && (
        <VoucherForm
          open
          voucher={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
