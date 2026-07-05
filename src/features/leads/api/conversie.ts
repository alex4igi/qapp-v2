import { supabase } from '@/lib/supabase'
import { normalizeTelefon } from '@/lib/phone'

// Caută un client existent cu același telefon sau email (pentru merge la conversie).
export async function findMatchingClient(
  telefon: string | null,
  email: string | null,
): Promise<{
  id: string
  nume: string
  prenume: string | null
  familia: string | null
} | null> {
  const filters: string[] = []
  if (telefon?.trim()) filters.push(`telefon.eq.${normalizeTelefon(telefon)}`)
  if (email?.trim()) filters.push(`email.eq.${email.trim()}`)
  if (!filters.length) return null
  const { data, error } = await supabase
    .from('clienti')
    .select('id, nume, prenume, familia')
    .or(filters.join(','))
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

// Reintegrează un client (de obicei după reziliere) ca lead în coloana Nurture.
// Dacă există deja un lead legat de acest client, îl readuce în Nurture și resetează
// flagurile; altfel creează un lead nou pre-populat din datele clientului.
export async function reintegrateClientAsLead(clientId: string): Promise<void> {
  const { data: client, error: clientErr } = await supabase
    .from('clienti')
    .select('id, nume, prenume, telefon, email, data_nasterii')
    .eq('id', clientId)
    .single()
  if (clientErr) throw clientErr

  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('id_client', clientId)
    .limit(1)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('leads')
      .update({
        status: 'nurture',
        sub_status: null,
        flag_reminder: false,
        flag_reminder_at: null,
        flag_streak: 0,
        motiv_pierdut: null,
      })
      .eq('id', existing.id)
    if (error) throw error
    return
  }

  const telefon = client.telefon ? normalizeTelefon(client.telefon) : null
  const { error } = await supabase.from('leads').insert({
    nume: client.nume,
    prenume: client.prenume,
    telefon,
    email: client.email,
    data_nasterii: client.data_nasterii,
    status: 'nurture',
    id_client: client.id,
  })
  if (error) throw error
}

// Leagă lead-ul de un client FĂRĂ a-l marca convertit. Conversia e atomică cu
// înrolarea: un lead devine `convertit` abia după ce înrolarea reușește
// (vezi markLeadConvertit). Aici doar atașăm clientul creat/identificat, ca să
// putem deschide formularul de înrolare precompletat.
export async function attachClientToLead(
  leadId: string,
  clientId: string,
): Promise<void> {
  const { error } = await supabase
    .from('leads')
    .update({ id_client: clientId })
    .eq('id', leadId)
  if (error) throw error
}

// Marchează lead-ul convertit — se apelează DOAR după ce înrolarea s-a creat cu
// succes. Setează data_conversie și declanșează SMS-ul de review.
export async function markLeadConvertit(leadId: string): Promise<void> {
  const { error } = await supabase
    .from('leads')
    .update({
      status: 'convertit',
      data_conversie: new Date().toISOString(),
    })
    .eq('id', leadId)
  if (error) throw error

  // SMS review la conversie (dedup pe sms_logs tip='review' în edge function).
  try {
    await supabase.functions.invoke('send-lead-sms', {
      body: { leadId, tip: 'review' },
    })
  } catch (e) {
    console.error('[markLeadConvertit] review sms', e)
  }
}

// Dintr-o listă de clienți, cei care au cel puțin o înrolare activă (ne-reziliată).
// Folosit pe carduri ca să distingem „client creat, neînrolat" de „deja înrolat".
export async function getEnrolledClientIds(
  clientIds: string[],
): Promise<string[]> {
  if (clientIds.length === 0) return []
  const { data, error } = await supabase
    .from('enrollments')
    .select('client')
    .in('client', clientIds)
    .eq('reziliat', false)
  if (error) throw error
  return [...new Set((data ?? []).map((r) => r.client as string))]
}

// Pentru un lead deja convertit: clientul legat + grupa/cursul REAL din înrolarea
// activă (sursa de adevăr pentru reguli — nu `grupa_varsta` de pe lead, care e doar
// banda de vârstă-intenție).
export type LeadConversionInfo = {
  clientId: string
  clientNume: string
  cursNume: string | null
  cursVarsta: string | null
  cursId: string | null
  dataIncepere: string | null
}

export async function getLeadConversionInfo(
  clientId: string,
): Promise<LeadConversionInfo | null> {
  const { data: client, error: cErr } = await supabase
    .from('clienti')
    .select('id, nume, prenume')
    .eq('id', clientId)
    .maybeSingle()
  if (cErr) throw cErr
  if (!client) return null

  const { data: enr, error: eErr } = await supabase
    .from('enrollments')
    .select('cursul(id, numele, varsta), data_incepere')
    .eq('client', clientId)
    .eq('reziliat', false)
    .order('data_incepere', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (eErr) throw eErr

  const cursRaw = enr?.cursul as unknown
  const curs = (Array.isArray(cursRaw) ? cursRaw[0] : cursRaw) as
    | { id: string; numele: string; varsta: string | null }
    | null
    | undefined

  return {
    clientId: client.id as string,
    clientNume: [client.prenume, client.nume].filter(Boolean).join(' ').trim(),
    cursNume: curs?.numele ?? null,
    cursVarsta: curs?.varsta ?? null,
    cursId: curs?.id ?? null,
    dataIncepere: (enr?.data_incepere as string | null) ?? null,
  }
}
