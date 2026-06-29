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
import type { Inventar } from '@/types/db'
import { InventarForm } from './InventarForm'
import { listInventar, PAGE_SIZE } from './api'

const columns: Column<Inventar>[] = [
  {
    header: 'Articol',
    cell: (a) => <span className="font-medium">{a.articol}</span>,
    sortValue: (a) => a.articol?.toLowerCase(),
  },
  { header: 'Categorie', cell: (a) => a.categorie ?? '—', className: 'w-32', sortValue: (a) => a.categorie?.toLowerCase() },
  {
    header: 'Stoc',
    cell: (a) => (a.stoc != null ? String(a.stoc) : '—'),
    className: 'w-20',
    sortValue: (a) => a.stoc ?? 0,
  },
  { header: 'Preț', cell: (a) => a.pret ?? '—', className: 'w-24', sortValue: (a) => a.pret?.toLowerCase() },
  {
    header: 'Portal',
    cell: (a) =>
      a.public ? (
        <span title="Afișat pe portalul de membri">🌐</span>
      ) : (
        '—'
      ),
    className: 'w-20 text-center',
  },
]

export function InventarListPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Inventar | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['inventar', { search, page }],
    queryFn: () => listInventar({ search, page }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  return (
    <div>
      <PageHeader
        title="Inventar"
        subtitle={data ? `${data.total} articole` : undefined}
        actions={
          <Button onClick={() => setFormOpen(true)}>+ Articol nou</Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <TextInput
          placeholder="Caută după articol sau descriere…"
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
            rowKey={(a) => a.id}
            onRowClick={(a) => setEditing(a)}
            emptyMessage="Niciun articol."
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

      {formOpen && <InventarForm open onClose={() => setFormOpen(false)} />}
      {editing && (
        <InventarForm
          open
          articol={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
