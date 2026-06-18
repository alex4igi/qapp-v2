import { supabase } from '@/lib/supabase'
import type { EvaluareTeacher, InsertDto, UpdateDto } from '@/types/db'

// Criteriile de evaluare a profesorului (1–5). feedback_cursanti e separat
// (scor manual în v1 → vezi migrația; Faza 2 = din portal client).
export type CriteriuKey =
  | 'scor_punctualitate'
  | 'scor_pregatire'
  | 'scor_energie'
  | 'scor_comunicare'
  | 'scor_disciplina'
  | 'scor_rezultate'

export const CRITERII: { key: CriteriuKey; label: string }[] = [
  { key: 'scor_punctualitate', label: 'Punctualitate' },
  { key: 'scor_pregatire', label: 'Pregătirea lecției' },
  { key: 'scor_energie', label: 'Energie / atmosferă' },
  { key: 'scor_comunicare', label: 'Comunicare cu părinții' },
  { key: 'scor_disciplina', label: 'Disciplina grupei' },
  { key: 'scor_rezultate', label: 'Rezultate (prezență / retenție)' },
]

// Toate scorurile care intră în media (criterii + feedback cursanți).
const SCOR_KEYS: (keyof EvaluareTeacher)[] = [
  ...CRITERII.map((c) => c.key),
  'feedback_cursanti',
]

export function scorMediu(e: EvaluareTeacher): number | null {
  const vals = SCOR_KEYS
    .map((k) => e[k] as number | null)
    .filter((v): v is number => typeof v === 'number')
  if (!vals.length) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

export async function listEvaluariTeacher(
  teacherId: string,
): Promise<EvaluareTeacher[]> {
  const { data, error } = await supabase
    .from('evaluari_teacher')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('anul', { ascending: false })
    .order('luna', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createEvaluareTeacher(
  dto: InsertDto<'evaluari_teacher'>,
): Promise<void> {
  const { error } = await supabase.from('evaluari_teacher').insert(dto)
  if (error) throw error
}

export async function updateEvaluareTeacher(
  id: string,
  dto: UpdateDto<'evaluari_teacher'>,
): Promise<void> {
  const { error } = await supabase
    .from('evaluari_teacher')
    .update({ ...dto, updated: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteEvaluareTeacher(id: string): Promise<void> {
  const { error } = await supabase.from('evaluari_teacher').delete().eq('id', id)
  if (error) throw error
}
