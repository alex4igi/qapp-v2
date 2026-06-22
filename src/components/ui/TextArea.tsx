import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>

export function TextArea({ className, rows = 3, ...rest }: Props) {
  return (
    <textarea
      rows={rows}
      className={cn(
        'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-quasar-black outline-none transition-colors focus:border-quasar-yellow focus:ring-2 focus:ring-quasar-yellow/40 disabled:bg-quasar-gray-light',
        className,
      )}
      {...rest}
    />
  )
}
