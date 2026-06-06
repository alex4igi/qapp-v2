import { useQuery } from '@tanstack/react-query'
import { getVacanteForData } from '@/lib/vacante'

type Props = {
  // YYYY-MM-DD sau datetime-local (YYYY-MM-DDTHH:mm) — luăm doar partea de dată.
  data: string | null | undefined
}

// Avertisment NON-BLOCANT: data aleasă cade într-o vacanță. În unele vacanțe se
// țin cursuri, în altele nu — recepția confirmă, de asta doar notificăm.
export function VacantaWarning({ data }: Props) {
  const dateOnly = data ? data.slice(0, 10) : ''
  const { data: vacante } = useQuery({
    queryKey: ['vacanta-pentru-data', dateOnly],
    queryFn: () => getVacanteForData(dateOnly),
    enabled: dateOnly.length === 10,
    staleTime: 60_000,
  })

  if (!vacante || vacante.length === 0) return null
  const nume = vacante.map((v) => v.nume).join(', ')

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      ⚠️ Data aleasă e în <strong>{nume}</strong>. În unele vacanțe se țin cursuri, în altele
      nu — confirmă cu recepția dacă se țin cursuri în această perioadă.
    </div>
  )
}
