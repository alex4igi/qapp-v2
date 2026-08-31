import { useQuery } from '@tanstack/react-query'
import type { Enums } from '@/types/db'
import { getClientEligibilityContext } from './api'

type Props = {
  clientId: string | null | undefined
  tipPlata: Enums<'tip_plata'>
  isFacultativ: boolean
}

// Sugestii proactive pentru front-desk la crearea unei înrolări:
// politicile automate care se vor aplica (cross-sell / family).
export function EligibilityAlerts({ clientId, tipPlata, isFacultativ }: Props) {
  // Politica −10% se aplică DOAR pe înrolări recurente lunare. La `Per an` sau
  // facultativ noua înrolare nu primește discount, deci nu promitem nimic.
  const policyApplies = tipPlata === 'Per luna' && !isFacultativ

  const { data, isLoading } = useQuery({
    queryKey: ['client-eligibility', clientId],
    queryFn: () => getClientEligibilityContext(clientId ?? ''),
    enabled: Boolean(clientId) && policyApplies,
    staleTime: 30_000,
  })

  if (!clientId || !policyApplies || isLoading || !data) return null

  const alerts: { key: string; text: string }[] = []

  if (data.altCursActivRecurent.length > 0) {
    const cursuri = data.altCursActivRecurent
      .map((c) => c.cursulNume)
      .join(', ')
    alerts.push({
      key: 'cross',
      text: `Clientul are deja înrolare recurentă pe: ${cursuri}. Politica cross-sell se aplică automat — cel mai scump abonament rămâne la preț integral, restul primesc −10%.`,
    })
  }
  if (data.fratiActivi.length > 0) {
    const frati = data.fratiActivi
      .map((f) => `${f.nume} ${f.prenume ?? ''}`.trim())
      .join(', ')
    alerts.push({
      key: 'family',
      text: `Frați activi în aceeași familie: ${frati}. Politica family se aplică automat — în pool-ul familiei cel mai scump abonament rămâne integral, restul primesc −10%. Reducerile nu se cumulează: pe preț de reînscriere se aplică doar varianta cea mai avantajoasă.`,
    })
  }

  if (alerts.length === 0) return null

  return (
    <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {alerts.map((a) => (
        <p key={a.key}>💡 {a.text}</p>
      ))}
    </div>
  )
}
