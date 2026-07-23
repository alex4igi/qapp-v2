import { supabase } from '@/lib/supabase'
import type { JurnalRand, StatusJurnal } from '../types'

// Jurnalul de predare: o confirmare per (grupă, zi). Baza auditului — managerul
// vede unde s-a predat conform planului și unde s-a deviat (cu motivul).

export async function confirmaSedinta(params: {
  cursId: string
  data: string
  nrSedinta: number
  lectieId: string | null
  status: StatusJurnal
  nota: string | null
  teacherId: string | null
}): Promise<void> {
  const { error } = await supabase.from('program_jurnal').upsert(
    {
      curs_id: params.cursId,
      data: params.data,
      nr_sedinta: params.nrSedinta,
      lectie_id: params.lectieId,
      status: params.status,
      nota: params.nota,
      teacher_id: params.teacherId,
      updated: new Date().toISOString(),
    },
    { onConflict: 'curs_id,data' }
  )
  if (error) throw error
}

export async function getJurnalCurs(cursId: string): Promise<JurnalRand[]> {
  const { data, error } = await supabase
    .from('program_jurnal')
    .select('*')
    .eq('curs_id', cursId)
    .order('data', { ascending: false })
  if (error) throw error
  return data ?? []
}
