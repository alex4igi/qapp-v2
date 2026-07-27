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

// Caută campania după nume. `ok: false` = interogarea a eșuat (≠ „nu există”).
async function findCampanie(
  supabase: SupabaseClient,
  nume: string,
): Promise<{ id: string | null; ok: boolean }> {
  const { data, error } = await supabase
    .from('campanii_promovare')
    .select('id')
    .eq('nume', nume)
    .order('created', { ascending: true })
    .limit(1)
  if (error) {
    console.error('[campanii] lookup eșuat:', error.message)
    return { id: null, ok: false }
  }
  return { id: data?.[0]?.id ?? null, ok: true }
}

// Găsește campania după nume; o creează dacă nu există. Returnează id-ul.
//
// Incident 23–27 iulie 2026 (674 rânduri „Meta Ads”): varianta veche folosea
// `.maybeSingle()` și ignora `error`, așa că orice eroare de lookup se citea ca
// „nu există campania” → insert. Cu 2 rânduri pe același nume, maybeSingle dă
// eroare la FIECARE apel, deci bucla se auto-întreținea. De aceea aici:
// lookup-ul eșuat NU declanșează insert (lead-ul intră cu sursa null, recuperabil),
// iar conflictul pe indexul unique se rezolvă re-citind rândul existent.
export async function resolveCampanie(
  supabase: SupabaseClient,
  nume: string,
): Promise<string | null> {
  const found = await findCampanie(supabase, nume)
  if (found.id) return found.id
  if (!found.ok) return null

  const { data: created, error } = await supabase
    .from('campanii_promovare')
    .insert({ nume })
    .select('id')
    .single()
  if (created?.id) return created.id
  // 23505 = unique_violation: a creat-o alt request între timp.
  if (error?.code === '23505') return (await findCampanie(supabase, nume)).id
  console.error('[campanii] insert eșuat:', error?.message)
  return null
}

// Rezolvă campania o singură dată per request și DOAR când chiar există un lead de
// inserat. Pollerele rulează la 15 min și de cele mai multe ori nu aduc nimic nou —
// nu au de ce să atingă `campanii_promovare` la fiecare tick.
export function lazyCampanie(
  supabase: SupabaseClient,
  nume: string,
): () => Promise<string | null> {
  let pending: Promise<string | null> | null = null
  return () => (pending ??= resolveCampanie(supabase, nume))
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

// Găsește un client existent „real" (activ sau ex) cu același telefon sau email.
// clienti.telefon e stocat INCONSISTENT (majoritatea '0…', unele '+40…') iar
// leadurile vin normalizate '+40…' — deci comparăm pe toate formatele plauzibile
// derivate din numărul național (9 cifre), nu pe string brut.
// „Real" = are ≥1 înrolare SAU ≥1 plată: baza clienti conține ~1.4k fantome de
// import v1 (EXclient fără istoric); un lead care se potrivește doar cu o fantomă
// rămâne lead normal (nu-l scoatem din fluxul rece).
export async function findMatchingClient(
  supabase: SupabaseClient,
  telefon: string | null,
  email: string | null,
): Promise<{ id: string } | null> {
  const filters: string[] = []
  const nat = roMobileNational(telefon)
  if (nat) {
    filters.push(`telefon.eq.0${nat}`)
    filters.push(`telefon.eq.+40${nat}`)
    filters.push(`telefon.eq.0040${nat}`)
  }
  if (email?.trim()) filters.push(`email.eq.${email.trim()}`)
  if (!filters.length) return null
  const { data } = await supabase
    .from('clienti')
    .select('id')
    .or(filters.join(','))
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return (await clientHasHistory(supabase, data.id)) ? data : null
}

// True dacă clientul are cel puțin o înrolare sau o încasare (client „real",
// nu o fantomă de import fără istoric).
async function clientHasHistory(
  supabase: SupabaseClient,
  clientId: string,
): Promise<boolean> {
  const { count: enr } = await supabase
    .from('enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('client', clientId)
  if ((enr ?? 0) > 0) return true
  const { count: pay } = await supabase
    .from('incasari')
    .select('id', { count: 'exact', head: true })
    .eq('client', clientId)
  return (pay ?? 0) > 0
}

// Vârsta declarată în formularul Meta („4-6", „11 ani", „25+ ani") → grupa
// canonică + vârsta exactă când e dată. Aceeași mapare ca backfill-ul din
// migrația 20260722120000; dacă se schimbă una, se schimbă și cealaltă.
// Intervalele care traversează două grupe merg la cea majoritară.
export function parseVarsta(
  v: string | null | undefined,
): { grupa: string | null; ani: number | null } {
  const raw = (v ?? '').replace(/_/g, ' ').trim()
  if (!raw) return { grupa: null, ani: null }

  const exact = raw.match(/^(\d{1,2}) ani/)
  const ani = exact ? Number(exact[1]) : null

  const grupa =
    /^4-6/.test(raw) ? 'Tiny'
    : /^7-10/.test(raw) ? 'Junior'
    : /^11-1[45]/.test(raw) ? 'Varsity'
    : /^1[56]-18/.test(raw) ? 'Teens'
    : /^19-25/.test(raw) ? 'Students'
    : /^25\+/.test(raw) ? 'Adults'
    : ani == null ? null
    : ani <= 6 ? 'Tiny'
    : ani <= 10 ? 'Junior'
    : ani <= 14 ? 'Varsity'
    : ani <= 19 ? 'Teens'
    : ani <= 25 ? 'Students'
    : 'Adults'

  return { grupa, ani }
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
  varsta?: number | null
  locatia?: string | null
  observatii?: string | null
  // ID-ul la sursa externă (Meta). Cheie de dedup — stă în coloana lui, NU în
  // observații: acolo bloca notița recepției cu text de import.
  extern_id?: string | null
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

  // Dacă telefonul/emailul aparține unui client existent (activ sau ex), marchează
  // lead-ul „deja client": rămâne pe board ca istoric, dar e scos din fluxul rece.
  const emailTrim = lead.email?.trim() || null
  const match = await findMatchingClient(supabase, telefon, emailTrim)

  const { data, error } = await supabase
    .from('leads')
    .insert({
      nume: lead.nume.trim() || 'Lead nou',
      prenume: lead.prenume?.trim() || null,
      nume_parinte: lead.nume_parinte?.trim() || null,
      telefon,
      email: emailTrim,
      data_nasterii: dataNasterii,
      interes,
      grupa_varsta: safeEnum(lead.grupa_varsta, GRUPA_VALUES),
      varsta: lead.varsta ?? null,
      locatia,
      sursa: sursaId,
      id_client: match?.id ?? null,
      deja_client: !!match,
      status: opts?.status ?? 'nou',
      observatii: note.length ? note.join('\n') : null,
      extern_id: lead.extern_id?.trim() || null,
      utm_source: lead.utm_source?.trim() || null,
      utm_medium: lead.utm_medium?.trim() || null,
      utm_campaign: lead.utm_campaign?.trim() || null,
    })
    .select('id')
    .single()
  if (error) return { created: false, leadId: null, reason: error.message }
  return { created: true, leadId: data.id }
}
