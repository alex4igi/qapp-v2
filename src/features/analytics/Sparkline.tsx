// Sparkline inline (SVG pur, fără recharts) — pentru o celulă de tabel.
export function Sparkline({
  values,
  width = 96,
  height = 28,
  color = '#1d4ed8',
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (!values || values.length < 2) {
    return <span className="text-xs text-quasar-gray">—</span>
  }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const stepX = width / (values.length - 1)
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4)
  const points = values.map((v, i) => `${i * stepX},${y(v)}`).join(' ')
  const last = values[values.length - 1]
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={(values.length - 1) * stepX} cy={y(last)} r={2.2} fill={color} />
    </svg>
  )
}
