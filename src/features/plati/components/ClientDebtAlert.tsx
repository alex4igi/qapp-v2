import { useQuery } from '@tanstack/react-query'
import { formatRON } from '@/lib/format'
import { sezonActivId } from '@/lib/lookups'
import { getClientRestante } from '../api/datorii'

type Props = {
  clientId: string | null | undefined
}

// Avertisment warn-only la înrolare: clientul are restanțe ne-prescrise (abonamente +
// one-off). Evidențiază separat datoria din sezoanele anterioare — concern-ul la
// pornirea unui sezon nou (nu vrem re-înrolări peste restanțe vechi). Nu blochează submit.
export function ClientDebtAlert({ clientId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['client-restante', clientId],
    queryFn: () => getClientRestante(clientId ?? ''),
    enabled: Boolean(clientId),
    staleTime: 30_000,
  })
  const { data: sezonActiv } = useQuery({
    queryKey: ['sezon-activ-id'],
    queryFn: () => sezonActivId(),
    staleTime: 60_000,
  })

  if (!clientId || isLoading || !data || data.length === 0) return null

  const total = data.reduce((sum, r) => sum + Number(r.rest), 0)
  if (total <= 0) return null

  // Restul din alte sezoane decât cel activ = datorie „veche", agregată pe sezon.
  const anterioare = new Map<string, number>()
  for (const r of data) {
    if (r.sezon_id && r.sezon_id === sezonActiv) continue
    const nume = r.sezon_nume ?? 'fără sezon'
    anterioare.set(nume, (anterioare.get(nume) ?? 0) + Number(r.rest))
  }

  return (
    <div className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
      <p>
        ⚠️ Client cu restanțe: <strong>{formatRON(total)}</strong>
      </p>
      {[...anterioare.entries()].map(([nume, suma]) => (
        <p key={nume} className="text-xs">
          din care sezon anterior ({nume}): <strong>{formatRON(suma)}</strong>
        </p>
      ))}
    </div>
  )
}
