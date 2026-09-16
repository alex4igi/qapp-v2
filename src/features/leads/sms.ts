import { supabase } from '@/lib/supabase'
import type { Lead, StatusLead } from '@/types/db'

// După o tranziție de status, declanșează SMS-ul aferent (dacă e cazul).
// Apelează Edge Function-ul send-lead-sms, care face dedup și trimite (sau stub).
// Eșecul SMS nu blochează salvarea lead-ului — doar se loghează.
export async function triggerLeadSms(
  prev: StatusLead | null,
  lead: Lead,
): Promise<void> {
  if (!lead.telefon) return
  // Lead marcat „deja client" = client existent care a completat un formular „for
  // fun" → scos din fluxul rece, niciun SMS automat.
  if (lead.deja_client) return

  // Conversia nu mai trimite SMS de review (scos 2026-09-16); coada
  // `confirmari_review_sms` rămâne goală.
  const tips: string[] = []
  // followup DOAR la 1-a neprezentare; a 2-a e rutată în nurture (fără SMS).
  if (
    lead.status === 'nu_a_venit' &&
    prev !== 'nu_a_venit' &&
    (lead.nr_neprezentari ?? 0) < 2
  )
    tips.push('followup')
  if (lead.status === 'waiting_list' && prev !== 'waiting_list')
    tips.push('waiting_list')

  for (const tip of tips) {
    try {
      await supabase.functions.invoke('send-lead-sms', {
        body: { leadId: lead.id, tip },
      })
    } catch (e) {
      console.error('[triggerLeadSms]', tip, e)
    }
  }
}
