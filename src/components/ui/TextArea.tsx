import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>

export function TextArea({ className, rows = 3, ...rest }: Props) {
  return (
    <textarea
      rows={rows}
      className={cn(
        'w-full rounded-[10px] border border-line bg-card px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-quasar-yellow focus:ring-2 focus:ring-quasar-yellow/30 disabled:bg-surface',
        className,
      )}
      {...rest}
    />
  )
}
