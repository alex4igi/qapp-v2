import { supabase } from '@/lib/supabase'
import type { TarifPublic, ProdusPublic, InsertDto, UpdateDto } from '@/types/db'

// ---------- Tarife publice ----------
// Oferta publică afișată pe portalul de membri (/servicii). Decuplată de prețurile
// per-curs — manager/admin/owner o editează aici, portalul o citește live.
export async function listTarifePublice(): Promise<TarifPublic[]> {
  const { data, error } = await supabase
    .from('tarife_publice')
    .select('*')
    .order('ordine', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createTarifPublic(
  dto: InsertDto<'tarife_publice'>,
): Promise<TarifPublic> {
  const { data, error } = await supabase
    .from('tarife_publice')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateTarifPublic(
  id: string,
  dto: UpdateDto<'tarife_publice'>,
): Promise<TarifPublic> {
  const { data, error } = await supabase
    .from('tarife_publice')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteTarifPublic(id: string): Promise<void> {
  const { error } = await supabase.from('tarife_publice').delete().eq('id', id)
  if (error) throw error
}

// ---------- Produse publice (merchandise) ----------
// `produse_publice` e acum un VIEW peste `inventar` (articolele cu flag `public`).
// Sursa unică de editare e Inventarul → aici doar CITIM (preview read-only).
export async function listProdusePublice(): Promise<ProdusPublic[]> {
  const { data, error } = await supabase
    .from('produse_publice')
    .select('*')
    .order('ordine', { ascending: true })
  if (error) throw error
  return data ?? []
}
