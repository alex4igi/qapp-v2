import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataTable, Field, Spinner, TextInput, type Column } from '@/components/ui'
import { getDemoFunnel, type DemoFunnelRow } from '@/features/evenimente/apiDemo'

const iso = (d: Date) => d.toISOString().slice(0, 10)

function defaultRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 0)
  return { from: iso(from), to: iso(to) }
}

type Grup = {
  key: string
  nume: string
  rows: DemoFunnelRow[]
  inscrisi: number
  prezenti: number
  convertiti: number
  contracte: number
}

const pct = (n: number, base: number) =>
  base > 0 ? `${Math.round((n / base) * 100)}%` : '—'

// Rezultatul claselor demo, grupat pe campanie. Trăiește în /campanii, nu pe o
// rută nouă: acolo se uită oricum la performanța campaniilor.
export function RaportDemoSection() {
  const [range, setRange] = useState(defaultRange)
  const q = useQuery({
    queryKey: ['demo-funnel', 'campanii', range.from, range.to],
    queryFn: () => getDemoFunnel({ from: range.from, to: range.to }),
  })

  const grupuri = useMemo<Grup[]>(() => {
    const map = new Map<string, Grup>()
    for (const r of q.data ?? []) {
      const key = r.campanie_id ?? '—'
      let g = map.get(key)
      if (!g) {
        g = {
          key,
          nume: r.campanie_nume ?? 'Fără campanie',
          rows: [],
          inscrisi: 0,
          prezenti: 0,
          convertiti: 0,
          contracte: 0,
        }
        map.set(key, g)
      }
      g.rows.push(r)
      g.inscrisi += r.inscrisi
      g.prezenti += r.prezenti
      g.convertiti += r.convertiti
      g.contracte += r.contract_semnat
    }
    return [...map.values()].sort((a, b) => b.inscrisi - a.inscrisi)
  }, [q.data])

  const columns: Column<DemoFunnelRow>[] = [
    { header: 'Data', cell: (r) => r.data ?? '—', sortValue: (r) => r.data },
    { header: 'Ora', cell: (r) => r.ora?.slice(0, 5) ?? '—' },
    { header: 'Clasă demo', cell: (r) => r.nume, sortValue: (r) => r.nume },
    { header: 'Locație', cell: (r) => r.locatie_nume ?? '—' },
    {
      header: 'Înscriși',
      cell: (r) =>
        r.capacitate != null ? `${r.inscrisi} / ${r.capacitate}` : String(r.inscrisi),
      sortValue: (r) => r.inscrisi,
    },
    {
      header: 'Prezenți',
      cell: (r) => `${r.prezenti} (${pct(r.prezenti, r.inscrisi)})`,
      sortValue: (r) => r.prezenti,
    },
    {
      header: 'Convertiți',
      cell: (r) => `${r.convertiti} (${pct(r.convertiti, r.inscrisi)})`,
      sortValue: (r) => r.convertiti,
    },
    {
      header: 'Contract semnat',
      cell: (r) => `${r.contract_semnat} (${pct(r.contract_semnat, r.inscrisi)})`,
      sortValue: (r) => r.contract_semnat,
    },
  ]

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-quasar-black">
        Rezultat clase demo
      </h2>

      <div className="mb-4 flex flex-wrap gap-3">
        <Field label="De la" htmlFor="demo-from">
          <TextInput
            id="demo-from"
            type="date"
            value={range.from}
            onChange={(e) => setRange((p) => ({ ...p, from: e.target.value }))}
          />
        </Field>
        <Field label="Până la" htmlFor="demo-to">
          <TextInput
            id="demo-to"
            type="date"
            value={range.to}
            onChange={(e) => setRange((p) => ({ ...p, to: e.target.value }))}
          />
        </Field>
      </div>

      {q.isLoading ? (
        <Spinner />
      ) : grupuri.length === 0 ? (
        <p className="rounded-md border border-quasar-gray-light bg-white p-4 text-sm text-quasar-gray">
          Nicio clasă demo în interval.
        </p>
      ) : (
        <div className="space-y-6">
          {grupuri.map((g) => (
            <div key={g.key}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-quasar-gray">
                {g.nume}{' '}
                <span className="ml-1 font-normal normal-case tracking-normal">
                  — {g.inscrisi} înscriși · {g.prezenti} prezenți (
                  {pct(g.prezenti, g.inscrisi)}) · {g.convertiti} convertiți (
                  {pct(g.convertiti, g.inscrisi)}) · {g.contracte} contracte (
                  {pct(g.contracte, g.inscrisi)})
                </span>
              </h3>
              <DataTable
                columns={columns}
                rows={g.rows}
                rowKey={(r) => r.eveniment_id}
                emptyMessage="—"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
