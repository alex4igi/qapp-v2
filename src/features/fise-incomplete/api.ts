import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAll'
import {
  CURS_CHECKLIST_COLS,
  type CursCheckInput,
} from '@/lib/checklist/specs/curs'
import {
  TEACHER_CHECKLIST_COLS,
  teacherCheckRow,
  type TeacherCheckInput,
} from '@/lib/checklist/specs/teacher'
import {
  CLIENT_CHECKLIST_COLS,
  type ClientCheckInput,
} from '@/lib/checklist/specs/client'
import {
  FAMILIE_CHECKLIST_COLS,
  familieCheckRow,
  type FamilieCheckInput,
} from '@/lib/checklist/specs/familie'

export type CursChecklistRow = CursCheckInput & { id: string }

// Toate cursurile nearhivate ale sezonului, pentru evaluare client-side.
// `fetchAllRows` + tiebreaker pe `id`: fără paginare, PostgREST ar tăia tăcut
// la max_rows=1000 și pagina ar raporta mai puține fișe incomplete decât există.
//
// DELIBERAT fără filtru de locație în query: `cursuri.locatie` e chiar unul
// dintre câmpurile pe care pagina le verifică. Filtrat pe server, un curs fără
// locație ar dispărea exact de pe pagina care trebuie să-i semnaleze lipsa.
// Restrângerea la locația de lucru se face client-side, păstrând orfanii.
export async function listCursuriPentruChecklist(params: {
  sezonId: string | null
}): Promise<CursChecklistRow[]> {
  const data = await fetchAllRows(() => {
    let q = supabase
      .from('cursuri')
      .select(CURS_CHECKLIST_COLS)
      .eq('suspendat', false)
    if (params.sezonId) q = q.eq('sezon', params.sezonId)
    return q.order('id', { ascending: true })
  })
  return data as unknown as CursChecklistRow[]
}

export type TeacherChecklistRow = TeacherCheckInput & { id: string }

// Instructorii activi (nearhivați), pentru evaluare client-side.
//
// Fără filtru de sezon sau locație, DELIBERAT: un teacher nu aparține niciunuia
// — le moștenește prin cursurile pe care le predă (vezi `teacherIdsForFilters`
// din features/teacheri/api.ts). Filtrat așa, un instructor nou, fără grupă
// asignată încă, ar dispărea exact de pe pagina care trebuie să-i semnaleze
// fișa goală.
export async function listTeacheriPentruChecklist(): Promise<
  TeacherChecklistRow[]
> {
  const data = await fetchAllRows(() =>
    supabase
      .from('teacheri')
      .select(TEACHER_CHECKLIST_COLS)
      .eq('arhivat', false)
      .order('id', { ascending: true }),
  )
  return (data as unknown as Parameters<typeof teacherCheckRow>[0][]).map(
    teacherCheckRow,
  ) as TeacherChecklistRow[]
}

export type ClientChecklistRow = ClientCheckInput & { id: string }

// Doar clienții ACTIVI. Fișa unui exclient nu se mai completează de nimeni, iar
// fără filtru pagina ar aduce câteva mii de rânduri și ar îneca lista reală.
export async function listClientiPentruChecklist(): Promise<ClientChecklistRow[]> {
  const data = await fetchAllRows(() =>
    supabase
      .from('clienti')
      .select(CLIENT_CHECKLIST_COLS)
      .eq('status', 'Activ')
      .order('id', { ascending: true }),
  )
  return data as unknown as ClientChecklistRow[]
}

export type FamilieChecklistRow = FamilieCheckInput & { id: string }

// Doar familiile cu cel puțin un client activ — aceleași motive ca la clienți:
// din 656 de familii, cele „vii" sunt ~200, restul sunt istoric.
export async function listFamiliiPentruChecklist(): Promise<FamilieChecklistRow[]> {
  const clienti = await fetchAllRows(() =>
    supabase
      .from('clienti')
      .select('id, familia')
      .eq('status', 'Activ')
      .not('familia', 'is', null)
      .order('id', { ascending: true }),
  )
  const ids = [
    ...new Set((clienti as unknown as { familia: string }[]).map((c) => c.familia)),
  ]
  if (ids.length === 0) return []
  const data = await fetchAllRows(() =>
    supabase
      .from('familii')
      .select(FAMILIE_CHECKLIST_COLS)
      .in('id', ids)
      .order('id', { ascending: true }),
  )
  return (data as unknown as Parameters<typeof familieCheckRow>[0][]).map(
    familieCheckRow,
  ) as FamilieChecklistRow[]
}
