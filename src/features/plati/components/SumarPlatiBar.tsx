import { formatRON } from '@/lib/format'
import { metodaTone } from '@/lib/metodaPlata'
import type { SumarPlati } from '../api'

const ORDINE_METODE = ['Cash', 'Card', 'Transfer', 'Revolut', 'Online', 'Nespecificat']

export function SumarPlatiBar({ sumar, loading }: { sumar?: SumarPlati; loading: boolean }) {
  const metode = Object.entries(sumar?.pe_metoda ?? {})
    .filter(([, v]) => Math.abs(v) > 0.004)
    .sort(([a], [b]) => ORDINE_METODE.indexOf(a) - ORDINE_METODE.indexOf(b))

  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-opacity ${
        loading ? 'opacity-60' : ''
      }`}
    >
      <div>
        <p className="text-xs uppercase tracking-wide text-quasar-gray">Total încasat</p>
        <p className="font-display text-xl font-bold text-ink">
          {sumar ? formatRON(sumar.total) : '—'}
        </p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-quasar-gray">Plăți</p>
        <p className="font-display text-xl font-bold text-ink">{sumar?.numar ?? '—'}</p>
      </div>
      {metode.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {metode.map(([metoda, suma]) => (
            <span
              key={metoda}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${metodaTone(metoda)}`}
            >
              {metoda} · {formatRON(suma)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
