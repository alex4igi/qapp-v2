// Logică partajată pentru intake-ul automat de lead-uri (Meta + website).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// Numărul național semnificativ (9 cifre, începe cu 7) extras din orice format.
// Oglindește src/lib/phone.ts. Returnează null dacă nu e mobil RO valid.
export function roMobileNational(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('0040')) d = d.slice(4)
  else if (d.startsWith('40')) d = d.slice(2)
  else if (d.startsWith('0')) d = d.slice(1)
  return d.length === 9 && d.startsWith('7') ? d : null
}

// True dacă numărul e un mobil românesc valid (după reformatare).
export function isValidRoMobile(raw: string | null | undefined): boolean {
  return roMobileNational(raw) !== null
}

// Validare email simplă (backstop server-side; clientul ar trebui să valideze și el).
export function isValidEmail(raw: string | null | undefined): boolean {
  if (!raw) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())
}

// Normalizează un telefon românesc la +40… (la fel ca în frontend).
// Numerele care nu se pot interpreta cu încredere sunt păstrate ca atare.
export function normalizeTelefon(raw: string): string {
  const n = roMobileNational(raw)
  return n ? `+40${n}` : raw.trim()
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

const GRUPA_VALUES = new Set([
  'Tiny', 'Junior', 'Varsity', 'Teens', 'Students', 'Adults',
])

function safeEnum(value: unknown, allowed: Set<string>): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return allowed.has(v) ? v : null
}

// interes_lead v3 — sincron cu migrations/20260611100000_interes_lead_v3.sql.
// Cheile = lowercase fără diacritice; acoperă opțiunile exacte din dropdown-urile
// site-ului quasardance.ro + valorile istorice ale enum-ului.
const INTERES_ALIASES: Record<string, string> = {
  'street dance': 'Street Dance',
  'k-pop': 'K-pop',
  'kpop': 'K-pop',
  'kpop dance': 'K-pop',
  'k-pop dance': 'K-pop',
  'k-pop covers': 'K-pop',
  'acrobatica': 'Acrobatică',
  'gimnastica': 'Acrobatică',
  'gimnastica acrobatica': 'Acrobatică',
  'zumba': 'Zumba',
  'zumba (adulti)': 'Zumba',
  'nu stiu inca': 'Nu știu încă',
  'altceva': 'Nu știu încă',
  'quasar for kids': 'Nu știu încă',
}

// 'Quasar for Kids' / 'Orice locație' lipsesc intenționat — nu sunt locații de
// lead; valoarea brută ajunge în observații (vezi insertLead).
const LOCATIE_ALIASES: Record<string, string> = {
  'stefan cel mare': 'Ștefan cel Mare',
  'quasar centru': 'Ștefan cel Mare',
  'centru': 'Ștefan cel Mare',
  'nicolina': 'Nicolina',
  'quasar nicolina': 'Nicolina',
}

function foldKey(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  return v
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function mapInteres(v: unknown): string | null {
  const k = foldKey(v)
  return k ? (INTERES_ALIASES[k] ?? null) : null
}

export function mapLocatie(v: unknown): string | null {
  const k = foldKey(v)
  return k ? (LOCATIE_ALIASES[k] ?? null) : null
}

export type IntakeLead = {
  nume: string
  prenume?: string | null
  nume_parinte?: string | null
  telefon?: string | null
  email?: string | null
  data_nasterii?: string | null
  interes?: string | null
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
  opts?: { status?: string },
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

  // Valorile nemapabile nu se pierd — ajung ca note în observații.
  const interes = mapInteres(lead.interes)
  const locatia = mapLocatie(lead.locatia)
  const note: string[] = []
  if (!interes && lead.interes?.trim()) {
    note.push(`[site] interes cerut: ${lead.interes.trim()}`)
  }
  if (!locatia && lead.locatia?.trim()) {
    note.push(`[site] locație cerută: ${lead.locatia.trim()}`)
  }
  if (lead.observatii?.trim()) note.push(lead.observatii.trim())

  const { data, error } = await supabase
    .from('leads')
    .insert({
      nume: lead.nume.trim() || 'Lead nou',
      prenume: lead.prenume?.trim() || null,
      nume_parinte: lead.nume_parinte?.trim() || null,
      telefon,
      email: lead.email?.trim() || null,
      data_nasterii: dataNasterii,
      interes,
      grupa_varsta: safeEnum(lead.grupa_varsta, GRUPA_VALUES),
      locatia,
      sursa: sursaId,
      status: opts?.status ?? 'nou',
      observatii: note.length ? note.join('\n') : null,
      utm_source: lead.utm_source?.trim() || null,
      utm_medium: lead.utm_medium?.trim() || null,
      utm_campaign: lead.utm_campaign?.trim() || null,
    })
    .select('id')
    .single()
  if (error) return { created: false, leadId: null, reason: error.message }
  return { created: true, leadId: data.id }
}
