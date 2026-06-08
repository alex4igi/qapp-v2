import { useQuery } from '@tanstack/react-query'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { sezonActivId, teacheriOptions } from '@/lib/lookups'
import { teacheriOptionsFiltrate } from '@/features/teacheri/api'

// Sursă unică pentru selectoarele de teacher operaționale: doar teacherii care
// predau cursuri în sezonul activ (+ locația de lucru). Teacherii n-au legătură
// directă cu sezonul/locația — o moștenesc prin cursuri (titular legacy + M:N).
// Fără sezon activ → cade pe „toți" ca să nu golim dropdown-ul.
// NU folosi pentru selectoarele de ATRIBUIRE (CursForm titular, leagă cont,
// organizator eveniment) — acolo e nevoie de roster-ul complet.
// locatieId: omis → locația globală din header; prezent (gol/null) → acel filtru.
export function useTeacheriOptions(opts?: {
  enabled?: boolean
  locatieId?: string | null
}) {
  const working = useWorkingLocatie()
  const locatieId =
    opts && 'locatieId' in opts ? opts.locatieId || null : working.locatieId

  const sezonQ = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
  })
  const sezonId = sezonQ.data ?? null

  return useQuery({
    queryKey: ['lookup', 'teacheri', locatieId ?? 'all', sezonId],
    queryFn: () =>
      sezonId ? teacheriOptionsFiltrate(locatieId, sezonId) : teacheriOptions(),
    enabled: (opts?.enabled ?? true) && sezonQ.isSuccess,
  })
}
