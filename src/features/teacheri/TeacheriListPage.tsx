import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  TextInput,
  DataTable,
  Spinner,
  Select,
  Field,
  type Column,
} from '@/components/ui'
import type { Teacher } from '@/types/db'
import { locatiiOptions, sezoaneOptions, sezonActivId } from '@/lib/lookups'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { TeacherForm } from './TeacherForm'
import { listTeacheri, PAGE_SIZE } from './api'

const columns: Column<Teacher>[] = [
  {
    header: 'Nume',
    cell: (t) => (
      <span className="font-medium">
        {t.nume} {t.prenume ?? ''}
      </span>
    ),
    sortValue: (t) => `${t.nume ?? ''} ${t.prenume ?? ''}`.trim().toLowerCase(),
  },
  { header: 'Telefon', cell: (t) => t.telefon ?? '—', sortValue: (t) => t.telefon?.toLowerCase() },
  { header: 'Email', cell: (t) => t.email ?? '—', sortValue: (t) => t.email?.toLowerCase() },
  { header: 'Nivel', cell: (t) => t.nivelul ?? '—', className: 'w-28', sortValue: (t) => t.nivelul?.toLowerCase() },
]

export function TeacheriListPage() {
  const navigate = useNavigate()
  const { locatieId: globalLocatieId } = useWorkingLocatie()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [locatieId, setLocatieId] = useState<string>(globalLocatieId ?? '')
  const [sezonId, setSezonId] = useState('')
  const [sezonInit, setSezonInit] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    if (globalLocatieId && !locatieId) {
      setLocatieId(globalLocatieId)
    }
  }, [globalLocatieId, locatieId])

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })

  const sezoaneQ = useQuery({
    queryKey: ['lookup', 'sezoane'],
    queryFn: sezoaneOptions,
  })
  const sezonActivQ = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
  })

  // Default = sezonul activ (decongestionează); userul poate alege „Toate sezoanele".
  useEffect(() => {
    if (!sezonInit && sezonActivQ.isSuccess) {
      setSezonId(sezonActivQ.data ?? '')
      setSezonInit(true)
    }
  }, [sezonInit, sezonActivQ.isSuccess, sezonActivQ.data])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['teacheri', { search, page, locatieId, sezonId }],
    queryFn: () =>
      listTeacheri({
        search,
        page,
        locatieId: locatieId || null,
        sezonId: sezonId || null,
      }),
    placeholderData: keepPreviousData,
    enabled: sezonInit,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  return (
    <div>
      <PageHeader
        title="Teacheri"
        subtitle={data ? `${data.total} teacheri` : undefined}
        actions={
          <Button onClick={() => setFormOpen(true)}>+ Teacher nou</Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-72">
          <Field label="Caută" htmlFor="teach-search">
            <TextInput
              id="teach-search"
              placeholder="nume, telefon, email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-56">
          <Field label="Locație" htmlFor="teach-loc">
            <Select
              id="teach-loc"
              placeholder="Toate locațiile"
              options={locatiiQ.data ?? []}
              value={locatieId}
              onChange={(e) => {
                setLocatieId(e.target.value)
                setPage(0)
              }}
            />
          </Field>
        </div>
        <div className="w-56">
          <Field label="Sezon" htmlFor="teach-sezon">
            <Select
              id="teach-sezon"
              placeholder="Toate sezoanele"
              options={sezoaneQ.data ?? []}
              value={sezonId}
              onChange={(e) => {
                setSezonId(e.target.value)
                setPage(0)
              }}
            />
          </Field>
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
            rowKey={(t) => t.id}
            onRowClick={(t) => navigate(`/teacheri/${t.id}`)}
            emptyMessage="Niciun teacher găsit."
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
        <TeacherForm
          open
          onClose={() => setFormOpen(false)}
          onCreated={(t) => navigate(`/teacheri/${t.id}`)}
        />
      )}
    </div>
  )
}
