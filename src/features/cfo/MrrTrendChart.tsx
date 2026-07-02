import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
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

type Mode = 'ambele' | 'recurent' | 'facultativ'

const MODES: { key: Mode; label: string }[] = [
  { key: 'ambele', label: 'Ambele' },
  { key: 'recurent', label: 'Doar recurent' },
  { key: 'facultativ', label: 'Doar facultativ' },
]

// MRR recurent = venit predictibil din abonamente (baza). MRR facultativ = venit
// lunar din cursuri facultative — real, dar fără angajament recurent, deci afișat
// estompat, distinct de baza recurentă.
export function MrrTrendChart({ rows }: { rows: MrrRow[] }) {
  const [mode, setMode] = useState<Mode>('ambele')

  const data = rows.map((r) => ({
    luna: formatLuna(r.luna),
    Recurent: Math.round(r.mrr_recurent),
    Facultativ: Math.round(r.mrr_facultativ),
  }))

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-quasar-gray">Nicio dată.</p>
  }

  const showRec = mode !== 'facultativ'
  const showFac = mode !== 'recurent'

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex justify-end gap-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              mode === m.key
                ? 'bg-quasar-black text-white'
                : 'bg-quasar-gray-light text-quasar-gray hover:bg-gray-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 18, right: 12, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="mrrRecFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="mrrFacFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9ca3af" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#9ca3af" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="luna" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => formatRON(Number(v))} />
            <Tooltip formatter={(v, name) => [formatRON(Number(v)), name as string]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {showFac && (
              <Area
                type="monotone"
                dataKey="Facultativ"
                name="MRR facultativ"
                stroke="#9ca3af"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill="url(#mrrFacFill)"
                isAnimationActive={false}
              />
            )}
            {showRec && (
              <Area
                type="monotone"
                dataKey="Recurent"
                name="MRR recurent"
                stroke="#059669"
                strokeWidth={2}
                fill="url(#mrrRecFill)"
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
