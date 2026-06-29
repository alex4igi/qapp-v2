import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export type MenuItem = {
  label: string
  icon?: string
  title?: string
  onClick: () => void
  danger?: boolean
  separatorBefore?: boolean
}

type Props = {
  items: MenuItem[]
  align?: 'left' | 'right'
  ariaLabel?: string
}

export function KebabMenu({ items, align = 'right', ariaLabel = 'Acțiuni' }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  if (items.length === 0) return null

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-lg leading-none text-muted-2 transition-colors hover:bg-surface hover:text-ink"
      >
        ⋮
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-20 mt-1 min-w-44 overflow-hidden rounded-lg border border-line bg-card py-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              title={item.title}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                item.separatorBefore && 'border-t border-line',
                item.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-ink hover:bg-surface',
              )}
            >
              {item.icon && <span aria-hidden>{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
