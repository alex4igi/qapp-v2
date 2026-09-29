import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { Lead } from '@/types/db'
import { getClientExistent } from './api'

type LeadRef = Pick<Lead, 'deja_client' | 'id_client'> | null | undefined

export function useClientExistent(lead: LeadRef) {
  return useQuery({
    queryKey: ['client-existent', lead?.id_client],
    queryFn: () => getClientExistent(lead!.id_client!),
    enabled: Boolean(lead?.deja_client && lead?.id_client),
    staleTime: 60_000,
  })
}

/** Mutarea unui „deja client" încă înscris într-o coloană de vânzare cere bifa
 *  din banner. La foști clienți (EXclient) revenirea în pipeline e legitimă. */
export function ceraConfirmareClient(
  lead: LeadRef,
  q: ReturnType<typeof useClientExistent>,
): 'da' | 'nu' | 'se_verifica' {
  if (!lead?.deja_client) return 'nu'
  if (!lead.id_client) return 'da'
  if (q.isLoading) return 'se_verifica'
  return q.data?.inscris === false ? 'nu' : 'da'
}

type Props = {
  lead: LeadRef
  /** Doar la mutarea în Programat / Waiting list. */
  confirmare?: { checked: boolean; onChange: (v: boolean) => void }
}

// Incident 2026-09-29: lead Meta la o clientă activă, marcat corect „deja client",
// mutat în Waiting list și sunat 17 zile mai târziu ca lead rece. Insigna de pe
// card nu se vede la telefon — fișa și modalele de contact trebuie s-o spună.
export function DejaClientBanner({ lead, confirmare }: Props) {
  const q = useClientExistent(lead)
  if (!lead?.deja_client) return null

  const info = q.data
  const inscris = info ? info.inscris : true
  const titlu = info
    ? `${inscris ? 'E deja client' : 'Fost client'}: ${info.nume || '—'}${info.status ? ` · ${info.status}` : ''}`
    : 'E deja client'
  const ceaCere = ceraConfirmareClient(lead, q) === 'da'

  return (
    <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-quasar-black">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">⭐ {titlu}</span>
        {lead.id_client && (
          <Link
            to={`/clienti/${lead.id_client}`}
            className="text-xs font-semibold text-amber-800 underline underline-offset-2"
          >
            Deschide fișa clientului →
          </Link>
        )}
      </div>
      {info && info.cursuri.length > 0 && (
        <p className="mt-1 text-xs text-amber-900">Înscris la: {info.cursuri.join(', ')}</p>
      )}
      <p className="mt-1 text-xs text-amber-900">
        {inscris
          ? 'Nu-l suna ca pe un lead nou — de obicei vrea un al doilea curs (−10%) sau are o întrebare. Rezolvă din fișa clientului.'
          : 'A mai fost la noi. Poate reveni, dar vorbește cu el ca un client care se întoarce, nu ca un lead nou.'}
      </p>
      {confirmare && ceaCere && (
        <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs font-medium">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={confirmare.checked}
            onChange={(e) => confirmare.onChange(e.target.checked)}
          />
          <span>Am vorbit cu clientul: vrea ceva nou, nu e o dublură a înscrierii lui.</span>
        </label>
      )}
    </div>
  )
}
