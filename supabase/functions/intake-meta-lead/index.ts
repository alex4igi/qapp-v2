// Edge Function: webhook Facebook/Instagram Lead Ads.
//   GET  — verificarea webhook-ului de către Meta (hub.challenge).
//   POST — notificare lead nou: ia leadgen_id, aduce datele din Graph API
//          și creează un lead în status 'nou'.
//
// Env necesare (setate cu `supabase secrets set`):
//   META_VERIFY_TOKEN        — token-ul de verificare ales în Meta App (doar GET).
//   META_PAGE_ACCESS_TOKEN   — token-ul paginii, pentru Graph API.
//   META_APP_SECRET          — App Secret-ul din Meta App; cu el se verifică semnătura
//                              `X-Hub-Signature-256` de pe POST-uri. Fără el, notificările
//                              sunt neautentificate: oricine poate trimite leadgen_id-uri
//                              (nu poate injecta date false — lead-ul se aduce din Graph —
//                              dar poate forța apeluri și zgomot).
//   META_REQUIRE_SIGNATURE   — 'true' ⇒ o semnătură lipsă sau greșită înseamnă 401.
//     Cât timp NU e setat: fereastră de observare — se verifică și se loghează, dar
//     notificarea se procesează oricum. Se aprinde abia după ce logurile arată că
//     semnăturile reale ale Meta trec. Leadurile din reclame sunt plătite; un secret
//     greșit pus direct pe refuz le-ar arunca tăcut.
// Setup complet: docs/integrare-meta-lead-ads.md.
import {
  serviceClient,
  lazyCampanie,
  insertLead,
} from '../_shared/intake.ts'
import { GRAPH, parseLeadFields } from '../_shared/meta.ts'
import { clientIp, raspuns429, verificaPlafon } from '../_shared/rateLimit.ts'

// Plafon DOAR pentru apelanții fără semnătură validă: Meta trimite loturi și reîncearcă
// la timeout, iar un plafon pe traficul ei legitim ar pierde lead-uri plătite.
const PLAFON_NESEMNAT = { fereastraSec: 300, limita: 60 }

function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

// Meta semnează corpul BRUT cu HMAC-SHA256(app_secret): `X-Hub-Signature-256: sha256=<hex>`.
// Se verifică pe textul exact primit — un JSON re-serializat nu mai dă aceeași semnătură.
async function semnaturaValida(raw: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get('META_APP_SECRET')
  if (!secret || !header?.startsWith('sha256=')) return false
  const cheie = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cheie, new TextEncoder().encode(raw))
  const asteptat = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return egalConstant(asteptat, header.slice('sha256='.length).toLowerCase())
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // --- GET: verificarea webhook-ului ---
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === Deno.env.get('META_VERIFY_TOKEN')) {
      return new Response(challenge ?? '', { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Doar GET/POST' }, { status: 405 })
  }

  // --- POST: notificare lead ---
  const raw = await req.text()
  const semnat = await semnaturaValida(raw, req.headers.get('x-hub-signature-256'))

  if (!semnat) {
    if (Deno.env.get('META_REQUIRE_SIGNATURE') === 'true') {
      console.warn('[intake/meta] semnătură lipsă sau greșită — refuzat')
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.warn(
      `[intake/meta] NESEMNAT (fereastră de observare) de la ${clientIp(req)}` +
        `${Deno.env.get('META_APP_SECRET') ? '' : ' — META_APP_SECRET nesetat'}`,
    )
    const plafon = await verificaPlafon(serviceClient(), 'intake-meta-nesemnat', clientIp(req), PLAFON_NESEMNAT)
    if (!plafon.permis) return raspuns429(plafon.retryAfter)
  }

  try {
    const pageToken = Deno.env.get('META_PAGE_ACCESS_TOKEN')
    // deno-lint-ignore no-explicit-any
    let body: any = {}
    try { body = JSON.parse(raw || '{}') } catch { /* corp invalid → nimic de procesat */ }
    const supabase = serviceClient()
    const sursa = lazyCampanie(supabase, 'Meta Ads')
    let created = 0
    let skipped = 0

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') continue
        const leadgenId = change.value?.leadgen_id
        if (!leadgenId) continue

        if (!pageToken) {
          console.error('[intake/meta] META_PAGE_ACCESS_TOKEN lipsește')
          skipped++
          continue
        }

        // Dedup pe leadgen_id — Meta retrimite webhook-ul la timeout/retry.
        // Gardul idempotent e `leads.extern_id` (era în observații până în
        // migrația 20260722120000, unde bloca notița recepției).
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('extern_id', leadgenId)
          .limit(1)
          .maybeSingle()
        if (existing) {
          skipped++
          continue
        }

        // Aduce datele lead-ului din Graph API, cu context de campanie.
        // NU loga URL-ul (conține token-ul).
        const res = await fetch(
          `${GRAPH}/${leadgenId}` +
            `?fields=field_data,form_id,ad_id,ad_name,adset_id,adset_name,` +
            `campaign_id,campaign_name,platform,created_time` +
            `&access_token=${pageToken}`,
        )
        if (!res.ok) {
          console.error('[intake/meta] Graph API status:', res.status)
          skipped++
          continue
        }
        const data = await res.json()
        const parsed = parseLeadFields(data.field_data ?? [])

        // Doar răspunsurile din formular care n-au putut fi mapate pe câmpuri —
        // alea sunt informație despre om. Identificatorii reclamei stau în
        // coloanele lor de atribuire, NU în observații: `observatii` e notița
        // recepției.
        const note = [...parsed.notes]

        const result = await insertLead(
          supabase,
          {
            nume: parsed.nume,
            prenume: parsed.prenume,
            telefon: parsed.telefon,
            email: parsed.email,
            interes: parsed.interes,
            locatia: parsed.locatia,
            grupa_varsta: parsed.grupa_varsta,
            data_nasterii: parsed.data_nasterii,
            observatii: note.join('\n'),
            extern_id: leadgenId,
            utm_source: 'meta',
            utm_medium: 'lead_ads',
            utm_campaign: data.campaign_name ?? data.campaign_id ?? null,
            platform: data.platform ?? 'meta',
            campaign_id: data.campaign_id ?? null,
            ad_id: data.ad_id ?? null,
            ad_name: data.ad_name ?? null,
            adset_id: data.adset_id ?? null,
            adset_name: data.adset_name ?? null,
            form_id: data.form_id ?? null,
          },
          await sursa(),
          { canal: 'meta_webhook' },
        )
        if (result.created) created++
        else skipped++
      }
    }

    console.log(`[intake/meta] create: ${created}, skip: ${skipped}`)
    // 200 mereu — Meta reîncearcă agresiv la non-2xx.
    return Response.json({ created, skipped })
  } catch (e) {
    console.error('[intake/meta]', e)
    return Response.json({ error: String(e) }, { status: 200 })
  }
})
