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

  // review = la conversie (lead → client), NU după prezența la demo. NU se trimite
  // imediat: trece prin coada `confirmari_review_sms` cu delay de 5 min (fereastră
  // de undo — dacă revii din conversie, SMS-ul nu mai pleacă), drenată de edge fn
  // `process-review-sms`. La fel ca programarea (coada `confirmari_programare_sms`).
  if (lead.status === 'convertit' && prev !== 'convertit') {
    try {
      await supabase.rpc('enqueue_confirmare_review', { p_lead: lead.id })
    } catch (e) {
      console.error('[triggerLeadSms] review enqueue', e)
    }
  }

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
