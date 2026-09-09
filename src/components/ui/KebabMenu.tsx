import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { useIsMobile } from '@/hooks/useIsMobile'

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
  const isMobile = useIsMobile()
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
    // Pe telefon meniul e o foaie peste tot ecranul, cu fundal propriu — un
    // listener global l-ar închide chiar la tapul care îl deschide.
    if (!isMobile) document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', key)
    }
  }, [open, isMobile])

  if (items.length === 0) return null

  const trigger = (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-lg leading-none text-muted-2 transition-colors hover:bg-surface hover:text-ink max-md:h-10 max-md:w-10"
    >
      ⋮
    </button>
  )

  // Varianta de telefon: foaie ancorată jos. Meniul ancorat `absolute` s-ar tăia
  // în containerul cu scroll al shell-ului mobil.
  if (isMobile) {
    return (
      <div ref={rootRef} className="relative">
        {trigger}
        {open && (
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
            onPointerDown={() => setOpen(false)}
          >
            <div
              role="menu"
              className="max-h-[80dvh] overflow-y-auto overscroll-contain rounded-t-2xl bg-card pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {ariaLabel}
              </div>
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
                    'flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm transition-colors active:bg-surface',
                    item.separatorBefore && 'border-t border-line',
                    item.danger ? 'text-red-600' : 'text-ink',
                  )}
                >
                  {item.icon && <span aria-hidden>{item.icon}</span>}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      {trigger}

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
