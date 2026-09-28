import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDate, formatRON } from '@/lib/format'
import { getCreditFamilie, type MiscareCredit } from '../api'

const TIP_LABEL: Record<MiscareCredit['tip'], string> = {
  acordat: 'Acordat',
  consumat: 'Folosit',
  anulat: 'Anulat',
  restituit: 'Întors',
}

// Creditul de recomandare al familiei: se folosește din „Plată nouă” pe orice membru.
// Nu apare nimic dacă familia n-a primit niciodată credit.
export function CreditRecomandareBanner({ familieId }: { familieId: string | null | undefined }) {
  const [istoric, setIstoric] = useState(false)
  const q = useQuery({
    queryKey: ['credit-familie', familieId],
    queryFn: () => getCreditFamilie(familieId!),
    enabled: Boolean(familieId),
  })
  if (!familieId || !q.data || q.data.miscari.length === 0) return null
  const { sold, miscari } = q.data

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
      <div className="flex flex-wrap items-center gap-2">
        <span>🎁</span>
        <span>
          Credit de recomandare al familiei: <strong>{formatRON(sold)}</strong>
          {sold > 0 && ' — se folosește din „Plată nouă”, pe orice membru al familiei.'}
        </span>
        <button
          type="button"
          className="ml-auto text-xs font-medium underline"
          onClick={() => setIstoric((v) => !v)}
        >
          {istoric ? 'Ascunde istoricul' : 'Istoric'}
        </button>
      </div>
      {istoric && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {miscari.map((m) => (
            <li key={m.id} className="flex gap-3">
              <span className="w-20 text-amber-800">{formatDate(m.created)}</span>
              <span className="w-16">{TIP_LABEL[m.tip]}</span>
              <span className="w-20 text-right font-medium">
                {Number(m.suma) > 0 ? '+' : ''}
                {formatRON(Number(m.suma))}
              </span>
              <span className="text-amber-800">{m.motiv}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
