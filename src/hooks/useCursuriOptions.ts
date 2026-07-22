import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { hasTeacherLens, isTeacher } from '@/lib/rolesMatrix'
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
  const { role, teacherId } = useAuth()
  const working = useWorkingLocatie()
  // Teacher pur → doar cursurile lui. Cine are și profil de instructor, și acces
  // mai larg (manager/recepție care predă) → lista completă, cu grupele lui scoase
  // în față sub un antet. Aditiv, nu exclusiv: nu pierde nimic din ce vedea.
  const teacherMode = isTeacher(role)
  const teacherLens = hasTeacherLens(role, teacherId) && !teacherMode
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
      teacherLens ? teacherId : null,
    ],
    queryFn: async () => {
      if (teacherMode) return cursuriOptionsForCurrentTeacher(sezonId)
      const all = await cursuriOptions(locatieId, sezonId)
      if (!teacherLens) return all
      const mine = await cursuriOptionsForCurrentTeacher(sezonId)
      const mineIds = new Set(mine.map((o) => o.value))
      // Intersectăm cu lista din scopul curent: filtrul de locație/sezon rămâne
      // onest, doar ordinea se schimbă. Nu adăugăm grupe din afara filtrului.
      const inScope = all.filter((o) => mineIds.has(o.value))
      if (inScope.length === 0) return all
      return [
        ...inScope.map((o) => ({ ...o, group: 'Grupele mele' })),
        ...all
          .filter((o) => !mineIds.has(o.value))
          .map((o) => ({ ...o, group: 'Toate grupele' })),
      ]
    },
    enabled: (opts?.enabled ?? true) && (hasSezonOverride || sezonQ.isSuccess),
  })
}
