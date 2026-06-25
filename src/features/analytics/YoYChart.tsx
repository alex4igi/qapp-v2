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
import type { YoYRow } from './api'

const LUNI = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec']

// Comparație an-la-an pe ACEEAȘI lună (la o școală sezonieră, lună-la-lună nu are
// sens — iunie vs septembrie e absurd). p_metrica: venit (RON) sau activi (nr).
export function YoYChart({
  rows,
  metrica,
  anCurent,
}: {
  rows: YoYRow[]
  metrica: 'venit' | 'activi'
  anCurent: number
}) {
  const isVenit = metrica === 'venit'
  const data = rows.map((r) => ({
    luna: LUNI[r.luna_num - 1] ?? String(r.luna_num),
    [`${anCurent - 1}`]: r.an_precedent,
    [`${anCurent}`]: r.an_curent,
  }))

  const fmt = (v: number) => (isVenit ? formatRON(v) : String(v))

  return (
    <div className="h-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="luna" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={isVenit ? 64 : 36} tickFormatter={(v) => fmt(Number(v))} />
          <Tooltip formatter={(v) => fmt(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey={`${anCurent - 1}`} fill="#cbd5e1" radius={[3, 3, 0, 0]} />
          <Bar dataKey={`${anCurent}`} fill="#1d4ed8" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
