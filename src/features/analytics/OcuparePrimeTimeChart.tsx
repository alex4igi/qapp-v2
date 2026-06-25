import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PrimeTimeRow } from './api'

// Ocupare pe slot orar: prime-time (17-20) vs ore moarte. Decizia de extindere
// depinde de vârf, nu de media zilei.
export function OcuparePrimeTimeChart({ rows }: { rows: PrimeTimeRow[] }) {
  const data = rows
    .filter((r) => r.slot !== 'Fără oră' || r.grupe > 0)
    .map((r) => ({
      slot: r.slot,
      Ocupare: r.procent ?? 0,
      activi: r.activi,
      capacitate: r.capacitate,
      grupe: r.grupe,
    }))

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-quasar-gray">
        Fără grupe cu oră definită.
      </p>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">
        Ocupare pe interval orar
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="slot" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
            <Tooltip
              formatter={(v, _n, item) => {
                const p = item?.payload as (typeof data)[number]
                return [`${v}% · ${p.activi}/${p.capacitate} · ${p.grupe} grupe`, 'Ocupare']
              }}
            />
            <Bar dataKey="Ocupare" fill="#1d4ed8" radius={[3, 3, 0, 0]}>
              <LabelList
                dataKey="Ocupare"
                position="top"
                formatter={(v) => `${Number(v)}%`}
                style={{ fontSize: 11, fill: '#374151' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
