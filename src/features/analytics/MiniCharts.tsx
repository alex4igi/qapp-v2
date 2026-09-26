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
import type { LeadsLunaRow } from './api'

function formatLuna(luna: string): string {
  const [y, m] = luna.split('-')
  return `${m}.${y.slice(2)}`
}

export function LeadsLunaChart({ rows }: { rows: LeadsLunaRow[] }) {
  const data = rows.map((r) => ({
    luna: formatLuna(r.luna),
    Leads: r.leads,
    Convertiți: r.convertiti,
  }))

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-quasar-gray">
        Niciun lead în interval.
      </p>
    )
  }

  return (
    <div className="h-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="luna" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Leads" fill="#ffd600" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Convertiți" fill="#059669" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
