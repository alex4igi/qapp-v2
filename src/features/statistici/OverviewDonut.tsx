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
  // Cum se calculează — iconiță „i" lângă titlu, conținutul apare la hover/focus.
  info?: React.ReactNode
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
  info,
  children,
}: Props) {
  const total = slices[0].value + slices[1].value

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-1.5">
        <h3 className="text-sm font-semibold text-quasar-black">{title}</h3>
        {info && (
          <div className="group relative">
            <button
              type="button"
              aria-label="Cum se calculează"
              className="flex h-4 w-4 items-center justify-center rounded-full border border-quasar-gray text-[10px] font-bold leading-none text-quasar-gray transition-colors hover:border-quasar-black hover:text-quasar-black focus:border-quasar-black focus:text-quasar-black focus:outline-none"
            >
              i
            </button>
            <div
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-72 -translate-x-1/2 rounded-lg bg-quasar-black px-3 py-2.5 text-xs leading-relaxed text-white shadow-lg group-focus-within:block group-hover:block"
            >
              {info}
            </div>
          </div>
        )}
      </div>
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-quasar-gray">
          {emptyMessage}
        </p>
      ) : (
        <>
          <div className="relative h-64">
            <div className="pointer-events-none absolute inset-0 -mt-6 flex flex-col items-center justify-center">
              <span className="font-display text-3xl font-bold text-quasar-black">
                {percent.toLocaleString('ro-RO')}%
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
