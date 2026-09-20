// Helperi comuni pentru modulul Contracte (semnare electronică).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

// token opac aleator (base64url) + hash sha256 — căutarea se face pe hash
export function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const buf = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// O singură definiție a IP-ului de client, în `rateLimit.ts`: acolo e explicat de ce
// `cf-connecting-ip` e cel de încredere. IP-ul de aici intră în jurnalul probatoriu al
// semnăturii, deci contează să nu fie falsificabil.
export { clientIp } from './rateLimit.ts'

// Jurnal probatoriu append-only. Eșecul de logging nu blochează fluxul principal,
// dar îl raportăm în consolă (apare în logurile funcției).
export async function logEvent(
  supabase: SupabaseClient,
  contractId: string,
  tip: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase
    .from('contract_events')
    .insert({ contract_id: contractId, tip, meta })
  if (error) console.error(`[contract_events] ${tip} FAIL:`, error.message)
}

export function portalUrl(): string {
  return (Deno.env.get('PORTAL_URL') ?? 'https://membri.quasardance.ro').replace(/\/$/, '')
}

// Linkul de semnare e UNUL pe contract: trimitere, reminder și retrimitere trimit
// același link. Contractele trimise înainte de 2026-09-15 au doar hash-ul linkului
// (token NULL) — primesc aici un link nou, iar cel vechi rămâne valid.
export async function linkSemnare(admin: SupabaseClient, contractId: string): Promise<string> {
  const { data, error } = await admin
    .from('contract_tokens')
    .select('token')
    .eq('contract_id', contractId)
    .not('token', 'is', null)
    .order('created', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`contract_tokens: ${error.message}`)
  const token = data?.token ?? (await emiteToken(admin, contractId))
  return `${portalUrl()}/s/${token}`
}

async function emiteToken(admin: SupabaseClient, contractId: string): Promise<string> {
  const token = randomToken()
  const { error } = await admin
    .from('contract_tokens')
    .insert({ token_hash: await sha256Hex(token), contract_id: contractId, token })
  if (error) throw new Error(`contract_tokens: ${error.message}`)
  return token
}

// Validare CNP (checksum standard). CNP-ul e opțional în unele template-uri,
// dar dacă e completat trebuie să fie valid.
export function isValidCnp(cnp: string): boolean {
  if (!/^\d{13}$/.test(cnp)) return false
  const weights = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9]
  const sum = weights.reduce((acc, w, i) => acc + w * Number(cnp[i]), 0)
  const control = sum % 11 === 10 ? 1 : sum % 11
  return control === Number(cnp[12])
}

export type TemplateField = {
  key: string
  label: string
  type: 'text' | 'date' | 'checkbox' | 'signature' | 'copii_table'
  source:
    | 'familie.reprezentant'
    | 'familie.cnp'
    | 'familie.adresa'
    | 'familie.ci'
    | 'familie.telefon'
    | 'familie.email'
    | 'copil.nume'
    | 'manual'
    | 'azi'
  required?: boolean
  editable?: boolean
  page: number
  x: number
  y: number
  w: number
  h: number
  fontSize?: number
}

// Numele fișierului de descărcare. Supabase pune `download` în query string și îl
// re-encodează în Content-Disposition, așa că diacriticele ajungeau în numele
// salvat ca „%C8%9B" — coborâm la ASCII înainte.
export function pdfFileName(nume: string | null | undefined): string {
  const ascii = String(nume ?? '')
    .replace(/[/\\]/g, '-')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ._-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `${ascii || 'Document'}.pdf`
}
