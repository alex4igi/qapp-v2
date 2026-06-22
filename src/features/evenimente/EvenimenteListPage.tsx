import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  TextInput,
  Select,
  Field,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import type { Eveniment } from '@/types/db'
import { EvenimentForm } from './EvenimentForm'
import { listEvenimente, listEvenimenteAni, PAGE_SIZE } from './api'

type Temporal = 'all' | 'viitoare' | 'trecute'
const TEMPORAL_TABS: { key: Temporal; label: string }[] = [
  { key: 'all', label: 'Toate' },
  { key: 'viitoare', label: 'Viitoare' },
  { key: 'trecute', label: 'Trecute' },
]

const columns: Column<Eveniment>[] = [
  {
    header: 'Eveniment',
    cell: (e) => <span className="font-medium">{e.nume_eveniment}</span>,
    sortValue: (e) => e.nume_eveniment?.toLowerCase(),
  },
  {
    header: 'Data',
    cell: (e) => e.data ?? '—',
    className: 'w-32',
    sortValue: (e) => e.data,
  },
  {
    header: 'Locație',
    cell: (e) => e.locatia ?? '—',
    sortValue: (e) => e.locatia?.toLowerCase(),
  },
  {
    header: 'Status',
    cell: (e) => e.status ?? '—',
    className: 'w-28',
    sortValue: (e) => e.status?.toLowerCase(),
  },
  {
    header: 'Portal',
    cell: (e) =>
      e.public ? (
        <span title="Bilet afișat pe portalul de membri">🌐</span>
      ) : (
        '—'
      ),
    className: 'w-20 text-center',
  },
]

export function EvenimenteListPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [an, setAn] = useState('')
  const [temporal, setTemporal] = useState<Temporal>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Eveniment | null>(null)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const aniQ = useQuery({
    queryKey: ['evenimente', 'ani'],
    queryFn: listEvenimenteAni,
  })
  const aniOptions = useMemo(
    () => (aniQ.data ?? []).map((y) => ({ value: String(y), label: String(y) })),
    [aniQ.data],
  )

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['evenimente', { search, page, an, temporal }],
    queryFn: () =>
      listEvenimente({
        search,
        page,
        an: an ? Number(an) : null,
        temporal,
        today,
      }),
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

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-72">
          <Field label="Caută" htmlFor="ev-search">
            <TextInput
              id="ev-search"
              placeholder="Caută după nume sau locație…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="An" htmlFor="ev-an">
            <Select
              id="ev-an"
              placeholder="Toți anii"
              options={aniOptions}
              value={an}
              onChange={(e) => {
                setAn(e.target.value)
                setPage(0)
              }}
            />
          </Field>
        </div>
        <div className="flex gap-1">
          {TEMPORAL_TABS.map((t) => (
            <Button
              key={t.key}
              variant={temporal === t.key ? 'primary' : 'secondary'}
              onClick={() => {
                setTemporal(t.key)
                setPage(0)
              }}
            >
              {t.label}
            </Button>
          ))}
        </div>
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
