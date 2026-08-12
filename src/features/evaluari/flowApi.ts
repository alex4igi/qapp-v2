import { supabase } from '@/lib/supabase'
import type { SesiuneEvaluare, InsertDto, UpdateDto } from '@/types/db'
import type { SkillKey } from './skills'

export type StareEvaluare =
  | 'ciorna'
  | 'de_verificat'
  | 'aprobata'
  | 'respinsa'
  | 'trimisa'
  | 'expirata'

export type StareSesiune =
  | 'ciorna'
  | 'deschisa'
  | 'verificare'
  | 'trimisa'
  | 'inchisa'
  | 'anulata'

export const STARE_LABEL: Record<StareEvaluare, string> = {
  ciorna: 'Ciornă',
  de_verificat: 'La verificare',
  aprobata: 'Aprobată',
  respinsa: 'Respinsă',
  trimisa: 'Trimisă',
  expirata: 'Expirată',
}

export const STARE_SESIUNE_LABEL: Record<StareSesiune, string> = {
  ciorna: 'Ciornă',
  deschisa: 'Deschisă',
  verificare: 'În verificare',
  trimisa: 'Trimisă',
  inchisa: 'Închisă',
  anulata: 'Anulată',
}

/** Zilele implicite dintre termenul instructorilor, trimitere și închidere. */
export const ZILE_VERIFICARE = 7
export const ZILE_GRATIE = 14

// ── Runda activă ────────────────────────────────────────────────────────────
export type SesiuneActiva = {
  id: string
  nume: string
  stare: StareSesiune
  data_limita_teacher: string
  data_trimitere: string
  data_inchidere: string
  zile_pana_la_limita: number
  zile_pana_la_trimitere: number
  zile_pana_la_inchidere: number
}

export async function getSesiuneActiva(): Promise<SesiuneActiva | null> {
  const { data, error } = await supabase.rpc('get_sesiune_activa')
  if (error) throw error
  const rows = (data ?? []) as unknown as SesiuneActiva[]
  return rows[0] ?? null
}

