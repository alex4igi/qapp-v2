import { supabase } from '@/lib/supabase'

export type CanalComunicare = 'sms' | 'email' | 'contact' | 'contract' | 'anunt'

export type Comunicare = {
  moment: string | null
  canal: CanalComunicare
  tip: string | null
  status: string | null
  mesaj: string | null
  destinatar: string | null
  pentru: string | null
  autor: string | null
  detalii: Record<string, unknown> | null
}

// Cronologia se adună pe familie (SMS-ul pleacă pe telefonul părintelui), deci
// din fișa unui copil vezi și mesajele trimise pentru frații lui.
export async function getIstoricComunicari(
  target: { clientId: string } | { familieId: string },
): Promise<Comunicare[]> {
  const args =
    'clientId' in target ? { p_client: target.clientId } : { p_familie: target.familieId }
  const { data, error } = await supabase.rpc('get_istoric_comunicari', args)
  if (error) throw error
  return (data ?? []) as Comunicare[]
}
