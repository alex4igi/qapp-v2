import { cn } from '@/lib/cn'

export type ChipOption<V extends string> = {
  value: V
  label: string
  count?: number
}

type Props<V extends string> = {
  options: ChipOption<V>[]
  value: V
  onChange: (v: V) => void
  ariaLabel: string
}

export function FilterChips<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: Props<V>) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const activ = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={activ}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              activ
                ? 'border-ink bg-ink text-white'
                : 'border-line bg-card text-muted-2 hover:border-ink/30 hover:text-ink',
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cn('ml-1.5 fnum', activ ? 'text-white/70' : 'text-muted')}>
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Bara „câți sunt înăuntru / câți lipsesc", cu proporția la scară. */
export function SplitBar({
  in: inN,
  out: outN,
  inLabel,
  outLabel,
}: {
  in: number
  out: number
  inLabel: string
  outLabel: string
}) {
  const total = inN + outN
  if (total === 0) return null
  return (
    <div className="flex h-9 overflow-hidden rounded-lg border border-line">
      {inN > 0 && (
        <span
          className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap bg-success-bg px-3 text-xs font-semibold text-success"
          style={{ flex: `${inN} 1 0` }}
        >
          <b className="fnum text-sm">{inN}</b> {inLabel}
        </span>
      )}
      {outN > 0 && (
        <span
          className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap bg-warn-bg px-3 text-xs font-semibold text-warn"
          style={{ flex: `${outN} 1 0` }}
        >
          <b className="fnum text-sm">{outN}</b> {outLabel}
        </span>
      )}
    </div>
  )
}
