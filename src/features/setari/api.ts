import { supabase } from '@/lib/supabase'
import type {
  Locatie,
  Sala,
  Sezon,
  Vacanta,
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
  })
  if (error) throw error
  return data as string
}
