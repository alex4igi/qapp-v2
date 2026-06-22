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
import type { LunaBalanta } from './api'

type Props = {
  title: string
  rows: LunaBalanta[]
  baseColor?: string
  topColor?: string
  emptyMessage?: string
}

export function BalantaChart({
  title,
  rows,
  baseColor = '#ca8a04',
  topColor = '#fde68a',
  emptyMessage = 'Nicio dată în intervalul ales.',
}: Props) {
  const hasData = rows.some((r) => r.incasat > 0 || r.datorie > 0)

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
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${Number(v).toLocaleString('ro-RO')}`}
              />
              <Tooltip
                formatter={(v, name) => [formatRON(Number(v)), String(name)]}
                cursor={{ fill: '#f3f3f3' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="incasat"
                name="Încasat"
                stackId="b"
                fill={baseColor}
              />
              <Bar
                dataKey="datorie"
                name="Datorie"
                stackId="b"
                fill={topColor}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
