import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatRON } from '@/lib/format'
import type { BalantaGrupaRow } from '../api'

const LATIME_GRUPA = 96

// 3 bare per grupă: încasat în lună (cash-in) · restant luna asta · restant
// luni anterioare din sezon. Scroll orizontal când sunt multe grupe.
export function BalantaGrupeChart({ rows }: { rows: BalantaGrupaRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-quasar-gray">
        Nicio grupă cu încasări sau restanțe în luna aleasă.
      </p>
    )
  }
  const data = rows.map((r) => ({
    grupa: r.nume_curs,
    'Încasat în lună': Math.round(r.incasat_luna),
    'Restant luna asta': Math.round(r.restant_luna),
    'Restant luni anterioare': Math.round(r.restant_anterior),
    nr: r.nr_clienti_restanti,
    locatie: r.nume_locatie,
  }))
  const width = Math.max(rows.length * LATIME_GRUPA, 600)

  return (
    <div className="overflow-x-auto">
      <div style={{ width, height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 56, left: 4 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="grupa"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={64}
            />
            <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={(v) => formatRON(Number(v))} />
            <Tooltip
              formatter={(v, n) => [formatRON(Number(v)), n as string]}
              labelFormatter={(l, payload) => {
                const p = payload?.[0]?.payload as (typeof data)[number] | undefined
                return p
                  ? `${l} · ${p.locatie ?? ''} · ${p.nr} ${p.nr === 1 ? 'client cu restanță' : 'clienți cu restanță'}`
                  : String(l)
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" />
            <Bar dataKey="Încasat în lună" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Restant luna asta" fill="#ef4444" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Restant luni anterioare" fill="#991b1b" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
