import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CrestereNetaRow } from '@/features/ansamblu/api'
import type { LeadsLunaRow } from './api'

function formatLuna(luna: string): string {
  const [y, m] = luna.split('-')
  return `${m}.${y.slice(2)}`
}

// Două fluxuri separate: intrați vs pierduți pe lună (nu doar netul). 300 cursanți
// nu spun nimic dacă pierzi 30 și înlocuiești 30 = mers pe loc.
export function FluxChart({ rows }: { rows: CrestereNetaRow[] }) {
  const data = rows.map((r) => ({
    luna: formatLuna(r.luna),
    Intrați: r.intrati,
    Pierduți: r.pierduti,
    Net: r.net,
  }))

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-quasar-gray">
        Nicio dată în interval.
      </p>
    )
  }

  return (
    <div className="h-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="luna" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Intrați" fill="#16a34a" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Pierduți" fill="#dc2626" radius={[3, 3, 0, 0]} />
          <Line type="monotone" dataKey="Net" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
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
