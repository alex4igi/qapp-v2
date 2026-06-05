import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { formatRON } from '@/lib/format'
import type { CategoriePunct } from './api'

type Props = {
  title: string
  rows: CategoriePunct[]
  palette: Record<string, string>
  emptyMessage?: string
}

const FALLBACK = '#9ca3af'

export function CategorieChart({
  title,
  rows,
  palette,
  emptyMessage = 'Nicio dată în intervalul ales.',
}: Props) {
  return (
    <div className="rounded-lg border border-quasar-gray-light bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-quasar-gray">
          {emptyMessage}
        </p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                dataKey="total"
                nameKey="categorie"
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
                    key={r.categorie}
                    fill={palette[r.categorie] ?? FALLBACK}
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
