import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { campaniiOptions } from '@/lib/lookups'
import { listUsers } from '@/features/setari/utilizatoriApi'
import type { Lead } from '@/types/db'
import { listLeads } from './api'
import { PIPELINE_COLUMNS, GRUPA_LABELS } from './constants'

type Bucket = {
  key: string
  label: string
  total: number
  convertiti: number
  pierduti: number
}

function aggregate(
  leads: Lead[],
  keyOf: (l: Lead) => string,
  labelOf: (k: string) => string,
): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const l of leads) {
    const k = keyOf(l)
    let b = map.get(k)
    if (!b) {
      b = { key: k, label: labelOf(k), total: 0, convertiti: 0, pierduti: 0 }
      map.set(k, b)
    }
    b.total++
    if (l.status === 'convertit') b.convertiti++
    if (l.status === 'pierdut') b.pierduti++
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

function rata(b: Bucket): string {
  return b.total
    ? `${Math.round((b.convertiti / b.total) * 100)}%`
    : '—'
}

function BreakdownTable({
  titlu,
  coloana,
  buckets,
}: {
  titlu: string
  coloana: string
  buckets: Bucket[]
}) {
  return (
    <section className="rounded-lg border border-quasar-gray-light bg-white">
      <h3 className="border-b border-quasar-gray-light px-3 py-2 text-sm font-semibold text-quasar-black">
        {titlu}
      </h3>
      {buckets.length === 0 ? (
        <p className="px-3 py-3 text-sm text-quasar-gray">Fără date.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-quasar-gray">
              <th className="px-3 py-1.5 font-medium">{coloana}</th>
              <th className="px-3 py-1.5 text-right font-medium">Total</th>
              <th className="px-3 py-1.5 text-right font-medium">Convertiți</th>
              <th className="px-3 py-1.5 text-right font-medium">Pierduți</th>
              <th className="px-3 py-1.5 text-right font-medium">Rată</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr
                key={b.key}
                className="border-t border-quasar-gray-light/60"
              >
                <td className="px-3 py-1.5 text-quasar-black">{b.label}</td>
                <td className="px-3 py-1.5 text-right">{b.total}</td>
                <td className="px-3 py-1.5 text-right text-green-700">
                  {b.convertiti}
                </td>
                <td className="px-3 py-1.5 text-right text-quasar-gray">
                  {b.pierduti}
                </td>
                <td className="px-3 py-1.5 text-right font-medium">
                  {rata(b)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function LeadReports() {
  const leadsQ = useQuery({ queryKey: ['leads'], queryFn: listLeads })
  const campaniiQ = useQuery({
    queryKey: ['lookup', 'campanii'],
    queryFn: campaniiOptions,
  })
  const usersQ = useQuery({
    queryKey: ['lookup', 'users'],
    queryFn: listUsers,
    retry: false,
  })

  const campaniiById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of campaniiQ.data ?? []) m.set(c.value, c.label)
    return m
  }, [campaniiQ.data])

  const usersById = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of usersQ.data ?? []) m.set(u.id, u.email ?? u.id)
    return m
  }, [usersQ.data])

  const leads = leadsQ.data ?? []

  const funnel = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of leads) counts.set(l.status, (counts.get(l.status) ?? 0) + 1)
    return PIPELINE_COLUMNS.map((c) => ({
      status: c.status,
      label: c.label,
      count: counts.get(c.status) ?? 0,
    }))
  }, [leads])

  const total = leads.length
  const convertiti = funnel.find((f) => f.status === 'convertit')?.count ?? 0
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count))

  const perSursa = useMemo(
    () =>
      aggregate(
        leads,
        (l) => l.sursa ?? '—',
        (k) => (k === '—' ? 'Fără sursă' : (campaniiById.get(k) ?? k)),
      ),
    [leads, campaniiById],
  )
  const perCurs = useMemo(
    () =>
      aggregate(
        leads,
        (l) => l.curs_interes ?? '—',
        (k) => (k === '—' ? 'Necompletat' : k),
      ),
    [leads],
  )
  const perGrupa = useMemo(
    () =>
      aggregate(
        leads,
        (l) => l.grupa_varsta ?? '—',
        (k) =>
          k === '—'
            ? 'Necompletat'
            : (GRUPA_LABELS[k as keyof typeof GRUPA_LABELS] ?? k),
      ),
    [leads],
  )
  const perResponsabil = useMemo(
    () =>
      aggregate(
        leads,
        (l) => l.responsabil_id ?? '—',
        (k) => (k === '—' ? 'Neasignat' : (usersById.get(k) ?? 'Utilizator')),
      ),
    [leads, usersById],
  )

  if (leadsQ.isLoading) return <Spinner />
  if (leadsQ.isError)
    return (
      <p className="text-sm text-red-600">
        Eroare la încărcarea lead-urilor.
      </p>
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-quasar-gray-light bg-white px-4 py-3">
          <p className="text-xs text-quasar-gray">Total lead-uri</p>
          <p className="text-2xl font-semibold text-quasar-black">{total}</p>
        </div>
        <div className="rounded-lg border border-quasar-gray-light bg-white px-4 py-3">
          <p className="text-xs text-quasar-gray">Convertiți</p>
          <p className="text-2xl font-semibold text-green-700">
            {convertiti}
          </p>
        </div>
        <div className="rounded-lg border border-quasar-gray-light bg-white px-4 py-3">
          <p className="text-xs text-quasar-gray">Rată conversie</p>
          <p className="text-2xl font-semibold text-quasar-black">
            {total ? Math.round((convertiti / total) * 100) : 0}%
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-quasar-gray-light bg-white">
        <h3 className="border-b border-quasar-gray-light px-3 py-2 text-sm font-semibold text-quasar-black">
          Distribuție pe pipeline
        </h3>
        <div className="space-y-1.5 p-3">
          {funnel.map((f) => (
            <div key={f.status} className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 text-quasar-gray">
                {f.label}
              </span>
              <div className="h-4 flex-1 rounded bg-quasar-gray-light/50">
                <div
                  className="h-4 rounded bg-quasar-yellow"
                  style={{ width: `${(f.count / maxFunnel) * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right font-medium text-quasar-black">
                {f.count}
              </span>
            </div>
          ))}
        </div>
      </section>

      <BreakdownTable
        titlu="Conversie pe sursă"
        coloana="Sursă"
        buckets={perSursa}
      />
      <BreakdownTable
        titlu="Conversie pe curs"
        coloana="Curs"
        buckets={perCurs}
      />
      <BreakdownTable
        titlu="Conversie pe grupă"
        coloana="Grupă"
        buckets={perGrupa}
      />
      <BreakdownTable
        titlu="Conversie pe responsabil"
        coloana="Responsabil"
        buckets={perResponsabil}
      />
    </div>
  )
}
