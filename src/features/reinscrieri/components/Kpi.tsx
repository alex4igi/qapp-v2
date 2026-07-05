export function Kpi({
  label,
  value,
  highlight,
}: {
  label: string
  value: string | number
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-md px-3 py-2 ${
        highlight ? 'bg-amber-100' : 'bg-quasar-gray-light/30'
      }`}
    >
      <div className="text-xs text-quasar-gray">{label}</div>
      <div
        className={`text-lg font-semibold ${
          highlight ? 'text-amber-800' : 'text-quasar-black'
        }`}
      >
        {value}
      </div>
    </div>
  )
}
