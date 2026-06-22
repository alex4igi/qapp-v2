import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

type Props = {
  reinscrisi: number
  potential: number
  emptyMessage?: string
}

const COLORS = ['#ffd600', '#e5e5e5']

// Donut: câți s-au reînscris din potențialul de eligibili al sezonului țintă.
export function ReinscrieriDonut({
  reinscrisi,
  potential,
  emptyMessage = 'Niciun client eligibil în sezonul țintă.',
}: Props) {
  const ramasi = Math.max(0, potential - reinscrisi)
  const procent = potential > 0 ? Math.round((reinscrisi / potential) * 100) : 0
  const data = [
    { name: 'Reînscriși', value: reinscrisi },
    { name: 'Rămași', value: ramasi },
  ]

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">
        Reînscriși din potențial
      </h3>
      {potential === 0 ? (
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
              {reinscrisi} din {potential}
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
