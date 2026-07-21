import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { isTeacher } from '@/lib/rolesMatrix'
import {
  cursuriOptions,
  cursuriOptionsForCurrentTeacher,
  sezonActivId,
} from '@/lib/lookups'

// Sursă unică pentru selectoarele de curs din toată aplicația:
// - teacher → doar cursurile lui, din sezonul cerut (fără filtru de sezon lista
//   acumulează clonele din toate sezoanele — reînscrieri);
// - restul → cursurile sezonului, filtrate după locație.
// Fără sezon activ, cade înapoi pe „toate" (sezonId=null) ca să nu golim dropdown-ul.
// locatieId: omis → locația globală din header; prezent (string gol/null) → acel filtru
// (gol/null = toate locațiile) — pentru paginile cu selector propriu de locație.
// sezonId: omis → sezonul activ; prezent (string gol/null) → acel filtru
// (gol/null = toate sezoanele) — pentru paginile cu selector propriu de sezon.
export function useCursuriOptions(opts?: {
  enabled?: boolean
  locatieId?: string | null
  sezonId?: string | null
}) {
  const { role } = useAuth()
  const working = useWorkingLocatie()
  const teacherMode = isTeacher(role)
  const locatieId =
    opts && 'locatieId' in opts ? opts.locatieId || null : working.locatieId
  const hasSezonOverride = Boolean(opts && 'sezonId' in opts)

  const sezonQ = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
    enabled: !hasSezonOverride,
  })
  const sezonId = hasSezonOverride ? opts!.sezonId || null : sezonQ.data ?? null

  return useQuery({
    queryKey: [
      'lookup',
      'cursuri',
      teacherMode ? 'teacher' : locatieId ?? 'all',
      sezonId,
    ],
    queryFn: () =>
      teacherMode
        ? cursuriOptionsForCurrentTeacher(sezonId)
        : cursuriOptions(locatieId, sezonId),
    enabled: (opts?.enabled ?? true) && (hasSezonOverride || sezonQ.isSuccess),
  })
}
