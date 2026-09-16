import { humanizeError } from '@/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
import { difReconciliere } from '@/features/situatie-zilnica/api'
import { KpiCard } from '@/features/statistici/KpiCard'
import type { Views } from '@/types/db'

// View-ul recalculează încasările cash ale zilei din `incasari` (vezi migrația
// 20260916150000): coloana `total_sistem` din tabel e doar snapshotul de la
// numărare și rămâne în urmă dacă o încasare e corectată după salvare.
export type ReconciliereRow = Views<'reconcilieri_cash_live'>
type Row = ReconciliereRow

function difLive(r: Row): number {
  return difReconciliere({
    total_numarat: r.total_numarat,
    total_sistem: r.total_sistem_live,
    total_cheltuieli: r.total_cheltuieli,
  })
}

export async function listReconcilieri(params: {
  from: string
  to: string
  locatieId: string | null
}): Promise<Row[]> {
  let q = supabase
    .from('reconcilieri_cash_live')
    .select('*')
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
    cell: (r) => r.locatie_nume ?? '—',
    className: 'w-44',
    sortValue: (r) => r.locatie_nume?.toLowerCase(),
  },
  {
    header: 'Încasări cash',
    cell: (r) => formatRON(Number(r.total_sistem_live ?? 0)),
    className: 'w-32 text-right',
    sortValue: (r) => Number(r.total_sistem_live ?? 0),
  },
  {
    header: 'Cheltuieli cash',
    cell: (r) => formatRON(Number(r.total_cheltuieli ?? 0)),
    className: 'w-32 text-right',
    sortValue: (r) => Number(r.total_cheltuieli ?? 0),
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
      const d = difLive(r)
      return (
        <span className={`font-semibold ${difTone(d)}`}>
          {d > 0 ? '+' : ''}
          {formatRON(d)}
        </span>
      )
    },
    className: 'w-32 text-right',
    sortValue: (r) => difLive(r),
  },
  {
    header: 'Notițe',
    cell: (r) => r.notite ?? '—',
    className: 'text-xs text-quasar-gray',
    sortValue: (r) => r.notite?.toLowerCase(),
  },
]

