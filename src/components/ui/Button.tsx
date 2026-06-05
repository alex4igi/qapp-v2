import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
}

const variants: Record<Variant, string> = {
  primary:
    'bg-quasar-yellow text-quasar-black hover:bg-quasar-yellow-dark disabled:opacity-60',
  secondary:
    'border border-quasar-gray-light bg-white text-quasar-black hover:bg-quasar-gray-light disabled:opacity-60',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-60',
  ghost: 'text-quasar-gray hover:bg-quasar-gray-light hover:text-quasar-black',
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
        'inline-flex items-center justify-center rounded-md px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
      {...rest}
    />
  )
}
