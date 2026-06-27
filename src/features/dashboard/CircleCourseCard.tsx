import { Link } from 'react-router-dom'

type Props = {
  cursId: string
  numele: string
  ora: string | null
  sala: string | null
  teacher: string | null
  prezenti: number
  enrolled: number
  to: string
}

// Bară de prezență: verde (bun), galben (parțial), roșu (slab / fără prezenți).
function barColor(prezenti: number, enrolled: number): string {
  if (enrolled === 0 || prezenti === 0) return 'var(--color-danger)'
  const pct = prezenti / enrolled
  if (pct < 0.5) return 'var(--color-danger)'
  if (pct < 0.8) return 'var(--color-warn)'
  return 'var(--color-success)'
}

export function CircleCourseCard({
  cursId: _cursId,
  numele,
  ora,
  sala,
  teacher,
  prezenti,
  enrolled,
  to,
}: Props) {
  const pct = enrolled > 0 ? Math.min(100, Math.round((prezenti / enrolled) * 100)) : 0
  const meta = [sala, teacher].filter(Boolean).join(' · ') || '—'
  return (
    <Link
      to={to}
      className="gcard flex flex-col rounded-[14px] border border-line bg-card p-[18px]"
    >
      <div className="flex items-center justify-between">
        <span className="fnum font-display text-[15px] font-bold text-ink">
          {ora ?? '—'}
        </span>
      </div>
      <div className="mt-3 font-display text-[15.5px] font-semibold tracking-tight text-ink">
        {numele}
      </div>
      <div className="mt-0.5 text-[12.5px] text-muted">{meta}</div>
      <div className="mt-4 flex items-baseline justify-between">
        <div className="flex items-baseline gap-1">
          <span className="fnum font-display text-[22px] font-bold text-ink">
            {prezenti}
          </span>
          <span className="text-[13px] text-muted">/ {enrolled} prezenți</span>
        </div>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-line-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: barColor(prezenti, enrolled) }}
        />
      </div>
    </Link>
  )
}
