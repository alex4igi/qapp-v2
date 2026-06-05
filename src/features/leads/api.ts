import { supabase } from '@/lib/supabase'
import type {
  Lead,
  StatusLead,
  SubStatusLead,
  GrupaLead,
  InteresLead,
  InsertDto,
  UpdateDto,
} from '@/types/db'
import { normalizeTelefon } from '@/lib/phone'
import { triggerLeadSms } from './sms'

export { normalizeTelefon }

export type LeadForm = {
  prenume: string
  nume: string
  nume_parinte: string
  telefon: string
  email: string
  data_nasterii: string
  sursa: string
  interes: string
  curs_interes: string
  grupa_varsta: string
  status: StatusLead
  sub_status: string
  motiv_pierdut: string
  locatia: string
  data_programare: string
  data_callback_dorit: string
  observatii: string
}

function normalize(form: Partial<LeadForm>): UpdateDto<'leads'> {
  const out: UpdateDto<'leads'> = {}
  if ('prenume' in form) out.prenume = form.prenume?.trim() || null
  if ('nume' in form) out.nume = form.nume?.trim() ?? ''
  if ('nume_parinte' in form) out.nume_parinte = form.nume_parinte?.trim() || null
  if ('telefon' in form)
    out.telefon = form.telefon?.trim() ? normalizeTelefon(form.telefon) : null
  if ('email' in form) out.email = form.email?.trim() || null
  if ('data_nasterii' in form) out.data_nasterii = form.data_nasterii || null
  if ('sursa' in form) out.sursa = form.sursa || null
  if ('interes' in form)
    out.interes = (form.interes || null) as InteresLead | null
  if ('curs_interes' in form) out.curs_interes = form.curs_interes?.trim() || null
  if ('grupa_varsta' in form)
    out.grupa_varsta = (form.grupa_varsta || null) as GrupaLead | null
  if ('status' in form) out.status = form.status
  if ('sub_status' in form)
    out.sub_status = (form.sub_status || null) as SubStatusLead | null
  if ('motiv_pierdut' in form) out.motiv_pierdut = form.motiv_pierdut?.trim() || null
  if ('locatia' in form) out.locatia = form.locatia?.trim() || null
  if ('data_programare' in form)
    out.data_programare = form.data_programare || null
  if ('data_callback_dorit' in form)
    out.data_callback_dorit = form.data_callback_dorit || null
  if ('observatii' in form) out.observatii = form.observatii?.trim() || null
  return out
}

// Sincronizează prezența în programari_leads cu statusul lead-ului:
// a_venit → prezent, nu_a_venit → absent. Atinge cea mai recentă programare
// (corecțiile prezent↔absent trebuie să se reflecte; reprogramările vechi rămân).
async function syncProgramarePrezenta(
  leadId: string,
  status: StatusLead,
): Promise<void> {
  const prezenta =
    status === 'a_venit'
      ? 'prezent'
      : status === 'nu_a_venit'
        ? 'absent'
        : null
  if (!prezenta) return
  const { data: latest } = await supabase
    .from('programari_leads')
    .select('id')
    .eq('lead', leadId)
    .order('data_programarii', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latest) {
    await supabase
      .from('programari_leads')
      .update({ prezenta })
      .eq('id', latest.id)
  }
}

export async function listLeads(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Mută lead-urile cu programări doar în trecut din `programat` → `nu_a_venit`
// și marchează programările expirate ca `absent`. Apelată la load /leads.
export async function pruneExpiredLeads(): Promise<void> {
  const { error } = await supabase.rpc('prune_expired_leads')
  if (error) throw error
}

export async function checkDuplicateTelefon(
  telefon: string,
  excludeId?: string,
): Promise<{ duplicate: boolean; lead: Pick<Lead, 'id' | 'prenume' | 'nume'> | null }> {
  const term = telefon.trim() ? normalizeTelefon(telefon) : ''
  if (!term) return { duplicate: false, lead: null }
  let query = supabase
    .from('leads')
    .select('id, prenume, nume')
    .eq('telefon', term)
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query.limit(1).maybeSingle()
  if (error) throw error
  return { duplicate: Boolean(data), lead: data ?? null }
}

export async function createLead(form: LeadForm): Promise<Lead> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const payload: InsertDto<'leads'> = {
    ...normalize(form),
    nume: form.nume.trim(),
    responsabil_id: user?.id ?? null,
  }

  const { data, error } = await supabase
    .from('leads')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error

  await triggerLeadSms(null, data)
  return data
}

