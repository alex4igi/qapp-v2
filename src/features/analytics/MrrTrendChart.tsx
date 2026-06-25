import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatRON } from '@/lib/format'
import type { MrrRow } from './api'

function formatLuna(luna: string): string {
  const [y, m] = luna.split('-')
  return `${m}.${y.slice(2)}`
}

// MRR = venitul recurent lunar (baza de venit predictibil). Trendul ascendent =
// creștere reală a bazei recurente, nu venituri one-off.
export function MrrTrendChart({ rows }: { rows: MrrRow[] }) {
  const data = rows.map((r) => ({ luna: formatLuna(r.luna), MRR: Math.round(r.mrr) }))

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-quasar-gray">Nicio dată.</p>
  }

  return (
    <div className="h-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 18, right: 12, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="luna" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => formatRON(Number(v))} />
          <Tooltip formatter={(v) => [formatRON(Number(v)), 'MRR']} />
          <Area type="monotone" dataKey="MRR" stroke="#059669" strokeWidth={2} fill="url(#mrrFill)" isAnimationActive={false}>
            <LabelList
              dataKey="MRR"
              position="top"
              formatter={(v) => formatRON(Number(v))}
              style={{ fontSize: 10, fill: '#374151' }}
            />
          </Area>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
