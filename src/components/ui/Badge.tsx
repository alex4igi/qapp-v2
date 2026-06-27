import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'success' | 'danger' | 'warn' | 'neutral' | 'brand'

type Props = {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}

// Badge-pilulă Quasar OS — perechi fg/bg pe tonuri (vezi tokens în index.css).
const TONES: Record<BadgeTone, string> = {
  success: 'bg-success-bg text-success',
  danger: 'bg-danger-bg text-danger',
  warn: 'bg-warn-bg text-warn',
  neutral: 'bg-neutral-bg text-neutral',
  brand: 'bg-quasar-yellow text-ink',
}

export function Badge({ tone = 'neutral', children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
