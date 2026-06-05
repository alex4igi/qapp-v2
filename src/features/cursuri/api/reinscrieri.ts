import { supabase } from '@/lib/supabase'

// Activează promo reînscriere pe toate înrolările viitoare ale clientului la curs.
// Necesită cursuri.pret_lunar_promo setat. Returnează numărul de înrolări actualizate.
export async function activateReinscriere(
  clientId: string,
  cursId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('activate_reinscriere', {
    p_client_id: clientId,
    p_curs_id: cursId,
  })
  if (error) throw error
  return data ?? 0
}
