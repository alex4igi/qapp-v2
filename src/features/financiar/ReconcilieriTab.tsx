import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Field,
  DateInput,
  Select,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { formatRON } from '@/lib/format'
import { downloadCsv } from '@/lib/csv'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { locatiiOptions } from '@/lib/lookups'
import type { ReconciliereCash } from '@/types/db'

type Row = ReconciliereCash & { locatii?: { nume: string | null } | null }

async function listReconcilieri(params: {
  from: string
  to: string
  locatieId: string | null
}): Promise<Row[]> {
  let q = supabase
    .from('reconcilieri_cash')
    .select(`*, locatii(nume)`)
    .order('data', { ascending: false })
  if (params.from) q = q.gte('data', params.from)
  if (params.to) q = q.lte('data', params.to)
  if (params.locatieId) q = q.eq('locatie', params.locatieId)
  const { data, error } = await q
  if (error) throw error
  return (data as unknown as Row[] | null) ?? []
}

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

function difTone(d: number): string {
  if (d === 0) return 'text-emerald-700'
  if (d > 0) return 'text-amber-600'
  return 'text-red-600'
}

const columns: Column<Row>[] = [
  {
    header: 'Data',
    cell: (r) => r.data,
    className: 'w-28',
    sortValue: (r) => r.data,
  },
  {
    header: 'Locație',
    cell: (r) => r.locatii?.nume ?? '—',
    className: 'w-44',
    sortValue: (r) => r.locatii?.nume?.toLowerCase(),
  },
  {
    header: 'Sistem (Cash)',
    cell: (r) => formatRON(Number(r.total_sistem ?? 0)),
    className: 'w-32 text-right',
    sortValue: (r) => Number(r.total_sistem ?? 0),
  },
  {
    header: 'Fond ieri',
    cell: (r) => formatRON(Number(r.fond_inceput ?? 0)),
    className: 'w-28 text-right',
    sortValue: (r) => Number(r.fond_inceput ?? 0),
  },
  {
    header: 'Numărat',
    cell: (r) => formatRON(Number(r.total_numarat ?? 0)),
    className: 'w-28 text-right',
    sortValue: (r) => Number(r.total_numarat ?? 0),
  },
  {
    header: 'Dif.',
    cell: (r) => {
      const d = Number(r.total_numarat ?? 0) -
        (Number(r.fond_inceput ?? 0) + Number(r.total_sistem ?? 0))
      return (
        <span className={`font-semibold ${difTone(d)}`}>
          {d > 0 ? '+' : ''}
          {formatRON(d)}
        </span>
      )
    },
    className: 'w-32 text-right',
    sortValue: (r) =>
      Number(r.total_numarat ?? 0) -
      (Number(r.fond_inceput ?? 0) + Number(r.total_sistem ?? 0)),
  },
  {
    header: 'De depus',
    cell: (r) => formatRON(Number(r.de_depus ?? 0)),
    className: 'w-28 text-right',
    sortValue: (r) => Number(r.de_depus ?? 0),
  },
  {
    header: 'Fond mâine',
    cell: (r) => formatRON(Number(r.fond_ramas ?? 0)),
    className: 'w-28 text-right',
    sortValue: (r) => Number(r.fond_ramas ?? 0),
  },
  {
    header: 'Notițe',
    cell: (r) => r.notite ?? '—',
    className: 'text-xs text-quasar-gray',
    sortValue: (r) => r.notite?.toLowerCase(),
  },
]

export function ReconcilieriTab() {
  const { locatieId: globalLocatieId } = useWorkingLocatie()
  const [from, setFrom] = useState(startOfMonthIso())
  const [to, setTo] = useState(todayIso())
  const [locatieId, setLocatieId] = useState<string>('')

  useEffect(() => {
    if (!locatieId && globalLocatieId) setLocatieId(globalLocatieId)
  }, [globalLocatieId, locatieId])

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reconcilieri', { from, to, locatieId }],
    queryFn: () =>
      listReconcilieri({ from, to, locatieId: locatieId || null }),
  })

  const sumar = useMemo(() => {
    const rows = data ?? []
    return {
      n: rows.length,
      depus: rows.reduce((a, r) => a + Number(r.de_depus ?? 0), 0),
      difTotal: rows.reduce((a, r) => {
        const d = Number(r.total_numarat ?? 0) -
          (Number(r.fond_inceput ?? 0) + Number(r.total_sistem ?? 0))
        return a + d
      }, 0),
    }
  }, [data])

  const onExport = () => {
    const rows = data ?? []
    const body: (string | number)[][] = rows.map((r) => {
      const dif = Number(r.total_numarat ?? 0) -
        (Number(r.fond_inceput ?? 0) + Number(r.total_sistem ?? 0))
      return [
        r.data ?? '',
        r.locatii?.nume ?? '',
        Number(r.total_sistem ?? 0),
        Number(r.fond_inceput ?? 0),
        Number(r.total_numarat ?? 0),
        dif,
        Number(r.de_depus ?? 0),
        Number(r.fond_ramas ?? 0),
        r.notite ?? '',
      ]
    })
    // Total doar pe coloanele aditive; fondurile sunt solduri zilnice, nu se cumulează.
    const sum = (pick: (r: Row) => number) => rows.reduce((a, r) => a + pick(r), 0)
    body.push([
      'TOTAL',
      '',
      sum((r) => Number(r.total_sistem ?? 0)),
      '',
      sum((r) => Number(r.total_numarat ?? 0)),
      sumar.difTotal,
      sumar.depus,
      '',
      '',
    ])
    downloadCsv(
      `reconcilieri-cash-${from}_${to}.csv`,
      [
        'Data',
        'Locație',
        'Sistem (Cash)',
        'Fond ieri',
        'Numărat',
        'Diferență',
        'De depus',
        'Fond mâine',
        'Notițe',
      ],
      body,
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="w-40">
          <Field label="De la" htmlFor="rc-from">
            <DateInput
              id="rc-from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Până la" htmlFor="rc-to">
            <DateInput
              id="rc-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Locația" htmlFor="rc-loc">
            <Select
              id="rc-loc"
              placeholder="Toate locațiile"
              options={locatiiQ.data ?? []}
              value={locatieId}
              onChange={(e) => setLocatieId(e.target.value)}
            />
          </Field>
        </div>
        <div className="ml-auto">
          <Button
            variant="secondary"
            onClick={onExport}
            disabled={!data?.length}
          >
            ⬇ Export CSV
          </Button>
        </div>
      </div>

      {data && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-quasar-yellow text-lg">
            🧾
          </div>
          <p className="text-sm text-quasar-gray">
            <strong className="text-quasar-black">{sumar.n}</strong> reconcilieri
            · total depus{' '}
            <span className="font-semibold text-quasar-black">
              {formatRON(sumar.depus)}
            </span>
            {sumar.difTotal !== 0 && (
              <>
                {' '}· diferență cumulată{' '}
                <span className={`font-semibold ${difTone(sumar.difTotal)}`}>
                  {sumar.difTotal > 0 ? '+' : ''}
                  {formatRON(sumar.difTotal)}
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
          Eroare: {error instanceof Error ? error.message : ''}
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(r) => r.id}
          emptyMessage="Nicio reconciliere în intervalul ales."
        />
      )}
    </div>
  )
}
