import { supabase } from '@/lib/supabase'

export type CursEnrollment = {
  id: string
  suma: number | null
  data_incepere: string | null
  tip_plata: string | null
  activ: boolean
  client: { id: string; nume: string; prenume: string | null } | null
}

export async function getCursEnrollments(
  cursId: string,
): Promise<CursEnrollment[]> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('id, suma, data_incepere, tip_plata, activ, client(id, nume, prenume)')
    .eq('cursul', cursId)
    .order('data_incepere', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as CursEnrollment[]
}
