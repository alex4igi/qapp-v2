import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatRON } from '@/lib/format'
import type { ArpuRow } from './api'

function formatLuna(luna: string): string {
  const [y, m] = luna.split('-')
  return `${m}.${y.slice(2)}`
}

// ARPU = venit lună / clienți activi lună. Trendul contează mai mult decât nivelul.
export function ArpuTrendChart({ rows }: { rows: ArpuRow[] }) {
  const data = rows.map((r) => ({
    luna: formatLuna(r.luna),
    ARPU: r.arpu ?? 0,
    activi: r.clienti_activi,
    venit: r.venit,
  }))

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-quasar-gray">
        Nicio dată în interval.
      </p>
    )
  }

  return (
    <div className="h-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="luna" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={64} tickFormatter={(v) => formatRON(Number(v))} />
          <Tooltip
            formatter={(v, _n, item) => {
              const p = item?.payload as (typeof data)[number]
              return [`${formatRON(Number(v))} (${p.activi} activi)`, 'ARPU']
            }}
          />
          <Line
            type="monotone"
            dataKey="ARPU"
            stroke="#7c3aed"
            strokeWidth={2}
            dot={{ r: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