export function CashTab() {
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
    queryKey: ['cash', { from, to, locatieId }],
    queryFn: () => listReconcilieri({ from, to, locatieId: locatieId || null }),
  })

  const sumar = useMemo(() => {
    const rows = data ?? []
    const sum = (pick: (r: Row) => number) => rows.reduce((a, r) => a + pick(r), 0)
    return {
      zile: rows.length,
      sistem: sum((r) => Number(r.total_sistem_live ?? 0)),
      cheltuieli: sum((r) => Number(r.total_cheltuieli ?? 0)),
      // Fără fond reportat, Numărat = net-ul zilei → însumabil = cash rămas.
      numarat: sum((r) => Number(r.total_numarat ?? 0)),
      difTotal: sum((r) => difLive(r)),
      zileLipsa: rows.filter((r) => difLive(r) < 0).length,
      zileSurplus: rows.filter((r) => difLive(r) > 0).length,
    }
  }, [data])

  // Grafic: diferența pe zile, cronologic (listReconcilieri sortează desc).
  const chartData = useMemo(
    () =>
      [...(data ?? [])]
        .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''))
        .map((r) => ({ data: (r.data ?? '').slice(5), dif: difLive(r) })),
    [data],
  )

  const onExport = () => {
    const rows = data ?? []
    const body: (string | number)[][] = rows.map((r) => [
      r.data ?? '',
      r.locatie_nume ?? '',
      Number(r.total_sistem_live ?? 0),
      Number(r.total_cheltuieli ?? 0),
      Number(r.total_numarat ?? 0),
      difLive(r),
      r.notite ?? '',
    ])
    const sum = (pick: (r: Row) => number) => rows.reduce((a, r) => a + pick(r), 0)
    body.push([
      'TOTAL',
      '',
      sum((r) => Number(r.total_sistem_live ?? 0)),
      sum((r) => Number(r.total_cheltuieli ?? 0)),
      sumar.numarat,
      sumar.difTotal,
      '',
    ])
    downloadCsv(
      `cash-${from}_${to}.csv`,
      [
        'Data',
        'Locație',
        'Încasări cash',
        'Cheltuieli cash',
        'Numărat',
        'Diferență',
        'Notițe',
      ],
      body,
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="w-40">
          <Field label="De la" htmlFor="cash-from">
            <DateInput
              id="cash-from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Până la" htmlFor="cash-to">
            <DateInput
              id="cash-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Locația" htmlFor="cash-loc">
            <Select
              id="cash-loc"
              placeholder="Toate locațiile"
              options={locatiiQ.data ?? []}
              value={locatieId}
              onChange={(e) => setLocatieId(e.target.value)}
            />
          </Field>
        </div>
        <div className="ml-auto">
          <Button variant="secondary" onClick={onExport} disabled={!data?.length}>
            ⬇ Export CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-red-600">Eroare: {humanizeError(error)}</p>
      ) : !data?.length ? (
        <p className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-quasar-gray shadow-sm">
          Nicio reconciliere în intervalul ales.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard
              label="Zile reconciliate"
              value={sumar.zile}
              hint={`${sumar.zileLipsa} cu lipsă · ${sumar.zileSurplus} cu surplus`}
            />
            <KpiCard label="Încasări cash" value={formatRON(sumar.sistem)} />
            <KpiCard label="Cheltuieli cash" value={formatRON(sumar.cheltuieli)} />
            <KpiCard
              label="Cash rămas în casă"
              value={formatRON(sumar.numarat)}
              hint="suma numărată pe zile"
            />
            <KpiCard
              label="Diferență cumulată"
              value={`${sumar.difTotal > 0 ? '+' : ''}${formatRON(sumar.difTotal)}`}
              tone={
                sumar.difTotal === 0
                  ? 'positive'
                  : sumar.difTotal > 0
                    ? 'warning'
                    : 'negative'
              }
              hint={`${
                sumar.difTotal === 0
                  ? 'totul torn'
                  : sumar.difTotal > 0
                    ? 'surplus'
                    : 'lipsă'
              } · numărat − (încasări − cheltuieli), pe zile`}
            />
            <KpiCard
              label="Zile cu diferență"
              value={sumar.zileLipsa + sumar.zileSurplus}
              tone={
                sumar.zileLipsa + sumar.zileSurplus > 0 ? 'warning' : 'positive'
              }
              hint={`din ${sumar.zile} zile`}
            />
          </div>

          <p className="px-1 text-xs text-quasar-gray">
            „Cash rămas în casă" e corect pentru zilele reconciliate cu modelul
            nou (încasări − cheltuieli). Zilele mai vechi, făcute cu fond
            reportat, pot avea numărat umflat.
          </p>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-quasar-black">
              Diferență pe zile
              <span className="ml-2 font-normal text-quasar-gray">
                (verde = surplus, roșu = lipsă)
              </span>
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${Number(v).toLocaleString('ro-RO')}`}
                  />
                  <Tooltip
                    formatter={(v) => [formatRON(Number(v)), 'Diferență']}
                    cursor={{ fill: '#f3f3f3' }}
                  />
                  <ReferenceLine y={0} stroke="#9ca3af" />
                  <Bar dataKey="dif" name="Diferență" radius={[4, 4, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.dif < 0 ? '#dc2626' : d.dif > 0 ? '#d97706' : '#16a34a'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <DataTable
            columns={columns}
            rows={data ?? []}
            rowKey={(r) => r.id ?? `${r.data}-${r.locatie}`}
            emptyMessage="Nicio reconciliere în intervalul ales."
          />
        </div>
      )}
    </div>
  )
}
