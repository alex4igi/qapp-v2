import { supabase } from '@/lib/supabase'
import type { Views } from '@/types/db'


export type StatLunara = Views<'statistica_restante_totale'>
export type RestantaTeacher = Views<'restante_teacher_luna'>
export type RestantaLocatie = Views<'restante_locatie_luna'>

export async function getStatisticaLunara(): Promise<StatLunara[]> {
  const { data, error } = await supabase
    .from('statistica_restante_totale')
    .select('*')
    .order('id', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getRestanteTeacher(): Promise<RestantaTeacher[]> {
  const { data, error } = await supabase
    .from('restante_teacher_luna')
    .select('*')
    .order('luna', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getRestanteLocatie(): Promise<RestantaLocatie[]> {
  const { data, error } = await supabase
    .from('restante_locatie_luna')
    .select('*')
    .order('luna', { ascending: false })
  if (error) throw error
  return data ?? []
}
