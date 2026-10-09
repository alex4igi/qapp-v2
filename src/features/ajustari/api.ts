import { supabase } from '@/lib/supabase'

export type Ajustare = {
  id: string
  moment: string
  actiune: string
  rol: string | null
  autor: string | null
  motiv: string | null
  pentru: string | null
  curs: string | null
  curs_nou: string | null
  luna: string | null
  vechi: Record<string, unknown> | null
  nou: Record<string, unknown> | null
}

// Din fișa clientului vezi doar ajustările lui; din fișa familiei, ale tuturor membrilor.
export async function getAjustari(
  target: { clientId: string } | { familieId: string },
): Promise<Ajustare[]> {
  const args =
    'clientId' in target ? { p_client: target.clientId } : { p_familie: target.familieId }
  const { data, error } = await supabase.rpc('get_ajustari_client', args)
  if (error) throw error
  return (data ?? []) as Ajustare[]
}
