import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>

export function TextArea({ className, rows = 3, ...rest }: Props) {
  return (
    <textarea
      rows={rows}
      className={cn(
        'w-full rounded-md border border-quasar-gray-light bg-white px-3 py-2 text-sm text-quasar-black outline-none transition-colors focus:border-quasar-yellow disabled:bg-quasar-gray-light',
        className,
      )}
      {...rest}
    />
  )
}
