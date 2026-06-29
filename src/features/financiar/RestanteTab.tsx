import { humanizeError } from '@/lib/errorMessage'
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
import { locatiiOptions } from '@/lib/lookups'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import { listRestante, exportRestante, PAGE_SIZE, type RestantaRow } from './api'

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
    sortValue: (r) =>
      `${r.nume_client ?? ''} ${r.prenume_client ?? ''}`.trim().toLowerCase(),
  },
  {
    header: 'Curs',
    cell: (r) => r.nume_curs ?? '—',
    sortValue: (r) => r.nume_curs?.toLowerCase(),
  },
  {
    header: 'Locație',
    cell: (r) => r.nume_locatie ?? '—',
    className: 'w-36',
    sortValue: (r) => r.nume_locatie?.toLowerCase(),
  },
  {
    header: 'Început',
    cell: (r) => r.data_incepere ?? '—',
    className: 'w-28',
    sortValue: (r) => r.data_incepere,
  },
  {
    header: 'Total',
    cell: (r) => formatRON(r.total_de_plata),
    className: 'w-28 text-right',
    sortValue: (r) => r.total_de_plata ?? 0,
  },
  {
    header: 'Plătit',
    cell: (r) => formatRON(r.platit),
    className: 'w-28 text-right',
    sortValue: (r) => r.platit ?? 0,
  },
  {
    header: 'Rest',
    cell: (r) =>
      r.prescris ? (
        <span className="inline-flex items-center justify-end gap-1.5">
          <span
            className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500"
            title="Datorie prescrisă (sezon încheiat de peste 2 ani) — exclusă din totalul de recuperat"
          >
            prescris
          </span>
          <span className="font-semibold text-quasar-gray line-through">
            {formatRON(r.rest)}
          </span>
        </span>
      ) : (
        <span className="font-semibold text-red-600">{formatRON(r.rest)}</span>
      ),
    className: 'w-44 text-right',
    sortValue: (r) => r.rest ?? 0,
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

  const cursuriQ = useCursuriOptions({ locatieId })

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

  const [exporting, setExporting] = useState(false)
  const onExport = async () => {
    setExporting(true)
    try {
      const rows = await exportRestante({
        search,
        locatieId: locatieId || null,
        cursId: cursId || null,
      })
      const body: (string | number)[][] = rows.map((r) => [
        `${r.nume_client ?? ''} ${r.prenume_client ?? ''}`.trim(),
        r.nume_curs ?? '',
        r.nume_locatie ?? '',
        r.data_incepere ?? '',
        Number(r.total_de_plata ?? 0),
        Number(r.platit ?? 0),
        Number(r.rest ?? 0),
        r.prescris ? 'Da' : '—',
      ])
      const sum = (
        pick: (r: RestantaRow) => number,
        filter: (r: RestantaRow) => boolean = () => true,
      ) => rows.filter(filter).reduce((a, r) => a + pick(r), 0)
      const active = (r: RestantaRow) => !r.prescris
      body.push([
        'TOTAL DE RECUPERAT',
        '',
        '',
        '',
        sum((r) => Number(r.total_de_plata ?? 0), active),
        sum((r) => Number(r.platit ?? 0), active),
        sum((r) => Number(r.rest ?? 0), active),
        '',
      ])
      body.push([
        'TOTAL PRESCRIS',
        '',
        '',
        '',
        '',
        '',
        sum((r) => Number(r.rest ?? 0), (r) => !!r.prescris),
        '',
      ])
      downloadCsv(
        `restante-${locatieId ? 'loc' : 'toate-loc'}_${cursId ? 'curs' : 'toate-curs'}.csv`,
        ['Client', 'Curs', 'Locație', 'Început', 'Total (RON)', 'Plătit (RON)', 'Rest (RON)', 'Prescris'],
        body,
      )
    } finally {
      setExporting(false)
    }
  }

  const cursLabel = cursuriQ.data?.find((c) => c.value === cursId)?.label

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
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
            disabled={!data?.rows.length || exporting}
          >
            {exporting ? 'Se exportă…' : '⬇ Export CSV'}
          </Button>
        </div>
      </div>

      {data && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-quasar-yellow text-lg">
            ⚠️
          </div>
          <p className="text-sm text-quasar-gray">
            {cursLabel ? (
              <>
                Pe cursul{' '}
                <strong className="text-quasar-black">{cursLabel}</strong>:{' '}
              </>
            ) : (
              'Total: '
            )}
            <strong className="text-quasar-black">{data.total}</strong> înrolări
            cu restanță · de recuperat{' '}
            <span className="font-semibold text-red-600">
              {formatRON(data.sumRest)}
            </span>
            {data.countPrescris > 0 && (
              <>
                {' · '}
                <span className="text-quasar-gray">
                  {data.countPrescris} prescrise (
                  {formatRON(data.sumPrescris)}) excluse din total
                </span>
              </>
            )}
          </p>
        </div>
      )}

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
            rowKey={(r) => r.id_enrollment ?? String(r.id)}
            emptyMessage="Nicio restanță."
          />

          <div className="mt-4 flex items-center justify-end gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-quasar-gray shadow-sm">
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
