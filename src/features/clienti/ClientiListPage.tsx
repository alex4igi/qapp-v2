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
import type { Client } from '@/types/db'
import { ClientForm } from './ClientForm'
import { listClienti, PAGE_SIZE } from './api'

const columns: Column<Client>[] = [
  {
    header: 'Nume',
    cell: (c) => (
      <span className="font-medium">
        {c.nume} {c.prenume ?? ''}
      </span>
    ),
  },
  { header: 'Telefon', cell: (c) => c.telefon ?? '—' },
  { header: 'Email', cell: (c) => c.email ?? '—' },
  {
    header: 'Status',
    cell: (c) => c.status ?? '—',
    className: 'w-28',
  },
]

export function ClientiListPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)

  // Debounce căutare
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['clienti', { search, page }],
    queryFn: () => listClienti({ search, page }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  return (
    <div>
      <PageHeader
        title="Clienți"
        subtitle={data ? `${data.total} clienți` : undefined}
        actions={
          <Button onClick={() => setFormOpen(true)}>+ Client nou</Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <TextInput
          placeholder="Caută după nume, telefon, email…"
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
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`/clienti/${c.id}`)}
            emptyMessage="Niciun client găsit."
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
        <ClientForm open onClose={() => setFormOpen(false)} />
      )}
    </div>
  )
}
