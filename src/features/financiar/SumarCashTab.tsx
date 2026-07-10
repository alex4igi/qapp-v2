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
import { Field, DateInput, Select, Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { locatiiOptions } from '@/lib/lookups'
import { KpiCard } from '@/features/statistici/KpiCard'
import { listReconcilieri, type ReconciliereRow } from './ReconcilieriTab'

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

function difOf(r: ReconciliereRow): number {
  return (
    Number(r.total_numarat ?? 0) -
    (Number(r.fond_inceput ?? 0) + Number(r.total_sistem ?? 0))
  )
}

export function SumarCashTab() {
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
    queryKey: ['sumar-cash', { from, to, locatieId }],
    queryFn: () => listReconcilieri({ from, to, locatieId: locatieId || null }),
  })

  const sumar = useMemo(() => {
    const rows = data ?? []
    const sum = (pick: (r: ReconciliereRow) => number) =>
      rows.reduce((a, r) => a + pick(r), 0)
    const difTotal = sum(difOf)
    // Numărat NU se sumează pe zile: conține fondul reportat de ieri,
    // deja numărat în ziua precedentă — suma ar dubla banii.
    const last = [...rows].sort((a, b) =>
      (a.data ?? '').localeCompare(b.data ?? ''),
    )[rows.length - 1]
    return {
      zile: rows.length,
      sistem: sum((r) => Number(r.total_sistem ?? 0)),
      sertarFinal: Number(last?.fond_ramas ?? 0),
      sertarFinalData: last?.data ?? null,
      depus: sum((r) => Number(r.de_depus ?? 0)),
      difTotal,
      zileLipsa: rows.filter((r) => difOf(r) < 0).length,
      zileSurplus: rows.filter((r) => difOf(r) > 0).length,
    }
  }, [data])

  // Grafic: diferența pe zile, cronologic (listReconcilieri sortează desc).
  const chartData = useMemo(
    () =>
      [...(data ?? [])]
        .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''))
        .map((r) => ({ data: (r.data ?? '').slice(5), dif: difOf(r) })),
    [data],
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="w-40">
          <Field label="De la" htmlFor="sc-from">
            <DateInput
              id="sc-from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Până la" htmlFor="sc-to">
            <DateInput
              id="sc-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Locația" htmlFor="sc-loc">
            <Select
              id="sc-loc"
              placeholder="Toate locațiile"
              options={locatiiQ.data ?? []}
              value={locatieId}
              onChange={(e) => setLocatieId(e.target.value)}
            />
          </Field>
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
            <KpiCard label="Cash în sistem" value={formatRON(sumar.sistem)} />
            <KpiCard
              label="Sertar la final"
              value={formatRON(sumar.sertarFinal)}
              hint={
                sumar.sertarFinalData
                  ? `fond rămas după ${sumar.sertarFinalData}`
                  : 'fond rămas după ultima reconciliere'
              }
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
              } · numărat − (fond ieri + cash sistem), pe zile`}
            />
            <KpiCard label="Total depus" value={formatRON(sumar.depus)} />
            <KpiCard
              label="Zile cu probleme"
              value={sumar.zileLipsa + sumar.zileSurplus}
              tone={
                sumar.zileLipsa + sumar.zileSurplus > 0 ? 'warning' : 'positive'
              }
              hint={`din ${sumar.zile} zile`}
            />
          </div>

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
        </div>
      )}
    </div>
  )
}
