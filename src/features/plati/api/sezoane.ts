import { supabase } from '@/lib/supabase'

export type SezonOption = {
  id: string
  numele_sezonului: string
  data_incepere: string | null
  data_final: string | null
}

export async function listSezoane(): Promise<SezonOption[]> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('id, numele_sezonului, data_incepere, data_final')
    .order('data_incepere', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

// Sezonul unui curs. E sursa de adevăr pentru înrolare: triggerul din DB derivă
// `enrollments.sezon_id` tot din `cursuri.sezon`, iar la o semnare făcută înainte
// de startul sezonului (reînscrieri în august pentru toamnă) data ar indica alt
// sezon decât cursul.
export async function getSezonById(id: string): Promise<SezonOption | null> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('id, numele_sezonului, data_incepere, data_final')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

// Sezonul (Sept→Iun) care conține data dată. Dacă nu există, întoarce null.
export async function getSezonForDate(
  dateIso: string,
): Promise<SezonOption | null> {
  const { data, error } = await supabase
    .from('sezoane')
    .select('id, numele_sezonului, data_incepere, data_final')
    .lte('data_incepere', dateIso)
    .gte('data_final', dateIso)
    .order('data_incepere', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] ?? null
}
