import type { SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type SelectOption = {
  label: string
  value: string
  // Sub-text afișat de Combobox (ignorat de Select). Util pentru a diferenția
  // opțiuni cu același label (ex: 2 familii cu același nume).
  secondary?: string
}

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  options: SelectOption[]
  placeholder?: string
}

export function Select({ options, placeholder, className, ...rest }: Props) {
  return (
    <select
      className={cn(
        // h-[38px] = aceeași înălțime ca TextInput (select-ul nativ ignoră line-height, deci o fixăm)
        'h-[38px] w-full rounded-[10px] border border-line bg-card px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-quasar-yellow focus:ring-2 focus:ring-quasar-yellow/30 disabled:bg-surface',
        className,
      )}
      {...rest}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
