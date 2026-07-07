import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  TextInput,
  DataTable,
  Spinner,
  Badge,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import type { Spectacol, StatusSpectacol } from '@/types/db'
import { SpectacolForm } from './SpectacolForm'
import { listSpectacole, PAGE_SIZE } from './api'

const STATUS_META: Record<StatusSpectacol, { label: string; tone: BadgeTone }> = {
  planificat: { label: 'Planificat', tone: 'neutral' },
  confirmat: { label: 'Confirmat', tone: 'brand' },
  finalizat: { label: 'Finalizat', tone: 'success' },
  anulat: { label: 'Anulat', tone: 'danger' },
}

const columns: Column<Spectacol>[] = [
  {
    header: 'Spectacol',
    cell: (s) => <span className="font-medium">{s.nume}</span>,
    sortValue: (s) => s.nume?.toLowerCase(),
  },
  {
    header: 'Data',
    cell: (s) => (s.data ? `${s.data}${s.ora ? ` · ${s.ora}` : ''}` : '—'),
    className: 'w-40',
    sortValue: (s) => s.data,
  },
  {
    header: 'Locație',
    cell: (s) => s.locatie ?? '—',
    className: 'w-48',
    sortValue: (s) => s.locatie?.toLowerCase(),
  },
  {
    header: 'Status',
    cell: (s) => {
      const m = STATUS_META[s.status as StatusSpectacol] ?? STATUS_META.planificat
      return <Badge tone={m.tone}>{m.label}</Badge>
    },
    className: 'w-32',
    sortValue: (s) => s.status,
  },
]

export function SpectacoleListPage() {
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
    queryKey: ['spectacole', { search, page }],
    queryFn: () => listSpectacole({ search, page }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  return (
    <div>
      <PageHeader
        title="Spectacole"
        subtitle={data ? `${data.total} spectacole` : undefined}
        actions={<Button onClick={() => setFormOpen(true)}>+ Spectacol nou</Button>}
      />

      <div className="mb-4 max-w-sm">
        <TextInput
          placeholder="Caută după nume spectacol…"
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
            rowKey={(s) => s.id}
            onRowClick={(s) => navigate(`/spectacole/${s.id}`)}
            emptyMessage="Niciun spectacol."
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
        <SpectacolForm
          open
          onClose={() => setFormOpen(false)}
          onCreated={(s) => navigate(`/spectacole/${s.id}`)}
        />
      )}
    </div>
  )
}
