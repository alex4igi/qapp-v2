import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

type Props = {
  title: string
  parte: number
  total: number
  parteLabel: string
  restLabel: string
  emptyMessage?: string
}

const COLORS = ['#ffd600', '#e5e5e5']

// Donut „parte din total" pentru campania de reînscrieri. Numitorul vine de la
// apelant, fiindcă se schimbă după sursă: semnăturile din registre pentru
// campaniile ținute în Excel, pool-ul sezonului trecut pentru restul.
export function ReinscrieriDonut({
  title,
  parte,
  total,
  parteLabel,
  restLabel,
  emptyMessage = 'Nicio reînscriere înregistrată pe sezonul ales.',
}: Props) {
  const rest = Math.max(0, total - parte)
  const procent = total > 0 ? Math.round((parte / total) * 100) : 0
  const data = [
    { name: parteLabel, value: parte },
    { name: restLabel, value: rest },
  ]

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">{title}</h3>
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-quasar-gray">
          {emptyMessage}
        </p>
      ) : (
        <div className="relative h-72">
          <div className="pointer-events-none absolute inset-0 -mt-6 flex flex-col items-center justify-center">
            <span className="font-display text-3xl font-bold text-quasar-black">
              {procent}%
            </span>
            <span className="text-xs text-quasar-gray">
              {parte} din {total}
            </span>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={104}
                paddingAngle={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v} clienți`, n as string]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
