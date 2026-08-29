import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAll'
import {
  CURS_CHECKLIST_COLS,
  type CursCheckInput,
} from '@/lib/checklist/specs/curs'
import {
  TEACHER_CHECKLIST_COLS,
  type TeacherCheckInput,
} from '@/lib/checklist/specs/teacher'

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
  return data as unknown as TeacherChecklistRow[]
}
