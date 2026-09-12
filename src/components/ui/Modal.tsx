import { useEffect, useRef, type ReactNode } from 'react'
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
  const overlayRef = useRef<HTMLDivElement>(null)

  // Escape închide DOAR modalul din vârf. Fiecare instanță ascultă pe window,
  // deci pe modale stivuite (conversia leadului peste fișa leadului) un singur
  // Escape le închidea pe toate — inclusiv peste confirmările de ieșire.
  // Ordinea din DOM = ordinea de stivuire (toate au z-50), deci ultimul overlay
  // e cel de deasupra; o citim la apăsare, nu la montare.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const overlays = document.querySelectorAll('[data-modal-overlay]')
      if (overlays[overlays.length - 1] !== overlayRef.current) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    // `pointerdown`, nu `mousedown`: pe touch al doilea nu se emite decât ca
    // eveniment de compatibilitate, deci tapul pe fundal nu închidea modalul.
    <div
      ref={overlayRef}
      data-modal-overlay=""
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 max-md:items-end max-md:p-0"
      onPointerDown={onClose}
    >
      <div
        className={`max-h-[90vh] w-full ${SIZE_CLASS[size]} overflow-y-auto rounded-2xl bg-card shadow-2xl max-md:max-h-[92dvh] max-md:max-w-none max-md:overscroll-contain max-md:rounded-b-none`}
        style={minHeight ? { minHeight } : undefined}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card px-5 py-3.5 max-md:px-4">
          <h2 className="text-xl font-bold text-ink">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Închide">
            ✕
          </Button>
        </div>
        <div className="p-5 max-md:p-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5 max-md:pb-[calc(0.875rem+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
