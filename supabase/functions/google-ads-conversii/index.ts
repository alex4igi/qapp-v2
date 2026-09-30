// Edge Function: fișierul de conversii offline pentru Google Ads („scheduled upload" din HTTPS).
// Google Ads îl ia zilnic, cu utilizatorul și parola de mai jos (HTTP Basic), și potrivește
// fiecare rând după gclid cu click-ul pe reclamă. Ce intră și de ce: migrația 20260930170000
// (`conversii_google_csv`).
//
// Env (supabase secrets set):
//   GOOGLE_ADS_CSV_USER / GOOGLE_ADS_CSV_PASS — aceleași introduse în Google Ads la programare.
//   GOOGLE_ADS_CONVERSION_NAME — numele EXACT al acțiunii de conversie din Google Ads
//                                (default „Inscriere qapp", fără diacritice ca să nu difere).
import { serviceClient } from '../_shared/intake.ts'

const USER = Deno.env.get('GOOGLE_ADS_CSV_USER') ?? ''
const PASS = Deno.env.get('GOOGLE_ADS_CSV_PASS') ?? ''
const CONVERSION_NAME = Deno.env.get('GOOGLE_ADS_CONVERSION_NAME') ?? 'Inscriere qapp'

function egal(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

function autorizat(req: Request): boolean {
  if (!USER || !PASS) return false
  const h = req.headers.get('authorization') ?? ''
  if (!h.startsWith('Basic ')) return false
  let dec = ''
  try {
    dec = atob(h.slice(6))
  } catch {
    return false
  }
  return egal(dec, `${USER}:${PASS}`)
}

// CSV: câmpurile noastre n-au virgule sau ghilimele (gclid, dată, număr), dar numele
// acțiunii vine din configurare.
const camp = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response('Doar GET', { status: 405 })
  if (!autorizat(req)) {
    return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="conversii"' } })
  }

  const { data, error } = await serviceClient().rpc('conversii_google_csv')
  if (error) {
    console.error('[google-ads-conversii]', error.message)
    return new Response('Eroare', { status: 500 })
  }
  const randuri = (data ?? []) as { gclid: string; data_conversie: string; valoare: number }[]

  const linii = [
    'Parameters:TimeZone=Europe/Bucharest',
    'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Ad User Data,Ad Personalization',
    ...randuri.map((r) =>
      [camp(r.gclid), camp(CONVERSION_NAME), r.data_conversie, String(Number(r.valoare) || 0), 'RON', 'Granted', 'Granted'].join(','),
    ),
  ]
  console.log(`[google-ads-conversii] ${randuri.length} conversii în fișier`)
  return new Response(linii.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' },
  })
})
