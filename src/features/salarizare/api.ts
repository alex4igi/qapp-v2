import { supabase } from '@/lib/supabase'
import type { RezultatConfirmare, SalarizareLuna } from './types'

export async function getSalarizareLuna(anul: number, luna: number): Promise<SalarizareLuna> {
  const { data, error } = await supabase.rpc('get_salarizare_luna', { p_anul: anul, p_luna: luna })
  if (error) throw error
  return data as unknown as SalarizareLuna
}

/** Confirmă componentele definitive și neblocate ale lunii; restul rămân deschise. */
export async function confirmaSalariuStaff(
  userId: string,
  post: 'manager' | 'receptie',
  anul: number,
  luna: number,
  platitInLuna: string,
): Promise<RezultatConfirmare> {
  const { data, error } = await supabase.rpc('confirma_salariu_staff', {
    p_user: userId,
    p_post: post,
    p_anul: anul,
    p_luna: luna,
    p_platit_in_luna: platitInLuna,
  })
  if (error) throw error
  return data as unknown as RezultatConfirmare
}

export async function corecteazaComponenta(id: string, motiv: string): Promise<void> {
  const { error } = await supabase.rpc('corecteaza_componenta_salariu', { p_id: id, p_motiv: motiv })
  if (error) throw error
}

export async function adaugaGrupeNoiInPool(): Promise<number> {
  const { data, error } = await supabase.rpc('adauga_grupe_noi_in_pool')
  if (error) throw error
  return data as number
}
