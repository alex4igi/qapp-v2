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

  const tips: string[] = []
  // NB: confirmarea de programare NU se trimite aici — trece prin coada
  // `confirmari_programare_sms` cu delay de 2 min (fereastră de undo), drenată
  // de edge fn `process-programare-sms`. Vezi enqueueConfirmareProgramare.
  // review = la conversie (lead → client), NU după prezența la demo.
  if (lead.status === 'convertit' && prev !== 'convertit') tips.push('review')
  if (lead.status === 'nu_a_venit' && prev !== 'nu_a_venit')
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
