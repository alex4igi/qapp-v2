import { supabase } from '@/lib/supabase'
import { endOfMonth } from '@/features/plati/api/calendar'
import { dayOfWeekRO } from './helpers'
import { fetchAllRows } from '@/lib/fetchAll'

export type DashboardCourse = {
  id: string
  numele: string
  ora: string | null
  sala: string | null
  teacher: string | null
  enrolled: number
  prezenti: number
  capacitate: number | null
  // Locuri ocupate în ziua afișată, după regula de 30 de zile (locuri_ocupate) —
  // numărătorul barei de ocupare. Diferit de `enrolled` (rosterul zilei, cu tot
  // cu cine vine fără plată), care rămâne numitorul inelului de prezență.
  ocupate: number
  // Leads programați la grupă în ziua afișată. Stau în afara lui `enrolled`/`prezenti`
  // (aceia sunt cursanți înrolați), dar sunt oameni în sală — vezi cardul din agendă.
  leads: number
  leadsPrezenti: number
}

export type DashboardSezon = {
  id: string
  data_incepere: string
  data_final: string
}

// Cursurile zilei pentru sălile/locația selectate (`salaIds` gol = toate sălile). Pentru teacher se poate
// restrânge la `cursIds` (set obținut din `cursuri_teacheri` M:N).
// `sezon` vine de la pagină (același query cache-uit ca banner-ul de sezon), ca să nu
// mai facem un fetch separat aici; null = nu există sezon activ.
export async function getDashboardCourses(params: {
  date: string
  salaIds: string[]
  locatieId: string | null
  sezon: DashboardSezon | null
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
  // Sezonul se activează înainte de start (reînscrieri), deci în zilele dintre
  // activare și data_incepere grupele lui nu țin încă ore.
  const sezon = params.sezon
  if (sezon && (params.date < sezon.data_incepere || params.date > sezon.data_final)) {
    return []
  }

  let cursQ = supabase
    .from('cursuri')
    .select(`id, numele, ora, capacitate_maxima, ${saliRel}, teacher:teacheri!fk_cursuri_teacher(nume, prenume)`)
    .contains('zile', [dow])
    .eq('suspendat', false)

  if (sezon) cursQ = cursQ.eq('sezon', sezon.id)
  if (params.salaIds.length) cursQ = cursQ.in('sala', params.salaIds)
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

  // Cele trei surse de mai jos nu depind una de alta — rulează în paralel (înainte
  // erau 5-6 cereri strict secvențiale, ~1,3 s doar din așteptare).
  const [clientsByCurs, prezByCurs, programariRows, locuriRes] = await Promise.all([
    loadClientsByCurs(cursIds, params.date),
    loadPrezentiByCurs(params.date),
    loadProgramari(cursIds, params.date),
    supabase.rpc('locuri_ocupate', {
      p_de: params.date,
      p_pana: params.date,
      p_cursuri: cursIds,
    }),
  ])
  if (locuriRes.error) throw locuriRes.error
  const ocupateByCurs = new Map(
    (locuriRes.data ?? []).map((r) => [r.curs_id, r.ocupate]),
  )

  const enrolledByCurs = new Map<string, number>()
  for (const [c, set] of clientsByCurs) enrolledByCurs.set(c, set.size)

  // Leads programați azi la aceste grupe. Prezența lor NU stă în `prezente`, ci în
  // `programari_leads.prezenta` — de aceea cardul îi rata complet și arăta „7/7"
  // când în sală erau 8. Filtrele oglindesc rosterul din grupa.ts, ca să iasă
  // aceleași persoane în ambele locuri.
  const leadsByCurs = new Map<string, { total: number; prezenti: number }>()
  const seenLead = new Set<string>()
  for (const p of programariRows) {
    const c = p.cursul_programat
    if (!c || !p.lead) continue
    const key = `${c}:${p.lead.id}`
    if (seenLead.has(key)) continue
    if (
      p.lead.status === 'pierdut' ||
      p.lead.status === 'nurture' ||
      p.lead.status === 'waiting_list'
    )
      continue
    // Lead convertit al cărui client e deja în roster: ar fi numărat de două ori.
    if (p.lead.id_client && clientsByCurs.get(c)?.has(p.lead.id_client)) continue
    seenLead.add(key)
    const acc = leadsByCurs.get(c) ?? { total: 0, prezenti: 0 }
    acc.total += 1
    if (p.prezenta === 'prezent') acc.prezenti += 1
    leadsByCurs.set(c, acc)
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
      ocupate: ocupateByCurs.get(c.id) ?? 0,
      leads: leadsByCurs.get(c.id)?.total ?? 0,
      leadsPrezenti: leadsByCurs.get(c.id)?.prezenti ?? 0,
    }))
    .sort((a, b) => (a.ora ?? '').localeCompare(b.ora ?? ''))
}

