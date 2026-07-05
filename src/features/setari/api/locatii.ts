import { supabase } from '@/lib/supabase'
import type { Locatie, InsertDto, UpdateDto } from '@/types/db'

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

