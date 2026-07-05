import { supabase } from '@/lib/supabase'

export type TeacherOverviewRow = {
  curs_id: string
  curs_nume: string
  curs_nivel: string | null
  facultativ: boolean
  activi: number
  prezenti: number
  posibile: number
  datorie: number
}

// Overview per instructor (secțiunea „Privire pe instructor" din /statistici):
// un rând per curs al teacher-ului, pe luna curentă (activi, prezențe, datorie neprescrisă).
export async function getTeacherOverview(
  teacherId: string,
): Promise<TeacherOverviewRow[]> {
  const { data, error } = await supabase.rpc('get_teacher_overview', {
    p_teacher_id: teacherId,
  })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    curs_id: String(r.curs_id),
    curs_nume: (r.curs_nume as string) ?? '',
    curs_nivel: (r.curs_nivel as string | null) ?? null,
    facultativ: Boolean(r.facultativ),
    activi: Number(r.activi ?? 0),
    prezenti: Number(r.prezenti ?? 0),
    posibile: Number(r.posibile ?? 0),
    datorie: Number(r.datorie ?? 0),
  }))
}
