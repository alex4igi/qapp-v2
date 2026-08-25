import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatRON } from '@/lib/format'
import type { EvolutieRow } from '../api'

function formatLuna(luna: string): string {
  const [y, m] = luna.split('-')
  return `${m}.${y.slice(2)}`
}

export function EvolutieChart({ rows }: { rows: EvolutieRow[] }) {
  const data = rows.map((r) => ({
    luna: formatLuna(r.luna),
    Abonamente: Math.round(r.sold_net),
    'One-off': Math.round(r.sold_oneoff),
    total: Math.round(r.sold_total),
  }))

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-quasar-gray">Nicio dată.</p>
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="luna" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={(v) => formatRON(Number(v))} />
          <Tooltip
            formatter={(v, n) => [formatRON(Number(v)), n as string]}
            labelFormatter={(l, payload) => {
              const total = (payload?.[0]?.payload as (typeof data)[number] | undefined)?.total
              return total != null ? `${l} · total ${formatRON(total)}` : String(l)
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="Abonamente"
            stackId="sold"
            stroke="#ef4444"
            fill="#ef4444"
            fillOpacity={0.35}
          />
          <Area
            type="monotone"
            dataKey="One-off"
            stackId="sold"
            stroke="#f59e0b"
            fill="#f59e0b"
            fillOpacity={0.35}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
