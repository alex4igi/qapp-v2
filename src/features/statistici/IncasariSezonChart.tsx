import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatRON } from '@/lib/format'
import type { IncasariSezonRow } from './api'

const STARE_FILL: Record<string, string> = {
  activ: '#ffd600',
  arhivat: '#9ca3af',
  planificat: '#3b82f6',
}

type Props = {
  rows: IncasariSezonRow[]
  emptyMessage?: string
}

export function IncasariSezonChart({
  rows,
  emptyMessage = 'Niciun sezon cu încasări înregistrate.',
}: Props) {
  const hasData = rows.some((r) => r.total_incasari > 0)

  const data = rows.map((r) => ({
    nume: r.numele_sezonului,
    total: Number(r.total_incasari ?? 0),
    stare: r.stare,
    tip: r.tip,
  }))

  return (
    <div className="rounded-lg border border-quasar-gray-light bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">
        Încasări per sezon (toate)
      </h3>
      {!hasData ? (
        <p className="py-8 text-center text-sm text-quasar-gray">
          {emptyMessage}
        </p>
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 16, left: 0, bottom: 32 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis
                dataKey="nume"
                tick={{ fontSize: 10 }}
                angle={-25}
                textAnchor="end"
                interval={0}
                height={50}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${Number(v).toLocaleString('ro-RO')}`}
              />
              <Tooltip
                formatter={(v, _name, item) => {
                  const stare = (
                    item as { payload?: { stare?: string } }
                  )?.payload?.stare
                  return [
                    `${formatRON(Number(v))} (${stare ?? '—'})`,
                    'Încasări',
                  ]
                }}
                cursor={{ fill: '#f3f3f3' }}
              />
              <Bar dataKey="total" name="Încasări">
                {data.map((row, idx) => (
                  <Cell
                    key={`c-${idx}`}
                    fill={STARE_FILL[row.stare] ?? '#9ca3af'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-3 flex gap-4 text-xs text-quasar-gray">
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded"
            style={{ background: STARE_FILL.activ }}
          />
          Activ
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded"
            style={{ background: STARE_FILL.planificat }}
          />
          Planificat
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded"
            style={{ background: STARE_FILL.arhivat }}
          />
          Arhivat
        </span>
      </div>
    </div>
  )
}
