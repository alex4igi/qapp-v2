import { supabase } from '@/lib/supabase'

export type PontajStatus = 'ok' | 'necesita_confirmare' | 'corectat' | 'legacy'

export type PontajRow = {
  id: string
  user_id: string
  locatie_id: string | null
  start_at: string
  end_at: string | null
  source: string | null
  status: PontajStatus
  minute_platibile: number | null
  nota: string | null
  corectat_de: string | null
  corectat_la: string | null
  // joined
  locatie_nume: string | null
}

export type PontajSumarRow = {
  user_id: string
  total_minute: number
  nr_ture: number
  nr_neconfirmate: number
  nr_deschise: number
  aprobat: boolean
}

const SELECT =
  'id, user_id, locatie_id, start_at, end_at, source, status, minute_platibile, nota, corectat_de, corectat_la, locatii(nume)'

type Raw = Omit<PontajRow, 'locatie_nume'> & {
  locatii: { nume: string | null } | null
}

function mapRows(data: unknown): PontajRow[] {
  const rows = (data as Raw[] | null) ?? []
  return rows.map((r) => ({ ...r, locatie_nume: r.locatii?.nume ?? null }))
}

export async function listPontaj(params: {
  from?: string | null
  to?: string | null
}): Promise<PontajRow[]> {
  let q = supabase
    .from('staff_pontaj')
    .select(SELECT)
    .order('start_at', { ascending: false })
    .limit(500)

  if (params.from) q = q.gte('start_at', params.from)
  if (params.to) q = q.lte('start_at', params.to + 'T23:59:59')

  const { data, error } = await q
  if (error) throw error
  return mapRows(data)
}

/** Turele care așteaptă confirmarea managerului — independent de filtrul de dată. */
export async function listNeconfirmate(): Promise<PontajRow[]> {
  const { data, error } = await supabase
    .from('staff_pontaj')
    .select(SELECT)
    .eq('status', 'necesita_confirmare')
    .order('start_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return mapRows(data)
}

/* ---------- pontare proprie ---------- */

export async function getStareCurenta(): Promise<PontajRow | null> {
  const { data, error } = await supabase.rpc('pontaj_stare_curenta')
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as PontajRow | null
  // `returns staff_pontaj` fără rânduri vine ca rând de NULL-uri, nu ca null —
  // obiectul e truthy și butonul ar rămâne blocat pe „Închei tura". Discriminăm pe id.
  return row?.id ? row : null
}

export async function checkIn(locatieId?: string | null): Promise<void> {
  const { error } = await supabase.rpc(
    'pontaj_check_in',
    locatieId ? { p_locatie: locatieId } : {},
  )
  if (error) throw error
}

export async function checkOut(): Promise<void> {
  const { error } = await supabase.rpc('pontaj_check_out')
  if (error) throw error
}

/* ---------- corecție (manager+) ---------- */

export async function upsertManual(params: {
  id?: string | null
  userId: string
  start: string
  end: string
  locatieId: string
  motiv: string
}): Promise<void> {
  const { error } = await supabase.rpc('pontaj_upsert_manual', {
    p_user_id: params.userId,
    p_start: params.start,
    p_end: params.end,
    p_locatie: params.locatieId,
    p_motiv: params.motiv,
    ...(params.id ? { p_id: params.id } : {}),
  })
  if (error) throw error
}

export async function confirmaTura(id: string): Promise<void> {
  const { error } = await supabase.rpc('pontaj_confirma', { p_id: id })
  if (error) throw error
}

export async function stergeTura(id: string, motiv: string): Promise<void> {
  const { error } = await supabase.rpc('pontaj_sterge', {
    p_id: id,
    p_motiv: motiv,
  })
  if (error) throw error
}

/* ---------- lună (owner/admin) ---------- */

/**
 * Aceeași sursă pentru previzualizarea din UI și pentru aprobare: RPC-ul de
 * aprobare recalculează prin exact această funcție, deci numărul afișat e
 * numărul care ajunge în snapshot.
 */
export async function sumarLuna(luna: string): Promise<PontajSumarRow[]> {
  const { data, error } = await supabase.rpc('pontaj_sumar_luna', {
    p_luna: luna,
  })
  if (error) throw error
  return (data as PontajSumarRow[] | null) ?? []
}

export async function aprobaLuna(
  userId: string,
  luna: string,
  nota?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('pontaj_aproba_luna', {
    p_user_id: userId,
    p_luna: luna,
    ...(nota ? { p_nota: nota } : {}),
  })
  if (error) throw error
}

export async function deblocheazaLuna(
  userId: string,
  luna: string,
  motiv: string,
): Promise<void> {
  const { error } = await supabase.rpc('pontaj_deblocheaza_luna', {
    p_user_id: userId,
    p_luna: luna,
    p_motiv: motiv,
  })
  if (error) throw error
}
