// Edge Function: webhook Facebook/Instagram Lead Ads.
//   GET  — verificarea webhook-ului de către Meta (hub.challenge).
//   POST — notificare lead nou: ia leadgen_id, aduce datele din Graph API
//          și creează un lead în status 'nou'.
//
// Env necesare (setate cu `supabase secrets set`):
//   META_VERIFY_TOKEN        — token-ul de verificare ales în Meta App.
//   META_PAGE_ACCESS_TOKEN   — token-ul paginii, pentru Graph API.
import { serviceClient, resolveCampanie, insertLead } from '../_shared/intake.ts'

const GRAPH = 'https://graph.facebook.com/v21.0'

type FieldDatum = { name: string; values: string[] }

// Extrage nume/telefon/email din field_data-ul Meta (numele câmpurilor variază).
function parseFields(fields: FieldDatum[]) {
  const get = (...names: string[]) => {
    for (const f of fields) {
      if (names.includes(f.name.toLowerCase())) return f.values?.[0] ?? null
    }
    return null
  }
  const fullName = get('full_name', 'nume', 'name')
  const firstName = get('first_name', 'prenume')
  const lastName = get('last_name')
  return {
    nume: lastName || fullName || 'Lead Meta',
    prenume: firstName,
    telefon: get('phone_number', 'telefon', 'phone'),
    email: get('email'),
  }
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

        // Aduce datele lead-ului din Graph API.
        const res = await fetch(
          `${GRAPH}/${leadgenId}?access_token=${pageToken}`,
        )
        if (!res.ok) {
          console.error('[intake/meta] Graph API:', await res.text())
          skipped++
          continue
        }
        const data = await res.json()
        const parsed = parseFields(data.field_data ?? [])

        const sursaId = await resolveCampanie(supabase, 'Meta Ads')
        const result = await insertLead(
          supabase,
          {
            nume: parsed.nume,
            prenume: parsed.prenume,
            telefon: parsed.telefon,
            email: parsed.email,
            observatii: `Meta Lead Ads (form ${change.value?.form_id ?? '?'})`,
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
