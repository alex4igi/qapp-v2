import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CrestereNetaRow } from './api'

function formatLuna(luna: string): string {
  // "2025-09" → "09.25"
  const [y, m] = luna.split('-')
  return `${m}.${y.slice(2)}`
}

export function CrestereNetaChart({ rows }: { rows: CrestereNetaRow[] }) {
  // Pierduți afișați negativ → bare divergente în jurul lui 0.
  const data = rows.map((r) => ({
    luna: formatLuna(r.luna),
    Intrați: r.intrati,
    Pierduți: -r.pierduti,
    Net: r.net,
  }))

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-quasar-gray">
        Nicio dată în interval.
      </p>
    )
  }

  return (
    <div className="h-72 rounded-lg border border-quasar-gray-light bg-white p-4 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="luna" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => Math.abs(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="#9ca3af" />
          <Bar dataKey="Intrați" fill="#10b981" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Pierduți" fill="#ef4444" radius={[0, 0, 3, 3]} />
          <Line
            dataKey="Net"
            stroke="#111827"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
