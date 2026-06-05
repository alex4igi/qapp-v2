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
import { categorieCheltuialaOptions } from '@/lib/enums'
import { supabase } from '@/lib/supabase'
import type { Cheltuiala } from '@/types/db'
import { CheltuialaForm } from '@/features/cheltuieli/CheltuialaForm'

const PAGE_SIZE = 25

type Filtre = {
  search: string
  from: string
  to: string
  categorie: string
  achitat: string // '' | 'da' | 'nu'
  page: number
}

async function listCheltuieliExt(f: Filtre): Promise<{
  rows: Cheltuiala[]
  total: number
  sumTotal: number
  sumAchitat: number
  sumNeachitat: number
}> {
  const rangeFrom = f.page * PAGE_SIZE
  const rangeTo = rangeFrom + PAGE_SIZE - 1

  const build = () => {
    let q = supabase.from('cheltuieli').select('*', { count: 'exact' })
    const term = f.search.trim()
    if (term) q = q.or(`nume.ilike.%${term}%,descriere.ilike.%${term}%`)
    if (f.from) q = q.gte('deadline', f.from)
    if (f.to) q = q.lte('deadline', f.to)
    if (f.categorie)
      q = q.eq(
        'categorie',
        f.categorie as 'Administrativa' | 'Salariala' | 'Alta',
      )
    if (f.achitat === 'da') q = q.eq('achitat', true)
    if (f.achitat === 'nu') q = q.eq('achitat', false)
    return q
  }

  const paginated = build()
    .order('deadline', { ascending: true, nullsFirst: false })
    .range(rangeFrom, rangeTo)
  const { data, error, count } = await paginated
  if (error) throw error

  // Sume agregate pe tot filtrul (separate query)
  const { data: aggRows, error: aggErr } = await build().select(
    'valoare, achitat',
  )
  if (aggErr) throw aggErr
  const sumTotal = (aggRows ?? []).reduce(
    (a, r) => a + Number(r.valoare ?? 0),
    0,
  )
  const sumAchitat = (aggRows ?? [])
    .filter((r) => r.achitat)
    .reduce((a, r) => a + Number(r.valoare ?? 0), 0)
  const sumNeachitat = sumTotal - sumAchitat

  return {
    rows: data ?? [],
    total: count ?? 0,
    sumTotal,
    sumAchitat,
    sumNeachitat,
  }
}

const columns: Column<Cheltuiala>[] = [
  {
    header: 'Nume',
    cell: (c) => <span className="font-medium">{c.nume}</span>,
  },
  {
    header: 'Categorie',
    cell: (c) => c.categorie ?? '—',
    className: 'w-36',
  },
  {
    header: 'Deadline',
    cell: (c) => c.deadline ?? '—',
    className: 'w-32',
  },
  {
    header: 'Valoare',
    cell: (c) => formatRON(c.valoare),
    className: 'w-28 text-right',
  },
  {
    header: 'Achitată',
    cell: (c) =>
      c.achitat ? (
        <span className="font-medium text-green-700">Da</span>
      ) : (
        <span className="font-medium text-red-600">Nu</span>
      ),
    className: 'w-24',
  },
  {
    header: 'Descriere',
    cell: (c) => c.descriere ?? '—',
    className: 'text-xs text-quasar-gray',
  },
]

export function CheltuieliTab() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [categorie, setCategorie] = useState('')
  const [achitat, setAchitat] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Cheltuiala | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cheltuieli-ext', { search, from, to, categorie, achitat, page }],
    queryFn: () =>
      listCheltuieliExt({ search, from, to, categorie, achitat, page }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  const onExport = () => {
    const rows = data?.rows ?? []
    downloadCsv(
      `cheltuieli-${from || 'all'}_${to || 'all'}_${categorie || 'toate-cat'}.csv`,
      ['Nume', 'Categorie', 'Deadline', 'Valoare (RON)', 'Achitată', 'Descriere'],
      rows.map((r) => [
        r.nume,
        r.categorie ?? '',
        r.deadline ?? '',
        Number(r.valoare ?? 0),
        r.achitat ? 'Da' : 'Nu',
        r.descriere ?? '',
      ]),
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Field label="Caută nume/descriere" htmlFor="ch-search">
            <TextInput
              id="ch-search"
              placeholder="ex: chirie, salariu…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Deadline de la" htmlFor="ch-from">
            <TextInput
              id="ch-from"
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
          <Field label="Până la" htmlFor="ch-to">
            <TextInput
              id="ch-to"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setPage(0)
              }}
            />
          </Field>
        </div>
        <div className="w-44">
          <Field label="Categorie" htmlFor="ch-cat">
            <Select
              id="ch-cat"
              placeholder="Toate"
              options={categorieCheltuialaOptions}
              value={categorie}
              onChange={(e) => {
                setCategorie(e.target.value)
                setPage(0)
              }}
            />
          </Field>
        </div>
        <div className="w-32">
          <Field label="Achitată?" htmlFor="ch-ach">
            <Select
              id="ch-ach"
              options={[
                { value: '', label: 'Toate' },
                { value: 'da', label: 'Da' },
                { value: 'nu', label: 'Nu' },
              ]}
              value={achitat}
              onChange={(e) => {
                setAchitat(e.target.value)
                setPage(0)
              }}
            />
          </Field>
        </div>
        <div className="ml-auto flex items-end gap-2">
          <Button
            variant="secondary"
            onClick={onExport}
            disabled={!data?.rows.length}
          >
            ⬇ Export CSV
          </Button>
          <Button onClick={() => setFormOpen(true)}>+ Cheltuială nouă</Button>
        </div>
      </div>

      {data && (
        <p className="mb-3 text-sm">
          <strong>{data.total}</strong> cheltuieli · total{' '}
          <span className="font-semibold">{formatRON(data.sumTotal)}</span>
          {' · '}achitat{' '}
          <span className="font-semibold text-green-700">
            {formatRON(data.sumAchitat)}
          </span>
          {' · '}neachitat{' '}
          <span className="font-semibold text-red-600">
            {formatRON(data.sumNeachitat)}
          </span>
        </p>
      )}

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
            onRowClick={(c) => setEditing(c)}
            emptyMessage="Nicio cheltuială."
          />

          <div className="mt-4 flex items-center justify-end gap-2 text-sm text-quasar-gray">
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
        </>
      )}

      {formOpen && (
        <CheltuialaForm open onClose={() => setFormOpen(false)} />
      )}
      {editing && (
        <CheltuialaForm
          open
          cheltuiala={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
