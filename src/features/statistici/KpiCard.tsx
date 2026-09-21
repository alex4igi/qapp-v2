import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Tooltip } from '@/components/ui'

type Props = {
  label: string
  value: ReactNode
  tone?: 'default' | 'positive' | 'negative' | 'warning'
  hint?: ReactNode
  /** „Cum se calculează" — iconiță „i" lângă etichetă, conținut la hover/focus. */
  info?: ReactNode
  /** Face cardul clickabil (rând acționabil care duce către lista completă). */
  to?: string
}

const toneClass: Record<NonNullable<Props['tone']>, string> = {
  default: 'text-ink',
  positive: 'text-success',
  negative: 'text-danger',
  warning: 'text-warn',
}

export function KpiCard({ label, value, tone = 'default', hint, info, to }: Props) {
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </span>
        {info && (
          <Tooltip content={info} width={300}>
            <span
              role="button"
              tabIndex={0}
              aria-label="Cum se calculează"
              className="flex h-4 w-4 items-center justify-center rounded-full border border-muted text-[10px] font-bold leading-none text-muted transition-colors hover:border-ink hover:text-ink focus:border-ink focus:text-ink focus:outline-none"
            >
              i
            </span>
          </Tooltip>
        )}
      </div>
      <div
        className={`fnum mt-2.5 font-display text-3xl font-bold tracking-tight ${toneClass[tone]}`}
      >
        {value}
      </div>
      {hint && <div className="mt-1.5 text-xs text-muted-2">{hint}</div>}
    </>
  )

  const clase =
    'block rounded-2xl border border-line bg-card p-5 transition-shadow hover:shadow-md'

  return to ? (
    <Link to={to} className={clase}>
      {body}
    </Link>
  ) : (
    <div className={clase}>{body}</div>
  )
}
