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
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="text-sm font-medium text-quasar-gray">{label}</div>
      <div className={`mt-2 font-display text-3xl font-bold ${toneClass[tone]}`}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-xs text-quasar-gray">{hint}</div>}
    </div>
  )
}
