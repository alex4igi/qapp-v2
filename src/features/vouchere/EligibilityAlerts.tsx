import { useQuery } from '@tanstack/react-query'
import { getClientEligibilityContext } from './api'

type Props = {
  clientId: string | null | undefined
}

// Sugestii proactive pentru front-desk la crearea unei înrolări:
// politicile automate care se vor aplica (cross-sell / family).
export function EligibilityAlerts({ clientId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['client-eligibility', clientId],
    queryFn: () => getClientEligibilityContext(clientId ?? ''),
    enabled: Boolean(clientId),
    staleTime: 30_000,
  })

  if (!clientId || isLoading || !data) return null

  const alerts: { key: string; text: string }[] = []

  if (data.altCursActivRecurent.length > 0) {
    const cursuri = data.altCursActivRecurent
      .map((c) => c.cursulNume)
      .join(', ')
    alerts.push({
      key: 'cross',
      text: `Clientul are deja înrolare recurentă pe: ${cursuri}. Politica cross-sell se aplică automat — cel mai ieftin curs primește −10%.`,
    })
  }
  if (data.fratiActivi.length > 0) {
    const frati = data.fratiActivi
      .map((f) => `${f.nume} ${f.prenume ?? ''}`.trim())
      .join(', ')
    alerts.push({
      key: 'family',
      text: `Frați activi în aceeași familie: ${frati}. Politica family se aplică automat — cel mai ieftin enrollment al familiei primește −10%.`,
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
