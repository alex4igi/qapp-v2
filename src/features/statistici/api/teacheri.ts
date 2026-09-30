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

// ── Instructori — clienți + trend (feature „1 click") ───────────────────────
export type InstructorTrendRow = {
  teacher_id: string
  teacher_nume: string
  clienti_curent: number
  clienti_prev: number
  delta: number
  retentie_procent: number | null
  serie: number[]
}

export async function getInstructoriClientiTrend(luni = 6): Promise<InstructorTrendRow[]> {
  const { data, error } = await supabase.rpc('get_instructori_clienti_trend', { p_luni: luni })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    teacher_id: String(r.teacher_id),
    teacher_nume: (r.teacher_nume as string) ?? '',
    clienti_curent: Number(r.clienti_curent ?? 0),
    clienti_prev: Number(r.clienti_prev ?? 0),
    delta: Number(r.delta ?? 0),
    retentie_procent: r.retentie_procent != null ? Number(r.retentie_procent) : null,
    serie: ((r.serie as number[]) ?? []).map((x) => Number(x)),
  }))
}
