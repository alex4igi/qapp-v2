import { useState } from 'react'
import { humanizeError } from '@/lib/errorMessage'
import { formatTime } from '@/lib/format'
import { usePontaj } from '@/features/pontaj/usePontaj'

function durata(minute: number | null): string {
  if (minute == null) return ''
  const h = Math.floor(minute / 60)
  const m = minute % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

/**
 * Un singur buton de pontaj, care comută. Înainte existau două acțiuni („Ieșire"
 * și „Încheie tura") care făceau exact același lucru — ambele derivate din auth.
 * Acum pontarea e o declarație explicită, separată de sign-out.
 */
export function RailPontaj({ collapsed }: { collapsed: boolean }) {
  const { inTura, tura, minuteScurse, loading, inLucru, intraInTura, iesDinTura } =
    usePontaj()
  const [eroare, setEroare] = useState<string | null>(null)

  if (loading) return null

  const comuta = async () => {
    setEroare(null)
    try {
      if (inTura) await iesDinTura()
      else await intraInTura()
    } catch (e) {
      setEroare(humanizeError(e))
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => void comuta()}
        disabled={inLucru}
        title={inTura ? `În tură de la ${formatTime(tura?.start_at)}` : 'Intru în tură'}
        aria-label={inTura ? 'Închei tura' : 'Intru în tură'}
        className={[
          'mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg text-base transition-colors',
          inTura
            ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
            : 'bg-rail-2 text-rail-muted hover:text-white',
          inLucru ? 'opacity-50' : '',
        ].join(' ')}
      >
        <span aria-hidden>{inTura ? '🟢' : '▶'}</span>
      </button>
    )
  }

  return (
    <div className="mb-2 px-1">
      <button
        type="button"
        onClick={() => void comuta()}
        disabled={inLucru}
        className={[
          'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
          inTura
            ? 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
            : 'bg-rail-2 text-rail-muted hover:text-white',
          inLucru ? 'opacity-50' : '',
        ].join(' ')}
      >
        {inTura ? (
          <>
            <span className="min-w-0">
              <span className="block font-medium text-emerald-200">Închei tura</span>
              <span className="block truncate text-xs text-emerald-300/70">
                de la {formatTime(tura?.start_at)} · {durata(minuteScurse)}
              </span>
            </span>
            <span aria-hidden className="shrink-0">
              🟢
            </span>
          </>
        ) : (
          <>
            <span className="font-medium">Intru în tură</span>
            <span aria-hidden className="shrink-0">
              ▶
            </span>
          </>
        )}
      </button>
      {eroare && <p className="mt-1 px-1 text-xs text-red-300">{eroare}</p>}
    </div>
  )
}
