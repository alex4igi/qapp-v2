import { supabase } from '@/lib/supabase'
import type {
  TarifPublic,
  ProdusPublic,
  BiletPublic,
  InsertDto,
  UpdateDto,
} from '@/types/db'
import { sezonActivId } from '@/lib/lookups'

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

// ---------- Bilete publice (din evenimente) ----------
// `bilete_publice` e un VIEW peste `evenimente` (cele cu flag `public`, viitoare,
// neanulate). Sursa unică de editare e modulul Evenimente → aici doar CITIM.
export async function listBiletePublice(): Promise<BiletPublic[]> {
  const { data, error } = await supabase
    .from('bilete_publice')
    .select('*')
    .order('data', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

// ---------- Referință prețuri cursuri (Pas 3) ----------
// Prețurile REALE de facturare din cursuri (sezon activ, nesuspendate). Folosite ca
// panou de referință lângă tarife_publice ca să se vadă drift-ul ofertă marketing ↔
// facturare. NU sunt sursa ofertei publice — doar comparație informativă.
export type PretCursReferinta = {
  numele: string
  facultativ: boolean
  pret_lunar: number | null
  pret_anual: number | null
  pret_sedinta: number | null
}

export async function listPreturiCursuriReferinta(): Promise<
  PretCursReferinta[]
> {
  const sezon = await sezonActivId()
  let q = supabase
    .from('cursuri')
    .select('numele, facultativ, pret_lunar, pret_anual, pret_sedinta')
    .eq('suspendat', false)
    .order('numele', { ascending: true })
  if (sezon) q = q.eq('sezon', sezon)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}
