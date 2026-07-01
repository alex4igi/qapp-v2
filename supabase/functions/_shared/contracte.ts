// Helperi comuni pentru modulul Contracte (semnare electronică).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

// token opac aleator (base64url) + hash sha256 — stocăm DOAR hash-ul (ca portal-auth)
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

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'necunoscut'
}

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
