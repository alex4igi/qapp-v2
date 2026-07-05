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
import { triggerLeadSms } from '../sms'

export type LeadForm = {
  prenume: string
  nume: string
  nume_parinte: string
  telefon: string
  email: string
  data_nasterii: string
  sursa: string
  interes: string
  grupa_varsta: string
  status: StatusLead
  sub_status: string
  motiv_pierdut: string
  locatia: string
  data_programare: string
  data_callback_dorit: string
  observatii: string
}

export function normalize(form: Partial<LeadForm>): UpdateDto<'leads'> {
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

// PostgREST returnează max 1000 rânduri/request.
const PAGE = 1000

// Paginare completă pe `leads`, filtrată pe apartenența la `nurture`
// (PostgREST cap = 1000 rânduri/request).
async function fetchLeadsPaged(inNurture: boolean): Promise<Lead[]> {
  let all: Lead[] = []
  for (;;) {
    const base = supabase.from('leads').select('*')
    const filtered = inNurture
      ? base.eq('status', 'nurture')
      : base.neq('status', 'nurture')
    const { data, error } = await filtered
      .order('created', { ascending: false })
      .range(all.length, all.length + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    all = all.concat(data)
    if (data.length < PAGE) break
  }
  return all
}

// Lead-urile board-ului Kanban. Excludem `nurture` — e un pool de reactivare ce
// crește nelimitat (5k+ ex-clienți istorici); trăiește în tab-ul separat „Nurture",
// nu pe board. Kanban, rapoartele și „De lucrat azi" folosesc doar pipeline-ul activ.
export async function listLeads(): Promise<Lead[]> {
  return fetchLeadsPaged(false)
}

// Pool-ul Nurture complet (separat de board), pentru tab-ul „Nurture".
export async function listNurtureLeads(): Promise<Lead[]> {
  return fetchLeadsPaged(true)
}

export async function checkDuplicateTelefon(
  telefon: string,
  excludeId?: string,
): Promise<{
  duplicate: boolean
  lead: Pick<Lead, 'id' | 'prenume' | 'nume' | 'status'> | null
}> {
  const term = telefon.trim() ? normalizeTelefon(telefon) : ''
  if (!term) return { duplicate: false, lead: null }
  let query = supabase
    .from('leads')
    .select('id, prenume, nume, status')
    .eq('telefon', term)
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query.limit(1).maybeSingle()
  if (error) throw error
  return { duplicate: Boolean(data), lead: data ?? null }
}

// Căutare server-side ușoară în pool-ul Nurture (5k+ rânduri) — doar când există
// un termen. NU reutilizăm listNurtureLeads, care aduce tot pool-ul.
export async function searchNurtureByTerm(
  term: string,
): Promise<Pick<Lead, 'id' | 'prenume' | 'nume' | 'telefon'>[]> {
  const t = term.trim()
  if (t.length < 2) return []
  const { data, error } = await supabase
    .from('leads')
    .select('id, prenume, nume, telefon')
    .eq('status', 'nurture')
    .or(`prenume.ilike.%${t}%,nume.ilike.%${t}%,telefon.ilike.%${t}%`)
    .limit(25)
  if (error) throw error
  return data ?? []
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
