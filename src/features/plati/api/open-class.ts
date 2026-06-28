import { supabase } from '@/lib/supabase'
import type { Curs, Enums, OpenSesiune, StatusRezervare } from '@/types/db'
import { listCursuriPentruInrolare } from './enrollments'

// Cursuri facultative (OPEN class) la care se pot face rezervări pe sesiune.
export async function listCursuriFacultative(
  locatieId: string | null,
  sezonId?: string | null,
): Promise<Curs[]> {
  const cursuri = await listCursuriPentruInrolare(locatieId, sezonId)
  return cursuri.filter((c) => c.facultativ)
}

export type OpenSesiuneOcupare = {
  sesiune: OpenSesiune | null
  ocupate: number
  capacitate: number
}

// Sesiunea OPEN pentru (curs, dată) + numărul de locuri ocupate (rezervări vii).
// Dacă sesiunea nu există încă, întoarcem null + 0 ocupate (se creează la prima rezervare).
export async function getOpenSesiuneByDate(
  cursId: string,
  data: string,
): Promise<OpenSesiuneOcupare> {
  const { data: sesiune, error } = await supabase
    .from('open_sesiuni')
    .select('*')
    .eq('curs', cursId)
    .eq('data', data)
    .maybeSingle()
  if (error) throw error

  if (!sesiune) {
    const { data: curs, error: cErr } = await supabase
      .from('cursuri')
      .select('capacitate_maxima')
      .eq('id', cursId)
      .single()
    if (cErr) throw cErr
    return { sesiune: null, ocupate: 0, capacitate: curs.capacitate_maxima ?? 35 }
  }

  const { count, error: rErr } = await supabase
    .from('open_rezervari')
    .select('id', { count: 'exact', head: true })
    .eq('sesiune', sesiune.id)
    .neq('status', 'anulat')
  if (rErr) throw rErr

  return { sesiune, ocupate: count ?? 0, capacitate: sesiune.capacitate }
}

export type OpenSesiuneRow = OpenSesiune & {
  ocupate: number
  instructor_nume: string | null
}

// Sesiunile viitoare (azi+) ale unui curs, cu ocupare și instructor.
export async function listOpenSesiuni(cursId: string): Promise<OpenSesiuneRow[]> {
  const today = new Date()
  const todayIso = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)

  const { data, error } = await supabase
    .from('open_sesiuni')
    .select('*, instructor_rel:teacheri!open_sesiuni_instructor_fkey(nume)')
    .eq('curs', cursId)
    .gte('data', todayIso)
    .order('data', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as Array<OpenSesiune & { instructor_rel?: { nume: string } | null }>
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const { data: rez, error: rErr } = await supabase
    .from('open_rezervari')
    .select('sesiune')
    .in('sesiune', ids)
    .neq('status', 'anulat')
  if (rErr) throw rErr

  const countBySesiune = new Map<string, number>()
  for (const r of rez ?? []) {
    if (r.sesiune) countBySesiune.set(r.sesiune, (countBySesiune.get(r.sesiune) ?? 0) + 1)
  }

  return rows.map((r) => {
    const { instructor_rel, ...rest } = r
    return {
      ...(rest as OpenSesiune),
      ocupate: countBySesiune.get(r.id) ?? 0,
      instructor_nume: instructor_rel?.nume ?? null,
    }
  })
}

export type RezervareRow = {
  id: string
  status: StatusRezervare
  suma: number | null
  created: string
  clientId: string | null
  nume: string
  prenume: string | null
}

// Rezervările vii ale unei sesiuni (exclude anulate), cu clientul.
export async function listRezervariSesiune(
  sesiuneId: string,
): Promise<RezervareRow[]> {
  const { data, error } = await supabase
    .from('open_rezervari')
    .select('id, status, suma, created, client:clienti(id, nume, prenume)')
    .eq('sesiune', sesiuneId)
    .neq('status', 'anulat')
    .order('created', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as unknown as Array<{
    id: string
    status: StatusRezervare
    suma: number | null
    created: string
    client: { id: string; nume: string; prenume: string | null } | null
  }>

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    suma: r.suma,
    created: r.created,
    clientId: r.client?.id ?? null,
    nume: r.client?.nume ?? '—',
    prenume: r.client?.prenume ?? null,
  }))
}

export type RezervaLocParams = {
  clientId: string
  suma: number
  metoda: Enums<'metoda_plata'>
  locatieId: string
  // fie sesiunea existentă, fie (curs + dată) pentru a o crea
  sesiuneId?: string | null
  cursId?: string | null
  data?: string | null
  instructorId?: string | null
  dataIncasare?: string | null
  // walk-in la recepție: permite depășirea limitei sesiunii (limita rămâne strictă online)
  permiteOverbook?: boolean
  // plată mixtă: a doua metodă + sumă (ex: `suma`=Cash, `metoda2`/`suma2`=Card).
  // Totalul rezervării = suma + (suma2 ?? 0).
  metoda2?: Enums<'metoda_plata'> | null
  suma2?: number | null
}

// Rezervă un loc + încasează, atomic (blocare strictă la capacitate în RPC).
export async function rezervaLocOpen(params: RezervaLocParams): Promise<string> {
  const { data, error } = await supabase.rpc('rezerva_loc_open', {
    p_client: params.clientId,
    p_suma: params.suma,
    p_metoda: params.metoda,
    p_locatie: params.locatieId,
    p_sesiune: params.sesiuneId ?? undefined,
    p_curs: params.cursId ?? undefined,
    p_data: params.data ?? undefined,
    p_instructor: params.instructorId ?? undefined,
    p_data_incasare: params.dataIncasare ?? undefined,
    p_permite_overbook: params.permiteOverbook ?? undefined,
    p_metoda2: params.metoda2 ?? undefined,
    p_suma2: params.suma2 ?? undefined,
  })
  if (error) {
    if (error.code === '23505') {
      throw new Error('Clientul are deja o rezervare la această sesiune.')
    }
    throw new Error(error.message)
  }
  return data as string
}

// Rezervări OPEN bonus (gratuite) pe ședințe specifice, legate de o înrolare
// facultativă „Per lună" existentă (promo iulie — bonus 29-30 iunie). Nu încasează
// nimic; idempotentă (re-apelarea nu dublează). Întoarce nr. de rezervări create.
export async function rezervaBonusOpen(
  enrollmentId: string,
  dates: string[],
): Promise<number> {
  const { data, error } = await supabase.rpc('rezerva_bonus_open', {
    p_enrollment: enrollmentId,
    p_date_list: dates,
  })
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}

export type CreateOpenSesiuneParams = {
  cursId: string
  data: string
  capacitate: number
  instructorId?: string | null
}

// Creează o sesiune OPEN goală în viitor (staff), ca să fie vizibilă pentru rezervare
// din portalul de membru. RLS: doar admin/owner/manager/front_desk pot insera.
export async function createOpenSesiune(params: CreateOpenSesiuneParams): Promise<string> {
  const { data, error } = await supabase
    .from('open_sesiuni')
    .insert({
      curs: params.cursId,
      data: params.data,
      capacitate: params.capacitate,
      instructor: params.instructorId || null,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new Error('Există deja o sesiune la această dată pentru acest curs.')
    }
    throw new Error(error.message)
  }
  return data.id as string
}

export async function anuleazaRezervare(params: {
  rezervareId: string
  motiv?: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('anuleaza_rezervare_open', {
    p_rezervare: params.rezervareId,
    p_motiv: params.motiv ?? undefined,
  })
  if (error) throw new Error(error.message)
}
