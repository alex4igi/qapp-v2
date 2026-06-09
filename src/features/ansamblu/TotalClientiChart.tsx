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
import type { CrestereNetaRow } from './api'

function formatLuna(luna: string): string {
  // "2025-09" → "09.25"
  const [y, m] = luna.split('-')
  return `${m}.${y.slice(2)}`
}

// Numărul total de clienți (cu înrolare care acoperă luna) per lună.
export function TotalClientiChart({ rows }: { rows: CrestereNetaRow[] }) {
  const data = rows.map((r) => ({
    luna: formatLuna(r.luna),
    Clienți: r.activi,
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
        <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="luna" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip formatter={(v) => [`${v}`, 'Clienți']} />
          <Bar dataKey="Clienți" fill="#3b82f6" radius={[3, 3, 0, 0]}>
            <LabelList
              dataKey="Clienți"
              position="top"
              style={{ fontSize: 11, fill: '#374151' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
