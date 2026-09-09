import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
}

const variants: Record<Variant, string> = {
  primary:
    'bg-quasar-yellow text-ink hover:bg-quasar-yellow-dark disabled:opacity-60',
  secondary:
    'border border-line bg-card text-ink hover:bg-surface disabled:opacity-60',
  danger: 'bg-danger text-white hover:brightness-95 disabled:opacity-60',
  ghost: 'text-muted-2 hover:bg-surface hover:text-ink',
}

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-[10px] px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed max-md:min-h-10',
        variants[variant],
        className,
      )}
      {...rest}
    />
  )
}
