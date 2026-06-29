import { useEffect, type ReactNode } from 'react'
import { Button } from './Button'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl'
  minHeight?: string
}

const SIZE_CLASS: Record<NonNullable<Props['size']>, string> = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({ open, title, onClose, children, footer, size = 'md', minHeight }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <div
        className={`max-h-[90vh] w-full ${SIZE_CLASS[size]} overflow-y-auto rounded-2xl bg-card shadow-2xl`}
        style={minHeight ? { minHeight } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-xl font-bold text-ink">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Închide">
            ✕
          </Button>
        </div>
        <div className="p-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
