import { supabase } from '@/lib/supabase'
import type { Sala, TarifInchiriere, InsertDto, UpdateDto } from '@/types/db'

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

