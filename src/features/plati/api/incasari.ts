import { supabase } from '@/lib/supabase'
import type { Enums, Incasare, InsertDto } from '@/types/db'

export async function getEnrollmentIncasari(
  enrollmentId: string,
): Promise<Incasare[]> {
  const { data, error } = await supabase
    .from('incasari')
    .select('*')
    .eq('inregistrare', enrollmentId)
    .order('data', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

export async function createIncasare(
  dto: InsertDto<'incasari'>,
): Promise<Incasare> {
  const { data, error } = await supabase
    .from('incasari')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// Creează una sau mai multe încasări pentru un set de înrolări selectate,
// distribuind suma FIFO peste rândurile vechi → noi.
export async function registerPlataFifo(params: {
  enrollmentIds: string[] // în ordine vechi → nou
  remaining: number[] // rest per enrollment, în aceeași ordine
  partialAmount: number | null // dacă null, plătim restul fiecăruia integral
  metoda: Enums<'metoda_plata'>
  data: string // YYYY-MM-DD
  locatieId: string // locația de unde se face plata
}): Promise<Incasare[]> {
  const inserts: InsertDto<'incasari'>[] = []
  let pool =
    params.partialAmount != null
      ? params.partialAmount
      : params.remaining.reduce((a, b) => a + b, 0)

  for (let i = 0; i < params.enrollmentIds.length; i++) {
    const owe = params.remaining[i]
    if (owe <= 0) continue
    const pay = Math.min(owe, pool)
    if (pay <= 0) break
    inserts.push({
      inregistrare: params.enrollmentIds[i],
      data: params.data,
      suma: pay,
      metoda: params.metoda,
      categorie: 'Abonament',
      locatie: params.locatieId,
    })
    pool -= pay
    if (pool <= 0) break
  }
  if (inserts.length === 0) return []

  const { data, error } = await supabase
    .from('incasari')
    .insert(inserts)
    .select('*')
  if (error) throw error
  return data ?? []
}
