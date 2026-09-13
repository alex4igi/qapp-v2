import type { SelectOption } from './Select'

// Stilul comun al pill-urilor de filtru/selecție (dashboard, leads, formulare).
export function pillClass(activ: boolean): string {
  return [
    'rounded-full border px-3 py-1.5 text-sm transition-colors',
    activ
      ? 'border-quasar-yellow bg-quasar-yellow font-medium text-quasar-black'
      : 'border-line text-quasar-gray hover:border-quasar-yellow',
  ].join(' ')
}

type Props = {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  /** Re-click pe opțiunea activă golește selecția (implicit da). */
  clearable?: boolean
  'aria-label'?: string
  id?: string
  className?: string
}

/** Selecție unică afișată ca pill-uri — alternativa la un dropdown cu 2-4 opțiuni. */
export function Pills({
  options,
  value,
  onChange,
  clearable = true,
  id,
  className,
  'aria-label': ariaLabel,
}: Props) {
  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      className={['flex flex-wrap items-center gap-1.5', className].filter(Boolean).join(' ')}
    >
      {options.map((o) => {
        const activ = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={activ}
            onClick={() => onChange(activ && clearable ? '' : o.value)}
            className={pillClass(activ)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
