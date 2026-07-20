import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAll'

// Ultima prezență la demo per lead, din `programari_leads`.
//
// Necesară doar pentru pool-ul Nurture: acolo `status` e uniform 'nurture', deci
// informația „a venit / nu a venit" s-ar pierde. În pipeline statusul o conține
// deja, dar harta rămâne validă și acolo (corecțiile prezent↔absent se scriu în
// programari_leads, vezi syncProgramarePrezenta).
export async function lastPrezentaByLead(): Promise<Map<string, string>> {
  const rows = await fetchAllRows<{
    lead: string | null
    prezenta: string | null
    data_programarii: string | null
  }>(() =>
    supabase
      .from('programari_leads')
      .select('lead, prezenta, data_programarii')
      .not('lead', 'is', null)
      .order('data_programarii', { ascending: true })
      .order('id', { ascending: true }),
  )

  // Ordinea crescătoare face ca ultima scriere per lead să fie cea mai recentă.
  const out = new Map<string, string>()
  for (const r of rows) {
    if (r.lead && r.prezenta) out.set(r.lead, r.prezenta)
  }
  return out
}
