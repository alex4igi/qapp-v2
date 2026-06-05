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
import type { Eveniment } from '@/types/db'
import { EvenimentForm } from './EvenimentForm'
import { listEvenimente, PAGE_SIZE } from './api'

const columns: Column<Eveniment>[] = [
  {
    header: 'Eveniment',
    cell: (e) => <span className="font-medium">{e.nume_eveniment}</span>,
  },
  { header: 'Data', cell: (e) => e.data ?? '—', className: 'w-32' },
  { header: 'Locație', cell: (e) => e.locatia ?? '—' },
  { header: 'Status', cell: (e) => e.status ?? '—', className: 'w-28' },
]

export function EvenimenteListPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Eveniment | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['evenimente', { search, page }],
    queryFn: () => listEvenimente({ search, page }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  return (
    <div>
      <PageHeader
        title="Evenimente"
        subtitle={data ? `${data.total} evenimente` : undefined}
        actions={
          <Button onClick={() => setFormOpen(true)}>+ Eveniment nou</Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <TextInput
          placeholder="Caută după nume sau locație…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-red-600">
          Eroare la încărcare: {error instanceof Error ? error.message : ''}
        </p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data?.rows ?? []}
            rowKey={(e) => e.id}
            onRowClick={(e) => setEditing(e)}
            emptyMessage="Niciun eveniment."
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

      {formOpen && <EvenimentForm open onClose={() => setFormOpen(false)} />}
      {editing && (
        <EvenimentForm
          open
          eveniment={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
