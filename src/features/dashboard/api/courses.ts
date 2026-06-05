import { supabase } from '@/lib/supabase'
import { dayOfWeekRO } from './helpers'

export type DashboardCourse = {
  id: string
  numele: string
  ora: string | null
  sala: string | null
  teacher: string | null
  enrolled: number
  prezenti: number
}

// Cursurile zilei pentru sala/locația selectată. Pentru teacher se poate
// restrânge la `cursIds` (set obținut din `cursuri_teacheri` M:N).
export async function getDashboardCourses(params: {
  date: string
  salaId: string | null
  locatieId: string | null
  cursIds?: string[] | null
}): Promise<DashboardCourse[]> {
  const dow = dayOfWeekRO(new Date(params.date))

  if (params.cursIds && params.cursIds.length === 0) return []

  // !inner pe sala — dacă există locatieId, cursurile fără sală sau cu sală
  // din altă locație sunt excluse automat de filtrul pe sala.locatie.
  const saliRel = params.locatieId
    ? 'sala:sali!inner(nume, locatie)'
    : 'sala:sali(nume)'

  let cursQ = supabase
    .from('cursuri')
    .select(`id, numele, ora, ${saliRel}, teacher:teacheri!fk_cursuri_teacher(nume, prenume)`)
    .contains('zile', [dow])
    .eq('suspendat', false)

  if (params.salaId) cursQ = cursQ.eq('sala', params.salaId)
  if (params.locatieId) cursQ = cursQ.eq('sala.locatie', params.locatieId)
  if (params.cursIds) cursQ = cursQ.in('id', params.cursIds)

  const { data: cursuri, error } = await cursQ
  if (error) throw error
  const cursRows = (cursuri ?? []) as unknown as Array<{
    id: string
    numele: string
    ora: string | null
    sala: { nume: string } | null
    teacher: { nume: string; prenume: string | null } | null
  }>
  const cursIds = cursRows.map((c) => c.id)
  if (cursIds.length === 0) return []

  // Active enrollments per course
  const { data: enr, error: enrErr } = await supabase
    .from('enrollments')
    .select('cursul')
    .in('cursul', cursIds)
    .eq('activ', true)
  if (enrErr) throw enrErr
  const enrolledByCurs = new Map<string, number>()
  for (const e of enr ?? []) {
    if (!e.cursul) continue
    enrolledByCurs.set(e.cursul, (enrolledByCurs.get(e.cursul) ?? 0) + 1)
  }

  // Prezenti azi per course (join through enrollments → cursul)
  const { data: prez, error: prezErr } = await supabase
    .from('prezente')
    .select('enrollment:enrollments(cursul)')
    .eq('data', params.date)
    .eq('status', 'Prezent')
  if (prezErr) throw prezErr
  const prezRows = (prez ?? []) as unknown as Array<{
    enrollment: { cursul: string } | null
  }>
  const prezByCurs = new Map<string, number>()
  for (const p of prezRows) {
    const c = p.enrollment?.cursul
    if (!c) continue
    prezByCurs.set(c, (prezByCurs.get(c) ?? 0) + 1)
  }

  return cursRows
    .map((c) => ({
      id: c.id,
      numele: c.numele,
      ora: c.ora,
      sala: c.sala?.nume ?? null,
      teacher: c.teacher
        ? `${c.teacher.nume} ${c.teacher.prenume ?? ''}`.trim()
        : null,
      enrolled: enrolledByCurs.get(c.id) ?? 0,
      prezenti: prezByCurs.get(c.id) ?? 0,
    }))
    .sort((a, b) => (a.ora ?? '').localeCompare(b.ora ?? ''))
}
