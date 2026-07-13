import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'

// Plățile (tenders) încasate pentru o înrolare = rânduri din `incasari` cu
// `inregistrare = id_enrollment`. Rândurile de datorie folosesc coloana `datorie`,
// deci sunt excluse automat de filtrul de mai jos.
export type EnrollmentTender = {
  id: string
  data: string | null
  suma: number
  metoda: Enums<'metoda_plata'> | null
}

export async function listMetodePerInrolare(
  enrollmentIds: string[],
): Promise<Map<string, EnrollmentTender[]>> {
  const map = new Map<string, EnrollmentTender[]>()
  if (enrollmentIds.length === 0) return map

  const { data, error } = await supabase
    .from('incasari')
    .select('id, inregistrare, data, suma, metoda')
    .in('inregistrare', enrollmentIds)
    .order('data', { ascending: true, nullsFirst: true })
  if (error) throw error

  for (const r of data ?? []) {
    if (!r.inregistrare) continue
    const arr = map.get(r.inregistrare) ?? []
    arr.push({
      id: r.id,
      data: r.data,
      suma: Number(r.suma ?? 0),
      metoda: r.metoda,
    })
    map.set(r.inregistrare, arr)
  }
  return map
}
