import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CursantiLunaRow } from './api'
import { numeLuna } from './comparatii'

// Axa sezonului școlar: septembrie → iunie, fără vacanța de vară.
const LUNI_SEZON = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6]
const ETICHETE: Record<number, string> = {
  9: 'Sep', 10: 'Oct', 11: 'Noi', 12: 'Dec', 1: 'Ian', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'Mai', 6: 'Iun',
}

type Punct = {
  luna: string
  curent: number | null
  trecut: number | null
  inCurs: boolean
}

type DotProps = { cx?: number; cy?: number; payload?: Punct; value?: number | null }

function PunctCurent({ cx, cy, payload, value }: DotProps) {
  if (cx == null || cy == null || value == null) return null
  return payload?.inCurs ? (
    <circle cx={cx} cy={cy} r={4.5} fill="#ffffff" stroke="#1a1814" strokeWidth={2} />
  ) : (
    <circle cx={cx} cy={cy} r={3.5} fill="#1a1814" />
  )
}

export function CursantiSezonChart({ rows }: { rows: CursantiLunaRow[] }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-2">Nicio lună de sezon încă.</p>
  }

  const ultima = rows.reduce((a, b) => (a.luna > b.luna ? a : b))
  const sezonCurent = ultima.sezon_id
  const numeCurent = ultima.sezon_nume
  const numeTrecut = rows.find((r) => r.sezon_id !== sezonCurent)?.sezon_nume ?? 'Sezonul trecut'

  const peLuna = (sezonId: string, eqTrecut: boolean) =>
    new Map(
      rows
        .filter((r) => (eqTrecut ? r.sezon_id !== sezonId : r.sezon_id === sezonId))
        .map((r) => [Number(r.luna.slice(5, 7)), r]),
    )
  const curent = peLuna(sezonCurent, false)
  const trecut = peLuna(sezonCurent, true)

  const data: Punct[] = LUNI_SEZON.map((m) => {
    const c = curent.get(m)
    const t = trecut.get(m)
    return {
      luna: ETICHETE[m],
      curent: c && !c.incomplet ? c.cursanti : null,
      trecut: t && !t.incomplet ? t.cursanti : null,
      inCurs: !!c?.in_curs,
    }
  })

  const incomplete = rows.filter((r) => r.incomplet)

  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <h3 className="text-sm font-semibold text-ink">Cursanți plătitori pe lună</h3>
      <p className="mb-3 text-xs text-muted-2">
        Oameni cu loc cu taxă în cel puțin o zi a lunii. Cercul gol = luna în curs, numărată până azi.
      </p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ece8e0" vertical={false} />
            <XAxis dataKey="luna" tick={{ fontSize: 11 }} padding={{ left: 20, right: 20 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={44} />
            <Tooltip
              formatter={(v, name) => [v == null ? '—' : Number(v).toLocaleString('ro-RO'), String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="trecut"
              name={numeTrecut}
              stroke="#b8b3a8"
              strokeWidth={2}
              dot={{ r: 3, fill: '#b8b3a8' }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="curent"
              name={numeCurent}
              stroke="#1a1814"
              strokeWidth={2.5}
              dot={<PunctCurent />}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {incomplete.length > 0 && (
        <p className="mt-2 text-xs text-muted-2">
          Lipsesc din grafic lunile incomplete în date:{' '}
          {incomplete
            .map((r) => `${numeLuna(r.luna)} (${r.acoperire != null ? `${r.acoperire.toLocaleString('ro-RO')}%` : 'fără prezențe'} din cei prezenți aveau loc)`)
            .join(', ')}
          .
        </p>
      )}
    </div>
  )
}
