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
import type { Feedback } from '@/types/db'
import { FeedbackForm } from './FeedbackForm'
import { listFeedback, PAGE_SIZE } from './api'

const columns: Column<Feedback>[] = [
  {
    header: 'Titlu',
    cell: (f) => (
      <span className="font-medium">{f.nume || '(fără titlu)'}</span>
    ),
    sortValue: (f) => f.nume?.toLowerCase(),
  },
  {
    header: 'Tip',
    cell: (f) => f.tip ?? '—',
    className: 'w-28',
    sortValue: (f) => f.tip?.toLowerCase(),
  },
  {
    header: 'Detalii',
    cell: (f) => (
      <span className="line-clamp-1 text-quasar-gray">{f.detalii ?? '—'}</span>
    ),
    sortValue: (f) => f.detalii?.toLowerCase(),
  },
  {
    header: 'Rezolvat',
    cell: (f) =>
      f.rezolvat ? (
        <span className="font-medium text-green-700">Da</span>
      ) : (
        <span className="text-quasar-gray">Nu</span>
      ),
    className: 'w-24',
    sortValue: (f) => (f.rezolvat ? 1 : 0),
  },
]

export function FeedbackListPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Feedback | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['feedback', { search, page }],
    queryFn: () => listFeedback({ search, page }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  return (
    <div>
      <PageHeader
        title="Feedback"
        subtitle={data ? `${data.total} înregistrări` : undefined}
        actions={
          <Button onClick={() => setFormOpen(true)}>+ Feedback nou</Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <TextInput
          placeholder="Caută după titlu sau detalii…"
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
            rowKey={(f) => f.id}
            onRowClick={(f) => setEditing(f)}
            emptyMessage="Niciun feedback."
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

      {formOpen && <FeedbackForm open onClose={() => setFormOpen(false)} />}
      {editing && (
        <FeedbackForm
          open
          feedback={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
