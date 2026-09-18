import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  content: ReactNode
  children: ReactNode
  /** Lățimea panoului, px. */
  width?: number
  /** Clase pe wrapper-ul din jurul trigger-ului (implicit `inline-flex`). */
  className?: string
}

const MARGIN = 10

// Tooltip randat în portal, cu poziție `fixed`. Un panou absolut ar fi tăiat de
// primul strămoș cu overflow — iar kanbanul de leads chiar are unul
// (`overflow-x-auto` pe rândul de coloane), deci ar fi fost ascuns exact pe
// cardurile de la baza coloanei.
//
// Se deschide la hover ȘI la focus din tastatură; se închide la pointerdown, ca
// să nu rămână agățat în timpul unui drag & drop.
export function Tooltip({ content, children, width = 300, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const open = useCallback(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const spatiuDreapta = window.innerWidth - r.right
    const left =
      spatiuDreapta >= width + MARGIN * 2
        ? r.right + MARGIN
        : Math.max(MARGIN, r.left - width - MARGIN)
    // Estimare de înălțime: panoul e clamp-at oricum prin maxHeight, iar
    // valoarea exactă n-o știm înainte de randare.
    const top = Math.min(
      Math.max(MARGIN, r.top),
      Math.max(MARGIN, window.innerHeight - 220),
    )
    setPos({ top, left })
  }, [width])

  const close = useCallback(() => setPos(null), [])

  // Scroll/resize invalidează poziția calculată; e mai onest s-o închidem decât
  // s-o lăsăm lipită lângă alt card.
  useEffect(() => {
    if (!pos) return
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [pos, close])

  return (
    <span
      ref={ref}
      className={className ?? 'inline-flex'}
      onMouseEnter={open}
      onMouseLeave={close}
      onPointerDown={close}
      onFocus={open}
      onBlur={close}
    >
      {children}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            style={{ top: pos.top, left: pos.left, width, maxHeight: '70vh' }}
            className="pointer-events-none fixed z-[60] overflow-hidden rounded-xl bg-quasar-black px-3.5 py-3 text-xs leading-relaxed text-white shadow-2xl"
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  )
}
