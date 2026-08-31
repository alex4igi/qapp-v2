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

// Marcarea prezenței de către un TEACHER, prin RPC security definer.
//
// RLS-ul nu-i permite teacherului să scrie direct în `programari_leads`/`leads`
// (20260515110000, 20260527190000), deși /grupa și rosterul evenimentului îi
// sunt deschise — click-ul pe bifă eșua tăcut cu PGRST116.
//
// RPC-ul scrie DOAR prezența pe programarea vizată. Efectele de pipeline
// (leads.status, follow-up SMS, nurture la a 2-a neprezentare) rămân pe calea
// recepției — vezi `updateLeadStatus`.
export async function marcheazaPrezentaLeadDemo(
  evenimentId: string,
  leadId: string,
  prezenta: 'programat' | 'prezent' | 'absent',
): Promise<void> {
  const { error } = await supabase.rpc('marcheaza_prezenta_lead_demo', {
    p_eveniment: evenimentId,
    p_lead: leadId,
    p_prezenta: prezenta,
  })
  if (error) throw error
}

export async function marcheazaPrezentaLeadCurs(
  leadId: string,
  cursId: string,
  data: string,
  prezenta: 'programat' | 'prezent' | 'absent',
): Promise<void> {
  const { error } = await supabase.rpc('marcheaza_prezenta_lead_curs', {
    p_lead: leadId,
    p_curs: cursId,
    p_data: data,
    p_prezenta: prezenta,
  })
  if (error) throw error
}
