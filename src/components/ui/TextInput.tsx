import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Props = InputHTMLAttributes<HTMLInputElement>

export function TextInput({ className, ...rest }: Props) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-quasar-black outline-none transition-colors focus:border-quasar-yellow focus:ring-2 focus:ring-quasar-yellow/40 disabled:bg-quasar-gray-light',
        className,
      )}
      {...rest}
    />
  )
}
