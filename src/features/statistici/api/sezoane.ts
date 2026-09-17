import { supabase } from '@/lib/supabase'

// ============================================================================
// KPI-uri reînscrieri & sezoane
// ============================================================================

export type SezonOption = {
  id: string
  numele_sezonului: string
  stare: string
  tip: string
}

export async function listSezoaneTinta(): Promise<SezonOption[]> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('id, numele_sezonului, stare, tip')
    .eq('tip', 'principal')
    .in('stare', ['planificat', 'activ'])
    .order('data_incepere', { ascending: false })
  if (error) throw error
  return (data ?? []) as SezonOption[]
}

export type ReinscrieriSumar = {
  /** Câte semnături are sezonul în registrele campaniei (`reinscrieri_semnate`). */
  semnate: number
  /** Dintre semnatari, câți au ajuns efectiv la o înrolare în sezon. */
  ajunsi: number
  /** Clienți distincți cu preț promo de reînscriere în sezon. */
  cu_promo: number
  /** Cine era în casă în cele 5 luni dinaintea startului (definiția din /start-sezon). */
  pool_anterior: number
  /** Dintre ei, câți s-au regăsit în sezonul nou. */
  pool_revenit: number
}

export async function getReinscrieriSumar(
  sezonId: string,
): Promise<ReinscrieriSumar> {
  const { data, error } = await supabase.rpc('get_reinscrieri_sumar', {
    p_sezon: sezonId,
  })
  if (error) throw error
  const r = (data ?? [])[0]
  return {
    semnate: Number(r?.semnate ?? 0),
    ajunsi: Number(r?.ajunsi ?? 0),
    cu_promo: Number(r?.cu_promo ?? 0),
    pool_anterior: Number(r?.pool_anterior ?? 0),
    pool_revenit: Number(r?.pool_revenit ?? 0),
  }
}

export type IncasariSezonRow = {
  sezon_id: string
  numele_sezonului: string
  tip: string
  stare: string
  data_incepere: string | null
  data_final: string | null
  total_incasari: number
}

export async function getIncasariPerSezon(): Promise<IncasariSezonRow[]> {
  const { data, error } = await supabase.rpc('get_incasari_per_sezon')
  if (error) throw error
  return ((data ?? []) as IncasariSezonRow[])
    .map((r) => ({
      ...r,
      total_incasari: Number(r.total_incasari ?? 0),
    }))
    // Cronologic (vechi → nou), ca restul graficelor; sezoanele fără dată la final.
    .sort((a, b) => {
      if (!a.data_incepere) return 1
      if (!b.data_incepere) return -1
      return a.data_incepere.localeCompare(b.data_incepere)
    })
}