export async function updateLead(
  id: string,
  form: Partial<LeadForm>,
): Promise<Lead> {
  const { data: current, error: fetchError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchError) throw fetchError

  const payload = normalize(form)

  // Incrementare nr_contactari când sub_status devine nu_raspunde / de_revenit
  if (
    'sub_status' in form &&
    (form.sub_status === 'nu_raspunde' || form.sub_status === 'de_revenit') &&
    current.sub_status !== form.sub_status
  ) {
    const newNr = (current.nr_contactari ?? 0) + 1
    payload.nr_contactari = newNr
    payload.ultima_contactare_la = new Date().toISOString()
    // După 4 contactări fără răspuns → Nurture
    if (newNr >= 4) {
      payload.status = 'nurture'
      payload.sub_status = null
    }
  }

  // data_conversie la trecerea în convertit
  if (payload.status === 'convertit' && current.status !== 'convertit') {
    payload.data_conversie = new Date().toISOString()
  }

  // Flagul de prioritate se curăță la prima schimbare de status (primul drag).
  const statusChanging =
    payload.status != null && payload.status !== current.status
  if (statusChanging && current.flag_reminder) {
    payload.flag_reminder = false
    payload.flag_reminder_at = null
    payload.flag_streak = 0
  }
  // sub_status are sens doar în 'contactat' — se golește la ieșirea din coloană.
  if (
    statusChanging &&
    payload.status !== 'contactat' &&
    current.sub_status &&
    payload.sub_status === undefined
  ) {
    payload.sub_status = null
  }

  const { data, error } = await supabase
    .from('leads')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error

  if (statusChanging) await syncProgramarePrezenta(id, data.status)
  await triggerLeadSms(current.status, data)
  return data
}

export async function updateLeadStatus(
  id: string,
  status: StatusLead,
): Promise<Lead> {
  const { data: current, error: fetchError } = await supabase
    .from('leads')
    .select('status, flag_reminder')
    .eq('id', id)
    .single()
  if (fetchError) throw fetchError

  const updates: UpdateDto<'leads'> = { status }
  if (status === 'convertit') {
    updates.data_conversie = new Date().toISOString()
  }
  // Flagul de prioritate se curăță la primul drag către altă coloană.
  if (current.flag_reminder) {
    updates.flag_reminder = false
    updates.flag_reminder_at = null
    updates.flag_streak = 0
  }
  // sub_status are sens doar în 'contactat' — se golește la ieșire.
  if (status !== 'contactat') {
    updates.sub_status = null
  }
  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error

  await syncProgramarePrezenta(id, status)
  await triggerLeadSms(current.status, data)
  return data
}

export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) throw error
}

export type LeadHistoryEntry = {
  id: string
  action_type: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

// Jurnalul de activitate al unui lead (cel mai recent primul).
export async function getLeadHistory(
  leadId: string,
): Promise<LeadHistoryEntry[]> {
  const { data, error } = await supabase
    .from('lead_history')
    .select('id, action_type, old_value, new_value, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Cursul ultimei programări a lead-ului (pentru precompletarea înrolării).
export async function getLatestProgramareCurs(
  leadId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('programari_leads')
    .select('cursul_programat')
    .eq('lead', leadId)
    .order('data_programarii', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.cursul_programat ?? null
}

// Caută un client existent cu același telefon sau email (pentru merge la conversie).
export async function findMatchingClient(
  telefon: string | null,
  email: string | null,
): Promise<{ id: string; nume: string; prenume: string | null } | null> {
  const filters: string[] = []
  if (telefon?.trim()) filters.push(`telefon.eq.${normalizeTelefon(telefon)}`)
  if (email?.trim()) filters.push(`email.eq.${email.trim()}`)
  if (!filters.length) return null
  const { data, error } = await supabase
    .from('clienti')
    .select('id, nume, prenume')
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

// Leagă lead-ul de un client și îl marchează convertit.
export async function linkLeadToClient(
  leadId: string,
  clientId: string,
): Promise<void> {
  const { error } = await supabase
    .from('leads')
    .update({
      status: 'convertit',
      id_client: clientId,
      data_conversie: new Date().toISOString(),
    })
    .eq('id', leadId)
  if (error) throw error
}

export type CursProgramabil = {
  id: string
  numele: string
  varsta: string | null
  zile: string[] | null
  locatie: string | null
}

// Cursurile nesuspendate, pentru dropdown-ul de programare din ScheduleModal.
export async function listCursuriProgramabile(): Promise<CursProgramabil[]> {
  const { data, error } = await supabase
    .from('cursuri')
    .select('id, numele, varsta, zile, locatie')
    .eq('suspendat', false)
    .order('numele', { ascending: true })
  if (error) throw error
  return (data ?? []) as CursProgramabil[]
}

// Creează rândul de programare care leagă lead-ul de un curs la o dată.
// Activează badge-ul "LEAD" pe roster-ul grupei respective.
export async function createProgramareLead(input: {
  lead: string
  cursul_programat: string | null
  locatie: string | null
  data_programarii: string
}): Promise<void> {
  const { error } = await supabase.from('programari_leads').insert({
    lead: input.lead,
    cursul_programat: input.cursul_programat,
    locatie: input.locatie,
    data_programarii: input.data_programarii,
    prezenta: 'programat',
  })
  if (error) throw error
}
