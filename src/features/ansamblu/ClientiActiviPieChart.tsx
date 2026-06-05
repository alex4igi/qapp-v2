import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { ClientiActiviRow } from './api'

const COLORS = ['#FFD600', '#111827', '#9ca3af', '#3b82f6', '#10b981', '#a855f7']

type Props = {
  rows: ClientiActiviRow[]
  total: number
}

export function ClientiActiviPieChart({ rows, total }: Props) {
  return (
    <div className="rounded-lg border border-quasar-gray-light bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">
        Clienți activi pe locație
      </h3>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-quasar-gray">
          Nicio locație cu clienți activi.
        </p>
      ) : (
        <div className="relative h-72">
          {/* Total unic în centrul donut-ului (overlay HTML — centrare robustă).
              Donut-ul lasă un gol între ~38% și ~62% pe înălțime; -mt-3 compensează
              spațiul legendei de jos ca textul să cadă pe centrul inelului. */}
          <div className="pointer-events-none absolute inset-0 -mt-6 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-quasar-black">{total}</span>
            <span className="text-xs text-quasar-gray">activi în club</span>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                dataKey="activi"
                nameKey="locatie_nume"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={104}
                paddingAngle={2}
                label={({ value }) => `${value}`}
                labelLine={false}
              >
                {rows.map((r, i) => (
                  <Cell key={r.locatie_id} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v} activi`, n as string]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
