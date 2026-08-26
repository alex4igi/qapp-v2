import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAll'
import {
  CURS_CHECKLIST_COLS,
  type CursCheckInput,
} from '@/lib/checklist/specs/curs'

export type CursChecklistRow = CursCheckInput & { id: string }

// Toate cursurile nearhivate ale sezonului, pentru evaluare client-side.
// `fetchAllRows` + tiebreaker pe `id`: fără paginare, PostgREST ar tăia tăcut
// la max_rows=1000 și pagina ar raporta mai puține fișe incomplete decât există.
export async function listCursuriPentruChecklist(params: {
  sezonId: string | null
  locatieId: string | null
}): Promise<CursChecklistRow[]> {
  const data = await fetchAllRows(() => {
    let q = supabase
      .from('cursuri')
      .select(CURS_CHECKLIST_COLS)
      .eq('suspendat', false)
    if (params.sezonId) q = q.eq('sezon', params.sezonId)
    if (params.locatieId) q = q.eq('locatie', params.locatieId)
    return q.order('id', { ascending: true })
  })
  return data as unknown as CursChecklistRow[]
}
