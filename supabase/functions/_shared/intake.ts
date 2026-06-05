// Logică partajată pentru intake-ul automat de lead-uri (Meta + website).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// Normalizează un telefon românesc la +40… (la fel ca în frontend api.ts).
export function normalizeTelefon(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  let d = digits
  if (d.startsWith('0040')) d = d.slice(4)
  else if (d.startsWith('40')) d = d.slice(2)
  else if (d.startsWith('0')) d = d.slice(1)
  return d.length === 9 ? `+40${d}` : raw.trim()
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Găsește campania după nume; o creează dacă nu există. Returnează id-ul.
export async function resolveCampanie(
  supabase: SupabaseClient,
  nume: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('campanii_promovare')
    .select('id')
    .eq('nume', nume)
    .maybeSingle()
  if (data?.id) return data.id
  const { data: created } = await supabase
    .from('campanii_promovare')
    .insert({ nume })
    .select('id')
    .single()
  return created?.id ?? null
}

// Aliniat cu enum-urile din migrations/20260514140000_leads_pipeline.sql.
const INTERES_VALUES = new Set([
  'Street Dance', 'K-pop', 'Gimnastică', 'Zumba',
  'Acrobatică', 'Quasar for Kids', 'Altceva',
])
const GRUPA_VALUES = new Set([
  'Tiny', 'Junior', 'Varsity', 'Teens', 'Students', 'Adults',
])

function safeEnum(value: unknown, allowed: Set<string>): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return allowed.has(v) ? v : null
}

export type IntakeLead = {
  nume: string
  prenume?: string | null
  nume_parinte?: string | null
  telefon?: string | null
  email?: string | null
  data_nasterii?: string | null
  interes?: string | null
  curs_interes?: string | null
  grupa_varsta?: string | null
  locatia?: string | null
  observatii?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
}

// Inserează un lead în status 'nou'. Deduplică pe telefon normalizat:
// dacă există deja un lead cu același telefon, NU creează unul nou.
export async function insertLead(
  supabase: SupabaseClient,
  lead: IntakeLead,
  sursaId: string | null,
): Promise<{ created: boolean; leadId: string | null; reason?: string }> {
  const telefon = lead.telefon ? normalizeTelefon(lead.telefon) : null

  if (telefon) {
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('telefon', telefon)
      .limit(1)
      .maybeSingle()
    if (existing) {
      return { created: false, leadId: existing.id, reason: 'telefon existent' }
    }
  }

  // Date naștere: doar ISO YYYY-MM-DD; orice altceva → null (evităm crash insert).
  const rawNastere = lead.data_nasterii?.trim() ?? ''
  const dataNasterii = /^\d{4}-\d{2}-\d{2}$/.test(rawNastere) ? rawNastere : null

  const { data, error } = await supabase
    .from('leads')
    .insert({
      nume: lead.nume.trim() || 'Lead nou',
      prenume: lead.prenume?.trim() || null,
      nume_parinte: lead.nume_parinte?.trim() || null,
      telefon,
      email: lead.email?.trim() || null,
      data_nasterii: dataNasterii,
      interes: safeEnum(lead.interes, INTERES_VALUES),
      curs_interes: lead.curs_interes?.trim() || null,
      grupa_varsta: safeEnum(lead.grupa_varsta, GRUPA_VALUES),
      locatia: lead.locatia?.trim() || null,
      sursa: sursaId,
      status: 'nou',
      observatii: lead.observatii?.trim() || null,
      utm_source: lead.utm_source?.trim() || null,
      utm_medium: lead.utm_medium?.trim() || null,
      utm_campaign: lead.utm_campaign?.trim() || null,
    })
    .select('id')
    .single()
  if (error) return { created: false, leadId: null, reason: error.message }
  return { created: true, leadId: data.id }
}
