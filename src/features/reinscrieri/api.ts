import { supabase } from '@/lib/supabase'

export type ReinscriereProgresRow = {
  curs_id: string
  curs_nume: string
  varsta: string | null
  total_eligibili: number
  activati: number
  ramasi: number
  procent: number
}

export type ReinscriereClientRow = {
  client_id: string
  nume: string
  prenume: string | null
  telefon: string | null
  email: string | null
  activata: boolean
}

export async function getReinscrieriProgress(
  sezonTintaId: string,
): Promise<ReinscriereProgresRow[]> {
  const { data, error } = await supabase.rpc('get_reinscrieri_progress', {
    p_sezon_tinta: sezonTintaId,
  })
  if (error) throw error
  return (data ?? []) as ReinscriereProgresRow[]
}

export async function listReinscrieriClienti(
  cursTintaId: string,
): Promise<ReinscriereClientRow[]> {
  const { data, error } = await supabase.rpc('list_reinscrieri_clienti', {
    p_curs_tinta_id: cursTintaId,
  })
  if (error) throw error
  return (data ?? []) as ReinscriereClientRow[]
}

export async function activateReinscriereLaSezon(
  clientId: string,
  cursTintaId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    'activate_reinscriere_pe_sezon',
    { p_client_id: clientId, p_curs_tinta_id: cursTintaId },
  )
  if (error) throw error
  return (data as number) ?? 0
}
