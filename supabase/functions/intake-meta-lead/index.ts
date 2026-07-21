// Edge Function: webhook Facebook/Instagram Lead Ads.
//   GET  — verificarea webhook-ului de către Meta (hub.challenge).
//   POST — notificare lead nou: ia leadgen_id, aduce datele din Graph API
//          și creează un lead în status 'nou'.
//
// Env necesare (setate cu `supabase secrets set`):
//   META_VERIFY_TOKEN        — token-ul de verificare ales în Meta App.
//   META_PAGE_ACCESS_TOKEN   — token-ul paginii, pentru Graph API.
// Setup complet: docs/integrare-meta-lead-ads.md.
import {
  serviceClient,
  resolveCampanie,
  insertLead,
} from '../_shared/intake.ts'
import { GRAPH, parseLeadFields } from '../_shared/meta.ts'

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
  try {
    const pageToken = Deno.env.get('META_PAGE_ACCESS_TOKEN')
    const body = await req.json().catch(() => ({}))
    const supabase = serviceClient()
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
            `?fields=field_data,form_id,ad_id,ad_name,campaign_id,campaign_name,created_time` +
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
        // alea sunt informație despre om. Marcajul, campania și numele reclamei
        // NU intră în observații: `observatii` e notița recepției, iar datele
        // tehnice ale reclamei se iau din Meta.
        const note = [...parsed.notes]

        const sursaId = await resolveCampanie(supabase, 'Meta Ads')
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
          },
          sursaId,
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
