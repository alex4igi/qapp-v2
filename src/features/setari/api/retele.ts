import { supabase } from '@/lib/supabase'

// Rețelele (IP public) recunoscute ca fiind ale unei locații — vezi `locatii_retele`.
export type ReteaLocatie = {
  ip: string
  locatie: string
  locatie_nume: string
  eticheta: string | null
  created: string
}

export async function listReteleLocatii(): Promise<ReteaLocatie[]> {
  const { data, error } = await supabase.rpc('lista_retele_locatii')
  if (error) throw error
  return data ?? []
}

export async function reteauaCurenta(): Promise<{ ip: string | null; locatie_id: string | null }> {
  const { data, error } = await supabase.rpc('locatia_retelei')
  if (error) throw error
  return data as { ip: string | null; locatie_id: string | null }
}

export async function asociazaReteauaCurenta(locatieId: string, eticheta: string): Promise<string> {
  const { data, error } = await supabase.rpc('asociaza_reteaua_curenta', {
    p_locatie: locatieId,
    p_eticheta: eticheta,
  })
  if (error) throw error
  return data
}

export async function stergeReteaLocatie(ip: string): Promise<void> {
  const { error } = await supabase.rpc('sterge_retea_locatie', { p_ip: ip })
  if (error) throw error
}
