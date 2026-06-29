import { supabase } from '@/lib/supabase'
import { endOfMonth } from '@/features/plati/api/calendar'
import { sezonActivId } from '@/lib/lookups'
import { dayOfWeekRO } from './helpers'

export type DashboardCourse = {
  id: string
  numele: string
  ora: string | null
  sala: string | null
  teacher: string | null
  enrolled: number
  prezenti: number
  capacitate: number | null
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

  // Doar cursurile sezonului activ — altfel apar și grupele clonate din
  // sezoanele anterioare (reînscrieri) care au aceeași zi în `zile`.
  const sezonId = await sezonActivId()

  let cursQ = supabase
    .from('cursuri')
    .select(`id, numele, ora, capacitate_maxima, ${saliRel}, teacher:teacheri!fk_cursuri_teacher(nume, prenume)`)
    .contains('zile', [dow])
    .eq('suspendat', false)

  if (sezonId) cursQ = cursQ.eq('sezon', sezonId)
  if (params.salaId) cursQ = cursQ.eq('sala', params.salaId)
  if (params.locatieId) cursQ = cursQ.eq('sala.locatie', params.locatieId)
  if (params.cursIds) cursQ = cursQ.in('id', params.cursIds)

  const { data: cursuri, error } = await cursQ
  if (error) throw error
  const cursRows = (cursuri ?? []) as unknown as Array<{
    id: string
    numele: string
    ora: string | null
    capacitate_maxima: number | null
    sala: { nume: string } | null
    teacher: { nume: string; prenume: string | null } | null
  }>
  const cursIds = cursRows.map((c) => c.id)
  if (cursIds.length === 0) return []

  // Înrolați per curs = înrolare NEreziliată care ACOPERĂ luna afișată. NU
  // folosim `activ` (nesigur la datele v1). Aceeași definiție ca rosterul din
  // grupa.ts → countul de pe card == lungimea rosterului grupei.
  // Paginăm: la datele v1 un client are mai multe rânduri care acoperă luna
  // (data_final=null pe lunile vechi), deci un `.in()` peste toate cursurile zilei
  // poate depăși limita PostgREST de 1000 → trunchiere și count subevaluat.
  const monthStart = params.date.slice(0, 7) + '-01'
  const monthEnd = endOfMonth(monthStart)
  const clientsByCurs = new Map<string, Set<string>>()
  for (let offset = 0; ; offset += 1000) {
    const { data: enr, error: enrErr } = await supabase
      .from('enrollments')
      .select('cursul, client')
      .in('cursul', cursIds)
      .eq('reziliat', false)
      .lte('data_incepere', monthEnd)
      .or(`data_final.is.null,data_final.gte.${monthStart}`)
      .range(offset, offset + 999)
    if (enrErr) throw enrErr
    for (const e of enr ?? []) {
      if (!e.cursul || !e.client) continue
      let set = clientsByCurs.get(e.cursul)
      if (!set) {
        set = new Set<string>()
        clientsByCurs.set(e.cursul, set)
      }
      set.add(e.client)
    }
    if (!enr || enr.length < 1000) break
  }
  // Cursuri facultative: clienții cu rezervare OPEN ne-anulată pe ziua afișată au
  // acces (ex. ședințe bonus din promo: înrolarea lor e pe altă lună). Îi adăugăm
  // ca să rămână invariantul „count card == lungime roster grupă" (vezi grupa.ts).
  const { data: sesiuni, error: sesErr } = await supabase
    .from('open_sesiuni')
    .select('id, curs')
    .in('curs', cursIds)
    .eq('data', params.date)
  if (sesErr) throw sesErr
  const cursBySesiune = new Map<string, string>()
  for (const s of sesiuni ?? []) {
    if (s.id && s.curs) cursBySesiune.set(s.id, s.curs)
  }
  if (cursBySesiune.size > 0) {
    const { data: rez, error: rezErr } = await supabase
      .from('open_rezervari')
      .select('sesiune, client')
      .in('sesiune', Array.from(cursBySesiune.keys()))
      .neq('status', 'anulat')
    if (rezErr) throw rezErr
    for (const r of rez ?? []) {
      const curs = r.sesiune ? cursBySesiune.get(r.sesiune) : null
      if (!curs || !r.client) continue
      let set = clientsByCurs.get(curs)
      if (!set) {
        set = new Set<string>()
        clientsByCurs.set(curs, set)
      }
      set.add(r.client)
    }
  }

  const enrolledByCurs = new Map<string, number>()
  for (const [c, set] of clientsByCurs) enrolledByCurs.set(c, set.size)

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
      capacitate: c.capacitate_maxima,
    }))
    .sort((a, b) => (a.ora ?? '').localeCompare(b.ora ?? ''))
}
