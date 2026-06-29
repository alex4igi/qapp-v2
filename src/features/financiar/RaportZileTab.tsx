import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  DateInput,
  Field,
  Select,
  Spinner,
  DataTable,
  Button,
  type Column,
} from '@/components/ui'
import { formatRON } from '@/lib/format'
import { downloadCsv } from '@/lib/csv'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { locatiiOptions, saliOptions } from '@/lib/lookups'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import { useTeacheriOptions } from '@/hooks/useTeacheriOptions'
import {
  getRaportZile,
  RAPORT_DIMENSIUNI,
  CATEGORII_RAPORT,
  RAPORT_CATEGORIE_LABEL,
  type RaportDimensiune,
  type RaportZiRow,
} from './api'

function startOfMonthIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayIso(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

const baseColumns: Column<RaportZiRow>[] = [
  {
    header: 'Data',
    cell: (r) => r.data,
    className: 'w-32',
    sortValue: (r) => r.data,
  },
  {
    header: 'Încasări',
    cell: (r) => (
      <span className="font-semibold text-quasar-black">
        {formatRON(r.total)}
      </span>
    ),
    className: 'w-32 text-right',
    sortValue: (r) => r.total ?? 0,
  },
  {
    header: 'Cash',
    cell: (r) => (r.cash > 0 ? formatRON(r.cash) : '—'),
    className: 'w-32 text-right',
    sortValue: (r) => r.cash ?? 0,
  },
  {
    header: 'Card',
    cell: (r) => (r.card > 0 ? formatRON(r.card) : '—'),
    className: 'w-32 text-right',
    sortValue: (r) => r.card ?? 0,
  },
  {
    header: 'Transfer',
    cell: (r) => (r.transfer > 0 ? formatRON(r.transfer) : '—'),
    className: 'w-32 text-right',
    sortValue: (r) => r.transfer ?? 0,
  },
  {
    header: 'Revolut',
    cell: (r) => (r.revolut > 0 ? formatRON(r.revolut) : '—'),
    className: 'w-32 text-right',
    sortValue: (r) => r.revolut ?? 0,
  },
  {
    header: 'Online',
    cell: (r) => (r.online > 0 ? formatRON(r.online) : '—'),
    className: 'w-32 text-right',
    sortValue: (r) => r.online ?? 0,
  },
]

// Defalcare pe categorii (Abonament/Bilet/Merch/Taxă/Workshop/Audiție) —
// „tab-urile" din modalul Plată nouă. Sumele vin din map-ul r.categorii.
const categoriiColumns: Column<RaportZiRow>[] = CATEGORII_RAPORT.map((cat) => ({
  header: RAPORT_CATEGORIE_LABEL[cat] ?? cat,
  cell: (r: RaportZiRow) =>
    (r.categorii[cat] ?? 0) > 0 ? formatRON(r.categorii[cat]) : '—',
  className: 'w-28 text-right',
  sortValue: (r: RaportZiRow) => r.categorii[cat] ?? 0,
}))

// Cheltuielile nu au atribuire pe dimensiune → doar în „Toate locațiile".
const cheltuieliColumns: Column<RaportZiRow>[] = [
  {
    header: 'Cheltuieli',
    cell: (r) =>
      r.cheltuieli > 0 ? (
        <span className="text-red-600">{formatRON(r.cheltuieli)}</span>
      ) : (
        '—'
      ),
    className: 'w-32 text-right',
    sortValue: (r) => r.cheltuieli ?? 0,
  },
  {
    header: 'Net',
    cell: (r) => (
      <span
        className={`font-semibold ${r.net < 0 ? 'text-red-600' : 'text-emerald-700'}`}
      >
        {formatRON(r.net)}
      </span>
    ),
    className: 'w-32 text-right',
    sortValue: (r) => r.net ?? 0,
  },
]

export function RaportZileTab({ privileged }: { privileged: boolean }) {
  const { locatieId: globalLocatieId } = useWorkingLocatie()
  const [from, setFrom] = useState(startOfMonthIso())
  const [to, setTo] = useState(todayIso())
  const [dimensiune, setDimensiune] = useState<RaportDimensiune>(
    globalLocatieId ? 'locatie' : 'all',
  )
  const [entityId, setEntityId] = useState(globalLocatieId ?? '')

  // Sincronizează entityId cu locația globală când se schimbă în header
  useEffect(() => {
    if (dimensiune === 'locatie' && globalLocatieId && !entityId) {
      setEntityId(globalLocatieId)
    }
  }, [globalLocatieId, dimensiune, entityId])

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
    enabled: dimensiune === 'locatie',
  })
  const saliQ = useQuery({
    queryKey: ['lookup', 'sali'],
    queryFn: () => saliOptions(),
    enabled: dimensiune === 'sala',
  })
  const cursuriQ = useCursuriOptions({ enabled: dimensiune === 'curs' })
  const teacheriQ = useTeacheriOptions({ enabled: dimensiune === 'teacher' })

  const entityOptions =
    dimensiune === 'locatie'
      ? (locatiiQ.data ?? [])
      : dimensiune === 'sala'
        ? (saliQ.data ?? [])
        : dimensiune === 'curs'
          ? (cursuriQ.data ?? [])
          : dimensiune === 'teacher'
            ? (teacheriQ.data ?? [])
            : []

  const entityLabel =
    {
      all: '',
      locatie: 'Locație',
      sala: 'Sala',
      curs: 'Curs',
      teacher: 'Profesor',
    }[dimensiune]

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['raport-zile', { from, to, dimensiune, entityId, privileged }],
    queryFn: () =>
      getRaportZile({ from, to, dimensiune, entityId, includeCheltuieli: privileged }),
    placeholderData: keepPreviousData,
  })

  const summary = data?.summary
  const showCheltuieli = privileged && dimensiune === 'all'
  const columns = showCheltuieli
    ? [...baseColumns, ...categoriiColumns, ...cheltuieliColumns]
    : [...baseColumns, ...categoriiColumns]

  const onExport = () => {
    const rows = data?.rows ?? []
    const headers = [
      'Data',
      'Încasări',
      'Cash',
      'Card',
      'Transfer',
      'Revolut',
      'Online',
      ...CATEGORII_RAPORT.map((c) => RAPORT_CATEGORIE_LABEL[c] ?? c),
    ]
    const body: (string | number)[][] = rows.map((r) => [
      r.data,
      r.total,
      r.cash,
      r.card,
      r.transfer,
      r.revolut,
      r.online,
      ...CATEGORII_RAPORT.map((c) => r.categorii[c] ?? 0),
    ])
    const totalRow: (string | number)[] = [
      'TOTAL',
      summary?.total ?? 0,
      summary?.cash ?? 0,
      summary?.card ?? 0,
      summary?.transfer ?? 0,
      summary?.revolut ?? 0,
      summary?.online ?? 0,
      ...CATEGORII_RAPORT.map((c) => summary?.categorii[c] ?? 0),
    ]
    if (showCheltuieli) {
      headers.push('Cheltuieli', 'Net')
      rows.forEach((r, i) => body[i].push(r.cheltuieli, r.net))
      totalRow.push(summary?.cheltuieli ?? 0, summary?.net ?? 0)
    }
    body.push(totalRow)
    downloadCsv(`raport-zile-${from}_${to}.csv`, headers, body)
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="w-40">
          <Field label="De la" htmlFor="rz-from">
            <DateInput
              id="rz-from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Până la" htmlFor="rz-to">
            <DateInput
              id="rz-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Tip raport" htmlFor="rz-dim">
            <Select
              id="rz-dim"
              options={RAPORT_DIMENSIUNI}
              value={dimensiune}
              onChange={(e) => {
                setDimensiune(e.target.value as RaportDimensiune)
                setEntityId('')
              }}
            />
          </Field>
        </div>
        {dimensiune !== 'all' && (
          <div className="w-64">
            <Field label={entityLabel} htmlFor="rz-entity">
              <Select
                id="rz-entity"
                placeholder={`Alege ${entityLabel.toLowerCase()}…`}
                options={entityOptions}
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
              />
            </Field>
          </div>
        )}
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

      {summary && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-quasar-yellow text-lg">
            💰
          </div>
          <p className="text-sm">
            <strong className="text-quasar-black">
              Încasări: {formatRON(summary.total)}
            </strong>
            {summary.total > 0 && (
              <span className="text-quasar-gray">
                {' '}
                · Cash {formatRON(summary.cash)} · Card{' '}
                {formatRON(summary.card)} · Transfer{' '}
                {formatRON(summary.transfer)} · Revolut{' '}
                {formatRON(summary.revolut)} · Online{' '}
                {formatRON(summary.online)}
              </span>
            )}
            {showCheltuieli && (
              <span>
                {' · '}
                <span className="text-red-600">
                  Cheltuieli {formatRON(summary.cheltuieli)}
                </span>
                {' · '}
                <strong
                  className={summary.net < 0 ? 'text-red-600' : 'text-emerald-700'}
                >
                  Net {formatRON(summary.net)}
                </strong>
              </span>
            )}
            {summary.total > 0 && (
              <span className="mt-1 block text-quasar-gray">
                {CATEGORII_RAPORT.filter((c) => (summary.categorii[c] ?? 0) > 0)
                  .map(
                    (c) =>
                      `${RAPORT_CATEGORIE_LABEL[c] ?? c} ${formatRON(summary.categorii[c])}`,
                  )
                  .join(' · ')}
              </span>
            )}
          </p>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-red-600">
          Eroare: {humanizeError(error)}
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => r.data}
          emptyMessage={
            showCheltuieli
              ? 'Nicio mișcare în intervalul ales.'
              : 'Nicio încasare în intervalul ales.'
          }
        />
      )}
    </div>
  )
}
