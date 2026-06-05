import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  TextInput,
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
import {
  locatiiOptions,
  saliOptions,
  cursuriOptions,
  teacheriOptions,
} from '@/lib/lookups'
import {
  getRaportZile,
  RAPORT_DIMENSIUNI,
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

const columns: Column<RaportZiRow>[] = [
  { header: 'Data', cell: (r) => r.data, className: 'w-32' },
  {
    header: 'Total',
    cell: (r) => (
      <span className="font-semibold text-quasar-black">
        {formatRON(r.total)}
      </span>
    ),
    className: 'w-32 text-right',
  },
  {
    header: 'Cash',
    cell: (r) => (r.cash > 0 ? formatRON(r.cash) : '—'),
    className: 'w-32 text-right',
  },
  {
    header: 'Card',
    cell: (r) => (r.card > 0 ? formatRON(r.card) : '—'),
    className: 'w-32 text-right',
  },
  {
    header: 'Transfer',
    cell: (r) => (r.transfer > 0 ? formatRON(r.transfer) : '—'),
    className: 'w-32 text-right',
  },
  {
    header: 'Revolut',
    cell: (r) => (r.revolut > 0 ? formatRON(r.revolut) : '—'),
    className: 'w-32 text-right',
  },
]

export function RaportZileTab() {
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
  const cursuriQ = useQuery({
    queryKey: ['lookup', 'cursuri'],
    queryFn: () => cursuriOptions(),
    enabled: dimensiune === 'curs',
  })
  const teacheriQ = useQuery({
    queryKey: ['lookup', 'teacheri'],
    queryFn: teacheriOptions,
    enabled: dimensiune === 'teacher',
  })

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
    queryKey: ['raport-zile', { from, to, dimensiune, entityId }],
    queryFn: () => getRaportZile({ from, to, dimensiune, entityId }),
    placeholderData: keepPreviousData,
  })

  const summary = data?.summary

  const onExport = () => {
    const rows = data?.rows ?? []
    downloadCsv(
      `raport-zile-${from}_${to}.csv`,
      ['Data', 'Total', 'Cash', 'Card', 'Transfer', 'Revolut'],
      rows.map((r) => [r.data, r.total, r.cash, r.card, r.transfer, r.revolut]),
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Field label="De la" htmlFor="rz-from">
            <TextInput
              id="rz-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Până la" htmlFor="rz-to">
            <TextInput
              id="rz-to"
              type="date"
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
        <p className="mb-3 text-sm">
          <strong>Total: {formatRON(summary.total)}</strong>
          {summary.total > 0 && (
            <span className="text-quasar-gray">
              {' '}
              · Cash {formatRON(summary.cash)} · Card{' '}
              {formatRON(summary.card)} · Transfer{' '}
              {formatRON(summary.transfer)} · Revolut{' '}
              {formatRON(summary.revolut)}
            </span>
          )}
        </p>
      )}

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-red-600">
          Eroare: {error instanceof Error ? error.message : ''}
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => r.data}
          emptyMessage="Nicio încasare în intervalul ales."
        />
      )}
    </div>
  )
}