// ── CRUD runde (manager) ────────────────────────────────────────────────────
export async function listSesiuni(): Promise<SesiuneEvaluare[]> {
  const { data, error } = await supabase
    .from('sesiuni_evaluare')
    .select('*')
    .order('data_trimitere', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createSesiune(
  dto: InsertDto<'sesiuni_evaluare'>,
  cursIds: string[],
): Promise<SesiuneEvaluare> {
  const { data, error } = await supabase
    .from('sesiuni_evaluare')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  await setGrupeSesiune(data.id, cursIds)
  return data
}

export async function updateSesiune(
  id: string,
  dto: UpdateDto<'sesiuni_evaluare'>,
  cursIds?: string[],
): Promise<void> {
  const { error } = await supabase.from('sesiuni_evaluare').update(dto).eq('id', id)
  if (error) throw error
  if (cursIds) await setGrupeSesiune(id, cursIds)
}

export async function deleteSesiune(id: string): Promise<void> {
  const { error } = await supabase.from('sesiuni_evaluare').delete().eq('id', id)
  if (error) throw error
}

export async function getGrupeSesiune(sesiuneId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('sesiune_evaluare_grupe')
    .select('curs_id')
    .eq('sesiune_id', sesiuneId)
  if (error) throw error
  return (data ?? []).map((r) => r.curs_id)
}

// Rescriem apartenența la rundă ca diff, nu delete-all + insert: ștergerea în bloc
// ar arunca și grupele nemodificate, iar ele pot avea deja evaluări legate.
async function setGrupeSesiune(sesiuneId: string, cursIds: string[]): Promise<void> {
  const actuale = await getGrupeSesiune(sesiuneId)
  const deAdaugat = cursIds.filter((id) => !actuale.includes(id))
  const deSters = actuale.filter((id) => !cursIds.includes(id))

  if (deAdaugat.length) {
    const { error } = await supabase
      .from('sesiune_evaluare_grupe')
      .insert(deAdaugat.map((curs_id) => ({ sesiune_id: sesiuneId, curs_id })))
    if (error) throw error
  }
  if (deSters.length) {
    const { error } = await supabase
      .from('sesiune_evaluare_grupe')
      .delete()
      .eq('sesiune_id', sesiuneId)
      .in('curs_id', deSters)
    if (error) throw error
  }
}

// ── Acoperire (manager) ─────────────────────────────────────────────────────
export type AcoperireGrupa = {
  curs_id: string
  curs_nume: string
  teacher_nume: string | null
  n_asteptati: number
  n_exceptii: number
  n_ciorna: number
  n_de_verificat: number
  n_aprobate: number
  n_respinse: number
  n_trimise: number
  n_expirate: number
}

export async function getAcoperireSesiune(sesiuneId: string): Promise<AcoperireGrupa[]> {
  const { data, error } = await supabase.rpc('get_acoperire_sesiune', {
    p_sesiune: sesiuneId,
  })
  if (error) throw error
  return (data ?? []) as unknown as AcoperireGrupa[]
}

// ── Contorul instructorului ─────────────────────────────────────────────────
export type CountdownGrupa = {
  sesiune_id: string
  sesiune_nume: string
  sesiune_stare: StareSesiune
  data_limita_teacher: string
  data_trimitere: string
  zile_ramase: number
  curs_id: string
  curs_nume: string
  n_asteptati: number
  n_completate: number
  n_respinse: number
  grupa_trimisa: boolean
}

export async function getCountdownTeacher(): Promise<CountdownGrupa[]> {
  const { data, error } = await supabase.rpc('get_countdown_evaluari_teacher')
  if (error) throw error
  return (data ?? []) as unknown as CountdownGrupa[]
}

// ── Rosterul de completat ───────────────────────────────────────────────────
export type RosterEvaluareRow = {
  client_id: string
  client_nume: string
  evaluare_id: string | null
  stare: StareEvaluare | null
  motiv_respingere: string | null
  feedback_general: string | null
  nivel_grupa: string | null
  exceptat: boolean
  motiv_exceptie: string | null
} & Record<SkillKey, number | null>

export async function getRosterEvaluare(
  sesiuneId: string,
  cursId: string,
): Promise<RosterEvaluareRow[]> {
  const { data, error } = await supabase.rpc('get_roster_evaluare', {
    p_sesiune: sesiuneId,
    p_curs: cursId,
  })
  if (error) throw error
  return (data ?? []) as unknown as RosterEvaluareRow[]
}

// ── Acțiuni ─────────────────────────────────────────────────────────────────
export async function excludeCursant(params: {
  sesiuneId: string
  cursId: string
  clientId: string
  motiv: string
}): Promise<void> {
  const { error } = await supabase.rpc('exclude_cursant_evaluare', {
    p_sesiune: params.sesiuneId,
    p_curs: params.cursId,
    p_client: params.clientId,
    p_motiv: params.motiv,
  })
  if (error) throw error
}

export async function anuleazaExceptie(params: {
  sesiuneId: string
  cursId: string
  clientId: string
}): Promise<void> {
  const { error } = await supabase.rpc('anuleaza_exceptie_evaluare', {
    p_sesiune: params.sesiuneId,
    p_curs: params.cursId,
    p_client: params.clientId,
  })
  if (error) throw error
}

export async function submitGrupa(sesiuneId: string, cursId: string): Promise<number> {
  const { data, error } = await supabase.rpc('submit_grupa_evaluare', {
    p_sesiune: sesiuneId,
    p_curs: cursId,
  })
  if (error) throw error
  return (data as unknown as number) ?? 0
}

export async function aprobaEvaluari(ids: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('aproba_evaluari', { p_ids: ids })
  if (error) throw error
  return (data as unknown as number) ?? 0
}

export async function respingeEvaluare(id: string, motiv: string): Promise<void> {
  const { error } = await supabase.rpc('respinge_evaluare', { p_id: id, p_motiv: motiv })
  if (error) throw error
}

export async function trimiteAprobate(sesiuneId: string): Promise<number> {
  const { data, error } = await supabase.rpc('trimite_aprobate', { p_sesiune: sesiuneId })
  if (error) throw error
  return (data as unknown as number) ?? 0
}

/**
 * Creează rundele standard ale unui sezon (2 pe sezonul principal: mijloc + final).
 * Idempotent — dacă sezonul are deja runde, întoarce 0 fără să dubleze.
 * clone_sezon o cheamă singur; aici o expunem pentru sezoanele create manual și
 * pentru cele dinainte de feature.
 */
export async function genereazaRundeSezon(sezonId: string): Promise<number> {
  const { data, error } = await supabase.rpc('genereaza_runde_sezon', { p_sezon: sezonId })
  if (error) throw error
  return (data as unknown as number) ?? 0
}

export async function inchideSesiune(
  sesiuneId: string,
): Promise<{ trimise: number; expirate: number }> {
  const { data, error } = await supabase.rpc('inchide_sesiune', { p_sesiune: sesiuneId })
  if (error) throw error
  return data as unknown as { trimise: number; expirate: number }
}
