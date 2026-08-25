import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatRON } from '@/lib/format'
import type { AgingRow } from './api'

const BUCKET_COLOR: Record<string, string> = {
  '0-30': '#10b981',
  '31-60': '#eab308',
  '61-90': '#f59e0b',
  '90+': '#ef4444',
}

// Restanțe nete (neprescrise) pe vechimea datoriei. Coada (90+) = bani greu
// recuperabili — semnal de urgență. onBucketClick (opțional, /datorii): click pe
// o bară filtrează lista de datornici; /analytics îl omite și rămâne static.
export function RestanteAgingChart({
  rows,
  onBucketClick,
  activeBucket,
}: {
  rows: AgingRow[]
  onBucketClick?: (bucket: string) => void
  activeBucket?: string | null
}) {
  const data = rows.map((r) => ({
    bucket: `${r.bucket} zile`,
    raw: r.bucket,
    total: r.total,
    nr: r.nr,
  }))
  const hasData = rows.some((r) => r.total > 0)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">
        Restanțe pe vechime
        {onBucketClick && (
          <span className="ml-2 text-xs font-normal text-quasar-gray">
            clic pe o bară filtrează lista
          </span>
        )}
      </h3>
      {!hasData ? (
        <p className="py-8 text-center text-sm text-quasar-gray">
          Nicio restanță netă.
        </p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => formatRON(Number(v))} />
              <Tooltip
                formatter={(v, _n, item) => {
                  const nr = (item?.payload as (typeof data)[number])?.nr
                  return [`${formatRON(Number(v))} · ${nr} înrolări`, 'Restanță']
                }}
              />
              <Bar
                dataKey="total"
                radius={[3, 3, 0, 0]}
                cursor={onBucketClick ? 'pointer' : undefined}
                onClick={
                  onBucketClick
                    ? (d: { payload?: { raw?: string } }) => {
                        const raw = d?.payload?.raw
                        if (raw) onBucketClick(raw)
                      }
                    : undefined
                }
              >
                {data.map((d) => (
                  <Cell
                    key={d.raw}
                    fill={BUCKET_COLOR[d.raw] ?? '#9ca3af'}
                    fillOpacity={activeBucket && activeBucket !== d.raw ? 0.3 : 1}
                  />
                ))}
                <LabelList
                  dataKey="total"
                  position="top"
                  formatter={(v) => formatRON(Number(v))}
                  style={{ fontSize: 10, fill: '#374151' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
