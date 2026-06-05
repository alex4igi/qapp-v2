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

type Row = {
  curs_nume: string
  varsta: string | null
  [key: string]: unknown
}

type Props = {
  title: string
  rows: Row[]
  baseKey: string
  baseLabel: string
  baseColor: string
  topKey: string
  topLabel: string
  topColor: string
  percentKey: string
  percentSuffix: string
  emptyMessage?: string
}

export function ReinscrieriKpiChart({
  title,
  rows,
  baseKey,
  baseLabel,
  baseColor,
  topKey,
  topLabel,
  topColor,
  percentKey,
  percentSuffix,
  emptyMessage = 'Niciun curs cu activări în sezonul țintă.',
}: Props) {
  const hasData = rows.some(
    (r) => Number(r[baseKey] ?? 0) > 0 || Number(r[topKey] ?? 0) > 0,
  )

  const data = rows.map((r) => ({
    nume: r.varsta ? `${r.curs_nume} (${r.varsta})` : r.curs_nume,
    ...r,
  }))

  return (
    <div className="rounded-lg border border-quasar-gray-light bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">{title}</h3>
      {!hasData ? (
        <p className="py-8 text-center text-sm text-quasar-gray">
          {emptyMessage}
        </p>
      ) : (
        <div className="h-72">
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
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                formatter={(v, name, item) => {
                  if (name === baseLabel || name === topLabel) {
                    const pct = Number(
                      (item as { payload?: Record<string, unknown> })?.payload?.[
                        percentKey
                      ] ?? 0,
                    )
                    return [
                      `${v} (${pct}${percentSuffix})`,
                      String(name),
                    ]
                  }
                  return [String(v), String(name)]
                }}
                cursor={{ fill: '#f3f3f3' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey={baseKey}
                name={baseLabel}
                stackId="r"
                fill={baseColor}
              />
              <Bar
                dataKey={topKey}
                name={topLabel}
                stackId="r"
                fill={topColor}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
