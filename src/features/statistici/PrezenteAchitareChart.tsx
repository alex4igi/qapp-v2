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
import type { PrezentaAchitareRow } from './api'

type Props = {
  title: string
  rows: PrezentaAchitareRow[]
  emptyMessage?: string
}

// achitate + neachitate partiționează prezențele lunii; din_trecut e un overlay
// (prezențe din luni anterioare stinse în luna curentă) — de aceea bare grupate, nu stivuite.
export function PrezenteAchitareChart({
  title,
  rows,
  emptyMessage = 'Nicio prezență în intervalul ales.',
}: Props) {
  const hasData = rows.some(
    (r) => r.achitate > 0 || r.neachitate > 0 || r.din_trecut > 0,
  )

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">{title}</h3>
      {!hasData ? (
        <p className="py-8 text-center text-sm text-quasar-gray">
          {emptyMessage}
        </p>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="luna" tick={{ fontSize: 11 }} />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${Number(v).toLocaleString('ro-RO')}`}
              />
              <Tooltip
                formatter={(v, name) => [
                  Number(v).toLocaleString('ro-RO'),
                  String(name),
                ]}
                cursor={{ fill: '#f3f3f3' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="achitate" name="Achitate" fill="#16a34a" />
              <Bar dataKey="neachitate" name="Neachitate" fill="#dc2626" />
              <Bar
                dataKey="din_trecut"
                name="Achitate din trecut"
                fill="#60a5fa"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
