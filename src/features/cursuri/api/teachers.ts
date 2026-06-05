// Asocieri teacher ↔ curs (M:N) — principal (titular) + co-instructor (asistent)
// Reguli:
// - cursuri.teacher (FK singular) păstrează principalul → calculul de salariu îl folosește.
// - cursuri_teacheri (M:N) ține și principalul (rol='titular') și co-instructorul opțional (rol='asistent').
// - UI-ul curent impune cel mult un titular + cel mult un asistent per curs.
import { supabase } from '@/lib/supabase'

export type CursTeacherAsignment = {
  teacher_id: string
  rol: 'titular' | 'asistent'
}

export async function getCursTeacheri(
  cursId: string,
): Promise<CursTeacherAsignment[]> {
  const { data, error } = await supabase
    .from('cursuri_teacheri')
    .select('teacher_id, rol')
    .eq('curs_id', cursId)
  if (error) throw error
  return (data ?? []) as CursTeacherAsignment[]
}

// Sincronizează asocierile M:N pentru un curs:
// - Șterge toate rândurile existente pentru cursId
// - Inserează (cursId, principal, 'titular') dacă principal e setat
// - Inserează (cursId, coInstructor, 'asistent') dacă coInstructor e setat
export async function setCursTeacheri(params: {
  cursId: string
  principalId: string | null
  coInstructorId: string | null
}): Promise<void> {
  const { error: delErr } = await supabase
    .from('cursuri_teacheri')
    .delete()
    .eq('curs_id', params.cursId)
  if (delErr) throw delErr

  const rows: { curs_id: string; teacher_id: string; rol: 'titular' | 'asistent' }[] = []
  if (params.principalId) {
    rows.push({
      curs_id: params.cursId,
      teacher_id: params.principalId,
      rol: 'titular',
    })
  }
  if (params.coInstructorId && params.coInstructorId !== params.principalId) {
    rows.push({
      curs_id: params.cursId,
      teacher_id: params.coInstructorId,
      rol: 'asistent',
    })
  }
  if (rows.length === 0) return

  const { error: insErr } = await supabase
    .from('cursuri_teacheri')
    .insert(rows)
  if (insErr) throw insErr
}
