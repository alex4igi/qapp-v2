import { supabase } from '@/lib/supabase'
import type {
  Locatie,
  Sala,
  Sezon,
  Vacanta,
  TarifInchiriere,
  InsertDto,
  UpdateDto,
} from '@/types/db'

// ---------- Locații ----------
export async function listLocatii(): Promise<Locatie[]> {
  const { data, error } = await supabase
    .from('locatii')
    .select('*')
    .order('nume', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createLocatie(
  dto: InsertDto<'locatii'>,
): Promise<Locatie> {
  const { data, error } = await supabase
    .from('locatii')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateLocatie(
  id: string,
  dto: UpdateDto<'locatii'>,
): Promise<Locatie> {
  const { data, error } = await supabase
    .from('locatii')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteLocatie(id: string): Promise<void> {
  const { error } = await supabase.from('locatii').delete().eq('id', id)
  if (error) throw error
}

// ---------- Săli ----------
export async function listSali(): Promise<Sala[]> {
  const { data, error } = await supabase
    .from('sali')
    .select('*')
    .order('nume', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createSala(dto: InsertDto<'sali'>): Promise<Sala> {
  const { data, error } = await supabase
    .from('sali')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateSala(
  id: string,
  dto: UpdateDto<'sali'>,
): Promise<Sala> {
  const { data, error } = await supabase
    .from('sali')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteSala(id: string): Promise<void> {
  const { error } = await supabase.from('sali').delete().eq('id', id)
  if (error) throw error
}

// ---------- Tarife închiriere săli ----------
export async function listTarifeInchiriere(): Promise<TarifInchiriere[]> {
  const { data, error } = await supabase.from('tarife_inchiriere').select('*')
  if (error) throw error
  return data ?? []
}

export async function upsertTarifInchiriere(
  dto: InsertDto<'tarife_inchiriere'>,
): Promise<TarifInchiriere> {
  const { data, error } = await supabase
    .from('tarife_inchiriere')
    .upsert({ ...dto, updated: new Date().toISOString() }, { onConflict: 'sala,tier' })
    .select('*')
    .single()
  if (error) throw error
  return data
}

// ---------- Sezoane ----------
export async function listSezoane(): Promise<Sezon[]> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('*')
    .order('data_incepere', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createSezon(dto: InsertDto<'sezoane'>): Promise<Sezon> {
  const { data, error } = await supabase
    .from('sezoane')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateSezon(
  id: string,
  dto: UpdateDto<'sezoane'>,
): Promise<Sezon> {
  const { data, error } = await supabase
    .from('sezoane')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteSezon(id: string): Promise<void> {
  const { error } = await supabase.from('sezoane').delete().eq('id', id)
  if (error) throw error
}

export async function getSezonActiv(): Promise<Sezon | null> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('*')
    .eq('activ', true)
    .maybeSingle()
  if (error) throw error
  return data
}

// Setează un singur sezon activ. Folosește RPC activate_sezon care arhivează
// sezonul activ curent înainte de a-l marca pe acesta `activ`.
export async function setSezonActiv(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_sezon', { p_sezon_id: id })
  if (error) throw error
}

// ---------- Vacanțe ----------
export async function listVacante(sezonId: string): Promise<Vacanta[]> {
  const { data, error } = await supabase
    .from('vacante')
    .select('*')
    .eq('sezon_id', sezonId)
    .order('data_incepere', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createVacanta(
  dto: InsertDto<'vacante'>,
): Promise<Vacanta> {
  const { data, error } = await supabase
    .from('vacante')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateVacanta(
  id: string,
  dto: UpdateDto<'vacante'>,
): Promise<Vacanta> {
  const { data, error } = await supabase
    .from('vacante')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteVacanta(id: string): Promise<void> {
  const { error } = await supabase.from('vacante').delete().eq('id', id)
  if (error) throw error
}

// ---------- Clonare sezon ----------
export type CloneSezonCursOverride = Partial<{
  numele: string
  stil: string
  nivelul: string
  varsta: string
  teacher: string
  sala: string
  facultativ: boolean
  pret_anual: number
  pret_lunar: number
  pret_sedinta: number
  pret_lunar_promo: number
  capacitate_maxima: number
  zile: string
  ora: string
  durata_cursului: number
}>

export type CloneSezonCursInput = {
  sursa_id: string
  overrides?: CloneSezonCursOverride
}

export type CloneSezonVacantaInput = {
  nume: string
  data_incepere: string
  data_final: string
}

export type CloneSezonInput = {
  sezon_sursa: string
  nume: string
  tip: 'principal' | 'extra'
  data_incepere: string
  data_final: string
  scadenta_prima_rata: string | null
  scadenta_ultima_rata: string | null
  cursuri: CloneSezonCursInput[]
  vacante: CloneSezonVacantaInput[]
}

export async function cloneSezon(input: CloneSezonInput): Promise<string> {
  const { data, error } = await supabase.rpc('clone_sezon', {
    p_sezon_sursa: input.sezon_sursa,
    p_nume: input.nume,
    p_tip: input.tip,
    p_data_incepere: input.data_incepere,
    p_data_final: input.data_final,
    p_cursuri: input.cursuri,
    p_vacante: input.vacante,
    p_scadenta_prima_rata: input.scadenta_prima_rata ?? undefined,
    p_scadenta_ultima_rata: input.scadenta_ultima_rata ?? undefined,
  })
  if (error) throw error
  return data as string
}

// ---------- Zonă interzisă SMS (quiet hours) ----------
// Config stocat ca JSON în parametri_aplicatie (rândul 'sms_quiet_hours'). Citit și
// de edge functions (_shared/quietHours.ts). Rândul e seedat de migrație.
export type QuietHoursConfig = {
  enabled: boolean
  start: string // "HH:MM" local (Europe/Bucharest)
  end: string // "HH:MM" local
}

const QUIET_HOURS_DEFAULT: QuietHoursConfig = {
  enabled: true,
  start: '19:30',
  end: '10:00',
}

export async function getSmsQuietHours(): Promise<QuietHoursConfig> {
  const { data, error } = await supabase
    .from('parametri_aplicatie')
    .select('valoare')
    .eq('titlu', 'sms_quiet_hours')
    .maybeSingle()
  if (error) throw error
  if (!data?.valoare) return QUIET_HOURS_DEFAULT
  try {
    const parsed = JSON.parse(data.valoare)
    return {
      enabled: parsed.enabled !== false,
      start: typeof parsed.start === 'string' ? parsed.start : QUIET_HOURS_DEFAULT.start,
      end: typeof parsed.end === 'string' ? parsed.end : QUIET_HOURS_DEFAULT.end,
    }
  } catch {
    return QUIET_HOURS_DEFAULT
  }
}

export async function saveSmsQuietHours(cfg: QuietHoursConfig): Promise<void> {
  const valoare = JSON.stringify(cfg)
  // Rândul e seedat de migrație; update după titlu (RLS: doar admin/owner).
  const { data, error } = await supabase
    .from('parametri_aplicatie')
    .update({ valoare, updated: new Date().toISOString() })
    .eq('titlu', 'sms_quiet_hours')
    .select('id')
  if (error) throw error
  // Fallback dacă rândul lipsește (migrație neaplicată într-un mediu vechi).
  if (!data || data.length === 0) {
    const { error: insErr } = await supabase
      .from('parametri_aplicatie')
      .insert({ titlu: 'sms_quiet_hours', valoare })
    if (insErr) throw insErr
  }
}
