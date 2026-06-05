import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { formatRON } from '@/lib/format'
import type { MetodaPunct } from './api'

const COLORS: Record<string, string> = {
  Cash:       '#ffd600',
  Card:       '#3b82f6',
  Transfer:   '#10b981',
  Revolut:    '#a855f7',
  Necunoscut: '#9ca3af',
}

type Props = {
  rows: MetodaPunct[]
}

export function MetodePlataChart({ rows }: Props) {
  return (
    <div className="rounded-lg border border-quasar-gray-light bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">
        Mix metode de plată
      </h3>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-quasar-gray">
          Nicio încasare în această lună.
        </p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                dataKey="total"
                nameKey="metoda"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
                label={({ percent }) => {
                  const pct = Math.round((percent ?? 0) * 100)
                  return pct >= 5 ? `${pct}%` : ''
                }}
                labelLine={false}
              >
                {rows.map((r) => (
                  <Cell
                    key={r.metoda}
                    fill={COLORS[r.metoda] ?? '#9ca3af'}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatRON(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
