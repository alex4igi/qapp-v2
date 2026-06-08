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
// - teacher → doar cursurile lui (deja un set mic);
// - restul → cursurile sezonului activ, filtrate după locație.
// Fără sezon activ, cade înapoi pe „toate" (sezonId=null) ca să nu golim dropdown-ul.
// locatieId: omis → locația globală din header; prezent (string gol/null) → acel filtru
// (gol/null = toate locațiile) — pentru paginile cu selector propriu de locație.
export function useCursuriOptions(opts?: {
  enabled?: boolean
  locatieId?: string | null
}) {
  const { role } = useAuth()
  const working = useWorkingLocatie()
  const teacherMode = isTeacher(role)
  const locatieId =
    opts && 'locatieId' in opts ? opts.locatieId || null : working.locatieId

  const sezonQ = useQuery({
    queryKey: ['lookup', 'sezon-activ'],
    queryFn: sezonActivId,
    enabled: !teacherMode,
  })
  const sezonId = sezonQ.data ?? null

  return useQuery({
    queryKey: [
      'lookup',
      'cursuri',
      teacherMode ? 'teacher' : locatieId ?? 'all',
      teacherMode ? null : sezonId,
    ],
    queryFn: () =>
      teacherMode
        ? cursuriOptionsForCurrentTeacher()
        : cursuriOptions(locatieId, sezonId),
    enabled: (opts?.enabled ?? true) && (teacherMode || sezonQ.isSuccess),
  })
}
