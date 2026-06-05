import type { ReactNode } from 'react'

type Props = {
  label: string
  value: ReactNode
  tone?: 'default' | 'positive' | 'negative' | 'warning'
  hint?: string
}

const toneClass: Record<NonNullable<Props['tone']>, string> = {
  default: 'text-quasar-black',
  positive: 'text-green-700',
  negative: 'text-red-600',
  warning: 'text-amber-600',
}

export function KpiCard({ label, value, tone = 'default', hint }: Props) {
  return (
    <div className="rounded-lg border border-quasar-gray-light bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-quasar-gray">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${toneClass[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-quasar-gray">{hint}</div>}
    </div>
  )
}
