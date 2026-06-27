import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode
}

export function Checkbox({ label, className, id, ...rest }: Props) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 text-sm text-ink"
    >
      <input
        id={id}
        type="checkbox"
        className={cn(
          'h-4 w-4 rounded border-line accent-quasar-yellow',
          className,
        )}
        {...rest}
      />
      {label}
    </label>
  )
}
