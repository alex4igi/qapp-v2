import { supabase } from '@/lib/supabase'
import type { Vacanta } from '@/types/db'

// Vacanțele care acoperă o dată (YYYY-MM-DD). De obicei 0 sau 1.
export async function getVacanteForData(data: string): Promise<Vacanta[]> {
  if (!data) return []
  const { data: rows, error } = await supabase
    .from('vacante')
    .select('*')
    .lte('data_incepere', data)
    .gte('data_final', data)
    .order('data_incepere', { ascending: true })
  if (error) throw error
  return rows ?? []
}

// Iulie–august: sezonul de vară are doar grupe facultative, deci lunile astea nu
// se compară cu o lună de școală (retenție, fluxuri, grafice pe sezon).
export const LUNI_VACANTA = [7, 8]
