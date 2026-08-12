import { useState } from 'react'
import { cn } from '@/lib/cn'
import { SCALE_LEFT, SCALE_RIGHT } from './skills'
import { STELE_MAX, TREPTE_PE_STEA, toStele, toTrepte, formatStele } from './scale'

type Props = {
  label?: string
  /** Trepte 1–10 (valoarea din DB), nu stele. */
  value: number | null
  onChange: (trepte: number) => void
  disabled?: boolean
  compact?: boolean
}

/**
 * 5 stele cu jumătăți. Jumătatea stângă a unei stele dă x−0,5; dreapta dă x.
 *
 * Hover-ul e ținut în trepte, nu în stele, ca preview-ul să poată arăta jumătatea
 * fără să treacă prin virgulă mobilă.
 */
export function Stele({ value, onChange, disabled, compact }: Omit<Props, 'label'>) {
  const [hover, setHover] = useState<number | null>(null)
  const activ = hover ?? value ?? 0
  const dim = compact ? 'h-5 w-5' : 'h-7 w-7'

  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => setHover(null)}
      role="slider"
      aria-valuemin={0.5}
      aria-valuemax={STELE_MAX}
      aria-valuenow={toStele(value) ?? undefined}
      aria-valuetext={`${formatStele(value)} din ${STELE_MAX}`}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return
        const curent = value ?? 0
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault()
          onChange(Math.min(STELE_MAX * TREPTE_PE_STEA, curent + 1))
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault()
          onChange(Math.max(1, curent - 1))
        }
      }}
    >
      {Array.from({ length: STELE_MAX }, (_, i) => {
        const stea = i + 1
        const trepteIntreaga = toTrepte(stea)
        const trepteJumatate = trepteIntreaga - 1
        const umplere =
          activ >= trepteIntreaga ? 'plina' : activ >= trepteJumatate ? 'jumatate' : 'goala'

        return (
          <span key={stea} className={cn('relative inline-block', dim)}>
            <Stea umplere={umplere} className={dim} />
            {!disabled && (
              <>
                <button
                  type="button"
                  aria-label={`${stea - 0.5} stele`}
                  onMouseEnter={() => setHover(trepteJumatate)}
                  onClick={() => onChange(trepteJumatate)}
                  className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
                />
                <button
                  type="button"
                  aria-label={`${stea} stele`}
                  onMouseEnter={() => setHover(trepteIntreaga)}
                  onClick={() => onChange(trepteIntreaga)}
                  className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
                />
              </>
            )}
          </span>
        )
      })}
      <span className="ml-1.5 w-8 text-xs font-medium tabular-nums text-muted">
        {formatStele(hover ?? value)}
      </span>
    </div>
  )
}

/**
 * Steaua în sine. Jumătatea se face tăind o copie plină cu overflow-hidden pe 50%
 * lățime — nu cu clip-path pe SVG, care se comportă inconsecvent între browsere.
 */
function Stea({
  umplere,
  className,
}: {
  umplere: 'plina' | 'jumatate' | 'goala'
  className?: string
}) {
  return (
    <span className={cn('relative block', className)}>
      <StearGlif className={cn(className, 'fill-line')} />
      {umplere !== 'goala' && (
        <span
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: umplere === 'jumatate' ? '50%' : '100%' }}
        >
          <StearGlif className={cn(className, 'fill-quasar-yellow')} />
        </span>
      )}
    </span>
  )
}

function StearGlif({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('block', className)} aria-hidden="true">
      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.4 6.2 20.4l1.1-6.4L2.6 9.4l6.5-.9z" />
    </svg>
  )
}

/** Rândul complet dintr-un formular: eticheta abilității + stelele. */
export function SkillRating({ label, value, onChange, disabled }: Props) {
  return (
    <div className="rounded-md border border-line bg-card px-4 py-3">
      {label && <p className="mb-2 text-sm font-medium text-ink">{label}</p>}
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="w-28 shrink-0 text-right">{SCALE_LEFT}</span>
        <Stele value={value} onChange={onChange} disabled={disabled} />
        <span className="w-28 shrink-0">{SCALE_RIGHT}</span>
      </div>
    </div>
  )
}
