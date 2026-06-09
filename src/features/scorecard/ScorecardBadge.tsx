import type { Clasa } from './constants'
import { CLASA_LABEL } from './constants'

const CLS: Record<'sub' | 'standard' | 'peste', string> = {
  sub: 'bg-red-50 text-red-700 border-red-200',
  standard: 'bg-amber-50 text-amber-700 border-amber-200',
  peste: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const ICON: Record<'sub' | 'standard' | 'peste', string> = {
  sub: '📉',
  standard: '👌',
  peste: '🚀',
}

const base =
  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border'

// Valoare + badge de clasă. Fără date → „—" discret.
export function ScorecardBadge({
  clasa,
  value,
}: {
  clasa: Clasa
  value?: string | null
}) {
  if (!clasa) {
    return <span className="text-quasar-gray">{value ?? '—'}</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {value != null && <span className="text-quasar-black">{value}</span>}
      <span className={`${base} ${CLS[clasa]}`} title={CLASA_LABEL[clasa]}>
        {ICON[clasa]}
      </span>
    </span>
  )
}
