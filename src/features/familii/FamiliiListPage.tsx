import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  TextInput,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import type { Familie } from '@/types/db'
import { FamilieForm } from './FamilieForm'
import { listFamilii, PAGE_SIZE } from './api'

const columns: Column<Familie>[] = [
  {
    header: 'Familie',
    cell: (f) => <span className="font-medium">{f.nume_familie}</span>,
  },
  {
    header: 'Reprezentant',
    cell: (f) =>
      [f.nume_reprezentant, f.prenume_reprezentant]
        .filter(Boolean)
        .join(' ') || '—',
  },
  { header: 'Telefon', cell: (f) => f.telefon ?? '—' },
  { header: 'Email', cell: (f) => f.email ?? '—' },
]

export function FamiliiListPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['familii', { search, page }],
    queryFn: () => listFamilii({ search, page }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  return (
    <div>
      <PageHeader
        title="Familii"
        subtitle={data ? `${data.total} familii` : undefined}
        actions={
          <Button onClick={() => setFormOpen(true)}>+ Familie nouă</Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <TextInput
          placeholder="Caută după nume, reprezentant, telefon…"
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
            rowKey={(f) => f.id}
            onRowClick={(f) => navigate(`/familii/${f.id}`)}
            emptyMessage="Nicio familie găsită."
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
        <FamilieForm open onClose={() => setFormOpen(false)} />
      )}
    </div>
  )
}