// Înrolați per curs = înrolare NEreziliată care ACOPERĂ luna afișată. NU
// folosim `activ` (nesigur la datele v1). Aceeași definiție ca rosterul din
// grupa.ts → countul de pe card == lungimea rosterului grupei.
// Paginăm: la datele v1 un client are mai multe rânduri care acoperă luna
// (data_final=null pe lunile vechi), deci un `.in()` peste toate cursurile zilei
// poate depăși limita PostgREST de 1000 → trunchiere și count subevaluat.
async function loadClientsByCurs(
  cursIds: string[],
  date: string,
): Promise<Map<string, Set<string>>> {
  const monthStart = date.slice(0, 7) + '-01'
  const monthEnd = endOfMonth(monthStart)
  const clientsByCurs = new Map<string, Set<string>>()
  const add = (curs: string, client: string) => {
    let set = clientsByCurs.get(curs)
    if (!set) {
      set = new Set<string>()
      clientsByCurs.set(curs, set)
    }
    set.add(client)
  }

  // Înrolările și rezervările OPEN nu depind una de alta — în paralel.
  const [enrRows, sesiuni] = await Promise.all([
    (async () => {
      const all: Array<{ cursul: string | null; client: string | null }> = []
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
        all.push(...(enr ?? []))
        if (!enr || enr.length < 1000) break
      }
      return all
    })(),
    (async () => {
      const { data, error } = await supabase
        .from('open_sesiuni')
        .select('id, curs')
        .in('curs', cursIds)
        .eq('data', date)
      if (error) throw error
      return data ?? []
    })(),
  ])
  for (const e of enrRows) {
    if (e.cursul && e.client) add(e.cursul, e.client)
  }

  // Cursuri facultative: clienții cu rezervare OPEN ne-anulată pe ziua afișată au
  // acces (ex. ședințe bonus din promo: înrolarea lor e pe altă lună). Îi adăugăm
  // ca să rămână invariantul „count card == lungime roster grupă" (vezi grupa.ts).
  const cursBySesiune = new Map<string, string>()
  for (const s of sesiuni) {
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
      if (curs && r.client) add(curs, r.client)
    }
  }
  return clientsByCurs
}

// Prezenti azi per course (join through enrollments → cursul)
// Paginat: peste 1000 de prezențe într-o zi (toate cursurile) ar strica numărătoarea.
async function loadPrezentiByCurs(date: string): Promise<Map<string, number>> {
  const prez = await fetchAllRows(() =>
    supabase
      .from('prezente')
      .select('enrollment:enrollments(cursul), id')
      .eq('data', date)
      .eq('status', 'Prezent')
      .order('id', { ascending: true }),
  )
  const prezRows = prez as unknown as Array<{
    enrollment: { cursul: string } | null
  }>
  const prezByCurs = new Map<string, number>()
  for (const p of prezRows) {
    const c = p.enrollment?.cursul
    if (!c) continue
    prezByCurs.set(c, (prezByCurs.get(c) ?? 0) + 1)
  }
  return prezByCurs
}

type ProgramareRow = {
  cursul_programat: string | null
  prezenta: string | null
  lead: { id: string; status: string | null; id_client: string | null } | null
}

async function loadProgramari(cursIds: string[], date: string): Promise<ProgramareRow[]> {
  const { data, error } = await supabase
    .from('programari_leads')
    .select('cursul_programat, prezenta, lead:leads(id, status, id_client)')
    .in('cursul_programat', cursIds)
    .eq('data_programarii', date)
  if (error) throw error
  return (data ?? []) as unknown as ProgramareRow[]
}
