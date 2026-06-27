import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Props = InputHTMLAttributes<HTMLInputElement>

export function TextInput({ className, ...rest }: Props) {
  return (
    <input
      className={cn(
        'w-full rounded-[10px] border border-line bg-card px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-quasar-yellow focus:ring-2 focus:ring-quasar-yellow/30 disabled:bg-surface',
        className,
      )}
      {...rest}
    />
  )
}
