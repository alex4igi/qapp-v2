import type { ReactNode } from 'react'

type Props = {
  label: string
  value: ReactNode
  tone?: 'default' | 'positive' | 'negative' | 'warning'
  hint?: string
}

const toneClass: Record<NonNullable<Props['tone']>, string> = {
  default: 'text-ink',
  positive: 'text-success',
  negative: 'text-danger',
  warning: 'text-warn',
}

export function KpiCard({ label, value, tone = 'default', hint }: Props) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 transition-shadow hover:shadow-md">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div
        className={`fnum mt-2.5 font-display text-3xl font-bold tracking-tight ${toneClass[tone]}`}
      >
        {value}
      </div>
      {hint && <div className="mt-1.5 text-xs text-muted-2">{hint}</div>}
    </div>
  )
}
