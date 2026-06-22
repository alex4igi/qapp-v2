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
        'h-[38px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-quasar-black outline-none transition-colors focus:border-quasar-yellow focus:ring-2 focus:ring-quasar-yellow/40 disabled:bg-quasar-gray-light',
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
