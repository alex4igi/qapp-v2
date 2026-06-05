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
import type { DashboardChartRow } from './api'

type Props = {
  rows: DashboardChartRow[]
}

export function DashboardChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-quasar-gray-light bg-white p-6 text-sm text-quasar-gray">
        Niciun curs azi — fără date de afișat.
      </div>
    )
  }
  return (
    <div className="h-72 rounded-lg border border-quasar-gray-light bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis dataKey="curs" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="incasari" name="Încasări" fill="#86efac" />
          <Bar dataKey="restante" name="Restanțe" fill="#fca5a5" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
