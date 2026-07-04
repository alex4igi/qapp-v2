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
import type { Concurs } from '@/types/db'
import { ConcursForm } from './ConcursForm'
import { listConcursuri, PAGE_SIZE } from './api'

const columns: Column<Concurs>[] = [
  {
    header: 'Concurs',
    cell: (c) => <span className="font-medium">{c.numele_concursului}</span>,
    sortValue: (c) => c.numele_concursului?.toLowerCase(),
  },
  {
    header: 'Data',
    cell: (c) => c.data_evenimentului ?? '—',
    className: 'w-32',
    sortValue: (c) => c.data_evenimentului,
  },
  {
    header: 'Locuri I / II / III',
    cell: (c) =>
      `${c.locul_i ?? 0} / ${c.locul_ii ?? 0} / ${c.locul_iii ?? 0}`,
    className: 'w-40',
    sortValue: (c) => (c.locul_i ?? 0) + (c.locul_ii ?? 0) + (c.locul_iii ?? 0),
  },
]

export function ConcursuriListPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Concurs | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['concursuri', { search, page }],
    queryFn: () => listConcursuri({ search, page }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  return (
    <div>
      <PageHeader
        title="Concursuri"
        subtitle={data ? `${data.total} concursuri` : undefined}
        actions={
          <div className="flex gap-2">
            <a
              href="https://alex4igi.github.io/QDF/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-[10px] border border-line bg-card px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface"
            >
              🏆 Platformă jurizare ↗
            </a>
            <Button onClick={() => setFormOpen(true)}>+ Concurs nou</Button>
          </div>
        }
      />

      <div className="mb-4 max-w-sm">
        <TextInput
          placeholder="Caută după nume concurs…"
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
            rowKey={(c) => c.id}
            onRowClick={(c) => setEditing(c)}
            emptyMessage="Niciun concurs."
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

      {formOpen && <ConcursForm open onClose={() => setFormOpen(false)} />}
      {editing && (
        <ConcursForm
          open
          concurs={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
