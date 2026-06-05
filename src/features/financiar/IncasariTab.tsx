import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Button,
  TextInput,
  Field,
  Select,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import { formatRON } from '@/lib/format'
import { downloadCsv } from '@/lib/csv'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { locatiiOptions } from '@/lib/lookups'
import { categorieIncasareOptions } from '@/lib/enums'
import { useAuth } from '@/hooks/useAuth'
import { isManagerOrHigher } from '@/lib/rolesMatrix'
import { listIncasari, PAGE_SIZE, type IncasareRow } from './api'
import { IncasareEditModal } from './IncasareEditModal'

function buildColumns(
  onEdit: ((id: string) => void) | null,
): Column<IncasareRow>[] {
  const base: Column<IncasareRow>[] = [
    { header: 'Data', cell: (i) => i.data ?? '—', className: 'w-28' },
    {
      header: 'Client',
      cell: (i) => <span className="font-medium">{i.client_nume ?? '—'}</span>,
    },
    {
      header: 'Categorie',
      cell: (i) => i.categorie ?? '—',
      className: 'w-28',
    },
    { header: 'Detalii', cell: (i) => i.detalii ?? '—' },
    {
      header: 'Locație',
      cell: (i) => i.locatie_nume ?? '—',
      className: 'w-36',
    },
    { header: 'Metodă', cell: (i) => i.metoda ?? '—', className: 'w-24' },
    {
      header: 'Sumă',
      cell: (i) => formatRON(i.suma),
      className: 'w-28 text-right',
    },
  ]
  if (onEdit) {
    base.push({
      header: '',
      cell: (i) => (
        <Button variant="ghost" onClick={() => onEdit(i.id)}>
          Editează
        </Button>
      ),
      className: 'w-28 text-right',
    })
  }
  return base
}

export function IncasariTab() {
  const { locatieId: globalLocatieId } = useWorkingLocatie()
  const { role } = useAuth()
  const canEdit = isManagerOrHigher(role)
  const [editingId, setEditingId] = useState<string | null>(null)
  const columns = useMemo(
    () => buildColumns(canEdit ? (id: string) => setEditingId(id) : null),
    [canEdit],
  )
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [locatieId, setLocatieId] = useState<string>('')
  const [categorie, setCategorie] = useState<string>('')
  const [page, setPage] = useState(0)

  // Default locatie din global la primul mount
  useEffect(() => {
    if (!locatieId && globalLocatieId) setLocatieId(globalLocatieId)
  }, [globalLocatieId, locatieId])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['incasari', { search, from, to, page, locatieId, categorie }],
    queryFn: () =>
      listIncasari({
        search,
        from,
        to,
        page,
        locatieId: locatieId || null,
        categorie: categorie || null,
      }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  const pageSum = useMemo(
    () => (data?.rows ?? []).reduce((acc, r) => acc + (r.suma ?? 0), 0),
    [data],
  )

  const onExport = () => {
    const rows = data?.rows ?? []
    const suffix = [
      from || 'all',
      to || 'all',
      locatieId ? 'loc' : 'toate-loc',
      categorie || 'toate-cat',
    ].join('_')
    downloadCsv(
      `incasari-${suffix}.csv`,
      ['Data', 'Client', 'Categorie', 'Detalii', 'Locație', 'Metodă', 'Sumă (RON)', 'Observații'],
      rows.map((r) => [
        r.data ?? '',
        r.client_nume ?? '',
        r.categorie ?? '',
        r.detalii ?? '',
        r.locatie_nume ?? '',
        r.metoda ?? '',
        r.suma,
        r.observatii ?? '',
      ]),
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Field label="Caută în observații" htmlFor="inc-search">
            <TextInput
              id="inc-search"
              placeholder="ex: reînscriere…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="De la" htmlFor="inc-from">
            <TextInput
              id="inc-from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setPage(0)
              }}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Până la" htmlFor="inc-to">
            <TextInput
              id="inc-to"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setPage(0)
              }}
            />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Locația" htmlFor="inc-loc">
            <Select
              id="inc-loc"
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
        <div className="w-44">
          <Field label="Categorie" htmlFor="inc-cat">
            <Select
              id="inc-cat"
              placeholder="Toate"
              options={categorieIncasareOptions}
              value={categorie}
              onChange={(e) => {
                setCategorie(e.target.value)
                setPage(0)
              }}
            />
          </Field>
        </div>
        <div className="ml-auto">
          <Button
            variant="secondary"
            onClick={onExport}
            disabled={!data?.rows.length}
          >
            ⬇ Export CSV
          </Button>
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
            rowKey={(i) => i.id ?? ''}
            emptyMessage="Nicio încasare."
          />

          {editingId && (
            <IncasareEditModal
              open
              incasareId={editingId}
              onClose={() => setEditingId(null)}
            />
          )}

          <div className="mt-4 flex items-center justify-between text-sm text-quasar-gray">
            <span>
              {data?.total ?? 0} încasări · total pagină:{' '}
              <span className="font-semibold text-quasar-black">
                {formatRON(pageSum)}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <span>
                Pagina {page + 1} / {totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ←
              </Button>
              <Button
                variant="secondary"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                →
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
