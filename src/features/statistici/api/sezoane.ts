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

