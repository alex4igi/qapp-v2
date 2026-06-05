import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { locatiiOptions, cursuriOptions } from '@/lib/lookups'
import { listRestante, PAGE_SIZE, type RestantaRow } from './api'

const columns: Column<RestantaRow>[] = [
  {
    header: 'Client',
    cell: (r) =>
      r.id_cursant ? (
        <Link
          to={`/clienti/${r.id_cursant}`}
          className="font-medium text-quasar-black hover:underline"
        >
          {r.nume_client} {r.prenume_client ?? ''}
        </Link>
      ) : (
        <span className="font-medium">
          {r.nume_client} {r.prenume_client ?? ''}
        </span>
      ),
  },
  { header: 'Curs', cell: (r) => r.nume_curs ?? '—' },
  {
    header: 'Locație',
    cell: (r) => r.nume_locatie ?? '—',
    className: 'w-36',
  },
  {
    header: 'Început',
    cell: (r) => r.data_incepere ?? '—',
    className: 'w-28',
  },
  {
    header: 'Total',
    cell: (r) => formatRON(r.total_de_plata),
    className: 'w-28 text-right',
  },
  {
    header: 'Plătit',
    cell: (r) => formatRON(r.platit),
    className: 'w-28 text-right',
  },
  {
    header: 'Rest',
    cell: (r) => (
      <span className="font-semibold text-red-600">{formatRON(r.rest)}</span>
    ),
    className: 'w-28 text-right',
  },
]

export function RestanteTab() {
  const { locatieId: globalLocatieId } = useWorkingLocatie()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [locatieId, setLocatieId] = useState<string>('')
  const [cursId, setCursId] = useState<string>('')
  const [page, setPage] = useState(0)

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

  const cursuriQ = useQuery({
    queryKey: ['lookup', 'cursuri'],
    queryFn: () => cursuriOptions(),
  })

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['restante', { search, page, locatieId, cursId }],
    queryFn: () =>
      listRestante({
        search,
        page,
        locatieId: locatieId || null,
        cursId: cursId || null,
      }),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
    [data],
  )

  const onExport = () => {
    const rows = data?.rows ?? []
    downloadCsv(
      `restante-${locatieId ? 'loc' : 'toate-loc'}_${cursId ? 'curs' : 'toate-curs'}.csv`,
      ['Client', 'Curs', 'Locație', 'Început', 'Total (RON)', 'Plătit (RON)', 'Rest (RON)'],
      rows.map((r) => [
        `${r.nume_client ?? ''} ${r.prenume_client ?? ''}`.trim(),
        r.nume_curs ?? '',
        r.nume_locatie ?? '',
        r.data_incepere ?? '',
        Number(r.total_de_plata ?? 0),
        Number(r.platit ?? 0),
        Number(r.rest ?? 0),
      ]),
    )
  }

  const cursLabel = cursuriQ.data?.find((c) => c.value === cursId)?.label

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Field label="Caută client sau curs" htmlFor="rs-search">
            <TextInput
              id="rs-search"
              placeholder="ex: Popescu…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Locația" htmlFor="rs-loc">
            <Select
              id="rs-loc"
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
        <div className="w-60">
          <Field label="Cursul" htmlFor="rs-curs">
            <Select
              id="rs-curs"
              placeholder="Toate cursurile"
              options={cursuriQ.data ?? []}
              value={cursId}
              onChange={(e) => {
                setCursId(e.target.value)
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

      {data && (
        <p className="mb-3 text-sm">
          {cursLabel ? (
            <>
              Pe cursul <strong>{cursLabel}</strong>:{' '}
            </>
          ) : (
            'Total: '
          )}
          <strong>{data.total}</strong> înrolări cu restanță · sumă totală{' '}
          <span className="font-semibold text-red-600">
            {formatRON(data.sumRest)}
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
            rowKey={(r) => r.id_enrollment ?? String(r.id)}
            emptyMessage="Nicio restanță."
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
    </div>
  )
}
