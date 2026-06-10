import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

export type DonutSlice = { name: string; value: number }

type Props = {
  title: string
  percent: number
  centerSub?: string
  slices: [DonutSlice, DonutSlice]
  colors?: [string, string]
  emptyMessage?: string
  children?: React.ReactNode
}

const DEFAULT_COLORS: [string, string] = ['#ffd600', '#e5e5e5']

// Donut generic cu procent centrat (2 felii). Folosit pentru rată prezență,
// grad de ocupare și retenție în overview-ul lunii curente.
export function OverviewDonut({
  title,
  percent,
  centerSub,
  slices,
  colors = DEFAULT_COLORS,
  emptyMessage = 'Fără date pe luna curentă.',
  children,
}: Props) {
  const total = slices[0].value + slices[1].value

  return (
    <div className="rounded-lg border border-quasar-gray-light bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">{title}</h3>
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-quasar-gray">
          {emptyMessage}
        </p>
      ) : (
        <>
          <div className="relative h-64">
            <div className="pointer-events-none absolute inset-0 -mt-6 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-quasar-black">
                {percent}%
              </span>
              {centerSub && (
                <span className="text-xs text-quasar-gray">{centerSub}</span>
              )}
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={64}
                  outerRadius={96}
                  paddingAngle={2}
                >
                  {slices.map((_, i) => (
                    <Cell key={i} fill={colors[i]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v}`, n as string]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {children}
        </>
      )}
    </div>
  )
}
